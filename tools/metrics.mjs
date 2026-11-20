// Business metrics from the game contract: players, weekly activity, retention, volume, fees, peak hours.
//   node tools/metrics.mjs           a readable report
//   node tools/metrics.mjs --json    the same as JSON (what /api/metrics serves)
// Env as for the risk service: CHAIN=localhost and CHESS_ADDRESS for a local chain.
import { formatUnits } from "viem";
import { computeMetrics } from "../src/lib/metrics.ts";
import { readGames, target } from "./risk/chain.mjs";

const DECIMALS = Number(process.env.TOKEN_DECIMALS ?? 6);
const t = target();
const { games } = await readGames(t);
const m = computeMetrics(games);

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(m, null, 2));
} else {
  const money = (v) => Number(formatUnits(BigInt(v), DECIMALS)).toLocaleString("en", { maximumFractionDigits: 2 });
  const pct = (x) => (x === null ? "n/a" : `${Math.round(x * 100)}%`);
  console.log(`Away Chess metrics, ${m.generatedAt} (contract ${t.chess})\n`);
  console.log(`Games      ${m.games.total} total: ${m.games.finished} finished (${m.games.decisive} decisive, ${m.games.draws} drawn), ${m.games.active} live, ${m.games.open} open, ${m.games.cancelled} cancelled`);
  console.log(`Players    ${m.players.total} total, ${m.players.returning} played 2+ games, ${m.players.playedFivePlus} played 5+`);
  console.log(`Money      ${money(m.money.staked)} staked, average stake ${money(m.money.averageStake)}, gross fees ${money(m.money.feesGross)}`);
  console.log(`Retention  ${pct(m.retention)} of a week's players came back the next week\n`);
  console.log("Week       players  new  games  kept");
  for (const w of m.weekly) {
    console.log(`${w.week}  ${String(w.activePlayers).padStart(7)}  ${String(w.newPlayers).padStart(3)}  ${String(w.games).padStart(5)}  ${w.retainedFromPrevious ?? "-"}`);
  }
  const peak = m.byHourUtc.map((n, h) => [h, n]).sort((a, b) => b[1] - a[1]).slice(0, 3);
  console.log(`\nBusiest hours (UTC): ${peak.map(([h, n]) => `${String(h).padStart(2, "0")}:00 (${n})`).join(", ")}`);
}
