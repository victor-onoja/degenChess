import type { NextApiRequest, NextApiResponse } from "next";
import { concat, createPublicClient, createWalletClient, encodeAbiParameters, http, isAddress, keccak256, pad, parseAbi, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { CHAIN, IS_LOCAL, RATINGS_ADDRESS } from "../../config";
import { chessRatingsAbi } from "../../contracts/abi";
import { assess, HANDLE_RULE, type Profile, type Stats } from "../../lib/rating";

// Checks a player's open request to link a chess.com account and delivers the result to
// ChessRatings. It does exactly what the rating workflow does (cre/rating/main.ts, the same
// `assess` function) and sends the same report through the same forwarder: until the workflow runs
// on Chainlink's network, this is what answers a request made in the app. It reads the request from
// the chain, so a caller can only trigger a check that the player themselves asked for.

const MOCK_FORWARDER = "0xB9F79d863261869B234c481D1f9A7af84AeAd192"; // Chainlink's simulation forwarder on Monad testnet
// First account of `npx hardhat node` (public, local chain only).
const HARDHAT_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const API_BASE = process.env.RATING_API_BASE ?? "https://api.chess.com/pub/player";
const COOLDOWN_MS = 15_000;
const lastCheck = new Map<string, number>();

type Body = { outcome: number } | { error: string };

async function chessCom(path: string): Promise<unknown | null> {
  const res = await fetch(`${API_BASE}/${path}`, { headers: { "User-Agent": "AwayChess/1.0 (rating link)", Accept: "application/json" }, cache: "no-store" });
  if (res.status === 404 || res.status === 410) return null;
  if (!res.ok) throw new Error(`chess.com answered ${res.status}`);
  return res.json();
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<Body>) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const player = req.body?.player;
  if (typeof player !== "string" || !isAddress(player)) return res.status(400).json({ error: "bad address" });
  const key = process.env.FAUCET_PRIVATE_KEY ?? (IS_LOCAL ? HARDHAT_KEY : undefined);
  const forwarder = (process.env.RATINGS_FORWARDER ?? (IS_LOCAL ? undefined : MOCK_FORWARDER)) as `0x${string}` | undefined;
  if (!key || !forwarder || !RATINGS_ADDRESS) return res.status(503).json({ error: "Rating links are not switched on here." });

  const id = player.toLowerCase();
  if (Date.now() - (lastCheck.get(id) ?? 0) < COOLDOWN_MS) return res.status(429).json({ error: "Checking already. Give it a few seconds." });
  lastCheck.set(id, Date.now());
  if (lastCheck.size > 5000) lastCheck.clear();

  try {
    const publicClient = createPublicClient({ chain: CHAIN, transport: http() });
    const handle = await publicClient.readContract({ address: RATINGS_ADDRESS, abi: chessRatingsAbi, functionName: "pending", args: [player] });
    if (!HANDLE_RULE.test(handle)) return res.status(404).json({ error: "No link request is waiting for that player." });

    const profile = (await chessCom(handle)) as Profile | null;
    const stats = profile ? ((await chessCom(`${handle}/stats`)) as Stats | null) : null;
    const verdict = assess(player, handle, profile, stats);

    // Matches ChessRatings.onReport's abi.decode, inside the report envelope Chainlink's forwarder expects:
    // version, execution id, timestamp, DON id, DON config version, workflow id, workflow name, workflow owner, report id.
    const account = privateKeyToAccount((key.startsWith("0x") ? key : `0x${key}`) as `0x${string}`);
    const body = encodeAbiParameters(
      [{ type: "address" }, { type: "string" }, { type: "uint16" }, { type: "uint16" }, { type: "uint16" }, { type: "uint8" }],
      [player, handle, verdict.rapid, verdict.blitz, verdict.bullet, verdict.outcome]
    );
    const execution = keccak256(encodeAbiParameters([{ type: "address" }, { type: "string" }, { type: "uint256" }], [player, handle, BigInt(Date.now())]));
    const header = concat([toHex(1, { size: 1 }), execution, toHex(Math.floor(Date.now() / 1000), { size: 4 }), toHex(0, { size: 4 }), toHex(0, { size: 4 }), pad("0x", { size: 32 }), pad(toHex("rating"), { size: 10, dir: "right" }), account.address, "0x0001"]);
    const wallet = createWalletClient({ account, chain: CHAIN, transport: http() });
    const send = () =>
      wallet.writeContract({
        address: forwarder,
        abi: parseAbi(["function report(address receiver, bytes rawReport, bytes reportContext, bytes[] signatures)"]),
        functionName: "report",
        args: [RATINGS_ADDRESS, concat([header, body]), "0x", []],
        gas: 350_000n,
      });
    // The same key also runs the faucet; if the two collide on a nonce, the second try goes through.
    const hash = await send().catch(async () => {
      await new Promise((r) => setTimeout(r, 1500));
      return send();
    });
    await publicClient.waitForTransactionReceipt({ hash });
    return res.status(200).json({ outcome: verdict.outcome });
  } catch (e) {
    console.error("rating:", e instanceof Error ? e.message.slice(0, 300) : e);
    lastCheck.delete(id);
    return res.status(502).json({ error: "Could not check chess.com just now. Please try again." });
  }
}
