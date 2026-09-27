import { Chess, Move, Square } from "chess.js";

// Must match DegenChess.makeMove: from | to << 6 | promotion << 12, square 0 = a1, 63 = h8.
const PROMOTION_CODE: Record<string, number> = { n: 2, b: 3, r: 4, q: 5 };
const PROMOTION_PIECE = ["", "", "n", "b", "r", "q"];

const squareIndex = (sq: Square) => (Number(sq[1]) - 1) * 8 + (sq.charCodeAt(0) - 97);
const squareName = (i: number) => (String.fromCharCode(97 + (i % 8)) + (Math.floor(i / 8) + 1)) as Square;

export function encodeMove(m: { from: Square; to: Square; promotion?: string }): number {
  return squareIndex(m.from) | (squareIndex(m.to) << 6) | ((m.promotion ? PROMOTION_CODE[m.promotion] : 0) << 12);
}

export function decodeMove(encoded: number) {
  const promotion = PROMOTION_PIECE[encoded >> 12] || undefined;
  return { from: squareName(encoded & 63), to: squareName((encoded >> 6) & 63), promotion };
}

export interface Replay {
  game: Chess;
  history: Move[];
  /** Ply index of the first move chess.js rejects (a tampered client), or null if all legal. */
  illegalAt: number | null;
}

/** Rebuilds the game from the on-chain move list. */
export function replay(moves: readonly number[]): Replay {
  const game = new Chess();
  const history: Move[] = [];
  for (let i = 0; i < moves.length; i++) {
    try {
      history.push(game.move(decodeMove(moves[i])));
    } catch {
      return { game, history, illegalAt: i };
    }
  }
  return { game, history, illegalAt: null };
}
