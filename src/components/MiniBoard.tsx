import type { Color, PieceSymbol } from "chess.js";
import { PieceIcon } from "./PieceIcon";

export type Cell = { type: PieceSymbol; color: Color } | null;

/** A board where the creator's side has set up and nobody sits opposite yet (random shows both, waiting). */
export function waitingBoard(side: "w" | "b" | "both" = "w"): Cell[][] {
  const rows: Cell[][] = Array.from({ length: 8 }, () => Array<Cell>(8).fill(null));
  const back: PieceSymbol[] = ["r", "n", "b", "q", "k", "b", "n", "r"];
  if (side !== "b") {
    rows[6] = back.map(() => ({ type: "p", color: "w" }));
    rows[7] = back.map((type) => ({ type, color: "w" }));
  }
  if (side !== "w") {
    rows[1] = back.map(() => ({ type: "p", color: "b" }));
    rows[0] = back.map((type) => ({ type, color: "b" }));
  }
  return rows;
}

/**
 * A small flat board showing a real position, rank 8 at the top.
 * `waiting` marks a board whose opponent has not arrived: White's side is set, the other is empty.
 */
export function MiniBoard({ rows, waiting = false }: { rows: Cell[][]; waiting?: boolean }) {
  return (
    <div className="board" role="img" aria-label={waiting ? "White is set up and waiting for an opponent" : "The current position"}>
      {rows.flatMap((row, r) =>
        row.map((cell, f) => (
          <div key={`${r}-${f}`} className={`board__sq ${(r + f) % 2 === 0 ? "board__sq--light" : ""}`}>
            {cell && <PieceIcon kind={cell.type} color={cell.color} />}
          </div>
        ))
      )}
    </div>
  );
}
