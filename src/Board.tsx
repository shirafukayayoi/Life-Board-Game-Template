import { useMemo } from "react";
import { BOARD, BOARD_POSITIONS, MAIN_TRACK_ORDER } from "./boardData";
import { colorForPlayer, type Player } from "./gameShared";

type Props = {
  players: Player[];
  currentPlayerId?: string;
  highlightSquareId?: string;
};

const YEAR_COLORS: Record<number, string> = {
  1: "var(--year-1)",
  2: "var(--year-2)",
  3: "var(--year-3)",
  4: "var(--year-4)",
};

/** Build SVG path data connecting consecutive main-track squares. */
function buildMainTrackPath(): string {
  const parts: string[] = [];
  for (let i = 0; i < MAIN_TRACK_ORDER.length; i++) {
    const id = MAIN_TRACK_ORDER[i];
    const pos = BOARD_POSITIONS[id];
    if (!pos) continue;
    parts.push(i === 0 ? `M ${pos.x} ${pos.y}` : `L ${pos.x} ${pos.y}`);
  }
  return parts.join(" ");
}

/** Build SVG path segments for branch routes. */
function buildBranchPaths(): Array<{ from: string; path: string }> {
  const branchGroups: Record<string, string[]> = {
    "9A": ["9", "9A-1", "9A-2", "10"],
    "9B": ["9", "9B-1", "9B-2", "10"],
    "17A": ["17", "17A-1", "17A-2", "17A-3", "18"],
    "17B": ["17", "17B-1", "17B-2", "17B-3", "18"],
    "17C": ["17", "17C-1", "17C-2", "17C-3", "18"],
    "26A": ["26", "26A-1", "26A-2", "27"],
    "26B": ["26", "26B-1", "26B-2", "27"],
  };

  return Object.entries(branchGroups).map(([key, ids]) => {
    const parts: string[] = [];
    ids.forEach((id, i) => {
      const pos = BOARD_POSITIONS[id];
      if (!pos) return;
      parts.push(i === 0 ? `M ${pos.x} ${pos.y}` : `L ${pos.x} ${pos.y}`);
    });
    return { from: key, path: parts.join(" ") };
  });
}

export function Board({ players, currentPlayerId, highlightSquareId }: Props) {
  const mainPath = useMemo(buildMainTrackPath, []);
  const branchPaths = useMemo(buildBranchPaths, []);

  // Group players by their current square
  const playersBySquare = useMemo(() => {
    const map = new Map<string, Array<{ player: Player; index: number }>>();
    players.forEach((player, index) => {
      const list = map.get(player.position) || [];
      list.push({ player, index });
      map.set(player.position, list);
    });
    return map;
  }, [players]);

  const allSquareIds = useMemo(() => Object.keys(BOARD_POSITIONS), []);

  return (
    <div className="board-container">
      {/* SVG layer for path lines */}
      <svg
        className="board-svg"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        {/* Main track line */}
        <path
          d={mainPath}
          fill="none"
          stroke="rgba(255,255,255,0.12)"
          strokeWidth="0.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Branch path lines */}
        {branchPaths.map((bp) => (
          <path
            key={bp.from}
            d={bp.path}
            fill="none"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth="0.4"
            strokeDasharray="1.2 0.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
      </svg>

      {/* Square nodes */}
      {allSquareIds.map((id) => {
        const pos = BOARD_POSITIONS[id];
        const square = BOARD[id];
        if (!pos || !square) return null;

        const isBranch = square.type === "branch";
        const isBranchPoint = square.type === "branch_point";
        const isStart = square.type === "start";
        const isGoal = square.type === "goal";
        const isHighlighted = highlightSquareId === id;

        let sizeClass = "board-square--main";
        if (isBranch) sizeClass = "board-square--branch";
        if (isBranchPoint) sizeClass = "board-square--branch-point";
        if (isStart) sizeClass = "board-square--start";
        if (isGoal) sizeClass = "board-square--goal";

        return (
          <div
            key={id}
            className={`board-square ${sizeClass} board-square--year-${square.year} ${isHighlighted ? "board-square--highlight" : ""}`}
            style={{
              left: `${pos.x}%`,
              top: `${pos.y}%`,
            }}
          >
            {isStart && <span className="board-square__label">START</span>}
            {isGoal && <span className="board-square__label">GOAL</span>}
            {isBranchPoint && (
              <span className="board-square__fork-icon">&#9095;</span>
            )}
            <span className="board-square__number">
              {isBranch ? "" : id}
            </span>
          </div>
        );
      })}

      {/* Player tokens */}
      {Array.from(playersBySquare.entries()).map(([squareId, occupants]) => {
        const pos = BOARD_POSITIONS[squareId];
        if (!pos) return null;

        // Offset tokens below the square
        const offsetY = pos.y + 5;
        const offsetXStart =
          pos.x - ((occupants.length - 1) * 1.5) / 2;

        return occupants.map(({ player, index: playerIndex }, i) => (
          <div
            key={player.id}
            className="board-tokens"
            style={{
              left: `${offsetXStart + i * 1.5}%`,
              top: `${offsetY}%`,
            }}
          >
            <div
              className="board-token"
              style={{
                backgroundColor: colorForPlayer(playerIndex),
                boxShadow:
                  currentPlayerId === player.id
                    ? `0 0 10px 3px ${colorForPlayer(playerIndex)}`
                    : undefined,
              }}
              title={player.name}
            >
              {player.name.slice(0, 1)}
            </div>
          </div>
        ));
      })}
    </div>
  );
}
