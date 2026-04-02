export type Role = "host" | "display" | "controller";

export type StatKey = "money" | "relations" | "growth" | "fulfillment";

export type Player = {
  id: string;
  name: string;
  stats: Record<StatKey, number>;
  position: number;
  lastRoll?: number;
  online: boolean;
};

export type LastRoll = {
  playerId: string;
  playerName: string;
  value: number;
};

export type GameState = {
  phase: "lobby" | "playing" | "result";
  round: number;
  players: Player[];
  turnIndex: number;
  lastRoll: LastRoll | null;
};

export type ServerMessage =
  | { type: "welcome"; clientId: string; hostId?: string; urls?: string[] }
  | { type: "state"; state: GameState }
  | { type: "system"; message: string }
  | { type: "navigate"; url: string; targetRoles: Role[] };

export type ClientMessage =
  | { type: "join"; name: string; role: Role; clientId?: string }
  | { type: "start_game" }
  | { type: "player_roll" }
  | { type: "request_state" };

export const BOARD_SIZE = 30;
export const BOARD_COLUMNS = 10;
export const BOARD_ROWS = 8;

export const EVENT_TEMPLATES = Array.from({ length: BOARD_SIZE }, (_, index) => ({
  id: `evt-${index + 1}`,
  title: `イベント ${index + 1}`,
  description: "（内容は後で入れ替え予定）",
  choices: [],
}));

export function getEventByPosition(position: number) {
  if (position <= 0) return null;
  const index = (position - 1) % EVENT_TEMPLATES.length;
  return EVENT_TEMPLATES[index];
}

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
      return host.startsWith("192.168.") || host.startsWith("10.") || host.startsWith("172.");
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

export function buildOuterPath() {
  const positions: Array<{ row: number; col: number }> = [];
  for (let col = 0; col < BOARD_COLUMNS; col += 1) {
    positions.push({ row: 0, col });
  }
  for (let row = 1; row < BOARD_ROWS - 1; row += 1) {
    positions.push({ row, col: BOARD_COLUMNS - 1 });
  }
  for (let col = BOARD_COLUMNS - 1; col >= 0; col -= 1) {
    positions.push({ row: BOARD_ROWS - 1, col });
  }
  for (let row = BOARD_ROWS - 2; row >= 1; row -= 1) {
    positions.push({ row, col: 0 });
  }
  return positions.slice(0, BOARD_SIZE);
}
