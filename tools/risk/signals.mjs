// Fair-play signals and promotion rules for the risk service. Pure functions over plain data, so they
// can be unit tested (signals.test.mjs) and tuned without touching the chain.
//
// Thresholds are starting points, not truths. Calibrate them on real games before trusting them with
// anything stronger than a freeze (which is bounded by the contract) and a human review.

export const DEFAULTS = {
  // A game counts towards a player's record only if it was a real game.
  minCountedStake: 1_000_000n, // 1 tUSD (6 decimals)
  minCountedPlies: 10,
  // Engine analysis: moves before this ply are skipped (opening theory looks like engine play).
  skipPlies: 16,
  minAnalysedMoves: 12,
  // Per game. "strong" freezes (if auto-freeze is on) and alerts; "watch" alerts only.
  strong: { match: 0.85, acpl: 12 },
  watch: { match: 0.7, acpl: 20 },
  // Across a player's analysed games.
  career: { minMoves: 60, match: 0.75 },
  // Collusion between a pair of accounts.
  oneWayPair: { minGames: 4, share: 0.9 },
  quickLoss: { maxPlies: 10, minCount: 3 },
  // Promotions, highest first. Tier 3 is only ever set by hand.
  tiers: [
    { tier: 2, games: 40, opponents: 15 },
    { tier: 1, games: 10, opponents: 5 },
  ],
  // A verified chess.com account with at least this many rated games counts as this many of ours.
  chessComBonus: 5,
};

const pairKey = (a, b) => (a.toLowerCase() < b.toLowerCase() ? `${a.toLowerCase()}|${b.toLowerCase()}` : `${b.toLowerCase()}|${a.toLowerCase()}`);

/** Whether a finished game counts towards promotion. */
export function counts(game, cfg = DEFAULTS) {
  return game.stake >= cfg.minCountedStake && game.moveCount >= cfg.minCountedPlies;
}

/**
 * Engine agreement for one side of one game.
 * @param evals per position i (before ply i): { best: "e2e4", cp: score for the side to move, capped }
 * @param played uci of each ply
 * @param side 0 for white, 1 for black
 */
export function engineScore(evals, played, side, cfg = DEFAULTS) {
  let moves = 0;
  let matches = 0;
  let loss = 0;
  for (let i = cfg.skipPlies; i < played.length; i++) {
    if (i % 2 !== side || !evals[i] || !evals[i + 1]) continue;
    // The position after the move, scored for the opponent: negate it to get the mover's view.
    const before = evals[i].cp;
    const after = -evals[i + 1].cp;
    // Already winning by a mile: any sensible move keeps it won, so agreement says little.
    if (Math.abs(before) >= 600) continue;
    moves++;
    if (played[i] === evals[i].best) matches++;
    loss += Math.max(0, before - after);
  }
  return { moves, matches, acpl: moves ? loss / moves : 0, match: moves ? matches / moves : 0 };
}

/** "strong", "watch" or null for one side's engine score in one game. */
export function engineVerdict(score, cfg = DEFAULTS) {
  if (score.moves < cfg.minAnalysedMoves) return null;
  if (score.match >= cfg.strong.match && score.acpl <= cfg.strong.acpl) return "strong";
  if (score.match >= cfg.watch.match && score.acpl <= cfg.watch.acpl) return "watch";
  return null;
}

/** Career agreement from summed per-game scores. */
export function careerVerdict(total, cfg = DEFAULTS) {
  if (total.moves < cfg.career.minMoves) return null;
  return total.matches / total.moves >= cfg.career.match ? "strong" : null;
}

/**
 * Collusion between pairs of accounts over finished games: one account always losing to the same other
 * (chip dumping, or one person on two accounts) and quick decisive losses between the same two.
 * @returns flags: { kind, players: [loser, winner], detail, severity }
 */
export function pairFlags(games, cfg = DEFAULTS) {
  const pairs = new Map();
  for (const g of games) {
    if (g.result !== 1 && g.result !== 2) continue;
    const [winner, loser] = g.result === 1 ? [g.white, g.black] : [g.black, g.white];
    const key = pairKey(winner, loser);
    const p = pairs.get(key) ?? { games: 0, wins: new Map(), quick: new Map(), moved: new Map() };
    p.games++;
    p.wins.set(winner.toLowerCase(), (p.wins.get(winner.toLowerCase()) ?? 0) + 1);
    if (g.moveCount <= cfg.quickLoss.maxPlies) p.quick.set(loser.toLowerCase(), (p.quick.get(loser.toLowerCase()) ?? 0) + 1);
    p.moved.set(winner.toLowerCase(), (p.moved.get(winner.toLowerCase()) ?? 0n) + g.stake);
    pairs.set(key, p);
  }
  const flags = [];
  for (const [key, p] of pairs) {
    const [a, b] = key.split("|");
    for (const [winner, loser] of [
      [a, b],
      [b, a],
    ]) {
      const wins = p.wins.get(winner) ?? 0;
      if (p.games >= cfg.oneWayPair.minGames && wins / p.games >= cfg.oneWayPair.share) {
        flags.push({
          kind: "one-way-pair",
          players: [loser, winner],
          severity: "watch",
          detail: `${winner} won ${wins} of ${p.games} decisive games against ${loser}`,
        });
      }
      const quick = p.quick.get(loser) ?? 0;
      if (quick >= cfg.quickLoss.minCount) {
        flags.push({
          kind: "quick-losses",
          players: [loser, winner],
          severity: "strong",
          detail: `${loser} lost ${quick} games to ${winner} within ${cfg.quickLoss.maxPlies} plies`,
        });
      }
    }
  }
  return flags;
}

/**
 * The tier each player has earned from their record, for players who would move up. Never demotes:
 * demotion is a human decision. Flagged players are not promoted.
 * @param games finished games
 * @param current Map(address lower -> tier)
 * @param flagged Set(address lower)
 * @param chessCom Map(address lower -> rated games on a verified chess.com account)
 * @returns Map(tier -> addresses)
 */
export function promotions(games, current, flagged, chessCom = new Map(), cfg = DEFAULTS) {
  const record = new Map();
  for (const g of games) {
    if (!counts(g, cfg)) continue;
    for (const [me, them] of [
      [g.white, g.black],
      [g.black, g.white],
    ]) {
      const k = me.toLowerCase();
      const r = record.get(k) ?? { games: 0, opponents: new Set() };
      r.games++;
      r.opponents.add(them.toLowerCase());
      record.set(k, r);
    }
  }
  const out = new Map();
  for (const [player, r] of record) {
    if (flagged.has(player)) continue;
    const bonus = (chessCom.get(player) ?? 0) > 0 ? cfg.chessComBonus : 0;
    const earned = cfg.tiers.find((t) => r.games + bonus >= t.games && r.opponents.size + (bonus ? 1 : 0) >= t.opponents)?.tier ?? 0;
    if (earned > (current.get(player) ?? 0)) out.set(earned, [...(out.get(earned) ?? []), player]);
  }
  return out;
}
