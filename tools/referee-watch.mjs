// Runs the Away Chess referee: watches MoveMade events on Monad testnet and, whenever a game needs a
// verdict, executes the Chainlink CRE workflow for that event with `cre workflow simulate --broadcast`.
// The workflow re-derives the verdict itself and delivers it through the Chainlink forwarder.
//
// This is the stand-in for a DON deployment (which needs CRE deployment access): once the workflow is
// deployed, Chainlink's network triggers it on every event and this script is no longer needed.
//
// Needs: `cre login` done once (or CRE_API_KEY on a server), `bun install` in cre/referee, and
// cre/.env containing CRE_ETH_PRIVATE_KEY=<key with testnet MON>.     Run: node tools/referee-watch.mjs
//
// Fallback: if the workflow cannot run (no CRE login yet, CLI failure), the watcher delivers the same
// verdict itself, through the same mock forwarder to the same ChessReferee, using judge.ts (the
// workflow's own verdict code). ChessReferee only accepts such reports from allowed reporter keys.
// REFEREE_MODE=direct skips the workflow entirely; REFEREE_MODE=cre disables the fallback.
import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { concat, createPublicClient, createWalletClient, encodeAbiParameters, http, keccak256, pad, parseAbi, parseAbiItem, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monadTestnet } from "viem/chains";
import { judge } from "../cre/referee/judge.ts";

const config = JSON.parse(readFileSync("cre/referee/config.staging.json", "utf8"));
const pub = createPublicClient({ chain: monadTestnet, transport: http() });
const abi = parseAbi([
  "function getMoves(uint256) view returns (uint16[])",
  "function getGame(uint256) view returns (address, address, uint256, uint256, uint256, uint8 status, uint8, address, uint64, uint256)",
]);
const MOVE_MADE = parseAbiItem("event MoveMade(uint256 indexed gameId, address indexed player, uint16 move, uint8 captured, uint256 value)");
const REASONS = ["", "illegal move", "checkmate", "stalemate", "insufficient material", "threefold repetition", "fifty-move rule"];
const settling = new Set();
const MODE = process.env.REFEREE_MODE ?? "auto"; // auto | cre | direct
const MOCK_FORWARDER = process.env.FORWARDER_ADDRESS ?? "0xB9F79d863261869B234c481D1f9A7af84AeAd192";

function signingKey() {
  if (process.env.CRE_ETH_PRIVATE_KEY) return process.env.CRE_ETH_PRIVATE_KEY;
  try {
    return readFileSync("cre/.env", "utf8").match(/^CRE_ETH_PRIVATE_KEY=(\S+)/m)?.[1];
  } catch {
    return undefined;
  }
}

/** Delivers a verdict without the CRE CLI: the report the workflow would write, sent through the mock forwarder. */
async function deliverDirect(gameId, verdict) {
  const key = signingKey();
  if (!key) throw new Error("no CRE_ETH_PRIVATE_KEY for direct delivery");
  const account = privateKeyToAccount(key.startsWith("0x") ? key : `0x${key}`);
  const wallet = createWalletClient({ account, chain: monadTestnet, transport: http() });
  const body = encodeAbiParameters(
    [{ type: "uint256" }, { type: "uint8" }, { type: "bool" }, { type: "uint256" }, { type: "uint8" }],
    [gameId, verdict.result, verdict.forfeit, BigInt(verdict.ply), verdict.reason]
  );
  // Keystone report header: version, execution id, timestamp, DON id, DON config version, workflow id,
  // workflow name, workflow owner, report id. The execution id is unique per verdict.
  const execution = keccak256(encodeAbiParameters([{ type: "address" }, { type: "uint256" }, { type: "uint256" }], [config.chessAddress, gameId, BigInt(verdict.ply)]));
  const header = concat([toHex(1, { size: 1 }), execution, toHex(Math.floor(Date.now() / 1000), { size: 4 }), toHex(0, { size: 4 }), toHex(0, { size: 4 }), pad("0x", { size: 32 }), pad(toHex("referee"), { size: 10, dir: "right" }), account.address, "0x0001"]);
  const hash = await wallet.writeContract({
    address: MOCK_FORWARDER,
    abi: parseAbi(["function report(address receiver, bytes rawReport, bytes reportContext, bytes[] signatures)"]),
    functionName: "report",
    args: [config.refereeAddress, concat([header, body]), "0x", []],
    gas: BigInt(config.gasLimit) + 200000n,
  });
  await pub.waitForTransactionReceipt({ hash });
  // The forwarder does not revert when the receiver does, so check the game itself.
  const game = await pub.readContract({ address: config.chessAddress, abi, functionName: "getGame", args: [gameId] });
  if (game[5] === 2) throw new Error(`report sent in ${hash} but the game is still active`);
  return hash;
}

function runWorkflow(txHash, eventIndex) {
  return new Promise((resolve) => {
    const args = ["workflow", "simulate", "referee", "--non-interactive", "--trigger-index", "0", "--evm-tx-hash", txHash,
      "--evm-event-index", String(eventIndex), "--broadcast", "--target", "staging-settings"];
    const child = spawn("cre", args, {
      cwd: "cre",
      env: { ...process.env, PATH: `${homedir()}/.cre/bin:${homedir()}/.bun/bin:${process.env.PATH}` },
    });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("close", (code) => resolve({ code, out }));
  });
}

async function onMove(log) {
  const gameId = log.args.gameId;
  if (settling.has(gameId)) return;
  const [game, moves] = await Promise.all([
    pub.readContract({ address: config.chessAddress, abi, functionName: "getGame", args: [gameId] }),
    pub.readContract({ address: config.chessAddress, abi, functionName: "getMoves", args: [gameId] }),
  ]);
  if (game[5] !== 2) return; // not active
  // Cheap local check so the workflow only runs when there is something to settle.
  const verdict = judge(moves);
  if (!verdict) return;

  settling.add(gameId);
  console.log(`game ${gameId}: ${REASONS[verdict.reason]} after move ${verdict.ply}`);
  if (MODE !== "direct") {
    console.log(`game ${gameId}: running the CRE workflow...`);
    const receipt = await pub.getTransactionReceipt({ hash: log.transactionHash });
    const eventIndex = receipt.logs.findIndex((l) => l.logIndex === log.logIndex);
    const { code, out } = await runWorkflow(log.transactionHash, eventIndex);
    const delivered = out.match(/verdict delivered in (0x[0-9a-f]{64})/i);
    if (delivered) return console.log(`game ${gameId}: settled by the CRE workflow in ${delivered[1]}`);
    console.log(`game ${gameId}: workflow exited ${code}\n${out.slice(-600)}`);
    if (MODE === "cre") return settling.delete(gameId);
  }
  try {
    console.log(`game ${gameId}: settled directly in ${await deliverDirect(gameId, verdict)}`);
  } catch (e) {
    console.log(`game ${gameId}: direct delivery failed: ${e.shortMessage ?? e.message}`);
    settling.delete(gameId);
  }
}

// Remember how far we got, so a restart catches up on the moves made while it was down.
// (State is per contract: a redeploy starts fresh.)
const STATE_FILE = process.env.STATE_FILE ?? ".referee-state.json";
function savedBlock() {
  try {
    const state = JSON.parse(readFileSync(STATE_FILE, "utf8"));
    return state.chessAddress === config.chessAddress ? BigInt(state.nextBlock) : null;
  } catch {
    return null;
  }
}
let from = process.env.FROM_BLOCK ? BigInt(process.env.FROM_BLOCK) : (savedBlock() ?? (await pub.getBlockNumber()));
console.log(`referee watching ${config.chessAddress} from block ${from}${existsSync(STATE_FILE) ? " (resumed)" : ""}`);
for (;;) {
  try {
    const head = await pub.getBlockNumber();
    if (head >= from) {
      const to = head - from > 90n ? from + 90n : head; // public RPC limits the block range per query
      const logs = await pub.getLogs({ address: config.chessAddress, event: MOVE_MADE, fromBlock: from, toBlock: to });
      for (const log of logs) await onMove(log);
      from = to + 1n;
      writeFileSync(STATE_FILE, JSON.stringify({ chessAddress: config.chessAddress, nextBlock: from.toString() }));
    }
  } catch (e) {
    console.error("poll failed:", e.shortMessage ?? e.message);
  }
  // Poll every 1.5s when caught up; go flat out while catching up after downtime.
  if (from > (await pub.getBlockNumber().catch(() => from))) await new Promise((r) => setTimeout(r, 1500));
}
