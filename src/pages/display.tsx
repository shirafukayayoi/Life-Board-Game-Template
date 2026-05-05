import { StrictMode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import confetti from "canvas-confetti";
import { MountainBoard, type CameraMode } from "../components/MountainBoard";
import "../index.css";
import "../App.css";
import {
  colorForPlayer,
  getRoundInfo,
  type ClientMessage,
  type GameEvent,
  type GameState,
  type ChoiceResult,
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

// ═══════════════════════════════════════════════════════════════════
//  Display Page
// ═══════════════════════════════════════════════════════════════════

export function DisplayPage() {
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

  const hostUrl = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("host") || window.location.origin;
  }, []);
  const targetUrl = useMemo(() => wsUrlFromInput(hostUrl), [hostUrl]);
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

  // Auto-derive camera mode from game phase
  const autoCameraMode: CameraMode = useMemo(() => {
    if (state.phase === "lobby") return "cinema";
    if (
      currentPlayer &&
      (state.phase === "rolling" ||
        state.phase === "choosing" ||
        state.phase === "animating")
    ) {
      return "follow";
    }
    return "overview";
  }, [state.phase, currentPlayer]);
  const cameraMode = cameraOverride ?? autoCameraMode;

  // Fade out event overlay after choice result
  const fadeOutEvent = useCallback(() => {
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
          setState(message.state);
          break;

        case "show_event":
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

        case "choice_result":
          setChoiceResult(message.result);
          // Auto-dismiss after 3 seconds
          setTimeout(() => {
            fadeOutEvent();
          }, 3000);
          break;

        case "round_end":
          setRoundEndInfo(message.roundInfo);
          setTimeout(() => setRoundEndInfo(null), 3000);
          break;

        case "game_result":
          setGameResults(message.results);
          // Show intro for 3s, then reveal content
          setTimeout(() => {
            setShowResultContent(true);
            // Fire confetti for the winner
            confetti({
              particleCount: 150,
              spread: 100,
              origin: { y: 0.5 },
            });
          }, 3200);
          break;

        case "system":
          setStatus(message.message);
          break;
      }
    };

    socket.onclose = () => setStatus("切断されました");
    socket.onerror = () => setStatus("接続エラー");

    return () => socket.close();
  }, [targetUrl, fadeOutEvent]);

  const requestFullscreen = async () => {
    try {
      await document.documentElement.requestFullscreen();
    } catch {
      // Fullscreen may not be supported
    }
  };

  // ─── Result screen ──────────────────────────────────────────────
  if (gameResults) {
    return (
      <div className="result-screen">
        {!showResultContent && (
          <div className="result-intro">4年間が過ぎた...</div>
        )}
        {showResultContent && (
          <div className="result-content">
            <h1 style={{ textAlign: "center", marginBottom: 8 }}>
              卒業 — 最終結果
            </h1>
            {gameResults.map((result) => (
              <div
                key={result.playerId}
                className={`result-player ${result.rank === 1 ? "result-player--winner" : ""}`}
              >
                <div
                  className={`result-rank ${result.rank <= 3 ? `result-rank--${result.rank}` : ""}`}
                >
                  #{result.rank}
                </div>
                <div className="result-info">
                  <div className="result-ending-header">
                    <span className="result-emoji">{result.ending.emoji}</span>
                    <span className="result-player-name">
                      {result.playerName}
                    </span>
                  </div>
                  <div className="result-ending-title">
                    {result.ending.title}
                  </div>
                  <div className="result-ending-desc">
                    {result.ending.description}
                  </div>
                  <div className="result-mini-stats">
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
                  </div>
                </div>
                <div className="result-score">
                  <div>{result.score}</div>
                  <div className="result-score__label">SCORE</div>
                </div>
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
          {currentPlayer ? (
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
          <span>Round {state.currentRound}/16</span>
          <span style={{ color: "var(--text-secondary)", fontSize: 12 }}>
            {statusLabel}
          </span>
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
          <div className="mountain-canvas-wrap">
            <MountainBoard
              players={state.players}
              currentPlayerId={currentPlayer?.id}
              highlightSquareId={highlightSquareId}
              cameraMode={cameraMode}
            />
          </div>

          {/* Camera mode toggle */}
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
            const isActive = currentPlayer?.id === player.id;
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
                    #{player.position}
                  </span>
                </div>
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

      {/* ── Dice Roll Overlay ────────────────────────────────────── */}
      {diceRoll && !showEvent && (
        <div className="round-end-banner">
          <div className="round-end-card" style={{ padding: "32px 48px" }}>
            <div style={{ fontSize: 14, color: "#a0a0b0", marginBottom: 8 }}>
              {diceRoll.name} がサイコロを振った
            </div>
            <div style={{ fontSize: 72, fontWeight: 800, lineHeight: 1 }}>
              {diceRoll.value}
            </div>
            <div style={{ fontSize: 18, color: "#a0a0b0", marginTop: 8 }}>
              {diceRoll.squares}マス進む
            </div>
          </div>
        </div>
      )}

      {/* ── Event Overlay ─────────────────────────────────────────── */}
      {showEvent && (
        <div
          className={`event-overlay ${eventFading ? "event-overlay--fadeout" : ""}`}
        >
          <div className="event-card">
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
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Show effects after choice */}
            {choiceResult && (
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
