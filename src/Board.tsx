import { useMemo } from "react";
import {
  BOARD_COLUMNS,
  BOARD_ROWS,
  buildOuterPath,
  colorForId,
  type Player,
} from "./gameShared";

type Props = {
  players: Player[];
};

export function Board({ players }: Props) {
  const outerPath = useMemo(() => buildOuterPath(), []);

  const cellMap = useMemo(() => {
    const map = new Map<string, number>();
    outerPath.forEach((pos, index) => {
      map.set(`${pos.row}-${pos.col}`, index + 1);
    });
    return map;
  }, [outerPath]);

  const directionMap = useMemo(() => {
    const map = new Map<number, string>();
    outerPath.forEach((pos, index) => {
      const next = outerPath[(index + 1) % outerPath.length];
      if (!next) return;
      let arrow = "right";
      if (next.row > pos.row) arrow = "down";
      if (next.row < pos.row) arrow = "up";
      if (next.col < pos.col) arrow = "left";
      map.set(index + 1, arrow);
    });
    return map;
  }, [outerPath]);

  const gridCells = useMemo(
    () =>
      Array.from({ length: BOARD_ROWS * BOARD_COLUMNS }, (_, index) => ({
        row: Math.floor(index / BOARD_COLUMNS),
        col: index % BOARD_COLUMNS,
      })),
    []
  );

  return (
    <div
      className="board"
      style={{ gridTemplateColumns: `repeat(${BOARD_COLUMNS}, minmax(0, 1fr))` }}
    >
      {gridCells.map((cell) => {
        const position = cellMap.get(`${cell.row}-${cell.col}`) ?? null;
        const occupants = position
          ? players.filter((player) => player.position === position)
          : [];
        return (
          <div
            key={`${cell.row}-${cell.col}`}
            className={`board-cell ${position ? "active" : "empty"}`}
          >
            {position ? (
              <>
                <div className="cell-number">{position}</div>
                <span
                  className={`cell-arrow dir-${directionMap.get(position) ?? "right"}`}
                  aria-hidden
                />
                <div className="cell-tokens">
                  {occupants.map((player) => (
                    <div
                      key={player.id}
                      className={`token ${player.online ? "" : "offline"}`}
                      style={{ backgroundColor: colorForId(player.id) }}
                      title={player.name}
                    >
                      {player.name.slice(0, 1)}
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="cell-center">
                <div className="center-title">Campus Life</div>
                <div className="center-sub">人生ゲーム</div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
