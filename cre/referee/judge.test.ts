import assert from "node:assert/strict";
import { test } from "node:test";
import { Chess } from "chess.js";
import { judge, Reason, Result } from "./judge.ts";

// Same encoding as the frontend (src/lib/moves.ts) and the contract.
const PROMO: Record<string, number> = { n: 2, b: 3, r: 4, q: 5 };
const sq = (s: string) => (Number(s[1]) - 1) * 8 + (s.charCodeAt(0) - 97);
const enc = (m: { from: string; to: string; promotion?: string }) =>
  sq(m.from) | (sq(m.to) << 6) | ((m.promotion ? PROMO[m.promotion] : 0) << 12);
const play = (sans: string) => {
  const game = new Chess();
  return sans.split(" ").map((san) => enc(game.move(san)));
};

test("an unfinished game has no verdict", () => {
  assert.equal(judge([]), null);
  assert.equal(judge(play("e4 e5 Nf3 Nc6")), null);
});

test("checkmate: the side that delivered it wins and the loser keeps their gains", () => {
  assert.deepEqual(judge(play("e4 e5 Bc4 Nc6 Qh5 Nf6 Qxf7#")), {
    result: Result.WhiteWins,
    forfeit: false,
    ply: 7,
    reason: Reason.Checkmate,
  });
  assert.deepEqual(judge(play("f3 e5 g4 Qh4#")), { result: Result.BlackWins, forfeit: false, ply: 4, reason: Reason.Checkmate });
});

test("an illegal move forfeits the game for whoever played it", () => {
  // White teleports the queen from d1 to d8.
  assert.deepEqual(judge([...play("e4 e5"), enc({ from: "d1", to: "d8" })]), {
    result: Result.BlackWins,
    forfeit: true,
    ply: 3,
    reason: Reason.IllegalMove,
  });
  // Black moves a knight like a rook; later moves don't matter.
  const moves = [...play("e4"), enc({ from: "b8", to: "b4" }), ...play("d4").slice(0, 1)];
  assert.deepEqual(judge(moves), { result: Result.WhiteWins, forfeit: true, ply: 2, reason: Reason.IllegalMove });
});

test("leaving your own king in check is illegal", () => {
  // White gives check with Qxe5+; black answers with a move that doesn't deal with it.
  const moves = [...play("e4 e5 Qh5 g6 Qxe5+"), enc({ from: "a7", to: "a6" })];
  assert.equal(judge(moves)?.reason, Reason.IllegalMove);
  assert.equal(judge(moves)?.result, Result.WhiteWins);
});

test("stalemate is a draw", () => {
  // Sam Loyd's ten-move stalemate.
  const moves = play("e3 a5 Qh5 Ra6 Qxa5 h5 h4 Rah6 Qxc7 f6 Qxd7+ Kf7 Qxb7 Qd3 Qxb8 Qh7 Qxc8 Kg6 Qe6");
  assert.deepEqual(judge(moves), { result: Result.Draw, forfeit: false, ply: 19, reason: Reason.Stalemate });
});

test("threefold repetition is a draw", () => {
  const moves = play("Nf3 Nf6 Ng1 Ng8 Nf3 Nf6 Ng1 Ng8");
  assert.equal(judge(moves)?.reason, Reason.ThreefoldRepetition);
  assert.equal(judge(moves)?.result, Result.Draw);
});

test("promotion moves decode correctly", () => {
  const moves = play("e4 d5 exd5 c6 dxc6 Nf6 cxb7 Nbd7 bxa8=Q");
  assert.equal(judge(moves), null);
  // Promoting without naming a piece is not a legal move.
  const bad = [...moves.slice(0, -1), enc({ from: "b7", to: "a8" })];
  assert.equal(judge(bad)?.reason, Reason.IllegalMove);
});
