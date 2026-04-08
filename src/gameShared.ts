// ─── Resource Stats ───────────────────────────────────────────────
export type ResourceKey = "time" | "money" | "credits" | "health";

export type ResourceStats = Record<ResourceKey, number>;

export const RESOURCE_KEYS: ResourceKey[] = [
  "time",
  "money",
  "credits",
  "health",
];

export const RESOURCE_LABELS: Record<ResourceKey, string> = {
  time: "時間",
  money: "お金",
  credits: "単位",
  health: "体力",
};

// ─── Experience Stats ─────────────────────────────────────────────
export type ExperienceKey =
  | "intellect"
  | "connections"
  | "work_tolerance"
  | "action_power"
  | "romance_exp";

export type ExperienceStats = Record<ExperienceKey, number>;

export const EXPERIENCE_KEYS: ExperienceKey[] = [
  "intellect",
  "connections",
  "work_tolerance",
  "action_power",
  "romance_exp",
];

export const EXPERIENCE_LABELS: Record<ExperienceKey, string> = {
  intellect: "知性",
  connections: "人脈",
  work_tolerance: "労働耐性",
  action_power: "行動力",
  romance_exp: "恋愛力",
};

// ─── Special Flags ────────────────────────────────────────────────
export type ClubType = "circle" | "team" | "none" | "community";
export type JobType =
  | "food_service"
  | "tutor"
  | "retail"
  | "intern"
  | "side_biz";

export interface SpecialFlags {
  living_alone: boolean;
  has_partner: boolean;
  has_license: boolean;
  studying_abroad: boolean;
  on_leave: boolean;
  in_seminar: boolean;
  teaching_cert: boolean;
  club_type: ClubType | null;
  job_type: JobType | null;
}

// ─── Stat Effects ─────────────────────────────────────────────────
export type StatEffects = Partial<ResourceStats & ExperienceStats>;

export type FlagEffects = Partial<SpecialFlags>;

// ─── Choice Condition ─────────────────────────────────────────────
export interface ChoiceCondition {
  minStats?: Partial<ResourceStats & ExperienceStats>;
  requiredFlags?: Partial<SpecialFlags>;
}

// ─── Event Types ──────────────────────────────────────────────────
export interface EventChoice {
  id: string;
  label: string;
  description?: string;
  effects: StatEffects;
  flagEffects?: FlagEffects;
  condition?: ChoiceCondition;
  /** Probability of a random bonus/penalty (0-1). Used for gambling-style choices. */
  randomChance?: number;
  randomBonusEffects?: StatEffects;
  randomPenaltyEffects?: StatEffects;
}

export interface ConditionalVariant {
  condition: ChoiceCondition;
  description?: string;
  choices: EventChoice[];
}

export interface GameEvent {
  id: string;
  title: string;
  description: string;
  category?: string;
  choices: EventChoice[];
  /** Alternative choice sets based on player flags/stats */
  conditionalVariants?: ConditionalVariant[];
}

// ─── Board Types ──────────────────────────────────────────────────
export interface BranchRoute {
  condition: ChoiceCondition;
  nextSquareId: string;
  label: string;
}

export interface BoardSquare {
  id: string;
  eventId: string;
  /** Next square ID, or branch routes for branch points */
  next: string | null;
  /** Branch routes — present only on branch point squares */
  branches?: BranchRoute[];
  year: 1 | 2 | 3 | 4;
  type: "normal" | "branch_point" | "branch" | "checkpoint" | "start" | "goal";
}

export interface BoardPosition {
  x: number; // percentage 0-100
  y: number; // percentage 0-100
}

// ─── Player ───────────────────────────────────────────────────────
export type Role = "host" | "display" | "controller";

export interface Player {
  id: string;
  name: string;
  resources: ResourceStats;
  experience: ExperienceStats;
  flags: SpecialFlags;
  position: string; // square ID, e.g. "1", "9A-1"
  lastRoll?: number;
  online: boolean;
  /** Track which flags were collected for the ending recap */
  flagHistory: string[];
}

// ─── Season / Round ───────────────────────────────────────────────
export type Season = "spring" | "summer" | "autumn" | "winter";

export interface RoundInfo {
  round: number; // 1-16
  year: 1 | 2 | 3 | 4;
  season: Season;
  label: string; // e.g. "1年 春"
}

const SEASON_ORDER: Season[] = ["spring", "summer", "autumn", "winter"];
const SEASON_LABELS: Record<Season, string> = {
  spring: "春",
  summer: "夏",
  autumn: "秋",
  winter: "冬",
};

export function getRoundInfo(round: number): RoundInfo {
  const clamped = Math.max(1, Math.min(16, round));
  const year = (Math.ceil(clamped / 4) as 1 | 2 | 3 | 4);
  const season = SEASON_ORDER[(clamped - 1) % 4];
  return {
    round: clamped,
    year,
    season,
    label: `${year}年 ${SEASON_LABELS[season]}`,
  };
}

// ─── Game State ───────────────────────────────────────────────────
export type GamePhase = "lobby" | "rolling" | "choosing" | "animating" | "result";

export interface LastRoll {
  playerId: string;
  playerName: string;
  value: number;
  squaresAdvanced: number;
}

export interface GameState {
  phase: GamePhase;
  currentRound: number; // 1-16
  players: Player[];
  turnIndex: number;
  /** Tracks which players have completed their turn this round */
  turnOrder: string[];
  completedTurns: string[];
  lastRoll: LastRoll | null;
  currentEvent: GameEvent | null;
  /** Which choices are available to the current player (filtered by conditions) */
  availableChoiceIds: string[];
  /** Last choice result for animation display */
  lastChoiceResult: ChoiceResult | null;
}

export interface ChoiceResult {
  playerId: string;
  playerName: string;
  choiceId: string;
  choiceLabel: string;
  effects: StatEffects;
  flagEffects?: FlagEffects;
}

// ─── Ending Types ─────────────────────────────────────────────────
export interface Ending {
  id: string;
  title: string;
  emoji: string;
  description: string;
}

export interface PlayerResult {
  playerId: string;
  playerName: string;
  score: number;
  rank: number;
  ending: Ending;
  resources: ResourceStats;
  experience: ExperienceStats;
  flags: SpecialFlags;
  flagHistory: string[];
}

// ─── Messages ─────────────────────────────────────────────────────
export type ServerMessage =
  | { type: "welcome"; clientId: string; hostId?: string; urls?: string[] }
  | { type: "state"; state: GameState }
  | { type: "system"; message: string }
  | { type: "navigate"; url: string; targetRoles: Role[] }
  | {
      type: "show_event";
      event: GameEvent;
      availableChoiceIds: string[];
      playerId: string;
    }
  | {
      type: "choice_result";
      result: ChoiceResult;
    }
  | { type: "round_end"; round: number; roundInfo: RoundInfo }
  | { type: "game_result"; results: PlayerResult[] };

export type ClientMessage =
  | { type: "join"; name: string; role: Role; clientId?: string }
  | { type: "start_game" }
  | { type: "player_roll" }
  | { type: "player_choice"; choiceId: string }
  | { type: "request_state" };

// ─── Default Values ───────────────────────────────────────────────
export function defaultResources(): ResourceStats {
  return { time: 10, money: 3, credits: 0, health: 10 };
}

export function defaultExperience(): ExperienceStats {
  return {
    intellect: 1,
    connections: 1,
    work_tolerance: 0,
    action_power: 1,
    romance_exp: 0,
  };
}

export function defaultFlags(): SpecialFlags {
  return {
    living_alone: false,
    has_partner: false,
    has_license: false,
    studying_abroad: false,
    on_leave: false,
    in_seminar: false,
    teaching_cert: false,
    club_type: null,
    job_type: null,
  };
}

export function defaultGameState(): GameState {
  return {
    phase: "lobby",
    currentRound: 1,
    players: [],
    turnIndex: 0,
    turnOrder: [],
    completedTurns: [],
    lastRoll: null,
    currentEvent: null,
    availableChoiceIds: [],
    lastChoiceResult: null,
  };
}

// ─── Stat Ranges ──────────────────────────────────────────────────
export const RESOURCE_RANGES: Record<ResourceKey, { min: number; max: number }> = {
  time: { min: 0, max: 12 },
  money: { min: -5, max: 99 },
  credits: { min: 0, max: 130 },
  health: { min: 0, max: 12 },
};

export const EXPERIENCE_RANGES: Record<ExperienceKey, { min: number; max: number }> = {
  intellect: { min: 0, max: 10 },
  connections: { min: 0, max: 10 },
  work_tolerance: { min: 0, max: 10 },
  action_power: { min: 0, max: 10 },
  romance_exp: { min: 0, max: 10 },
};

export function clampResource(key: ResourceKey, value: number): number {
  const range = RESOURCE_RANGES[key];
  return Math.max(range.min, Math.min(range.max, value));
}

export function clampExperience(key: ExperienceKey, value: number): number {
  const range = EXPERIENCE_RANGES[key];
  return Math.max(range.min, Math.min(range.max, value));
}

// ─── Dice → Squares Moved ─────────────────────────────────────────
/** Dice roll 1-3, advance by the same number */
export function diceToSquares(roll: number): number {
  return roll;
}

// ─── Credit Checkpoints ───────────────────────────────────────────
export const CREDIT_CHECKPOINTS: Record<number, number> = {
  4: 20,  // End of Year 1
  8: 50,  // End of Year 2
  12: 80, // End of Year 3
  16: 110, // Graduation
};

// ─── Player Colors ────────────────────────────────────────────────
const PLAYER_COLORS = [
  "#00d4aa", // teal
  "#ffb347", // amber
  "#a855f7", // purple
  "#f43f5e", // coral
  "#60a5fa", // blue
  "#fbbf24", // gold
  "#34d399", // green
  "#f97316", // orange
];

export function colorForPlayer(index: number): string {
  return PLAYER_COLORS[index % PLAYER_COLORS.length];
}

// ─── Utilities (kept from original) ───────────────────────────────
export function wsUrlFromInput(input: string) {
  if (!input) return "";
  try {
    const url = new URL(input);
    const wsProtocol = url.protocol === "https:" ? "wss:" : "ws:";
    return `${wsProtocol}//${url.host}`;
  } catch {
    return "";
  }
}

export function choosePrimaryHostUrl(urls: string[]) {
  const lan = urls.find((url) => {
    try {
      const host = new URL(url).hostname;
      return (
        host.startsWith("192.168.") ||
        host.startsWith("10.") ||
        host.startsWith("172.")
      );
    } catch {
      return false;
    }
  });
  if (lan) return lan;
  return urls.find((url) => !url.includes("localhost")) ?? urls[0] ?? "";
}

export function colorForId(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash << 5) - hash + id.charCodeAt(i);
    hash |= 0;
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 60%, 55%)`;
}
