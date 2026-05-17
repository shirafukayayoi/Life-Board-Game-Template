import { BOARD, BOARD_POSITIONS, MAIN_TRACK_ORDER } from "./boardData";

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

// World extents (Three.js units, Y-up).
//   X: left-right across the slope        [-20, +20]
//   Y: altitude                            [ 0, ~18 ]
//   Z: forward-backward, +Z = foot/start  [-20, +20]
export const MOUNTAIN_X_HALF = 22;
export const MOUNTAIN_Z_HALF = 22;
export const MOUNTAIN_PEAK_HEIGHT = 18;

/**
 * Sampled terrain height for a world (x, z) point.
 *  - Slope rises from front (+Z) to back (-Z)
 *  - Side ridges frame the trail
 *  - Subtle peak behind the goal
 */
export function terrainHeight(x: number, z: number): number {
  // Main slope: 0 at z=+22, peak at z=-22
  const slopeT = Math.max(0, Math.min(1, (MOUNTAIN_Z_HALF - z) / (MOUNTAIN_Z_HALF * 2)));
  // Cubic ease so the upper section is steeper, like a mountain
  const eased = slopeT * slopeT * (3 - 2 * slopeT);
  const baseSlope = eased * MOUNTAIN_PEAK_HEIGHT;

  // Side ridges (left & right) hugging the trail
  const sideBump = Math.exp(-Math.pow(Math.abs(x) - 26, 2) / 60) * 6;

  // Summit cone behind the goal
  const peakDist = Math.sqrt(x * x + Math.pow(z + 18, 2));
  const peak = Math.exp(-(peakDist * peakDist) / 40) * 3;

  // Gentle terrain noise
  const noise =
    Math.sin(x * 0.42) * Math.cos(z * 0.31) * 0.35 +
    Math.sin(x * 0.13 + z * 0.11) * 0.25;

  return baseSlope + sideBump + peak + noise;
}

/** Lerp helper */
function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

/**
 * Convert the existing 2D BOARD_POSITIONS (percentage 0-100) into 3D world coords
 * sitting on the terrain surface.
 *
 * 2D coords interpretation:
 *   x%  → world X  ( 5 → -18, 95 → +18 )
 *   y%  → world Z  (10 → +18, 85 → -18, growing toward the summit)
 */
export function squareWorldPos(squareId: string): Vec3 | null {
  const pos = BOARD_POSITIONS[squareId];
  if (!pos) return null;
  const x = lerp(-18, 18, (pos.x - 5) / 90);
  const z = lerp(18, -18, (pos.y - 10) / 75);
  const y = terrainHeight(x, z) + 0.25;
  return { x, y, z };
}

/** Year for a square (1-4) or null if unknown. */
export function squareYear(squareId: string): 1 | 2 | 3 | 4 | null {
  const sq = BOARD[squareId];
  return sq?.year ?? null;
}

/** Main-track polyline as a flat array of Vec3 points. */
export function mainTrackPoints(): Vec3[] {
  const out: Vec3[] = [];
  for (const id of MAIN_TRACK_ORDER) {
    const p = squareWorldPos(id);
    if (p) out.push(p);
  }
  return out;
}

/** Branch group definitions (mirrors Board.tsx). */
const BRANCH_GROUPS: Record<string, string[]> = {
  "9A": ["9", "9A-1", "9A-2", "10"],
  "9B": ["9", "9B-1", "9B-2", "10"],
  "17A": ["17", "17A-1", "17A-2", "17A-3", "18"],
  "17B": ["17", "17B-1", "17B-2", "17B-3", "18"],
  "17C": ["17", "17C-1", "17C-2", "17C-3", "18"],
  "26A": ["26", "26A-1", "26A-2", "27"],
  "26B": ["26", "26B-1", "26B-2", "27"],
};

export function branchTrackPoints(): Array<{ key: string; points: Vec3[] }> {
  return Object.entries(BRANCH_GROUPS).map(([key, ids]) => ({
    key,
    points: ids
      .map((id) => squareWorldPos(id))
      .filter((p): p is Vec3 => p !== null),
  }));
}

/** Year zone color used for terrain vertex coloring & UI accents. */
export function colorForYear(year: 1 | 2 | 3 | 4): [number, number, number] {
  switch (year) {
    case 1: return [0.35, 0.62, 0.32]; // meadow green
    case 2: return [0.22, 0.45, 0.25]; // forest deep green
    case 3: return [0.55, 0.46, 0.35]; // rocky brown
    case 4: return [0.92, 0.94, 0.98]; // snow white
  }
}

/** Approximate "year band" by world Z (used for terrain coloring). */
export function yearForZ(z: number): 1 | 2 | 3 | 4 {
  if (z > 10) return 1;
  if (z > 0) return 2;
  if (z > -10) return 3;
  return 4;
}

/** All square IDs known to the layout. */
export function allSquareIds(): string[] {
  return Object.keys(BOARD_POSITIONS);
}
