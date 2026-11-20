// node --test tools/risk/
import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULTS, careerVerdict, counts, engineScore, engineVerdict, pairFlags, promotions } from "./signals.mjs";

const A = "0xaaaa000000000000000000000000000000000001";
const B = "0xbbbb000000000000000000000000000000000002";
const C = "0xcccc000000000000000000000000000000000003";
const usd = (n) => BigInt(n) * 1_000_000n;
const game = (white, black, result, moveCount = 40, stake = usd(5)) => ({ white, black, result, moveCount, stake });

test("only real games count: a stake and enough moves", () => {
  assert.equal(counts(game(A, B, 1)), true);
  assert.equal(counts(game(A, B, 1, 4)), false);
  assert.equal(counts(game(A, B, 1, 40, 1000n)), false);
});

test("engine score skips the opening and won-out positions, and measures loss from the mover's view", () => {
  const plies = 40;
  const played = Array.from({ length: plies }, (_, i) => `m${i}`);
  // White always plays the engine move and loses nothing; black never does and drops 20cp a move.
  // From white's view the score after ply i is 20 * floor(i / 2); `cp` is for the side to move.
  const evals = Array.from({ length: plies + 1 }, (_, i) => {
    const white = 20 * Math.floor(i / 2);
    return { best: i % 2 === 0 ? `m${i}` : "other", cp: i % 2 === 0 ? white : -white };
  });
  const white = engineScore(evals, played, 0);
  const black = engineScore(evals, played, 1);
  assert.equal(white.moves, (plies - DEFAULTS.skipPlies) / 2);
  assert.equal(white.match, 1);
  assert.equal(black.match, 0);
  assert.equal(black.acpl, 20);
  assert.equal(engineVerdict(white), "strong");
  assert.equal(engineVerdict(black), null);

  const won = evals.map((e) => ({ ...e, cp: 900 }));
  assert.equal(engineScore(won, played, 0).moves, 0);
});

test("verdicts need enough moves; the career check needs a body of games", () => {
  assert.equal(engineVerdict({ moves: 5, match: 1, acpl: 0 }), null);
  assert.equal(engineVerdict({ moves: 20, match: 0.75, acpl: 18 }), "watch");
  assert.equal(careerVerdict({ moves: 40, matches: 40 }), null);
  assert.equal(careerVerdict({ moves: 100, matches: 80 }), "strong");
  assert.equal(careerVerdict({ moves: 100, matches: 60 }), null);
});

test("flags a pair where one account keeps losing to the other, and quick losses", () => {
  const games = [game(A, B, 1), game(B, A, 2), game(A, B, 1), game(A, B, 1, 6), game(B, A, 2, 4), game(A, B, 1, 8), game(A, C, 2)];
  const flags = pairFlags(games);
  const kinds = flags.map((f) => `${f.kind}:${f.players[0].slice(0, 6)}`);
  assert.deepEqual(kinds.sort(), ["one-way-pair:0xbbbb", "quick-losses:0xbbbb"]);
  // Even results between two players are not suspicious.
  assert.deepEqual(pairFlags([game(A, B, 1), game(A, B, 2), game(A, B, 1), game(A, B, 2)]), []);
});

test("promotes on games and distinct opponents, never demotes, and skips flagged players", () => {
  const opponents = Array.from({ length: 6 }, (_, i) => `0x${String(i + 1).padStart(40, "d")}`);
  const games = [];
  for (let i = 0; i < 10; i++) games.push(game(A, opponents[i % 6], 1));
  const up = promotions(games, new Map(), new Set());
  assert.deepEqual(up.get(1), [A.toLowerCase()]);
  assert.equal(promotions(games, new Map([[A.toLowerCase(), 2]]), new Set()).size, 0);
  assert.equal(promotions(games, new Map(), new Set([A.toLowerCase()])).get(1), undefined);
  // A verified chess.com account shortens the road.
  const few = games.slice(0, 5);
  assert.equal(promotions(few, new Map(), new Set()).get(1), undefined);
  assert.deepEqual(promotions(few, new Map(), new Set(), new Map([[A.toLowerCase(), 300]])).get(1), [A.toLowerCase()]);
});
