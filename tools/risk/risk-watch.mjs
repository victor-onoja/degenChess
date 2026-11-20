// The Away Chess risk service: the off-chain half of the fair-play trust layer in DegenChess.sol.
//
// Each pass it reads every newly finished game from the contract and
//   1. checks both players' moves against Stockfish (if a binary is available),
//   2. looks for collusion between pairs of accounts (one-way results, quick losses),
//   3. posts every new flag to Discord, and on a strong flag freezes the accounts involved
//      (the contract bounds a freeze to 14 days, with a 7-day cooldown, so a false alarm costs a wait),
//   4. promotes players who have built a clean record to a higher trust tier (bigger stakes, shorter hold).
// It never penalizes on its own: taking a game's winnings is a human decision, made with
// `penalize` below after reading the game.
//
//   node tools/risk/risk-watch.mjs                 watch, a pass every RISK_INTERVAL_SECONDS (default 300)
//   node tools/risk/risk-watch.mjs once            one pass
//   node tools/risk/risk-watch.mjs status <addr>   an account's tier, limits and flags
//   node tools/risk/risk-watch.mjs tier <addr> <0-3>
//   node tools/risk/risk-watch.mjs freeze <addr> <hours>
//   node tools/risk/risk-watch.mjs unfreeze <addr>
//   node tools/risk/risk-watch.mjs penalize <gameId> <cheater>
//   node tools/risk/risk-watch.mjs policy <tier> <maxStake tokens> <hold hours>   (owner key only)
//
// Env: RISK_PRIVATE_KEY (the contract's riskOperator; without it the service only reports),
// DISCORD_RISK_WEBHOOK or DISCORD_ALERTS_WEBHOOK, STOCKFISH_PATH, ENGINE_DEPTH, RISK_AUTO_FREEZE (default 1),
// RISK_FREEZE_HOURS (default 72), RISK_DRY_RUN=1 (decide and report, send nothing), STATE_FILE,
// APP_URL (for links), CHAIN=localhost + CHESS_ADDRESS for a local chain, TOKEN_DECIMALS (default 6).
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createWalletClient, http, isAddress, parseUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { chessAbi, readChessCom, readGames, readLimits, readMoves, STATUS, target, toUci } from "./chain.mjs";
import { openEngine } from "./engine.mjs";
import { DEFAULTS, careerVerdict, counts, engineScore, engineVerdict, pairFlags, promotions } from "./signals.mjs";

const cfg = DEFAULTS;
const STATE_FILE = process.env.STATE_FILE ?? "tools/risk/.state.json";
const APP_URL = process.env.APP_URL ?? "https://test.awaychess.com";
const DRY = process.env.RISK_DRY_RUN === "1";
const AUTO_FREEZE = process.env.RISK_AUTO_FREEZE !== "0";
const FREEZE_HOURS = Number(process.env.RISK_FREEZE_HOURS ?? 72);
const INTERVAL = Number(process.env.RISK_INTERVAL_SECONDS ?? 300) * 1000;
const DECIMALS = Number(process.env.TOKEN_DECIMALS ?? 6);

const t = target();
if (!t.chess) throw new Error("CHESS_ADDRESS is required on a local chain");
const key = process.env.RISK_PRIVATE_KEY;
const wallet = key ? createWalletClient({ account: privateKeyToAccount(key.startsWith("0x") ? key : `0x${key}`), chain: t.chain, transport: http(t.rpc) }) : null;

const short = (a) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const gameLink = (id) => `${APP_URL}/?game=${id}`;
const log = (...a) => console.log(new Date().toISOString(), ...a);

function loadState() {
  const empty = { cursor: 0, finished: [], engine: {}, flags: [] };
  if (!existsSync(STATE_FILE)) return empty;
  const s = JSON.parse(readFileSync(STATE_FILE, "utf8"));
  s.finished = s.finished.map((g) => ({ ...g, stake: BigInt(g.stake) }));
  return { ...empty, ...s };
}

function saveState(s) {
  writeFileSync(STATE_FILE, JSON.stringify({ ...s, finished: s.finished.map((g) => ({ ...g, stake: g.stake.toString() })) }, null, 1));
}

async function alert(text) {
  log(text.replace(/\n/g, " | "));
  const url = process.env.DISCORD_RISK_WEBHOOK ?? process.env.DISCORD_ALERTS_WEBHOOK;
  if (!url || DRY) return;
  await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ content: text.slice(0, 1900) }) }).catch((e) =>
    log("discord failed:", e.message)
  );
}

async function send(functionName, args) {
  if (!wallet) throw new Error("RISK_PRIVATE_KEY is not set");
  if (DRY) return log(`[dry run] ${functionName}(${args.map(String).join(", ")})`);
  const hash = await wallet.writeContract({ address: t.chess, abi: chessAbi, functionName, args });
  const receipt = await t.public.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`${functionName} reverted (${hash})`);
  log(`${functionName} ok ${hash}`);
  return hash;
}

/** Freeze, unless the account is already frozen or still in its cooldown. */
async function tryFreeze(player, why) {
  const limits = (await readLimits(t, [player])).get(player.toLowerCase());
  const now = Math.floor(Date.now() / 1000);
  if (!limits) return "could not read limits";
  if (limits.frozenUntil > now) return "already frozen";
  if (limits.frozenUntil !== 0 && now < limits.frozenUntil + 7 * 86400) return "in freeze cooldown: review by hand";
  if (!wallet) return "no risk key: freeze by hand";
  try {
    await send("freeze", [player, BigInt(now + FREEZE_HOURS * 3600)]);
    return `frozen for ${FREEZE_HOURS}h (${why})`;
  } catch (e) {
    return `freeze failed: ${e.shortMessage ?? e.message}`;
  }
}

async function analyseGame(engine, game) {
  const moves = (await readMoves(t, game.id)).map(Number);
  if (moves.length < cfg.skipPlies + cfg.minAnalysedMoves * 2) return [];
  const played = moves.map(toUci);
  const evals = await engine.analyse(played);
  return [0, 1].map((side) => ({ side, player: side === 0 ? game.white : game.black, score: engineScore(evals, played, side, cfg) }));
}

async function pass(state, engine) {
  const { count, games } = await readGames(t, state.cursor);
  const known = new Set(state.finished.map((g) => g.id));
  const fresh = games.filter((g) => g.status === STATUS.Finished && !known.has(g.id));
  // The cursor stops at the oldest game that can still change.
  const open = games.find((g) => g.status === STATUS.Open || g.status === STATUS.Active);
  state.cursor = open ? open.id : count;

  const newFlags = [];
  const flagKeys = new Set(state.flags.map((f) => f.key));
  const addFlag = (f) => {
    if (flagKeys.has(f.key)) return;
    flagKeys.add(f.key);
    f.at = new Date().toISOString();
    state.flags.push(f);
    newFlags.push(f);
  };

  for (const g of fresh) {
    state.finished.push({ id: g.id, white: g.white, black: g.black, stake: g.stake, result: g.result, moveCount: g.moveCount, lastMoveAt: g.lastMoveAt });
    if (!engine || !counts(g, cfg)) continue;
    try {
      for (const { player, score } of await analyseGame(engine, g)) {
        const k = player.toLowerCase();
        const career = (state.engine[k] ??= { moves: 0, matches: 0, games: 0 });
        career.moves += score.moves;
        career.matches += score.matches;
        career.games += score.moves > 0 ? 1 : 0;
        const verdict = engineVerdict(score, cfg);
        if (verdict) {
          addFlag({
            key: `engine:${g.id}:${k}`,
            kind: "engine",
            severity: verdict,
            players: [player],
            gameId: g.id,
            detail: `${Math.round(score.match * 100)}% engine moves, ${score.acpl.toFixed(1)} avg centipawn loss over ${score.moves} moves`,
          });
        }
        if (careerVerdict(career, cfg)) {
          addFlag({
            key: `engine-career:${k}:${Math.floor(career.moves / 100)}`,
            kind: "engine-career",
            severity: "strong",
            players: [player],
            gameId: g.id,
            detail: `${Math.round((career.matches / career.moves) * 100)}% engine moves over ${career.moves} moves in ${career.games} games`,
          });
        }
      }
    } catch (e) {
      log(`engine failed on game ${g.id}: ${e.message}`);
    }
  }

  for (const f of pairFlags(state.finished, cfg)) addFlag({ key: `${f.kind}:${f.players.join(":")}`, ...f, gameId: null });

  for (const f of newFlags) {
    const who = f.players.map(short).join(" vs ");
    let action = "alert only";
    if (f.severity === "strong" && AUTO_FREEZE) {
      // A pair flag freezes both sides: the money is on its way from one to the other.
      const outcomes = [];
      for (const p of f.players) outcomes.push(`${short(p)}: ${await tryFreeze(p, f.kind)}`);
      action = outcomes.join("; ");
    }
    await alert(
      [
        `**Fair play: ${f.kind}** (${f.severity}) ${who}`,
        f.detail,
        f.gameId !== null ? gameLink(f.gameId) : null,
        `Action: ${action}`,
        f.severity === "strong" ? `Review the game(s); to rule, \`node tools/risk/risk-watch.mjs penalize <gameId> <cheater>\`` : null,
      ]
        .filter(Boolean)
        .join("\n")
    );
  }

  // Promotions: everyone with a counted game, minus anyone ever flagged.
  const players = [...new Set(state.finished.flatMap((g) => [g.white.toLowerCase(), g.black.toLowerCase()]))];
  if (players.length) {
    const flagged = new Set(state.flags.flatMap((f) => f.players.map((p) => p.toLowerCase())));
    const limits = await readLimits(t, players);
    const tiers = new Map([...limits].map(([p, l]) => [p, l.tier]));
    const chessCom = await readChessCom(t, players);
    for (const [tier, list] of promotions(state.finished, tiers, flagged, chessCom, cfg)) {
      log(`promote ${list.length} to tier ${tier}: ${list.map(short).join(", ")}`);
      if (!wallet) continue;
      for (let i = 0; i < list.length; i += 100) {
        try {
          await send("setTrustTier", [list.slice(i, i + 100), tier]);
        } catch (e) {
          log(`promotion failed: ${e.shortMessage ?? e.message}`);
        }
      }
    }
  }

  saveState(state);
  log(`pass done: ${fresh.length} newly finished, ${newFlags.length} new flags, cursor ${state.cursor}/${count}`);
}

async function command(cmd, args) {
  const addr = (a) => {
    if (!isAddress(a ?? "")) throw new Error(`not an address: ${a}`);
    return a;
  };
  switch (cmd) {
    case "status": {
      const a = addr(args[0]);
      const [tier, maxStake, hold, frozen] = await t.public.readContract({ address: t.chess, abi: chessAbi, functionName: "limitsOf", args: [a] });
      const state = loadState();
      console.log({
        tier,
        maxStake: maxStake > 2n ** 255n ? "unlimited" : maxStake.toString(),
        payoutHoldHours: hold / 3600,
        frozenUntil: frozen ? new Date(Number(frozen) * 1000).toISOString() : "never",
        engine: state.engine[a.toLowerCase()] ?? null,
        flags: state.flags.filter((f) => f.players.some((p) => p.toLowerCase() === a.toLowerCase())),
      });
      return;
    }
    case "tier":
      return send("setTrustTier", [[addr(args[0])], Number(args[1])]);
    case "freeze":
      return send("freeze", [addr(args[0]), BigInt(Math.floor(Date.now() / 1000) + Number(args[1]) * 3600)]);
    case "unfreeze":
      return send("unfreeze", [addr(args[0])]);
    case "penalize":
      return send("penalize", [BigInt(args[0]), addr(args[1])]);
    case "policy":
      return send("setTierPolicy", [Number(args[0]), args[1] === "unlimited" ? 2n ** 256n - 1n : parseUnits(args[1], DECIMALS), Number(args[2]) * 3600]);
  }
  throw new Error(`unknown command ${cmd}`);
}

const [cmd = "watch", ...args] = process.argv.slice(2);
if (cmd === "watch" || cmd === "once") {
  const engine = await openEngine();
  log(`risk service on ${t.chain.name}, game contract ${t.chess}; engine ${engine ? "on" : "OFF (no Stockfish binary)"}; key ${wallet ? wallet.account.address : "none (report only)"}${DRY ? "; DRY RUN" : ""}`);
  const state = loadState();
  for (;;) {
    try {
      await pass(state, engine);
    } catch (e) {
      log("pass failed:", e.shortMessage ?? e.message);
    }
    if (cmd === "once") break;
    await new Promise((r) => setTimeout(r, INTERVAL));
  }
  engine?.close();
} else {
  await command(cmd, args);
}
