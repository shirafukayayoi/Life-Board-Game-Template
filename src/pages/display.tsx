import { Fragment, StrictMode, type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import confetti from "canvas-confetti";
import { QRCodeCanvas } from "qrcode.react";
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
} from "recharts";
import { MountainBoard, type CameraMode } from "../components/MountainBoard";
import "../index.css";
import "../App.css";
import { useGameSfx } from "../hooks/useGameSfx";
import {
  colorForPlayer,
  EXPERIENCE_KEYS,
  EXPERIENCE_LABELS,
  EXPERIENCE_RANGES,
  getRoundInfo,
  RESOURCE_KEYS,
  RESOURCE_LABELS,
  type ClientMessage,
  type EventChoice,
  type GameEvent,
  type GameState,
  type ChoiceResult,
  type LifeMapSquare,
  type TimelineLifePlayer,
  type PlayerResult,
  type RoundInfo,
  type ServerMessage,
  type StatEffects,
  defaultGameState,
  wsUrlFromInput,
} from "../domain/gameShared";

// ─── Year color helper ───────────────────────────────────────────
const YEAR_COLORS: Record<number, string> = {
  1: "var(--year-1)",
  2: "var(--year-2)",
  3: "var(--year-3)",
  4: "var(--year-4)",
};

function yearColor(year: number): string {
  return YEAR_COLORS[year] ?? "var(--text-secondary)";
}

// ─── Stat effect label helper ────────────────────────────────────
const ALL_LABELS: Record<string, string> = {
  time: "時間",
  money: "お金",
  credits: "単位",
  health: "体力",
  intellect: "知性",
  connections: "人脈",
  work_tolerance: "労働耐性",
  action_power: "行動力",
  romance_exp: "恋愛力",
};

function effectBadges(effects: StatEffects) {
  return Object.entries(effects)
    .filter(([, v]) => v !== 0 && v !== undefined)
    .map(([key, value]) => {
      const label = ALL_LABELS[key] ?? key;
      const isPositive = (value as number) > 0;
      return (
        <span
          key={key}
          className={`event-effect-badge ${isPositive ? "event-effect-badge--positive" : "event-effect-badge--negative"}`}
        >
          {label} {isPositive ? "+" : ""}{value}
        </span>
      );
    });
}

const RISK_LABELS: Record<NonNullable<EventChoice["preview"]>["risk"], string> = {
  low: "低リスク",
  medium: "揺れる",
  high: "荒れる",
  unknown: "読めない",
};

const LIFE_TRAIT_LABELS: Record<string, string> = {
  academic: "学び",
  stability: "生活",
  wellbeing: "余白",
  relationships: "関係",
  freedom: "自由",
  challenge: "挑戦",
  career: "進路",
  memory: "記憶",
  selfhood: "自分",
};

const SEASON_SORT: Record<string, number> = {
  spring: 0,
  summer: 1,
  autumn: 2,
  winter: 3,
};

function choicePreviewBadges(choice: EventChoice) {
  if (!choice.preview && !choice.tone && !choice.storyTags?.length) return null;

  return (
    <div className="event-choice__preview">
      {choice.tone && (
        <span className="event-choice__preview-chip event-choice__preview-chip--tone">
          {choice.tone}
        </span>
      )}
      {choice.preview?.gain.slice(0, 2).map((gain) => (
        <span key={`gain-${gain}`} className="event-choice__preview-chip event-choice__preview-chip--gain">
          + {gain}
        </span>
      ))}
      {choice.preview?.cost.slice(0, 2).map((cost) => (
        <span key={`cost-${cost}`} className="event-choice__preview-chip event-choice__preview-chip--cost">
          - {cost}
        </span>
      ))}
      {choice.preview && (
        <span className="event-choice__preview-chip event-choice__preview-chip--risk">
          {RISK_LABELS[choice.preview.risk]}
        </span>
      )}
      {choice.storyTags?.slice(0, 2).map((tag) => (
        <span key={`tag-${tag}`} className="event-choice__preview-chip">
          {tag}
        </span>
      ))}
    </div>
  );
}

function sortLifeSquares(a: LifeMapSquare, b: LifeMapSquare) {
  const yearDelta = a.year - b.year;
  if (yearDelta !== 0) return yearDelta;
  return (SEASON_SORT[a.season] ?? 0) - (SEASON_SORT[b.season] ?? 0);
}

function topLifeTraits(lifePlayer?: TimelineLifePlayer) {
  if (!lifePlayer) return [];
  return Object.entries(lifePlayer.traits)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([key]) => LIFE_TRAIT_LABELS[key] ?? key);
}

function initials(name: string) {
  return name.trim().slice(0, 2).toUpperCase() || "?";
}

const SCORE_BREAKDOWN_LABELS = {
  experience: "経験",
  health: "体力",
  money: "お金",
  credits: "単位",
  total: "合計",
} as const;

function resultTitle(result: PlayerResult) {
  return result.academicStatus
    ? result.storyAward?.title
    : result.ending?.title;
}

function resultDescription(result: PlayerResult) {
  return result.summary ?? result.ending?.description;
}

function buildExperienceRadarData(results: PlayerResult[]) {
  return EXPERIENCE_KEYS.map((key) => {
    const row: Record<string, string | number> = {
      stat: EXPERIENCE_LABELS[key],
      max: EXPERIENCE_RANGES[key].max,
    };
    for (const result of results) {
      row[result.playerId] = result.experience?.[key] ?? 0;
    }
    return row;
  });
}

const TONE_SHORT_LABELS: Record<string, string> = {
  安定: "STUDY",
  社交: "CREW",
  自由: "OPEN",
  挑戦: "QUEST",
  回復: "REST",
  現実: "WORK",
};

function LifeMapStage({ state }: { state: GameState }) {
  const squares = state.lifeMapSquares ?? [];
  const hubs = squares
    .filter((square): square is Extract<LifeMapSquare, { type: "season_hub" }> => square.type === "season_hub")
    .sort(sortLifeSquares);
  const routes = squares.filter(
    (square): square is Extract<LifeMapSquare, { type: "life_route" }> => square.type === "life_route",
  );
  const routesBySeason = new Map<string, Extract<LifeMapSquare, { type: "life_route" }>[]>();
  for (const route of routes) {
    const existing = routesBySeason.get(route.seasonId) ?? [];
    existing.push(route);
    routesBySeason.set(route.seasonId, existing);
  }

  const currentSeasonIndex = state.currentSeasonIndex ?? Math.max(0, state.currentRound - 1);
  const currentSeasonId = hubs[currentSeasonIndex]?.seasonId ?? state.currentEvent?.id;
  const routesByPlayer = state.lifePlayerRoutes ?? {};
  const currentPositions = state.lifePlayerPositions ?? {};
  const playersById = new Map(state.players.map((player, index) => [player.id, { player, index }]));
  const routeOwners = new Map<string, { playerId: string; name: string; index: number; current: boolean }[]>();

  for (const [playerId, routeIds] of Object.entries(routesByPlayer)) {
    const playerInfo = playersById.get(playerId);
    if (!playerInfo) continue;
    for (const routeId of routeIds) {
      const owners = routeOwners.get(routeId) ?? [];
      owners.push({
        playerId,
        name: playerInfo.player.name,
        index: playerInfo.index,
        current: currentPositions[playerId] === routeId,
      });
      routeOwners.set(routeId, owners);
    }
  }

  for (const [playerId, squareId] of Object.entries(currentPositions)) {
    if (!squareId.includes(":route:")) continue;
    const playerInfo = playersById.get(playerId);
    if (!playerInfo) continue;
    const owners = routeOwners.get(squareId) ?? [];
    if (!owners.some((owner) => owner.playerId === playerId)) {
      owners.push({
        playerId,
        name: playerInfo.player.name,
        index: playerInfo.index,
        current: true,
      });
      routeOwners.set(squareId, owners);
    }
  }

  const completedRoutes = Object.values(routesByPlayer).reduce(
    (total, routeIds) => total + routeIds.length,
    0,
  );
  const totalRouteSlots = Math.max(1, state.players.length * 16);
  const routeProgress = Math.round((completedRoutes / totalRouteSlots) * 100);
  const currentSquareOwners = new Map<string, { playerId: string; name: string; index: number; current: boolean }[]>();
  for (const [playerId, squareId] of Object.entries(currentPositions)) {
    const playerInfo = playersById.get(playerId);
    if (!playerInfo) continue;
    const owners = currentSquareOwners.get(squareId) ?? [];
    owners.push({
      playerId,
      name: playerInfo.player.name,
      index: playerInfo.index,
      current: true,
    });
    currentSquareOwners.set(squareId, owners);
  }
  const totalSquares = hubs.length * 5;

  return (
    <div className="life-map-stage">
      <div className="life-map-stage__header">
        <div>
          <div className="life-map-stage__eyebrow">Campus Life Map</div>
          <div className="life-map-stage__title">
            80マスの分岐で4年間を残す
          </div>
        </div>
        <div className="life-map-stage__meters">
          <span>{completedRoutes}ルート通過</span>
          <span>{routeProgress}%開拓</span>
        </div>
      </div>

      <div className="life-map-board">
        <div className="life-map-board__landmark life-map-board__landmark--library">
          LIBRARY
        </div>
        <div className="life-map-board__landmark life-map-board__landmark--cafe">
          CAFE
        </div>
        <div className="life-map-board__landmark life-map-board__landmark--lab">
          LAB
        </div>
        <div className="life-map-board__landmark life-map-board__landmark--club">
          CLUB
        </div>
        <div className="life-map-path" style={{ "--total-squares": totalSquares } as CSSProperties}>
        {hubs.map((hub, index) => {
          const routeOrder = hub.next;
          const seasonRoutes = (routesBySeason.get(hub.seasonId) ?? []).sort((a, b) =>
            routeOrder.indexOf(a.id) - routeOrder.indexOf(b.id),
          );
          const isCurrent = hub.seasonId === currentSeasonId && state.phase !== "result";
          const isPast = index < currentSeasonIndex;
          const isReverse = Math.floor(index / 4) % 2 === 1;
          const hubNumber = index * 5 + 1;
          const rowItems = [
            {
              kind: "hub" as const,
              id: hub.id,
              number: hubNumber,
              label: hub.label,
              subLabel: hub.theme,
              owners: currentSquareOwners.get(hub.id) ?? [],
              highRisk: false,
              selected: isPast || isCurrent,
            },
            ...seasonRoutes.map((route, routeIndex) => {
              const owners = routeOwners.get(route.id) ?? [];
              return {
                kind: "route" as const,
                id: route.id,
                number: index * 5 + routeIndex + 2,
                label: route.label,
                subLabel: TONE_SHORT_LABELS[route.tone ?? ""] ?? route.tone ?? "",
                owners,
                highRisk: route.preview.risk === "high",
                selected: owners.length > 0,
              };
            }),
          ];
          const displayItems = isReverse ? [...rowItems].reverse() : rowItems;

          return (
            <Fragment key={hub.id}>
              {displayItems.map((item, visualIndex) => {
                const current = item.owners.some((owner) => owner.current);
                const isRowStart = visualIndex === 0;
                const isRowEnd = visualIndex === displayItems.length - 1;
                const hasNextRow = index < hubs.length - 1;
                return (
                  <div
                    key={item.id}
                    className={[
                      "life-square",
                      "life-path-tile",
                      item.kind === "hub" ? "life-path-tile--hub" : "life-path-tile--route",
                      item.selected ? "life-path-tile--selected" : "",
                      current ? "life-path-tile--current" : "",
                      item.highRisk ? "life-path-tile--high-risk" : "",
                      isCurrent ? "life-path-tile--current-season" : "",
                      isPast ? "life-path-tile--past-season" : "",
                      isReverse ? "life-path-tile--reverse-row" : "",
                      isRowStart ? "life-path-tile--row-start" : "",
                      isRowEnd ? "life-path-tile--row-end" : "",
                      isRowEnd && hasNextRow ? "life-path-tile--bend-down" : "",
                    ].filter(Boolean).join(" ")}
                    style={{ "--season-color": yearColor(hub.year) } as CSSProperties}
                  >
                    <div className="life-square__no">
                      {String(item.number).padStart(2, "0")}
                    </div>
                    <div className="life-path-tile__content">
                      <div className="life-path-tile__label">
                        {item.highRisk && <span className="life-route__spark">!</span>}
                        {item.label}
                      </div>
                      <div className="life-path-tile__tone">{item.subLabel}</div>
                    </div>
                    {item.owners.length > 0 && (
                      <div className="life-route__tokens">
                        {item.owners.slice(0, 4).map((owner) => (
                          <span
                            key={owner.playerId}
                            className="life-route__token"
                            style={{ background: colorForPlayer(owner.index) }}
                            title={owner.name}
                          >
                            {initials(owner.name)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </Fragment>
          );
        })}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  Display Page
// ═══════════════════════════════════════════════════════════════════

export function DisplayPage() {
  const { play: playSfx } = useGameSfx();
  const [status, setStatus] = useState("接続準備中");
  const [state, setState] = useState<GameState>(defaultGameState);

  // Event overlay state
  const [showEvent, setShowEvent] = useState<GameEvent | null>(null);
  const [eventPlayerId, setEventPlayerId] = useState<string | null>(null);
  const [eventAvailableIds, setEventAvailableIds] = useState<string[]>([]);
  const [choiceResult, setChoiceResult] = useState<ChoiceResult | null>(null);
  const [eventFading, setEventFading] = useState(false);

  // Dice roll overlay
  const [diceRoll, setDiceRoll] = useState<{ name: string; value: number; squares: number } | null>(null);

  // Round-end banner
  const [roundEndInfo, setRoundEndInfo] = useState<RoundInfo | null>(null);

  // Game result
  const [gameResults, setGameResults] = useState<PlayerResult[] | null>(null);
  const [showResultContent, setShowResultContent] = useState(false);

  // Camera mode (auto with manual override)
  const [cameraOverride, setCameraOverride] = useState<CameraMode | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const stateRef = useRef<GameState>(state);
  const eventOverlayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hostUrl = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("host") || window.location.origin;
  }, []);
  const targetUrl = useMemo(() => wsUrlFromInput(hostUrl), [hostUrl]);
  const controllerEntryUrl = useMemo(
    () => `${hostUrl}/controller.html?host=${encodeURIComponent(hostUrl)}`,
    [hostUrl],
  );
  const statusLabel = targetUrl ? status : "接続先URLが不正です";

  // Current player info
  const currentPlayer = useMemo(() => {
    if (state.players.length === 0) return undefined;
    const currentId = state.turnOrder[state.turnIndex % state.turnOrder.length];
    return state.players.find((p) => p.id === currentId);
  }, [state.players, state.turnIndex, state.turnOrder]);

  const roundInfo = useMemo(
    () => getRoundInfo(state.currentRound),
    [state.currentRound],
  );
  const isLifeMapMode = state.mode === "life_map";
  const pendingLifeChoiceCount = Object.keys(state.pendingLifeChoices ?? {}).length;
  const onlinePlayerCount = state.players.filter((player) => player.online).length;
  const lifePlayersById = useMemo(
    () => new Map((state.lifePlayers ?? []).map((player) => [player.id, player])),
    [state.lifePlayers],
  );

  // Auto-derive camera mode from game phase
  const autoCameraMode: CameraMode = useMemo(() => {
    if (state.phase === "lobby" || isLifeMapMode) return "cinema";
    if (
      currentPlayer &&
      (state.phase === "rolling" ||
        state.phase === "choosing" ||
        state.phase === "animating")
    ) {
      return "follow";
    }
    return "overview";
  }, [state.phase, currentPlayer, isLifeMapMode]);
  const cameraMode = cameraOverride ?? autoCameraMode;

  // Fade out event overlay after choice result
  const fadeOutEvent = useCallback(() => {
    if (eventOverlayTimerRef.current) {
      clearTimeout(eventOverlayTimerRef.current);
      eventOverlayTimerRef.current = null;
    }
    setEventFading(true);
    const timer = setTimeout(() => {
      setShowEvent(null);
      setChoiceResult(null);
      setEventPlayerId(null);
      setEventAvailableIds([]);
      setEventFading(false);
    }, 500);
    return () => clearTimeout(timer);
  }, []);

  const scheduleEventOverlayDismiss = useCallback(() => {
    if (eventOverlayTimerRef.current) {
      clearTimeout(eventOverlayTimerRef.current);
    }
    eventOverlayTimerRef.current = setTimeout(() => {
      fadeOutEvent();
    }, 5000);
  }, [fadeOutEvent]);

  // WebSocket connection
  useEffect(() => {
    if (!targetUrl) {
      return;
    }

    const socket = new WebSocket(targetUrl);
    wsRef.current = socket;

    socket.onopen = () => {
      const payload: ClientMessage = {
        type: "join",
        name: "Display",
        role: "display",
      };
      socket.send(JSON.stringify(payload));
      setStatus("接続済み");
    };

    socket.onmessage = (event) => {
      const message = JSON.parse(event.data) as ServerMessage;

      switch (message.type) {
        case "state":
          // Detect new dice roll
          if (message.state.lastRoll && message.state.phase === "choosing") {
            setDiceRoll({
              name: message.state.lastRoll.playerName,
              value: message.state.lastRoll.value,
              squares: message.state.lastRoll.squaresAdvanced,
            });
          }
          if (message.state.phase !== "lobby") {
            setStatus("接続済み");
          }
          stateRef.current = message.state;
          setState(message.state);
          break;

        case "show_event":
          setStatus("接続済み");
          playSfx("event");
          // Delay event display so dice result is visible
          setTimeout(() => {
            setDiceRoll(null);
            setShowEvent(message.event);
            setEventPlayerId(message.playerId);
            setEventAvailableIds(message.availableChoiceIds);
            setChoiceResult(null);
            setEventFading(false);
          }, 1500);
          break;

        case "show_life_event":
          setStatus("接続済み");
          playSfx("event");
          setDiceRoll(null);
          setShowEvent(message.event);
          setEventPlayerId(null);
          setEventAvailableIds(message.availableChoiceIds);
          setChoiceResult(null);
          setEventFading(false);
          scheduleEventOverlayDismiss();
          break;

        case "choice_result":
          playSfx("choice_result");
          setChoiceResult(message.result);
          if (stateRef.current.mode !== "life_map") {
            setTimeout(() => {
              fadeOutEvent();
            }, 3000);
          }
          break;

        case "round_end":
          playSfx("round_end");
          setRoundEndInfo(message.roundInfo);
          setTimeout(() => setRoundEndInfo(null), 3000);
          break;

        case "game_result":
          playSfx("game_result");
          setGameResults(message.results);
          // Show intro for 3s, then reveal content
          setTimeout(() => {
            setShowResultContent(true);
            if (!message.results.some((result) => result.academicStatus)) {
              confetti({
                particleCount: 150,
                spread: 100,
                origin: { y: 0.5 },
              });
            }
          }, 3200);
          break;

        case "system":
          setStatus(message.message);
          break;
      }
    };

    socket.onclose = () => setStatus("切断されました");
    socket.onerror = () => setStatus("接続エラー");

    return () => {
      if (eventOverlayTimerRef.current) {
        clearTimeout(eventOverlayTimerRef.current);
      }
      socket.close();
    };
  }, [targetUrl, fadeOutEvent, scheduleEventOverlayDismiss, playSfx]);

  const requestFullscreen = async () => {
    try {
      await document.documentElement.requestFullscreen();
    } catch {
      // Fullscreen may not be supported
    }
  };

  // ─── Result screen ──────────────────────────────────────────────
  if (gameResults) {
    const isLifeMapResult = gameResults.some((result) => result.academicStatus);
    const radarData = buildExperienceRadarData(gameResults);
    return (
      <div className={`result-screen ${showResultContent ? "result-screen--revealed" : ""}`}>
        {!showResultContent && (
          <div className="result-intro">4年間が過ぎた...</div>
        )}
        {showResultContent && (
          <div className="result-content">
            <h1 style={{ textAlign: "center", marginBottom: 8 }}>
              {isLifeMapResult ? "それぞれの4年間" : "卒業 - 最終結果"}
            </h1>
            <div className="result-radar-card">
              <div className="result-section-title">経験値バランス</div>
              <div className="result-radar-wrap">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="72%">
                    <PolarGrid stroke="rgba(255, 255, 255, 0.16)" />
                    <PolarAngleAxis
                      dataKey="stat"
                      tick={{ fill: "var(--text-secondary)", fontSize: 12 }}
                    />
                    <PolarRadiusAxis
                      domain={[0, 10]}
                      tick={false}
                      axisLine={false}
                    />
                    {gameResults.map((result, index) => {
                      const color = colorForPlayer(index);
                      return (
                        <Radar
                          key={result.playerId}
                          name={result.playerName}
                          dataKey={result.playerId}
                          stroke={color}
                          fill={color}
                          fillOpacity={gameResults.length === 1 ? 0.28 : 0.12}
                          strokeWidth={2}
                        />
                      );
                    })}
                  </RadarChart>
                </ResponsiveContainer>
              </div>
              <div className="result-radar-legend">
                {gameResults.map((result, index) => (
                  <span key={result.playerId}>
                    <i style={{ background: colorForPlayer(index) }} />
                    {result.playerName}
                  </span>
                ))}
              </div>
            </div>
            {gameResults.map((result, index) => (
              <div
                key={result.playerId}
                className={`result-player ${result.rank === 1 ? "result-player--winner" : ""}`}
                style={{ "--player-color": colorForPlayer(index) } as CSSProperties}
              >
                {result.rank !== undefined ? (
                  <div
                    className={`result-rank ${result.rank <= 3 ? `result-rank--${result.rank}` : ""}`}
                  >
                    #{result.rank}
                  </div>
                ) : (
                  <div className="result-rank result-rank--2">LIFE</div>
                )}
                <div className="result-info">
                  <div className="result-ending-header">
                    <span className="result-emoji">
                      {result.academicStatus ? "\u{1F393}" : result.ending?.emoji ?? "\u{1F3C1}"}
                    </span>
                    <span className="result-player-name">
                      {result.playerName}
                    </span>
                  </div>
                  <div className="result-ending-title">
                    {resultTitle(result) ?? "キャンパスライフ完走"}
                  </div>
                  <div className="result-ending-desc">
                    {resultDescription(result) ?? "4年間の選択がここに刻まれました。"}
                  </div>
                  {result.ending?.flavorText && (
                    <div className="result-flavor-text">
                      {result.ending.flavorText}
                    </div>
                  )}
                  <div className="result-mini-stats">
                    {result.academicStatus ? (
                      <>
                        <span>{result.lifeArchetype?.title}</span>
                        <span>{result.storyAward?.title}</span>
                        <span>学業: {result.academicStatus.title}</span>
                        <span>{result.storyTags?.slice(0, 3).join(" / ")}</span>
                      </>
                    ) : (
                      <>
                        <span>
                          単位: {result.resources.credits}
                        </span>
                        <span>
                          知性: {result.experience.intellect}
                        </span>
                        <span>
                          人脈: {result.experience.connections}
                        </span>
                        <span>
                          行動力: {result.experience.action_power}
                        </span>
                      </>
                    )}
                  </div>
                  <div className="result-breakdown-grid">
                    <div className="result-breakdown">
                      <div className="result-section-title">リソース</div>
                      <div className="result-chip-row">
                        {RESOURCE_KEYS.map((key) => (
                          <span key={key} className="result-stat-chip">
                            {RESOURCE_LABELS[key]}: {result.resources?.[key] ?? 0}
                          </span>
                        ))}
                      </div>
                    </div>
                    {result.scoreBreakdown && (
                      <div className="result-breakdown">
                        <div className="result-section-title">スコア内訳</div>
                        <div className="result-chip-row">
                          {Object.entries(result.scoreBreakdown).map(([key, value]) => (
                            <span
                              key={key}
                              className={`result-stat-chip ${key === "total" ? "result-stat-chip--total" : ""}`}
                            >
                              {SCORE_BREAKDOWN_LABELS[key as keyof typeof SCORE_BREAKDOWN_LABELS]}: {value}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                {!result.academicStatus && (
                  <div className="result-score">
                    <div>{result.score ?? result.scoreBreakdown?.total ?? "-"}</div>
                    <div className="result-score__label">SCORE</div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ─── Determine highlight square ─────────────────────────────────
  const highlightSquareId =
    state.phase === "choosing" && currentPlayer
      ? currentPlayer.position
      : undefined;

  const hasEventOverlay = showEvent !== null;

  return (
    <div className="display-page" data-theme="dark">
      {/* ── Header ────────────────────────────────────────────────── */}
      <header className="display-header">
        <div className="display-header__left">
          <span
            className="display-header__year-dot"
            style={{ background: yearColor(roundInfo.year) }}
          />
          <span className="display-header__round-label">
            {roundInfo.label}
          </span>
        </div>

        <div className="display-header__center">
          {isLifeMapMode && state.phase === "choosing" ? (
            <span>
              {pendingLifeChoiceCount}/{onlinePlayerCount} 選択済み
            </span>
          ) : currentPlayer ? (
            <>
              <span
                className="display-header__turn-name"
                style={{ color: yearColor(roundInfo.year) }}
              >
                {currentPlayer.name}
              </span>
              {" "}
              {state.phase === "choosing" ? "選択中..." : "のターン"}
            </>
          ) : (
            <span style={{ color: "var(--text-secondary)" }}>
              {state.phase === "lobby" ? "待機中" : "進行中"}
            </span>
          )}
        </div>

        <div className="display-header__right">
          <span>
            {state.mode === "life_map"
              ? `Season ${state.currentRound}/16`
              : `Month ${state.currentRound}/48`}
          </span>
          <span style={{ color: "var(--text-secondary)", fontSize: 12 }}>
            {statusLabel}
          </span>
          <div className="display-header__qr" title="Controller QR">
            <QRCodeCanvas value={controllerEntryUrl} size={42} />
          </div>
          <button
            className="display-header__fullscreen"
            onClick={requestFullscreen}
          >
            全画面
          </button>
        </div>
      </header>

      {/* ── Main ──────────────────────────────────────────────────── */}
      <div className="display-main">
        {/* Board area */}
        <div
          className={`display-board-area ${hasEventOverlay ? "display-board-area--dimmed" : ""}`}
        >
          {isLifeMapMode ? (
            <LifeMapStage state={state} />
          ) : (
            <div className="mountain-canvas-wrap">
              <MountainBoard
                players={state.players}
                currentPlayerId={currentPlayer?.id}
                highlightSquareId={highlightSquareId}
                cameraMode={cameraMode}
              />
            </div>
          )}

          {/* Camera mode toggle */}
          {!isLifeMapMode && (
          <div className="camera-toolbar">
            {(["overview", "follow", "cinema"] as CameraMode[]).map((m) => {
              const active = cameraMode === m;
              const label =
                m === "overview" ? "俯瞰" : m === "follow" ? "追従" : "シネマ";
              return (
                <button
                  key={m}
                  className={`camera-toolbar__btn ${active ? "camera-toolbar__btn--active" : ""}`}
                  onClick={() =>
                    setCameraOverride((cur) =>
                      cur === m ? null : m,
                    )
                  }
                  title={cameraOverride === m ? "自動に戻す" : `カメラ: ${label}`}
                >
                  {label}
                </button>
              );
            })}
            {cameraOverride && (
              <button
                className="camera-toolbar__btn camera-toolbar__btn--reset"
                onClick={() => setCameraOverride(null)}
                title="自動切替に戻す"
              >
                自動
              </button>
            )}
          </div>
          )}
        </div>

        {/* Side panel */}
        <div className="display-side">
          <div
            style={{
              fontSize: 12,
              color: "var(--text-secondary)",
              textTransform: "uppercase" as const,
              letterSpacing: "0.1em",
              marginBottom: 4,
            }}
          >
            Players ({state.players.length})
          </div>
          {state.players.map((player, index) => {
            const lifePlayer = lifePlayersById.get(player.id);
            const traitLabels = topLifeTraits(lifePlayer);
            const isActive = isLifeMapMode
              ? !state.pendingLifeChoices?.[player.id] && state.phase === "choosing"
              : currentPlayer?.id === player.id;
            const hasLifeChoice = Boolean(state.pendingLifeChoices?.[player.id]);
            const lastLifeEntry = lifePlayer?.history.at(-1);
            const lastLifeChoice = lastLifeEntry?.choiceLabel;
            return (
              <div
                key={player.id}
                className={`display-player-card ${isActive ? "display-player-card--active" : ""}`}
              >
                <div className="display-player-card__header">
                  <span
                    className="display-player-card__dot"
                    style={{ background: colorForPlayer(index) }}
                  />
                  <span className="display-player-card__name">
                    {player.name}
                    {!player.online && (
                      <span
                        style={{
                          fontSize: 11,
                          color: "var(--year-4)",
                          marginLeft: 6,
                        }}
                      >
                        offline
                      </span>
                    )}
                  </span>
                  <span className="display-player-card__pos">
                    {isLifeMapMode
                      ? hasLifeChoice ? "選んだ道" : "道を選択中"
                      : `#${player.position}`}
                  </span>
                </div>
                {isLifeMapMode ? (
                  <div className="display-player-card__life">
                    <div className="display-player-card__stats">
                      <span className="display-player-card__stat">
                        ⏱ {player.resources.time}
                      </span>
                      <span className="display-player-card__stat">
                        💰 {player.resources.money}
                      </span>
                      <span className="display-player-card__stat">
                        ❤️ {player.resources.health}
                      </span>
                      <span className="display-player-card__stat">
                        📚 {player.resources.credits}
                      </span>
                    </div>
                    <div className="display-player-card__life-tags">
                      {traitLabels.map((label) => (
                        <span key={label}>{label}</span>
                      ))}
                    </div>
                    <div className="display-player-card__last-route">
                      {lastLifeChoice ?? "まだ道は刻まれていない"}
                    </div>
                    {lastLifeEntry && (
                      <div className="display-player-card__story-tags">
                        {lastLifeEntry.storyTags.slice(0, 3).map((tag) => (
                          <span key={tag}>{tag}</span>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="display-player-card__stats">
                    <span className="display-player-card__stat">
                      ⏱ {player.resources.time}
                    </span>
                    <span className="display-player-card__stat">
                      💰 {player.resources.money}
                    </span>
                    <span className="display-player-card__stat">
                      ❤️ {player.resources.health}
                    </span>
                    <span className="display-player-card__stat">
                      📚 {player.resources.credits}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
          {state.players.length === 0 && (
            <div
              style={{
                color: "var(--text-secondary)",
                padding: "20px 0",
                textAlign: "center",
              }}
            >
              参加者を待っています...
            </div>
          )}
        </div>
      </div>

      {/* ── Month Reveal Overlay ─────────────────────────────────── */}
      {diceRoll && !showEvent && (
        <div className="round-end-banner">
          <div className="round-end-card" style={{ padding: "32px 48px" }}>
            <div style={{ fontSize: 14, color: "#a0a0b0", marginBottom: 8 }}>
              {diceRoll.name} の今月イベント
            </div>
            <div style={{ fontSize: 48, fontWeight: 800, lineHeight: 1 }}>
              Month {state.currentRound}
            </div>
            <div style={{ fontSize: 18, color: "#a0a0b0", marginTop: 8 }}>
              選択へ進む
            </div>
          </div>
        </div>
      )}

      {/* ── Event Overlay ─────────────────────────────────────────── */}
      {showEvent && (
        <div
          className={`event-overlay ${eventFading ? "event-overlay--fadeout" : ""}`}
        >
          <div className={`event-card ${showEvent.category ? "event-card--major" : ""}`}>
            {showEvent.category && (
              <div className="event-card__category">{showEvent.category}</div>
            )}
            <div className="event-card__title">{showEvent.title}</div>
            <div className="event-card__description">
              {showEvent.description}
            </div>
            {eventPlayerId && (
              <div className="event-card__player-label">
                {state.players.find((p) => p.id === eventPlayerId)?.name ??
                  "?"}{" "}
                の選択
              </div>
            )}

            <div className="event-card__choices">
              {showEvent.choices.map((choice, i) => {
                const isAvailable = eventAvailableIds.includes(choice.id);
                const isChosen = choiceResult?.choiceId === choice.id;
                const keyLabel = String.fromCharCode(65 + i); // A, B, C...

                let className = "event-choice";
                if (isChosen) className += " event-choice--chosen";
                else if (!isAvailable)
                  className += " event-choice--unavailable";
                else className += " event-choice--available";

                return (
                  <div key={choice.id} className={className}>
                    <div className="event-choice__key">{keyLabel}</div>
                    <div className="event-choice__text">
                      <div className="event-choice__label">{choice.label}</div>
                      {choice.description && (
                        <div className="event-choice__desc">
                          {choice.description}
                        </div>
                      )}
                      {choicePreviewBadges(choice)}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Show effects after choice */}
            {choiceResult && effectBadges(choiceResult.effects).length > 0 && (
              <div className="event-effects">
                {effectBadges(choiceResult.effects)}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Round-end Banner ──────────────────────────────────────── */}
      {roundEndInfo && (
        <div className="round-end-banner">
          <div className="round-end-card">
            <div
              className="round-end-card__label"
              style={{ color: yearColor(roundEndInfo.year) }}
            >
              {roundEndInfo.label}
            </div>
            <div className="round-end-card__sub">ラウンド終了</div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Mount ────────────────────────────────────────────────────────
document.documentElement.setAttribute("data-theme", "dark");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <DisplayPage />
  </StrictMode>,
);
