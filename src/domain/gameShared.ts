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
export type Faculty =
  | "humanities"
  | "science"
  | "education"
  | "medical"
  | "arts_sports";
export type CareerPath = "standard" | "grad_school" | "entrepreneur";
export type HousingType = "family" | "alone" | "dorm_share";
export type IntentTag =
  | "study"
  | "research"
  | "social"
  | "community"
  | "romance"
  | "career"
  | "work"
  | "creative"
  | "adventure"
  | "rest"
  | "risk";

export type PathScores = Record<IntentTag, number>;

export interface YearAnchor {
  year: 1 | 2 | 3;
  choiceId: string;
  choiceLabel: string;
  intentTags: IntentTag[];
  storyTags?: string[];
}

export interface PlayerMilestone {
  round: number;
  eventId: string;
  eventTitle: string;
  choiceId: string;
  choiceLabel: string;
  intentTags: IntentTag[];
  storyTags?: string[];
}

export interface YearLog {
  year: 1 | 2 | 3 | 4;
  summary: string;
  choices: string[];
  resources: ResourceStats;
  experience: ExperienceStats;
  flags: SpecialFlags;
  romance: RomanceState;
}

export interface SpecialFlags {
  housing: HousingType;
  living_alone: boolean;
  has_partner: boolean;
  has_license: boolean;
  studying_abroad: boolean;
  on_leave: boolean;
  in_seminar: boolean;
  teaching_cert: boolean;
  cheating: boolean;
  career_path: CareerPath | null;
  career_failed: boolean;
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
  excludedFlags?: Partial<SpecialFlags>;
  requiredAnyFlags?: Partial<SpecialFlags>[];
  minRound?: number;
  faculty?: Faculty;
}

export interface DynamicRandomChance {
  formula: "romance_success";
  onSuccess?: StatEffects;
  onFailure?: StatEffects;
  onSuccessFlags?: FlagEffects;
  onFailureFlags?: FlagEffects;
}

// ─── Event Types ──────────────────────────────────────────────────
export interface EventChoice {
  id: string;
  label: string;
  description?: string;
  effects?: StatEffects;
  flagEffects?: FlagEffects;
  setFlags?: FlagEffects;
  condition?: ChoiceCondition;
  tone?: string;
  preview?: {
    gain: string[];
    cost: string[];
    risk: "low" | "medium" | "high" | "unknown";
  };
  storyTags?: string[];
  intentTags?: IntentTag[];
  /** Probability of a random bonus/penalty (0-1). Used for gambling-style choices. */
  randomChance?: number;
  randomBonusEffects?: StatEffects;
  randomPenaltyEffects?: StatEffects;
  dynamicRandomChance?: DynamicRandomChance;
  cheatAction?: boolean;
  badLuckDelta?: number;
  branchRoute?: string;
  weight?: number;
  polarity?: "positive" | "negative" | "mixed";
  effectBudgetTarget?: 3 | 5;
  preserveEffects?: boolean;
  skipRecovery?: boolean;
  cheatingRecoveryPay?: boolean;
  resultWeight?: number;
  yearAnchor?: boolean;
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
  year?: 1 | 2 | 3 | 4;
  season?: Season;
  label?: string;
  theme?: string;
  category?: string;
  pool?: "vacation" | "random";
  vacationType?: "spring" | "summer";
  weight?: number;
  polarity?: "positive" | "negative" | "mixed";
  effectBudgetTarget?: 3 | 5;
  intentTags?: IntentTag[];
  condition?: ChoiceCondition;
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
export type Gender = "male" | "female" | "other" | "unset";

export interface RomanceState {
  partnerStartedRound: number | null;
  exPartnerCount: number;
  relationshipStartCount: number;
  breakupCount: number;
  dateCount: number;
  moneyTroubleRounds: number[];
  cheatingRecoveryOfferRound: number | null;
}

export interface Player {
  id: string;
  name: string;
  faculty: Faculty;
  gender: Gender;
  resources: ResourceStats;
  experience: ExperienceStats;
  flags: SpecialFlags;
  romance: RomanceState;
  position: string; // square ID, e.g. "1", "9A-1"
  lastRoll?: number;
  online: boolean;
  badLuckPoints: number;
  /** Track which flags were collected for the ending recap */
  flagHistory: string[];
  choiceHistory: ChoiceHistoryEntry[];
  pathScores: PathScores;
  yearAnchors: YearAnchor[];
  milestones: PlayerMilestone[];
  yearLogs: YearLog[];
  recoveryCooldowns: Partial<Record<ResourceKey | ExperienceKey, number>>;
  recoveryUsesByYear: Record<string, number>;
}

export interface ChoiceHistoryEntry {
  round: number;
  eventId: string;
  eventTitle: string;
  choiceId: string;
  choiceLabel: string;
  effects: StatEffects;
  flagEffects?: FlagEffects;
  intentTags: IntentTag[];
  storyTags?: string[];
  submittedBy?: "controller" | "host" | "display";
  romanceEvent?: "partner_started" | "breakup" | "cheating_exposed" | "cheating_hidden" | "cheating_recovered";
}

// ─── Season / Round ───────────────────────────────────────────────
export type Season = "spring" | "summer" | "autumn" | "winter";

export interface RoundInfo {
  round: number; // 1-48 for board mode, 1-16 for life-map mode
  year: 1 | 2 | 3 | 4;
  season: Season;
  label: string; // e.g. "1年 4月"
}

const SEASON_LABELS: Record<Season, string> = {
  spring: "春",
  summer: "夏",
  autumn: "秋",
  winter: "冬",
};
const ACADEMIC_MONTHS = [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3];

function monthToSeason(month: number): Season {
  if (month >= 3 && month <= 5) return "spring";
  if (month >= 6 && month <= 8) return "summer";
  if (month >= 9 && month <= 11) return "autumn";
  return "winter";
}

export function getRoundInfo(round: number): RoundInfo {
  const clamped = Math.max(1, Math.min(48, round));
  const year = (Math.ceil(clamped / 12) as 1 | 2 | 3 | 4);
  const month = ACADEMIC_MONTHS[(clamped - 1) % 12];
  const season = monthToSeason(month);
  return {
    round: clamped,
    year,
    season,
    label: `${year}年 ${month}月（${SEASON_LABELS[season]}）`,
  };
}

// ─── Game State ───────────────────────────────────────────────────
export type GameMode = "board" | "life_map";
export type TurnMode = "pair" | "all";

export type GamePhase = "lobby" | "rolling" | "choosing" | "animating" | "year_recap" | "result";

export type LifeTraitKey =
  | "academic"
  | "stability"
  | "wellbeing"
  | "relationships"
  | "freedom"
  | "challenge"
  | "career"
  | "memory"
  | "selfhood";

export type LifeTraitStats = Record<LifeTraitKey, number>;

export interface TimelineHistoryEntry {
  seasonId: string;
  seasonLabel: string;
  theme: string;
  choiceId: string;
  choiceLabel: string;
  tone?: string;
  storyTags: string[];
}

export interface TimelineLifePlayer {
  id: string;
  name: string;
  traits: LifeTraitStats;
  storyTags: string[];
  history: TimelineHistoryEntry[];
}

export interface LifeMapPreview {
  gain: string[];
  cost: string[];
  risk: "low" | "medium" | "high" | "unknown";
}

export interface LifeMapSeasonHubSquare {
  id: string;
  type: "season_hub";
  seasonId: string;
  year: 1 | 2 | 3 | 4;
  season: Season;
  label: string;
  theme: string;
  description: string;
  next: string[];
}

export interface LifeMapRouteSquare {
  id: string;
  type: "life_route";
  seasonId: string;
  choiceId: string;
  year: 1 | 2 | 3 | 4;
  season: Season;
  label: string;
  tone?: string;
  preview: LifeMapPreview;
  storyTags: string[];
  next: string[];
}

export type LifeMapSquare = LifeMapSeasonHubSquare | LifeMapRouteSquare;

export interface YearRecapPlayer {
  playerId: string;
  playerName: string;
  gender: Gender;
  credits: number;
  creditStatus: string;
  graduationOutlook: string;
  strengths: string[];
  warningSigns: string[];
  resources: ResourceStats;
  experience: ExperienceStats;
  flags: SpecialFlags;
  romance: RomanceState;
}

export interface YearRecap {
  year: 1 | 2 | 3;
  round: number;
  title: string;
  players: YearRecapPlayer[];
}

export interface LastRoll {
  playerId: string;
  playerName: string;
  value: number;
  squaresAdvanced: number;
}

export interface GameState {
  mode?: GameMode;
  phase: GamePhase;
  currentRound: number; // 1-48 for board mode, 1-16 for life-map mode
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
  activeTurnPlayerIds?: string[];
  activeTurnEvents?: Record<string, GameEvent>;
  availableChoiceIdsByPlayer?: Record<string, string[]>;
  pendingTurnChoices?: Record<string, string>;
  pendingRecoveryOriginalEvents?: Record<string, { event: GameEvent; availableIds: string[] }>;
  lastTurnGroupResults?: ChoiceResult[];
  yearRecap?: YearRecap | null;
  fallbackMode?: boolean;
  turnMode?: TurnMode;
  startedAt?: number | null;
  turnStartedAt?: number | null;
  roundDurations?: RoundDuration[];
  currentSeasonIndex?: number;
  lifePlayers?: TimelineLifePlayer[];
  lifeMapSquares?: LifeMapSquare[];
  lifePlayerPositions?: Record<string, string>;
  lifePlayerRoutes?: Record<string, string[]>;
  pendingLifeChoices?: Record<string, string>;
}

export interface ChoiceResult {
  playerId: string;
  playerName: string;
  choiceId: string;
  choiceLabel: string;
  effects: StatEffects;
  flagEffects?: FlagEffects;
  tone?: string;
  intentTags?: IntentTag[];
  storyTags?: string[];
  randomOutcome?: "success" | "failure" | "cheat_exposed" | "cheat_hidden";
  submittedBy?: "controller" | "host" | "display";
}

export interface RoundDuration {
  round: number;
  playerId: string;
  playerName: string;
  durationSeconds: number;
}

export interface HostManagedPlayer {
  id: string;
  name: string;
  faculty: Faculty;
  gender: Gender;
  passkey: string;
  online: boolean;
}

// ─── Ending Types ─────────────────────────────────────────────────
export interface Ending {
  id: string;
  title: string;
  emoji: string;
  description: string;
  flavorText?: string;
}

export interface ReflectionQuestions {
  factor: string;
  turning_point: string;
  alternative: string;
}

export interface ScoreBreakdown {
  experience: number;
  health: number;
  money: number;
  credits: number;
  total: number;
}

export interface PlayerResult {
  playerId: string;
  playerName: string;
  gender?: Gender;
  score?: number;
  rank?: number;
  ending?: Ending;
  academicStatus?: Ending;
  lifeArchetype?: Ending;
  storyAward?: Ending;
  summary?: string;
  scoreBreakdown?: ScoreBreakdown;
  resources: ResourceStats;
  experience: ExperienceStats;
  flags: SpecialFlags;
  romance?: RomanceState;
  flagHistory: string[];
  pathScores?: PathScores;
  yearAnchors?: YearAnchor[];
  milestones?: PlayerMilestone[];
  yearLogs?: YearLog[];
  storyTags?: string[];
  choiceHistory?: ChoiceHistoryEntry[];
  reflection?: ReflectionQuestions;
}

// ─── Messages ─────────────────────────────────────────────────────
export type ServerMessage =
  | { type: "welcome"; clientId: string; hostId?: string; urls?: string[]; passkey?: string }
  | { type: "auth_error"; message: string }
  | { type: "host_player_management"; players: HostManagedPlayer[] }
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
      type: "show_life_event";
      event: GameEvent;
      availableChoiceIds: string[];
    }
  | {
      type: "choice_result";
      result: ChoiceResult;
    }
  | { type: "round_end"; round: number; roundInfo: RoundInfo }
  | { type: "player_removed"; playerId: string; playerName: string }
  | { type: "game_result"; results: PlayerResult[] };

export type ClientMessage =
  | { type: "join"; name: string; role: Role; clientId?: string; passkey?: string; faculty?: Faculty; gender?: Gender }
  | { type: "start_game" }
  | { type: "start_life_map_game" }
  | { type: "end_game" }
  | { type: "reset_game" }
  | { type: "remove_player"; playerId: string }
  | { type: "set_fallback_mode"; enabled: boolean }
  | { type: "set_turn_mode"; mode: TurnMode }
  | { type: "host_player_roll"; playerId: string }
  | { type: "host_player_choice"; playerId: string; choiceId: string }
  | { type: "display_player_choice"; playerId: string; choiceId: string }
  | { type: "continue_year_recap" }
  | { type: "continue_turn_results" }
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

export function defaultPathScores(): PathScores {
  return {
    study: 0,
    research: 0,
    social: 0,
    community: 0,
    romance: 0,
    career: 0,
    work: 0,
    creative: 0,
    adventure: 0,
    rest: 0,
    risk: 0,
  };
}

export function defaultFlags(): SpecialFlags {
  return {
    housing: "family",
    living_alone: false,
    has_partner: false,
    has_license: false,
    studying_abroad: false,
    on_leave: false,
    in_seminar: false,
    teaching_cert: false,
    cheating: false,
    career_path: null,
    career_failed: false,
    club_type: null,
    job_type: null,
  };
}

export function defaultRomanceState(): RomanceState {
  return {
    partnerStartedRound: null,
    exPartnerCount: 0,
    relationshipStartCount: 0,
    breakupCount: 0,
    dateCount: 0,
    moneyTroubleRounds: [],
    cheatingRecoveryOfferRound: null,
  };
}

export function defaultGameState(): GameState {
  return {
    mode: "board",
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
    activeTurnPlayerIds: [],
    activeTurnEvents: {},
    availableChoiceIdsByPlayer: {},
    pendingTurnChoices: {},
    pendingRecoveryOriginalEvents: {},
    lastTurnGroupResults: [],
    yearRecap: null,
    fallbackMode: false,
    turnMode: "pair",
    startedAt: null,
    turnStartedAt: null,
    roundDurations: [],
    currentSeasonIndex: 0,
    lifePlayers: [],
    lifeMapSquares: [],
    lifePlayerPositions: {},
    lifePlayerRoutes: {},
    pendingLifeChoices: {},
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
  intellect: { min: 0, max: 24 },
  connections: { min: 0, max: 24 },
  work_tolerance: { min: 0, max: 24 },
  action_power: { min: 0, max: 24 },
  romance_exp: { min: 0, max: 24 },
};

export function clampResource(key: ResourceKey, value: number): number {
  const range = RESOURCE_RANGES[key];
  return Math.max(range.min, Math.min(range.max, value));
}

export function clampExperience(key: ExperienceKey, value: number): number {
  const range = EXPERIENCE_RANGES[key];
  return Math.round(Math.max(range.min, Math.min(range.max, value)));
}

// ─── Month Advance ────────────────────────────────────────────────
/** Board mode advances one calendar month at a time. */
export function diceToSquares(roll: number): number {
  return roll;
}

// ─── Credit Checkpoints ───────────────────────────────────────────
export const CREDIT_CHECKPOINTS: Record<number, number> = {
  12: 30,  // End of Year 1
  24: 62,  // End of Year 2
  36: 96,  // End of Year 3
  48: 124, // Graduation
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
  const publicUrl = urls.find((url) => {
    try {
      const parsed = new URL(url);
      const host = parsed.hostname;
      const isPrivateLan =
        host.startsWith("192.168.") ||
        host.startsWith("10.") ||
        host.startsWith("172.") ||
        host === "localhost" ||
        host === "127.0.0.1";
      return parsed.protocol === "https:" && !isPrivateLan;
    } catch {
      return false;
    }
  });
  if (publicUrl) return publicUrl;

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
