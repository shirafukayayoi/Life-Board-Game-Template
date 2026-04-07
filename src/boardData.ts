import type { BoardSquare, BoardPosition } from "./gameShared";
import type { Player, ChoiceCondition } from "./gameShared";

// ─── Main Board Definition ───────────────────────────────────────
export const BOARD: Record<string, BoardSquare> = {
  // === Row 1 (L→R): Year 1 ===
  "1": {
    id: "1",
    eventId: "ev_1",
    next: "2",
    year: 1,
    type: "start",
  },
  "2": {
    id: "2",
    eventId: "ev_2",
    next: "3",
    year: 1,
    type: "normal",
  },
  "3": {
    id: "3",
    eventId: "ev_3",
    next: "4",
    year: 1,
    type: "normal",
  },
  "4": {
    id: "4",
    eventId: "ev_4",
    next: "5",
    year: 1,
    type: "normal",
  },
  "5": {
    id: "5",
    eventId: "ev_5",
    next: "6",
    year: 1,
    type: "normal",
  },
  "6": {
    id: "6",
    eventId: "ev_6",
    next: "7",
    year: 1,
    type: "normal",
  },
  "7": {
    id: "7",
    eventId: "ev_7",
    next: "8",
    year: 1,
    type: "normal",
  },
  "8": {
    id: "8",
    eventId: "ev_8",
    next: "9",
    year: 1,
    type: "checkpoint",
  },

  // === Row 2 (R←L): Year 2 ===
  "9": {
    id: "9",
    eventId: "ev_9",
    next: "10",
    year: 2,
    type: "branch_point",
    branches: [
      {
        condition: {
          requiredFlags: { club_type: "circle" },
        },
        nextSquareId: "9A-1",
        label: "団体活動ルート",
      },
      {
        condition: {
          requiredFlags: { club_type: "team" },
        },
        nextSquareId: "9A-1",
        label: "団体活動ルート",
      },
      {
        condition: {},
        nextSquareId: "9B-1",
        label: "ソロ活動ルート",
      },
    ],
  },
  "10": {
    id: "10",
    eventId: "ev_10",
    next: "11",
    year: 2,
    type: "normal",
  },
  "11": {
    id: "11",
    eventId: "ev_11",
    next: "12",
    year: 2,
    type: "normal",
  },
  "12": {
    id: "12",
    eventId: "ev_12",
    next: "13",
    year: 2,
    type: "normal",
  },
  "13": {
    id: "13",
    eventId: "ev_13",
    next: "14",
    year: 2,
    type: "normal",
  },
  "14": {
    id: "14",
    eventId: "ev_14",
    next: "15",
    year: 2,
    type: "normal",
  },
  "15": {
    id: "15",
    eventId: "ev_15",
    next: "16",
    year: 2,
    type: "normal",
  },
  "16": {
    id: "16",
    eventId: "ev_16",
    next: "17",
    year: 2,
    type: "checkpoint",
  },

  // === Row 3 (L→R): Year 3 ===
  "17": {
    id: "17",
    eventId: "ev_17",
    next: "18",
    year: 3,
    type: "branch_point",
    branches: [
      {
        condition: { minStats: { intellect: 4 } },
        nextSquareId: "17A-1",
        label: "留学ルート",
      },
      {
        condition: { minStats: { work_tolerance: 3 } },
        nextSquareId: "17B-1",
        label: "キャリアルート",
      },
      {
        condition: {},
        nextSquareId: "17C-1",
        label: "探索ルート",
      },
    ],
  },
  "18": {
    id: "18",
    eventId: "ev_18",
    next: "19",
    year: 3,
    type: "normal",
  },
  "19": {
    id: "19",
    eventId: "ev_19",
    next: "20",
    year: 3,
    type: "normal",
  },
  "20": {
    id: "20",
    eventId: "ev_20",
    next: "21",
    year: 3,
    type: "normal",
  },
  "21": {
    id: "21",
    eventId: "ev_21",
    next: "22",
    year: 3,
    type: "normal",
  },
  "22": {
    id: "22",
    eventId: "ev_22",
    next: "23",
    year: 3,
    type: "normal",
  },
  "23": {
    id: "23",
    eventId: "ev_23",
    next: "24",
    year: 3,
    type: "normal",
  },
  "24": {
    id: "24",
    eventId: "ev_24",
    next: "25",
    year: 3,
    type: "checkpoint",
  },

  // === Row 4 (R←L): Year 4 ===
  "25": {
    id: "25",
    eventId: "ev_25",
    next: "26",
    year: 4,
    type: "normal",
  },
  "26": {
    id: "26",
    eventId: "ev_26",
    next: "27",
    year: 4,
    type: "branch_point",
    branches: [
      {
        condition: {
          minStats: { action_power: 6, intellect: 5 },
        },
        nextSquareId: "26B-1",
        label: "挑戦ルート（起業・院進）",
      },
      {
        condition: {
          minStats: { action_power: 6, connections: 5 },
        },
        nextSquareId: "26B-1",
        label: "挑戦ルート（起業・院進）",
      },
      {
        condition: {},
        nextSquareId: "26A-1",
        label: "安定ルート（就活）",
      },
    ],
  },
  "27": {
    id: "27",
    eventId: "ev_27",
    next: "28",
    year: 4,
    type: "normal",
  },
  "28": {
    id: "28",
    eventId: "ev_28",
    next: "29",
    year: 4,
    type: "normal",
  },
  "29": {
    id: "29",
    eventId: "ev_29",
    next: "30",
    year: 4,
    type: "normal",
  },
  "30": {
    id: "30",
    eventId: "ev_30",
    next: "31",
    year: 4,
    type: "normal",
  },
  "31": {
    id: "31",
    eventId: "ev_31",
    next: "32",
    year: 4,
    type: "normal",
  },
  "32": {
    id: "32",
    eventId: "ev_32",
    next: null,
    year: 4,
    type: "goal",
  },

  // === Branch 1: #9 group path (circle/team) ===
  "9A-1": {
    id: "9A-1",
    eventId: "ev_9A1",
    next: "9A-2",
    year: 2,
    type: "branch",
  },
  "9A-2": {
    id: "9A-2",
    eventId: "ev_9A2",
    next: "10",
    year: 2,
    type: "branch",
  },

  // === Branch 1: #9 solo path (none/community/default) ===
  "9B-1": {
    id: "9B-1",
    eventId: "ev_9B1",
    next: "9B-2",
    year: 2,
    type: "branch",
  },
  "9B-2": {
    id: "9B-2",
    eventId: "ev_9B2",
    next: "10",
    year: 2,
    type: "branch",
  },

  // === Branch 2: #17 study abroad route ===
  "17A-1": {
    id: "17A-1",
    eventId: "ev_17A1",
    next: "17A-2",
    year: 3,
    type: "branch",
  },
  "17A-2": {
    id: "17A-2",
    eventId: "ev_17A2",
    next: "17A-3",
    year: 3,
    type: "branch",
  },
  "17A-3": {
    id: "17A-3",
    eventId: "ev_17A3",
    next: "18",
    year: 3,
    type: "branch",
  },

  // === Branch 2: #17 career route ===
  "17B-1": {
    id: "17B-1",
    eventId: "ev_17B1",
    next: "17B-2",
    year: 3,
    type: "branch",
  },
  "17B-2": {
    id: "17B-2",
    eventId: "ev_17B2",
    next: "17B-3",
    year: 3,
    type: "branch",
  },
  "17B-3": {
    id: "17B-3",
    eventId: "ev_17B3",
    next: "18",
    year: 3,
    type: "branch",
  },

  // === Branch 2: #17 explore route (default) ===
  "17C-1": {
    id: "17C-1",
    eventId: "ev_17C1",
    next: "17C-2",
    year: 3,
    type: "branch",
  },
  "17C-2": {
    id: "17C-2",
    eventId: "ev_17C2",
    next: "17C-3",
    year: 3,
    type: "branch",
  },
  "17C-3": {
    id: "17C-3",
    eventId: "ev_17C3",
    next: "18",
    year: 3,
    type: "branch",
  },

  // === Branch 3: #26 safe route (就活, default) ===
  "26A-1": {
    id: "26A-1",
    eventId: "ev_26A1",
    next: "26A-2",
    year: 4,
    type: "branch",
  },
  "26A-2": {
    id: "26A-2",
    eventId: "ev_26A2",
    next: "27",
    year: 4,
    type: "branch",
  },

  // === Branch 3: #26 challenge route (起業・院進) ===
  "26B-1": {
    id: "26B-1",
    eventId: "ev_26B1",
    next: "26B-2",
    year: 4,
    type: "branch",
  },
  "26B-2": {
    id: "26B-2",
    eventId: "ev_26B2",
    next: "27",
    year: 4,
    type: "branch",
  },
};

// ─── Display Coordinates (percentage 0-100) ──────────────────────
export const BOARD_POSITIONS: Record<string, BoardPosition> = {
  // Row 1 (L→R): y=10%
  "1":  { x: 5,   y: 10 },
  "2":  { x: 17.9, y: 10 },
  "3":  { x: 30.7, y: 10 },
  "4":  { x: 43.6, y: 10 },
  "5":  { x: 56.4, y: 10 },
  "6":  { x: 69.3, y: 10 },
  "7":  { x: 82.1, y: 10 },
  "8":  { x: 95,   y: 10 },

  // Row 2 (R←L): y=35%
  "9":  { x: 95,   y: 35 },
  "10": { x: 82.1, y: 35 },
  "11": { x: 69.3, y: 35 },
  "12": { x: 56.4, y: 35 },
  "13": { x: 43.6, y: 35 },
  "14": { x: 30.7, y: 35 },
  "15": { x: 17.9, y: 35 },
  "16": { x: 5,    y: 35 },

  // Row 3 (L→R): y=60%
  "17": { x: 5,   y: 60 },
  "18": { x: 17.9, y: 60 },
  "19": { x: 30.7, y: 60 },
  "20": { x: 43.6, y: 60 },
  "21": { x: 56.4, y: 60 },
  "22": { x: 69.3, y: 60 },
  "23": { x: 82.1, y: 60 },
  "24": { x: 95,   y: 60 },

  // Row 4 (R←L): y=85%
  "25": { x: 95,   y: 85 },
  "26": { x: 82.1, y: 85 },
  "27": { x: 69.3, y: 85 },
  "28": { x: 56.4, y: 85 },
  "29": { x: 43.6, y: 85 },
  "30": { x: 30.7, y: 85 },
  "31": { x: 17.9, y: 85 },
  "32": { x: 5,    y: 85 },

  // Branch 1 squares: y=25% (between row 1 and 2)
  "9A-1": { x: 82.1, y: 25 },
  "9A-2": { x: 69.3, y: 25 },
  "9B-1": { x: 82.1, y: 20 },
  "9B-2": { x: 69.3, y: 20 },

  // Branch 2 squares: y=50% (between row 2 and 3)
  "17A-1": { x: 17.9, y: 47 },
  "17A-2": { x: 30.7, y: 47 },
  "17A-3": { x: 43.6, y: 47 },
  "17B-1": { x: 17.9, y: 50 },
  "17B-2": { x: 30.7, y: 50 },
  "17B-3": { x: 43.6, y: 50 },
  "17C-1": { x: 17.9, y: 53 },
  "17C-2": { x: 30.7, y: 53 },
  "17C-3": { x: 43.6, y: 53 },

  // Branch 3 squares: y=75% (between row 3 and 4)
  "26A-1": { x: 69.3, y: 75 },
  "26A-2": { x: 56.4, y: 75 },
  "26B-1": { x: 69.3, y: 80 },
  "26B-2": { x: 56.4, y: 80 },
};

// ─── Main Track Order ────────────────────────────────────────────
export const MAIN_TRACK_ORDER: string[] = [
  "1", "2", "3", "4", "5", "6", "7", "8",
  "9", "10", "11", "12", "13", "14", "15", "16",
  "17", "18", "19", "20", "21", "22", "23", "24",
  "25", "26", "27", "28", "29", "30", "31", "32",
];

// ─── Navigation Logic ────────────────────────────────────────────

/**
 * Check if a player meets a ChoiceCondition based on their stats and flags.
 */
function meetsCondition(
  player: Player,
  condition: ChoiceCondition,
): boolean {
  if (condition.minStats) {
    const stats: Record<string, number> = {
      ...player.resources,
      ...player.experience,
    };
    for (const [key, threshold] of Object.entries(condition.minStats)) {
      if ((stats[key] ?? 0) < (threshold as number)) return false;
    }
  }
  if (condition.requiredFlags) {
    const flags: Record<string, unknown> = { ...player.flags };
    for (const [key, required] of Object.entries(condition.requiredFlags)) {
      if (flags[key] !== required) return false;
    }
  }
  return true;
}

/**
 * Determine the next square ID for a player at the given square.
 *
 * - For branch_point squares: evaluates branches in order, returns the first
 *   matching route. The last branch should always have an empty condition (default).
 * - For branch / normal squares: follows `next`.
 * - Returns null at the goal.
 */
export function getNextSquareId(
  currentId: string,
  player: Player,
): string | null {
  const square = BOARD[currentId];
  if (!square) return null;

  // Branch point: evaluate branch conditions
  if (square.type === "branch_point" && square.branches) {
    for (const route of square.branches) {
      if (meetsCondition(player, route.condition)) {
        return route.nextSquareId;
      }
    }
    // Fallback: should not reach here if last branch has empty condition
    return square.next;
  }

  // All other square types: follow linear next
  return square.next;
}
