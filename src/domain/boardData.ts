import type { BoardPosition, BoardSquare, ChoiceCondition, Player } from "./gameShared";

export const BOARD: Record<string, BoardSquare> = {
  "1": { id: "1", eventId: "ev_1", next: "2", year: 1, type: "start" },
  "2": { id: "2", eventId: "ev_2", next: "3", year: 1, type: "normal" },
  "3": { id: "3", eventId: "ev_3", next: "4", year: 1, type: "normal" },
  "4": { id: "4", eventId: "ev_4", next: "5", year: 1, type: "normal" },
  "5": { id: "5", eventId: "ev_5", next: "6", year: 1, type: "normal" },
  "6": { id: "6", eventId: "ev_6", next: "7", year: 1, type: "normal" },
  "7": { id: "7", eventId: "ev_7", next: "8", year: 1, type: "normal" },
  "8": { id: "8", eventId: "ev_8", next: "9", year: 1, type: "normal" },
  "9": { id: "9", eventId: "ev_9", next: "10", year: 1, type: "normal" },
  "10": { id: "10", eventId: "ev_10", next: "11", year: 1, type: "normal" },
  "11": { id: "11", eventId: "ev_11", next: "12", year: 1, type: "normal" },
  "12": { id: "12", eventId: "ev_12", next: "13", year: 1, type: "checkpoint" },
  "13": { id: "13", eventId: "ev_13", next: "14", year: 2, type: "normal" },
  "14": { id: "14", eventId: "ev_14", next: "15", year: 2, type: "normal" },
  "15": { id: "15", eventId: "ev_15", next: "16", year: 2, type: "normal" },
  "16": { id: "16", eventId: "ev_16", next: "17", year: 2, type: "normal" },
  "17": { id: "17", eventId: "ev_17", next: "18", year: 2, type: "normal" },
  "18": { id: "18", eventId: "ev_18", next: "19", year: 2, type: "normal" },
  "19": { id: "19", eventId: "ev_19", next: "20", year: 2, type: "normal" },
  "20": { id: "20", eventId: "ev_20", next: "21", year: 2, type: "normal" },
  "21": { id: "21", eventId: "ev_21", next: "22", year: 2, type: "normal" },
  "22": { id: "22", eventId: "ev_22", next: "23", year: 2, type: "normal" },
  "23": { id: "23", eventId: "ev_23", next: "24", year: 2, type: "normal" },
  "24": { id: "24", eventId: "ev_24", next: "25", year: 2, type: "checkpoint" },
  "25": { id: "25", eventId: "ev_25", next: "26", year: 3, type: "normal" },
  "26": { id: "26", eventId: "ev_26", next: "27", year: 3, type: "normal" },
  "27": { id: "27", eventId: "ev_27", next: "28", year: 3, type: "normal" },
  "28": { id: "28", eventId: "ev_28", next: "29", year: 3, type: "normal" },
  "29": { id: "29", eventId: "ev_29", next: "30", year: 3, type: "normal" },
  "30": { id: "30", eventId: "ev_30", next: "31", year: 3, type: "normal" },
  "31": { id: "31", eventId: "ev_31", next: "32", year: 3, type: "normal" },
  "32": { id: "32", eventId: "ev_32", next: "33", year: 3, type: "normal" },
  "33": { id: "33", eventId: "ev_33", next: "34", year: 3, type: "normal" },
  "34": { id: "34", eventId: "ev_34", next: "35", year: 3, type: "normal" },
  "35": { id: "35", eventId: "ev_35", next: "36", year: 3, type: "normal" },
  "36": { id: "36", eventId: "ev_36", next: "37", year: 3, type: "checkpoint" },
  "37": { id: "37", eventId: "ev_37", next: "38", year: 4, type: "normal" },
  "38": { id: "38", eventId: "ev_38", next: "39", year: 4, type: "normal" },
  "39": { id: "39", eventId: "ev_39", next: "40", year: 4, type: "normal" },
  "40": { id: "40", eventId: "ev_40", next: "41", year: 4, type: "normal" },
  "41": { id: "41", eventId: "ev_41", next: "42", year: 4, type: "normal" },
  "42": { id: "42", eventId: "ev_42", next: "43", year: 4, type: "normal" },
  "43": { id: "43", eventId: "ev_43", next: "44", year: 4, type: "normal" },
  "44": { id: "44", eventId: "ev_44", next: "45", year: 4, type: "normal" },
  "45": { id: "45", eventId: "ev_45", next: "46", year: 4, type: "normal" },
  "46": { id: "46", eventId: "ev_46", next: "47", year: 4, type: "normal" },
  "47": { id: "47", eventId: "ev_47", next: "48", year: 4, type: "normal" },
  "48": { id: "48", eventId: "ev_48", next: null, year: 4, type: "goal" },
};

export const BOARD_POSITIONS: Record<string, BoardPosition> = {
  "1": { x: 6, y: 8 },
  "2": { x: 18.6, y: 8 },
  "3": { x: 31.1, y: 8 },
  "4": { x: 43.7, y: 8 },
  "5": { x: 56.3, y: 8 },
  "6": { x: 68.9, y: 8 },
  "7": { x: 81.4, y: 8 },
  "8": { x: 94, y: 8 },
  "9": { x: 94, y: 24.8 },
  "10": { x: 81.4, y: 24.8 },
  "11": { x: 68.9, y: 24.8 },
  "12": { x: 56.3, y: 24.8 },
  "13": { x: 43.7, y: 24.8 },
  "14": { x: 31.1, y: 24.8 },
  "15": { x: 18.6, y: 24.8 },
  "16": { x: 6, y: 24.8 },
  "17": { x: 6, y: 41.6 },
  "18": { x: 18.6, y: 41.6 },
  "19": { x: 31.1, y: 41.6 },
  "20": { x: 43.7, y: 41.6 },
  "21": { x: 56.3, y: 41.6 },
  "22": { x: 68.9, y: 41.6 },
  "23": { x: 81.4, y: 41.6 },
  "24": { x: 94, y: 41.6 },
  "25": { x: 94, y: 58.4 },
  "26": { x: 81.4, y: 58.4 },
  "27": { x: 68.9, y: 58.4 },
  "28": { x: 56.3, y: 58.4 },
  "29": { x: 43.7, y: 58.4 },
  "30": { x: 31.1, y: 58.4 },
  "31": { x: 18.6, y: 58.4 },
  "32": { x: 6, y: 58.4 },
  "33": { x: 6, y: 75.2 },
  "34": { x: 18.6, y: 75.2 },
  "35": { x: 31.1, y: 75.2 },
  "36": { x: 43.7, y: 75.2 },
  "37": { x: 56.3, y: 75.2 },
  "38": { x: 68.9, y: 75.2 },
  "39": { x: 81.4, y: 75.2 },
  "40": { x: 94, y: 75.2 },
  "41": { x: 94, y: 92 },
  "42": { x: 81.4, y: 92 },
  "43": { x: 68.9, y: 92 },
  "44": { x: 56.3, y: 92 },
  "45": { x: 43.7, y: 92 },
  "46": { x: 31.1, y: 92 },
  "47": { x: 18.6, y: 92 },
  "48": { x: 6, y: 92 },
};

export const MAIN_TRACK_ORDER: string[] = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19", "20", "21", "22", "23", "24", "25", "26", "27", "28", "29", "30", "31", "32", "33", "34", "35", "36", "37", "38", "39", "40", "41", "42", "43", "44", "45", "46", "47", "48"];

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
      if ((stats[key] ?? 0) < threshold) return false;
    }
  }
  if (condition.requiredFlags) {
    const flags: Record<string, unknown> = { ...player.flags };
    for (const [key, required] of Object.entries(condition.requiredFlags)) {
      if (flags[key] !== required) return false;
    }
  }
  if (condition.requiredAnyFlags) {
    const flags: Record<string, unknown> = { ...player.flags };
    const hasAny = condition.requiredAnyFlags.some((requiredFlags) =>
      Object.entries(requiredFlags).every(([key, required]) => flags[key] === required),
    );
    if (!hasAny) return false;
  }
  if (condition.minRound) {
    return false;
  }
  if (condition.faculty && player.faculty !== condition.faculty) {
    return false;
  }
  return true;
}

export function getNextSquareId(
  currentId: string,
  player: Player,
): string | null {
  const square = BOARD[currentId];
  if (!square) return null;

  if (square.type === "branch_point" && square.branches) {
    for (const route of square.branches) {
      if (meetsCondition(player, route.condition)) {
        return route.nextSquareId;
      }
    }
  }

  return square.next;
}
