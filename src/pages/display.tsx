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
  type Season,
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

const RESULT_FLAG_LABELS: Record<string, string> = {
  has_partner: "恋人あり",
  cheating: "浮気",
  has_license: "免許あり",
  studying_abroad: "留学",
  on_leave: "休学",
  in_seminar: "ゼミ所属",
  teaching_cert: "教職課程",
  career_failed: "進路保留",
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

function flagBadges(result: ChoiceResult) {
  const labels: string[] = [];
  if (result.flagEffects?.has_partner === true) labels.push("恋人ができた");
  if (result.flagEffects?.has_partner === false) labels.push("恋人関係が終わった");
  if (result.flagEffects?.cheating === true) labels.push("浮気ステータス");
  if (result.randomOutcome === "cheat_exposed") labels.push("浮気発覚");
  return labels.map((label) => (
    <span key={`${result.playerId}-${label}`} className="event-effect-badge event-effect-badge--negative">
      {label}
    </span>
  ));
}

const RISK_LABELS: Record<NonNullable<EventChoice["preview"]>["risk"], string> = {
  low: "低リスク",
  medium: "中リスク",
  high: "高リスク",
  unknown: "不明",
};

const LIFE_TRAIT_LABELS: Record<string, string> = {
  academic: "学び",
  stability: "生活",
  wellbeing: "休み",
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
          伸びる {gain}
        </span>
      ))}
      {choice.preview?.cost.slice(0, 2).map((cost) => (
        <span key={`cost-${cost}`} className="event-choice__preview-chip event-choice__preview-chip--cost">
          使う {cost}
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

const BOARD_MONTH_COUNT = 48;
const ACADEMIC_MONTH_NUMBERS = [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3];
type DisplayPlayer = GameState["players"][number];
type ActiveChoicePanel = {
  player: DisplayPlayer;
  event: GameEvent | null;
  availableChoiceIds: string[];
  selectedChoiceId?: string;
};

const MONTH_SEASON_META: Record<Season, { label: string; cue: string; mark: string }> = {
  spring: { label: "春", cue: "履修・新歓", mark: "SPR" },
  summer: { label: "夏", cue: "試験・夏休み", mark: "SUM" },
  autumn: { label: "秋", cue: "学祭・後期", mark: "AUT" },
  winter: { label: "冬", cue: "進級・締切", mark: "WIN" },
};

const YEAR_STAGE_LABELS: Record<number, string> = {
  1: "入学と探索",
  2: "広がる生活",
  3: "専門と挑戦",
  4: "進路と卒業",
};

function monthNumberForRound(round: number) {
  return ACADEMIC_MONTH_NUMBERS[(round - 1) % ACADEMIC_MONTH_NUMBERS.length];
}

function monthFromPosition(position: string) {
  const match = position.match(/^\d+/);
  if (!match) return 1;
  const value = Number(match[0]);
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.min(BOARD_MONTH_COUNT, value));
}

function turnGroupName(players: DisplayPlayer[]) {
  if (players.length === 0) return "全員待機";
  if (players.length >= 3) return `全員（${players.length}人）`;
  return players.map((player) => player.name).join(" と ");
}

function phaseLabel(phase: GameState["phase"]) {
  const labels: Record<GameState["phase"], string> = {
    lobby: "待機中",
    rolling: "月イベント待ち",
    choosing: "選択中",
    animating: "結果発表",
    year_recap: "年末報告",
    result: "結果",
  };
  return labels[phase];
}

function exPartnerLabel(gender?: PlayerResult["gender"]) {
  if (gender === "male") return "元カノ数";
  if (gender === "female") return "元カレ数";
  return "元恋人数";
}

function submissionLabel(submittedBy?: ChoiceResult["submittedBy"]) {
  if (submittedBy === "display") return "ディスプレイ代行";
  if (submittedBy === "host") return "ホスト代行";
  return "本人選択";
}

function TurnGroupResultPanel({ results }: { results: ChoiceResult[] }) {
  if (results.length === 0) return null;

  return (
    <div className="turn-result-comparison">
      <div className="turn-result-comparison__title">
        {results.length > 1 ? "ふたりの選択" : "選択結果"}
      </div>
      <div className="turn-result-comparison__grid">
        {results.map((result) => (
          <div key={`${result.playerId}-${result.choiceId}`} className="turn-result-card">
            <div className="turn-result-card__player">{result.playerName}</div>
            <div className="turn-result-card__choice">{result.choiceLabel}</div>
            <div className="event-effects">
              {effectBadges(result.effects)}
              {flagBadges(result)}
            </div>
            <div className="turn-result-card__meta">
              {result.tone && <span>{result.tone}</span>}
              <span>{submissionLabel(result.submittedBy)}</span>
              {result.storyTags?.slice(0, 2).map((tag) => (
                <span key={`${result.playerId}-${tag}`}>{tag}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DisplayFallbackChoicePanel({
  panel,
  index,
  onSelect,
}: {
  panel: ActiveChoicePanel;
  index: number;
  onSelect: (playerId: string, choiceId: string) => void;
}) {
  const { player, event, availableChoiceIds, selectedChoiceId } = panel;
  const selectedChoice = event?.choices.find((choice) => choice.id === selectedChoiceId);

  return (
    <section className="display-fallback-player" style={{ "--player-color": colorForPlayer(index) } as CSSProperties}>
      <div className="display-fallback-player__header">
        <span className="display-fallback-player__avatar">{initials(player.name)}</span>
        <div>
          <div className="display-fallback-player__name">{player.name}</div>
          <div className="display-fallback-player__state">
            {selectedChoice ? `選択済み: ${selectedChoice.label}` : "ディスプレイから代行選択できます"}
          </div>
        </div>
      </div>

      {event ? (
        <>
          <div className="display-fallback-player__event">{event.title}</div>
          <div className="display-fallback-choice-list">
            {event.choices.map((choice, choiceIndex) => {
              const isAvailable = availableChoiceIds.includes(choice.id);
              const isSelected = selectedChoiceId === choice.id;
              const keyLabel = String.fromCharCode(65 + choiceIndex);
              return (
                <button
                  key={choice.id}
                  className={[
                    "display-fallback-choice",
                    isAvailable ? "display-fallback-choice--available" : "display-fallback-choice--unavailable",
                    isSelected ? "display-fallback-choice--selected" : "",
                  ].filter(Boolean).join(" ")}
                  disabled={!isAvailable || Boolean(selectedChoiceId)}
                  onClick={() => onSelect(player.id, choice.id)}
                >
                  <span className="display-fallback-choice__key">{keyLabel}</span>
                  <span className="display-fallback-choice__body">
                    <span className="display-fallback-choice__label">{choice.label}</span>
                    {choice.description && (
                      <span className="display-fallback-choice__desc">{choice.description}</span>
                    )}
                    {choicePreviewBadges(choice)}
                  </span>
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <div className="display-fallback-player__empty">
          このプレイヤーのイベント待ちです。
        </div>
      )}
    </section>
  );
}

function YearRecapStage({
  state,
  recap,
  onContinue,
}: {
  state: GameState;
  recap: NonNullable<GameState["yearRecap"]>;
  onContinue: () => void;
}) {
  const playerIndexById = new Map(state.players.map((player, index) => [player.id, index]));

  return (
    <section className="year-recap-stage">
      <div className="year-recap-stage__bg" aria-hidden="true">
        <span>YEAR {recap.year}</span>
        <span>CHECKPOINT</span>
      </div>
      <header className="year-recap-stage__header">
        <div>
          <div className="year-recap-stage__eyebrow">School Year Recap</div>
          <h1>{recap.title}</h1>
          <p>
            {recap.year}年目終了。ここまでの単位、生活の強み、少し危ないサインを全員で見ます。
          </p>
        </div>
        <div className="year-recap-stage__meter">
          <strong>{recap.players.length}人</strong>
          <span>今の状態を確認中</span>
          <button type="button" className="display-stage-button" onClick={onContinue}>
            次の学年へ進む
          </button>
        </div>
      </header>

      <div className="year-recap-grid">
        {recap.players.map((player) => {
          const playerIndex = playerIndexById.get(player.playerId) ?? 0;
          return (
            <article
              key={player.playerId}
              className="year-recap-card"
              style={{ "--player-color": colorForPlayer(playerIndex) } as CSSProperties}
            >
              <div className="year-recap-card__top">
                <span className="year-recap-card__avatar">{initials(player.playerName)}</span>
                <div>
                  <h2>{player.playerName}</h2>
                  <div className="year-recap-card__outlook">{player.graduationOutlook}</div>
                </div>
              </div>

              <div className="year-recap-card__credits">
                <span>{player.credits}単位</span>
                <strong>{player.creditStatus}</strong>
              </div>

              <div className="year-recap-card__stats">
                <span>時間 {player.resources.time}</span>
                <span>お金 {player.resources.money}</span>
                <span>体力 {player.resources.health}</span>
                <span>知性 {Math.round(player.experience.intellect)}</span>
                <span>人脈 {Math.round(player.experience.connections)}</span>
                <span>{player.flags.has_partner ? "恋人あり" : "恋人なし"}</span>
                <span>{exPartnerLabel(player.gender)} {player.romance?.exPartnerCount ?? 0}</span>
                {player.flags.cheating && <span>浮気あり</span>}
              </div>

              <div className="year-recap-card__tags">
                {(player.strengths.length > 0 ? player.strengths : ["まだ方向を探している"]).slice(0, 3).map((strength) => (
                  <span key={`strength-${player.playerId}-${strength}`}>{strength}</span>
                ))}
              </div>

              <div className="year-recap-card__warnings">
                {(player.warningSigns.length > 0 ? player.warningSigns : ["大きな警告なし"]).slice(0, 2).map((warning) => (
                  <span key={`warning-${player.playerId}-${warning}`}>{warning}</span>
                ))}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function MonthArchiveStage({
  state,
  currentPlayerId,
}: {
  state: GameState;
  currentPlayerId?: string;
}) {
  const currentMonth = Math.max(1, Math.min(BOARD_MONTH_COUNT, state.currentRound));
  const progressPercent = Math.round(((currentMonth - 1) / (BOARD_MONTH_COUNT - 1)) * 100);
  const playersByMonth = new Map<number, { id: string; name: string; index: number; active: boolean }[]>();

  state.players.forEach((player, index) => {
    const month = monthFromPosition(player.position);
    const owners = playersByMonth.get(month) ?? [];
    owners.push({
      id: player.id,
      name: player.name,
      index,
      active: player.id === currentPlayerId,
    });
    playersByMonth.set(month, owners);
  });

  const monthRows = [1, 2, 3, 4].map((year) =>
    Array.from({ length: 12 }, (_, monthIndex) => getRoundInfo((year - 1) * 12 + monthIndex + 1)),
  );

  return (
    <div className="month-calendar-stage">
      <div className="month-calendar-stage__skyline" aria-hidden="true">
        <span>LIB</span>
        <span>CAFE</span>
        <span>LAB</span>
        <span>CLUB</span>
      </div>

      <div className="month-calendar-stage__header">
        <div>
          <div className="month-calendar-stage__eyebrow">Campus Calendar</div>
          <div className="month-calendar-stage__title">
            48か月のキャンパスを進む
          </div>
          <div className="month-calendar-stage__event">
            {state.currentEvent?.title ?? "全員の準備が終わると、1か月目のイベントが始まります"}
          </div>
        </div>
        <div className="month-calendar-stage__meter">
          <strong>Month {currentMonth}/48</strong>
          <span>{getRoundInfo(currentMonth).label}</span>
          <div className="month-calendar-stage__progress">
            <i style={{ width: `${progressPercent}%` }} />
          </div>
        </div>
      </div>

      <div className="month-calendar-board" style={{ "--current-year-color": yearColor(getRoundInfo(currentMonth).year) } as CSSProperties}>
        {monthRows.map((months) => {
          const year = months[0]?.year ?? 1;
          return (
            <section
              key={year}
              className={[
                "month-calendar-year",
                currentMonth >= months[0].round && currentMonth <= months[months.length - 1].round
                  ? "month-calendar-year--current"
                  : "",
              ].filter(Boolean).join(" ")}
              style={{ "--year-color": yearColor(year) } as CSSProperties}
            >
              <div className="month-calendar-year__label">
                <span>{year}年</span>
                <small>{YEAR_STAGE_LABELS[year]}</small>
              </div>
              <div className="month-calendar-year__months">
                {months.map((monthInfo) => {
                  const seasonMeta = MONTH_SEASON_META[monthInfo.season];
                  const owners = playersByMonth.get(monthInfo.round) ?? [];
                  const isCurrent = monthInfo.round === currentMonth;
                  const isPast = monthInfo.round < currentMonth;
                  const isCheckpoint = monthInfo.round % 12 === 0;
                  return (
                    <div
                      key={monthInfo.round}
                      className={[
                        "month-tile",
                        `month-tile--${monthInfo.season}`,
                        isCurrent ? "month-tile--current" : "",
                        isPast ? "month-tile--past" : "",
                        isCheckpoint ? "month-tile--checkpoint" : "",
                        owners.length > 0 ? "month-tile--occupied" : "",
                      ].filter(Boolean).join(" ")}
                    >
                      <div className="month-tile__number">
                        {String(monthInfo.round).padStart(2, "0")}
                      </div>
                      <div className="month-tile__main">
                        {monthNumberForRound(monthInfo.round)}月
                      </div>
                      <div className="month-tile__season">
                        <span>{seasonMeta.mark}</span>
                        {seasonMeta.label}
                      </div>
                      <div className="month-tile__cue">{seasonMeta.cue}</div>
                      {owners.length > 0 && (
                        <div className="month-tile__tokens">
                          {owners.slice(0, 5).map((owner) => (
                            <span
                              key={owner.id}
                              className={`month-tile__token ${owner.active ? "month-tile__token--active" : ""}`}
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
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function FocusedMonthStage({
  state,
  currentPlayerId,
  activeTurnPlayers,
  pendingChoiceCount,
  lastTurnGroupResults,
  onOpenArchive,
}: {
  state: GameState;
  currentPlayerId?: string;
  activeTurnPlayers: DisplayPlayer[];
  pendingChoiceCount: number;
  lastTurnGroupResults: ChoiceResult[];
  onOpenArchive: () => void;
}) {
  const currentMonth = Math.max(1, Math.min(BOARD_MONTH_COUNT, state.currentRound));
  const roundInfo = getRoundInfo(currentMonth);
  const seasonMeta = MONTH_SEASON_META[roundInfo.season];
  const currentPlayer = state.players.find((player) => player.id === currentPlayerId);
  const groupLabel = turnGroupName(activeTurnPlayers.length > 0 ? activeTurnPlayers : currentPlayer ? [currentPlayer] : []);
  const progressPercent = Math.round(((currentMonth - 1) / (BOARD_MONTH_COUNT - 1)) * 100);
  const nextMonths = [1, 2, 3]
    .map((offset) => currentMonth + offset)
    .filter((month) => month <= BOARD_MONTH_COUNT);
  const previousMonth = currentMonth > 1 ? currentMonth - 1 : null;

  return (
    <div className="focused-month-stage" style={{ "--season-color": yearColor(roundInfo.year) } as CSSProperties}>
      <div className="focused-month-stage__ambient" aria-hidden="true">
        <span>1年</span>
        <span>2年</span>
        <span>3年</span>
        <span>4年</span>
      </div>

      <div className="focused-month-stage__path" aria-hidden="true">
        {previousMonth && (
          <div className="focused-path-panel focused-path-panel--past">
            <span>{previousMonth}</span>
          </div>
        )}
        <div className="focused-path-panel focused-path-panel--current">
          <span>{currentMonth}</span>
        </div>
        {nextMonths.map((month, index) => (
          <div
            key={month}
            className="focused-path-panel focused-path-panel--future"
            style={{ left: `${52 + index * 17}%` }}
          >
            <span>?</span>
          </div>
        ))}
      </div>

      <section className="focused-event-card">
        <div className="focused-event-card__meta">
          <span>Month {currentMonth}/48</span>
          <span>{roundInfo.label}</span>
          <span>{seasonMeta.label} / {seasonMeta.cue}</span>
        </div>
        <h2>
          {state.currentEvent?.title ?? `${monthNumberForRound(currentMonth)}月のイベント`}
        </h2>
        <p>
          {state.currentEvent?.description ??
            (state.phase === "lobby"
              ? "最初のイベントは、参加者の準備が終わるまで伏せられています。"
              : "次のイベントを表示します。")}
        </p>
        <div className="focused-event-card__chips">
          <span>{phaseLabel(state.phase)}</span>
          <span>{activeTurnPlayers.length > 1 ? `${groupLabel} のターン` : currentPlayer ? `${currentPlayer.name} の番` : "全員待機"}</span>
          {state.phase === "choosing" && activeTurnPlayers.length > 0 && (
            <span>{pendingChoiceCount}/{activeTurnPlayers.length} 選択済み</span>
          )}
          <span>{state.players.length}人参加</span>
        </div>
        <TurnGroupResultPanel results={lastTurnGroupResults} />
      </section>

      <aside className="focused-month-panel">
        <div className="focused-month-panel__title">4年間の道のり</div>
        <div className="focused-month-panel__rail">
          {[1, 2, 3, 4].map((year) => (
            <span
              key={year}
              className={year === roundInfo.year ? "focused-month-panel__year focused-month-panel__year--active" : "focused-month-panel__year"}
              style={{ "--year-color": yearColor(year) } as CSSProperties}
            >
              {year}
            </span>
          ))}
          <i style={{ height: `${progressPercent}%` }} />
        </div>
        <div className="focused-month-panel__hint">
          この先のイベントは、進むまで表示されません。
        </div>
        <button className="focused-month-panel__archive" onClick={onOpenArchive}>
          48か月一覧
        </button>
      </aside>
    </div>
  );
}

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

  // Round-end banner
  const [roundEndInfo, setRoundEndInfo] = useState<RoundInfo | null>(null);

  // Game result
  const [gameResults, setGameResults] = useState<PlayerResult[] | null>(null);
  const [showResultContent, setShowResultContent] = useState(false);
  const [showMonthArchive, setShowMonthArchive] = useState(false);

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
  const isLifeMapMode = state.mode === "life_map";

  const activeTurnPlayerIds = useMemo(() => {
    const knownPlayerIds = new Set(state.players.map((player) => player.id));
    const groupedIds = (state.activeTurnPlayerIds ?? []).filter((playerId) =>
      knownPlayerIds.has(playerId),
    );
    if (!isLifeMapMode && groupedIds.length === 0 && currentPlayer) {
      return [currentPlayer.id];
    }
    return groupedIds;
  }, [currentPlayer, isLifeMapMode, state.activeTurnPlayerIds, state.players]);

  const activeTurnPlayers = useMemo(
    () =>
      activeTurnPlayerIds
        .map((playerId) => state.players.find((player) => player.id === playerId))
        .filter((player): player is DisplayPlayer => Boolean(player)),
    [activeTurnPlayerIds, state.players],
  );

  const roundInfo = useMemo(
    () => getRoundInfo(state.currentRound),
    [state.currentRound],
  );
  const pendingLifeChoiceCount = Object.keys(state.pendingLifeChoices ?? {}).length;
  const onlinePlayerCount = state.players.filter((player) => player.online).length;
  const lifePlayersById = useMemo(
    () => new Map((state.lifePlayers ?? []).map((player) => [player.id, player])),
    [state.lifePlayers],
  );
  const primaryCurrentPlayer = activeTurnPlayers[0] ?? currentPlayer;
  const pendingTurnChoices = useMemo(
    () => state.pendingTurnChoices ?? {},
    [state.pendingTurnChoices],
  );
  const activeTurnPendingCount = activeTurnPlayers.filter((player) =>
    Boolean(pendingTurnChoices[player.id]),
  ).length;
  const lastTurnGroupResults = state.lastTurnGroupResults?.length
    ? state.lastTurnGroupResults
    : state.lastChoiceResult
      ? [state.lastChoiceResult]
      : [];
  const activeChoicePanels = useMemo<ActiveChoicePanel[]>(
    () =>
      activeTurnPlayers.map((player) => {
        const playerEvent =
          state.activeTurnEvents?.[player.id] ??
          (eventPlayerId === player.id ? showEvent : null) ??
          state.currentEvent ??
          showEvent;
        const availableChoiceIds =
          state.availableChoiceIdsByPlayer?.[player.id] ??
          (eventPlayerId === player.id ? eventAvailableIds : undefined) ??
          state.availableChoiceIds;
        return {
          player,
          event: playerEvent,
          availableChoiceIds,
          selectedChoiceId: pendingTurnChoices[player.id],
        };
      }),
    [
      activeTurnPlayers,
      eventAvailableIds,
      eventPlayerId,
      pendingTurnChoices,
      showEvent,
      state.activeTurnEvents,
      state.availableChoiceIds,
      state.availableChoiceIdsByPlayer,
      state.currentEvent,
    ],
  );
  const hasDisplayFallbackControls =
    !isLifeMapMode &&
    state.phase === "choosing" &&
    activeChoicePanels.some((panel) => panel.event?.choices.length);

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

  const sendMessage = useCallback((payload: ClientMessage) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      return;
    }
    wsRef.current.send(JSON.stringify(payload));
  }, []);

  const sendDisplayChoice = useCallback((playerId: string, choiceId: string) => {
    const payload: ClientMessage = {
      type: "display_player_choice",
      playerId,
      choiceId,
    };
    sendMessage(payload);
  }, [sendMessage]);

  const continueYearRecap = useCallback(() => {
    sendMessage({ type: "continue_year_recap" });
  }, [sendMessage]);

  const continueTurnResults = useCallback(() => {
    sendMessage({ type: "continue_turn_results" });
  }, [sendMessage]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      if (state.phase === "year_recap") {
        event.preventDefault();
        continueYearRecap();
      } else if (state.phase === "animating") {
        event.preventDefault();
        continueTurnResults();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [continueTurnResults, continueYearRecap, state.phase]);

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
          if (message.state.phase !== "lobby") {
            setStatus("接続済み");
          }
          if (message.state.phase === "choosing" && message.state.currentEvent) {
            setShowEvent((current) => current ?? message.state.currentEvent);
            setEventPlayerId(message.state.turnOrder[message.state.turnIndex] ?? null);
            setEventAvailableIds(message.state.availableChoiceIds);
            setEventFading(false);
          }
          stateRef.current = message.state;
          setState(message.state);
          break;

        case "show_event":
          setStatus("接続済み");
          playSfx("event");
          setShowEvent(message.event);
          setEventPlayerId(message.playerId);
          setEventAvailableIds(message.availableChoiceIds);
          setChoiceResult(null);
          setEventFading(false);
          break;

        case "show_life_event":
          setStatus("接続済み");
          playSfx("event");
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
                    {resultDescription(result) ?? "4年間の選択結果です。"}
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
                    <div className="result-breakdown">
                      <div className="result-section-title">経験値</div>
                      <div className="result-chip-row">
                        {EXPERIENCE_KEYS.map((key) => (
                          <span key={key} className="result-stat-chip">
                            {EXPERIENCE_LABELS[key]}: {Math.round(result.experience?.[key] ?? 0)}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="result-breakdown">
                      <div className="result-section-title">状態</div>
                      <div className="result-chip-row">
                        <span className="result-stat-chip">
                          恋人: {result.flags?.has_partner ? "あり" : "なし"}
                        </span>
                        <span className="result-stat-chip">
                          {exPartnerLabel(result.gender)}: {result.romance?.exPartnerCount ?? 0}
                        </span>
                        <span className="result-stat-chip">
                          交際回数: {result.romance?.relationshipStartCount ?? 0}
                        </span>
                        <span className="result-stat-chip">
                          別れた回数: {result.romance?.breakupCount ?? 0}
                        </span>
                        {Object.entries(result.flags ?? {})
                          .filter(([key, value]) => value === true && RESULT_FLAG_LABELS[key])
                          .map(([key]) => (
                            <span key={key} className="result-stat-chip">
                              {RESULT_FLAG_LABELS[key]}
                            </span>
                          ))}
                      </div>
                    </div>
                    {result.yearAnchors && result.yearAnchors.length > 0 && (
                      <div className="result-breakdown">
                        <div className="result-section-title">一年ごとの方針ログ</div>
                        <div className="result-chip-row">
                          {result.yearAnchors.map((anchor) => (
                            <span key={`${result.playerId}-${anchor.year}`} className="result-stat-chip">
                              {anchor.year}年後: {anchor.choiceLabel}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {result.yearLogs && result.yearLogs.length > 0 && (
                      <div className="result-breakdown">
                        <div className="result-section-title">一年ごとの変化ログ</div>
                        <div className="result-chip-row">
                          {result.yearLogs.map((log) => (
                            <span key={`${result.playerId}-log-${log.year}`} className="result-stat-chip">
                              {log.year}年: {log.summary}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
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

  const isYearRecap = state.phase === "year_recap" && Boolean(state.yearRecap);
  const overlayEvent = showEvent ?? activeChoicePanels.find((panel) => panel.event)?.event ?? null;
  const isGroupResultOverlay =
    !isLifeMapMode &&
    state.phase === "animating" &&
    lastTurnGroupResults.length > 1;
  const hasEventOverlay =
    !isYearRecap && (isGroupResultOverlay || overlayEvent !== null || hasDisplayFallbackControls);
  const headerGroupLabel = turnGroupName(activeTurnPlayers);

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
          ) : !isLifeMapMode && activeTurnPlayers.length > 0 ? (
            <>
              <span
                className="display-header__turn-name"
                style={{ color: yearColor(roundInfo.year) }}
              >
                {headerGroupLabel}
              </span>
              {" "}
              {state.phase === "choosing"
                ? `${activeTurnPendingCount}/${activeTurnPlayers.length} 選択済み`
                : state.phase === "animating"
                  ? "の結果発表"
                  : "のターン"}
            </>
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
              {phaseLabel(state.phase)}
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
      <div className={`display-main ${isYearRecap ? "display-main--recap" : ""}`}>
        {isYearRecap && state.yearRecap ? (
          <YearRecapStage state={state} recap={state.yearRecap} onContinue={continueYearRecap} />
        ) : (
          <>
        {/* Board area */}
        <div
          className={`display-board-area ${hasEventOverlay ? "display-board-area--dimmed" : ""}`}
        >
          {isLifeMapMode ? (
            <LifeMapStage state={state} />
          ) : (
            <FocusedMonthStage
              state={state}
              currentPlayerId={primaryCurrentPlayer?.id}
              activeTurnPlayers={activeTurnPlayers}
              pendingChoiceCount={activeTurnPendingCount}
              lastTurnGroupResults={lastTurnGroupResults}
              onOpenArchive={() => setShowMonthArchive(true)}
            />
          )}
          {!isLifeMapMode && showMonthArchive && (
            <div className="month-archive-modal">
              <MonthArchiveStage state={state} currentPlayerId={primaryCurrentPlayer?.id} />
              <button
                className="month-archive-modal__close"
                onClick={() => setShowMonthArchive(false)}
              >
                閉じる
              </button>
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
              : activeTurnPlayerIds.includes(player.id);
            const hasLifeChoice = Boolean(state.pendingLifeChoices?.[player.id]);
            const hasBoardChoice = Boolean(pendingTurnChoices[player.id]);
            const boardTurnStatus =
              state.phase === "choosing"
                ? hasBoardChoice ? "選択済み" : "選択中"
                : state.phase === "animating"
                  ? "発表中"
                  : "進行中";
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
                      : isActive
                        ? boardTurnStatus
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
                      {lastLifeChoice ?? "まだ選択履歴はありません"}
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
          </>
        )}
      </div>

      {/* ── Event Overlay ─────────────────────────────────────────── */}
      {hasEventOverlay && (overlayEvent || isGroupResultOverlay) && (
        <div
          className={`event-overlay ${eventFading ? "event-overlay--fadeout" : ""}`}
        >
          <div className={`event-card ${overlayEvent?.category ? "event-card--major" : ""} ${(hasDisplayFallbackControls || isGroupResultOverlay) ? "event-card--group" : ""}`}>
            {overlayEvent?.category && (
              <div className="event-card__category">{overlayEvent.category}</div>
            )}
            <div className="event-card__title">
              {isGroupResultOverlay ? "ふたりの選択が出そろった" : overlayEvent?.title}
            </div>
            <div className="event-card__description">
              {isGroupResultOverlay
                ? "同じ月の出来事でも、選び方にはその人らしさが出る。"
                : overlayEvent?.description}
            </div>

            {isGroupResultOverlay ? null : hasDisplayFallbackControls ? (
              <div className="event-card__player-label">
                {headerGroupLabel} のターン
                <span>{activeTurnPendingCount}/{activeTurnPlayers.length} 選択済み</span>
              </div>
            ) : eventPlayerId ? (
              <div className="event-card__player-label">
                {state.players.find((p) => p.id === eventPlayerId)?.name ??
                  "?"}{" "}
                の選択
              </div>
            ) : null}

            {isGroupResultOverlay ? (
              <>
                <TurnGroupResultPanel results={lastTurnGroupResults} />
                <button type="button" className="display-stage-button" onClick={continueTurnResults}>
                  次へ進む
                </button>
              </>
            ) : hasDisplayFallbackControls ? (
              <div className="display-fallback-grid">
                {activeChoicePanels.map((panel, index) => (
                  <DisplayFallbackChoicePanel
                    key={panel.player.id}
                    panel={panel}
                    index={index}
                    onSelect={sendDisplayChoice}
                  />
                ))}
              </div>
            ) : overlayEvent ? (
              <div className="event-card__choices">
                {overlayEvent.choices.map((choice, i) => {
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
            ) : null}

            {/* Show effects after choice */}
            {!isGroupResultOverlay && choiceResult && (
              <div className="event-effects">
                {effectBadges(choiceResult.effects)}
                {flagBadges(choiceResult)}
              </div>
            )}
            {!isGroupResultOverlay && lastTurnGroupResults.length > 1 && (
              <TurnGroupResultPanel results={lastTurnGroupResults} />
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
