// Business metrics computed from the games on the contract: everything here is public on-chain data,
// so the same numbers can be shown to players, to grant reviewers and to us. Pure functions only;
// used by /api/metrics and by tools/metrics.mjs.

export interface GameRow {
  id: number;
  white: string;
  black: string;
  stake: bigint;
  status: number; // 1 open, 2 active, 3 finished, 4 cancelled
  result: number; // 1 white, 2 black, 3 draw
  lastMoveAt: number; // unix seconds; for an open game, 0
  moveCount: number;
}

export interface Metrics {
  generatedAt: string;
  games: { total: number; open: number; active: number; finished: number; cancelled: number; decisive: number; draws: number };
  players: { total: number; returning: number; playedFivePlus: number };
  /** In token base units, as strings (JSON has no bigint). */
  money: { staked: string; feesGross: string; averageStake: string };
  /** Players with a game whose last move was in each ISO week, oldest first. */
  weekly: { week: string; activePlayers: number; newPlayers: number; games: number; retainedFromPrevious: number | null }[];
  /** Games by UTC hour of their last move: when people play. */
  byHourUtc: number[];
  /** Share of each week's players who also played the week after (the number that matters most). */
  retention: number | null;
}

const ZERO = "0x0000000000000000000000000000000000000000";
const FEE_PER_MILLE = 25n;

/** Monday-start ISO week label, e.g. "2026-W46". */
export function isoWeek(unix: number): string {
  const d = new Date(unix * 1000);
  const day = (d.getUTCDay() + 6) % 7; // Monday 0
  const thursday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day + 3));
  const firstThursday = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((thursday.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${thursday.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function computeMetrics(rows: GameRow[], now = Date.now()): Metrics {
  const played = rows.filter((g) => g.status === 2 || g.status === 3);
  const finished = rows.filter((g) => g.status === 3);
  const decisive = finished.filter((g) => g.result === 1 || g.result === 2);

  const gamesPerPlayer = new Map<string, number>();
  const firstWeek = new Map<string, string>();
  const weeks = new Map<string, { players: Set<string>; games: number }>();
  const byHourUtc = Array(24).fill(0);
  for (const g of [...played].sort((a, b) => a.lastMoveAt - b.lastMoveAt)) {
    const week = isoWeek(g.lastMoveAt);
    const w = weeks.get(week) ?? { players: new Set<string>(), games: 0 };
    w.games++;
    byHourUtc[new Date(g.lastMoveAt * 1000).getUTCHours()]++;
    for (const p of [g.white, g.black]) {
      if (!p || p === ZERO) continue;
      const k = p.toLowerCase();
      gamesPerPlayer.set(k, (gamesPerPlayer.get(k) ?? 0) + 1);
      if (!firstWeek.has(k)) firstWeek.set(k, week);
      w.players.add(k);
    }
    weeks.set(week, w);
  }

  const ordered = [...weeks.keys()].sort();
  const weekly = ordered.map((week, i) => {
    const w = weeks.get(week)!;
    const prev = i > 0 ? weeks.get(ordered[i - 1]) : undefined;
    return {
      week,
      activePlayers: w.players.size,
      newPlayers: [...w.players].filter((p) => firstWeek.get(p) === week).length,
      games: w.games,
      retainedFromPrevious: prev ? [...prev.players].filter((p) => w.players.has(p)).length : null,
    };
  });
  // Retention over completed week pairs only: the current week is still filling up.
  let kept = 0;
  let base = 0;
  for (let i = 1; i < ordered.length; i++) {
    if (ordered[i] === isoWeek(Math.floor(now / 1000))) continue;
    base += weeks.get(ordered[i - 1])!.players.size;
    kept += weekly[i].retainedFromPrevious ?? 0;
  }

  const staked = played.reduce((s, g) => s + g.stake * 2n, 0n);
  const fees = decisive.reduce((s, g) => s + (g.stake * 2n * FEE_PER_MILLE) / 1000n, 0n);
  const counts = [...gamesPerPlayer.values()];
  return {
    generatedAt: new Date(now).toISOString(),
    games: {
      total: rows.length,
      open: rows.filter((g) => g.status === 1).length,
      active: rows.filter((g) => g.status === 2).length,
      finished: finished.length,
      cancelled: rows.filter((g) => g.status === 4).length,
      decisive: decisive.length,
      draws: finished.length - decisive.length,
    },
    players: {
      total: gamesPerPlayer.size,
      returning: counts.filter((n) => n >= 2).length,
      playedFivePlus: counts.filter((n) => n >= 5).length,
    },
    money: {
      staked: staked.toString(),
      feesGross: fees.toString(),
      averageStake: played.length ? (staked / BigInt(played.length * 2)).toString() : "0",
    },
    weekly,
    byHourUtc,
    retention: base ? kept / base : null,
  };
}
