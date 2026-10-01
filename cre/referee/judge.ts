import { Chess } from "chess.js";

// Must match DegenChess.Result and the REASON_* constants in ChessReferee.sol.
export const Result = { WhiteWins: 1, BlackWins: 2, Draw: 3 } as const;
export const Reason = {
  IllegalMove: 1,
  Checkmate: 2,
  Stalemate: 3,
  InsufficientMaterial: 4,
  ThreefoldRepetition: 5,
  FiftyMoves: 6,
} as const;

export interface Verdict {
  result: number;
  /** The loser keeps nothing. Only for illegal moves. */
  forfeit: boolean;
  /** Number of moves examined when the verdict was reached. */
  ply: number;
  reason: number;
}

// Move encoding used by DegenChess.makeMove: from | to << 6 | promotion << 12, square 0 = a1, 63 = h8.
const PROMOTION = ["", "", "n", "b", "r", "q"];
const squareName = (i: number) => String.fromCharCode(97 + (i % 8)) + (Math.floor(i / 8) + 1);

export function decodeMove(encoded: number) {
  return {
    from: squareName(encoded & 63),
    to: squareName((encoded >> 6) & 63),
    promotion: PROMOTION[encoded >> 12] || undefined,
  };
}

/**
 * Replays a game from its on-chain move list and decides whether it is over.
 * Returns null while the game should simply continue.
 *
 * The contract only checks turn order and piece ownership, so the list can contain moves that are
 * not legal chess. The first such move loses the game for whoever played it.
 */
export function judge(moves: readonly number[]): Verdict | null {
  const game = new Chess();
  for (let ply = 0; ply < moves.length; ply++) {
    const mover = game.turn();
    try {
      game.move(decodeMove(moves[ply]));
    } catch {
      return {
        result: mover === "w" ? Result.BlackWins : Result.WhiteWins,
        forfeit: true,
        ply: ply + 1,
        reason: Reason.IllegalMove,
      };
    }
  }

  const ply = moves.length;
  if (game.isCheckmate()) {
    // The side to move has been mated.
    return { result: game.turn() === "w" ? Result.BlackWins : Result.WhiteWins, forfeit: false, ply, reason: Reason.Checkmate };
  }
  const draw = (reason: number): Verdict => ({ result: Result.Draw, forfeit: false, ply, reason });
  if (game.isStalemate()) return draw(Reason.Stalemate);
  if (game.isInsufficientMaterial()) return draw(Reason.InsufficientMaterial);
  if (game.isThreefoldRepetition()) return draw(Reason.ThreefoldRepetition);
  if (game.isDraw()) return draw(Reason.FiftyMoves);
  return null;
}
