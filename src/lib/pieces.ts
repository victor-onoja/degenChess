import type { Color, Move, PieceSymbol, Square } from "chess.js";

export interface TrackedPiece {
  /** Stable for the whole game, e.g. "w-p-e2" (colour, starting kind, starting square). */
  id: string;
  color: Color;
  kind: PieceSymbol;
  /** Current square, or the square it died on. */
  square: Square;
  alive: boolean;
}

/** What happened on the latest move, in terms of piece ids: drives the 3D animation. */
export interface MoveEvent {
  ply: number;
  moverId: string;
  from: Square;
  to: Square;
  victimId?: string;
  victimKind?: PieceSymbol;
  /** Differs from `to` for en passant. */
  victimSquare?: Square;
  /** Castling: the rook that hops over. */
  rook?: { id: string; from: Square; to: Square };
}

const BACK_RANK: PieceSymbol[] = ["r", "n", "b", "q", "k", "b", "n", "r"];
const FILES = "abcdefgh";

function initialPieces(): TrackedPiece[] {
  const pieces: TrackedPiece[] = [];
  for (let f = 0; f < 8; f++) {
    for (const [color, back, pawns] of [
      ["w", "1", "2"],
      ["b", "8", "7"],
    ] as const) {
      const backSquare = (FILES[f] + back) as Square;
      const pawnSquare = (FILES[f] + pawns) as Square;
      pieces.push({ id: `${color}-${BACK_RANK[f]}-${backSquare}`, color, kind: BACK_RANK[f], square: backSquare, alive: true });
      pieces.push({ id: `${color}-p-${pawnSquare}`, color, kind: "p", square: pawnSquare, alive: true });
    }
  }
  return pieces;
}

/** Replays the game keeping each piece's identity, and describes the last move. */
export function trackPieces(history: readonly Move[]): { pieces: TrackedPiece[]; last: MoveEvent | null } {
  const pieces = initialPieces();
  const at = (square: string) => pieces.find((p) => p.alive && p.square === square);
  let last: MoveEvent | null = null;

  history.forEach((m, ply) => {
    const mover = at(m.from);
    if (!mover) return;
    const event: MoveEvent = { ply, moverId: mover.id, from: m.from, to: m.to };

    if (m.captured) {
      const victimSquare = (m.flags.includes("e") ? m.to[0] + m.from[1] : m.to) as Square;
      const victim = at(victimSquare);
      if (victim) {
        victim.alive = false;
        event.victimId = victim.id;
        event.victimKind = victim.kind;
        event.victimSquare = victimSquare;
      }
    }
    mover.square = m.to;
    if (m.promotion) mover.kind = m.promotion;

    const castle = m.flags.includes("k") ? (["h", "f"] as const) : m.flags.includes("q") ? (["a", "d"] as const) : null;
    if (castle) {
      const rook = at(castle[0] + m.from[1]);
      if (rook) {
        const to = (castle[1] + m.from[1]) as Square;
        event.rook = { id: rook.id, from: rook.square, to };
        rook.square = to;
      }
    }
    last = event;
  });

  return { pieces, last };
}
