import type { Color, PieceSymbol } from "chess.js";
import { PieceIcon } from "./PieceIcon";

export type Cell = { type: PieceSymbol; color: Color } | null;

/** An empty board with one king waiting on its home square. */
export function waitingBoard(): Cell[][] {
  const rows: Cell[][] = Array.from({ length: 8 }, () => Array<Cell>(8).fill(null));
  rows[7][4] = { type: "k", color: "w" };
  return rows;
}

/**
 * A small flat board showing a real position, rank 8 at the top.
 * `waiting` makes the lone king breathe and gives it a beating core: its stake.
 */
export function MiniBoard({ rows, waiting = false }: { rows: Cell[][]; waiting?: boolean }) {
  return (
    <div className="board" role="img" aria-label={waiting ? "A board with one king waiting" : "The current position"}>
      {rows.flatMap((row, r) =>
        row.map((cell, f) => (
          <div key={`${r}-${f}`} className={`board__sq ${(r + f) % 2 === 0 ? "board__sq--light" : ""}`}>
            {cell && <PieceIcon kind={cell.type} color={cell.color} className={waiting ? "waiting" : undefined} core={waiting} />}
          </div>
        ))
      )}
    </div>
  );
}
