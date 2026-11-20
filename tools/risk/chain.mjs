// Reads games straight from the game contract (no indexer, no getLogs ranges): every game by id, in
// multicall batches. Shared by the risk service and the metrics report.
import { createPublicClient, defineChain, http, parseAbi } from "viem";
import { monadTestnet } from "viem/chains";
import { MONAD_TESTNET } from "../../src/deployments.ts";

export const chessAbi = parseAbi([
  "function gameCount() view returns (uint256)",
  "function getGame(uint256) view returns (address white, address black, uint256 stake, uint256 whiteBalance, uint256 blackBalance, uint8 status, uint8 result, address drawOfferedBy, uint64 lastMoveAt, uint256 moveCount)",
  "function getMoves(uint256) view returns (uint16[])",
  "function getWithdrawn(uint256) view returns (bool white, bool black)",
  "function getClock(uint256) view returns (uint32 base, uint32 increment, uint32 whiteTime, uint32 blackTime)",
  "function referrerOf(address) view returns (address)",
  "function accruedFees() view returns (uint256)",
  "function trustTier(address) view returns (uint8)",
  "function frozenUntil(address) view returns (uint64)",
  "function limitsOf(address) view returns (uint8 tier, uint256 maxStake, uint32 payoutHold, uint64 frozen)",
  "function setTrustTier(address[] players, uint8 tier)",
  "function freeze(address player, uint64 until)",
  "function unfreeze(address player)",
  "function penalize(uint256 gameId, address cheater)",
  "function setTierPolicy(uint8 tier, uint256 maxStake, uint32 payoutHold)",
  "function setRiskOperator(address operator)",
  "function riskOperator() view returns (address)",
  "function FREEZE_COOLDOWN() view returns (uint32)",
]);

export const ratingsAbi = parseAbi([
  "function getRatings(address[] players) view returns ((string handle, uint16 rapid, uint16 blitz, uint16 bullet, uint64 updatedAt)[])",
]);

export const STATUS = { None: 0, Open: 1, Active: 2, Finished: 3, Cancelled: 4 };
export const RESULT = { None: 0, WhiteWins: 1, BlackWins: 2, Draw: 3 };

const localChain = defineChain({
  id: 31337,
  name: "Hardhat",
  nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["http://127.0.0.1:8545"] } },
});

/** Chain and addresses from the environment, defaulting to the live Monad testnet deployment. */
export function target() {
  const local = process.env.CHAIN === "localhost";
  const chain = local ? localChain : monadTestnet;
  const rpc = process.env.RPC_URL ?? chain.rpcUrls.default.http[0];
  return {
    chain,
    rpc,
    chess: process.env.CHESS_ADDRESS ?? (local ? undefined : MONAD_TESTNET.chess),
    ratings: process.env.RATINGS_ADDRESS ?? (local ? undefined : MONAD_TESTNET.ratings),
    public: createPublicClient({ chain, transport: http(rpc) }),
  };
}

const BATCH = 150;

/** Batched reads; hardhat has no multicall3, so fall back to parallel single calls there. */
async function readMany(t, contracts) {
  if (t.chain.contracts?.multicall3) {
    const out = [];
    for (let i = 0; i < contracts.length; i += BATCH) {
      const page = await t.public.multicall({ contracts: contracts.slice(i, i + BATCH), allowFailure: true });
      out.push(...page.map((r) => (r.status === "success" ? r.result : undefined)));
    }
    return out;
  }
  return Promise.all(contracts.map((c) => t.public.readContract(c).catch(() => undefined)));
}

/**
 * Every game from `from` (inclusive) to the end, as plain objects.
 * @returns {{ count: number, games: object[] }}
 */
export async function readGames(t, from = 0) {
  const count = Number(await t.public.readContract({ address: t.chess, abi: chessAbi, functionName: "gameCount" }));
  const ids = [];
  for (let i = from; i < count; i++) ids.push(BigInt(i));
  const results = await readMany(
    t,
    ids.map((id) => ({ address: t.chess, abi: chessAbi, functionName: "getGame", args: [id] }))
  );
  const games = [];
  ids.forEach((id, i) => {
    const r = results[i];
    if (!r) return;
    const [white, black, stake, whiteBalance, blackBalance, status, result, , lastMoveAt, moveCount] = r;
    games.push({
      id: Number(id),
      white,
      black,
      stake,
      whiteBalance,
      blackBalance,
      status,
      result,
      lastMoveAt: Number(lastMoveAt),
      moveCount: Number(moveCount),
    });
  });
  return { count, games };
}

export async function readMoves(t, id) {
  return t.public.readContract({ address: t.chess, abi: chessAbi, functionName: "getMoves", args: [BigInt(id)] });
}

/** Tier and freeze for each player. */
export async function readLimits(t, players) {
  const results = await readMany(
    t,
    players.map((p) => ({ address: t.chess, abi: chessAbi, functionName: "limitsOf", args: [p] }))
  );
  const out = new Map();
  players.forEach((p, i) => {
    const r = results[i];
    if (r) out.set(p.toLowerCase(), { tier: Number(r[0]), frozenUntil: Number(r[3]) });
  });
  return out;
}

/** Rated games on each player's verified chess.com account (0 if none linked). */
export async function readChessCom(t, players) {
  const out = new Map();
  if (!t.ratings || players.length === 0) return out;
  try {
    const list = await t.public.readContract({ address: t.ratings, abi: ratingsAbi, functionName: "getRatings", args: [players] });
    // The register keeps ratings, not game counts: any rated time control means a real, verified account.
    players.forEach((p, i) => {
      const r = list[i];
      if (r && r.handle && (r.rapid || r.blitz || r.bullet)) out.set(p.toLowerCase(), 1);
    });
  } catch {}
  return out;
}

const PROMOTION_PIECE = ["", "", "n", "b", "r", "q"];
const squareName = (i) => String.fromCharCode(97 + (i % 8)) + (Math.floor(i / 8) + 1);

/** On-chain move (from | to << 6 | promotion << 12) to UCI, e.g. "e7e8q". */
export function toUci(encoded) {
  return squareName(encoded & 63) + squareName((encoded >> 6) & 63) + (PROMOTION_PIECE[encoded >> 12] ?? "");
}
