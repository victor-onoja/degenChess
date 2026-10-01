import type { NextApiRequest, NextApiResponse } from "next";
import { createPublicClient, createWalletClient, http, isAddress, parseEther, parseUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { CHAIN, IS_LOCAL, TOKEN_ADDRESS, TOKEN_DECIMALS } from "../../config";
import { erc20Abi } from "../../contracts/abi";

// Testnet faucet: tops a player up with gas (MON) and test dollars. It never holds user keys or
// funds - it only sends from its own balance, and only to addresses that are running low.
const MON_FLOOR = parseEther("0.5");
const MON_DRIP = parseEther("1");
const USD_FLOOR = parseUnits("10", TOKEN_DECIMALS);
const USD_DRIP = parseUnits("100", TOKEN_DECIMALS);
const COOLDOWN_MS = 60_000;

// First account of `npx hardhat node` (public, local chain only).
const HARDHAT_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

const lastDrip = new Map<string, number>();
// The faucet account sends one request at a time so concurrent sign-ups can't collide on nonces.
let queue: Promise<unknown> = Promise.resolve();

function faucetAccount() {
  const key = process.env.FAUCET_PRIVATE_KEY ?? (IS_LOCAL ? HARDHAT_KEY : process.env.DEPLOYER_PRIVATE_KEY);
  if (!key) return null;
  return privateKeyToAccount((key.startsWith("0x") ? key : `0x${key}`) as `0x${string}`);
}

type Body = { funded: boolean; blockNumber?: string } | { error: string };

export default async function handler(req: NextApiRequest, res: NextApiResponse<Body>) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const address = req.body?.address;
  if (typeof address !== "string" || !isAddress(address)) return res.status(400).json({ error: "bad address" });
  const account = faucetAccount();
  if (!account) return res.status(503).json({ error: "faucet not configured" });

  const key = address.toLowerCase();
  if (Date.now() - (lastDrip.get(key) ?? 0) < COOLDOWN_MS) return res.status(429).json({ error: "try again in a minute" });
  lastDrip.set(key, Date.now());

  const run = async (): Promise<Body> => {
    const publicClient = createPublicClient({ chain: CHAIN, transport: http() });
    const wallet = createWalletClient({ account, chain: CHAIN, transport: http() });
    const [mon, usd] = await Promise.all([
      publicClient.getBalance({ address }),
      publicClient.readContract({ address: TOKEN_ADDRESS, abi: erc20Abi, functionName: "balanceOf", args: [address] }),
    ]);

    let blockNumber: bigint | undefined;
    if (usd < USD_FLOOR) {
      const hash = await wallet.writeContract({
        address: TOKEN_ADDRESS,
        abi: erc20Abi,
        functionName: "mint",
        args: [address, USD_DRIP],
      });
      blockNumber = (await publicClient.waitForTransactionReceipt({ hash })).blockNumber;
    }
    if (mon < MON_FLOOR) {
      const hash = await wallet.sendTransaction({ to: address, value: MON_DRIP });
      blockNumber = (await publicClient.waitForTransactionReceipt({ hash })).blockNumber;
    }
    return { funded: blockNumber !== undefined, blockNumber: blockNumber?.toString() };
  };

  const result = queue.then(run, run);
  queue = result.catch(() => undefined);
  try {
    res.status(200).json(await result);
  } catch (e) {
    lastDrip.delete(key);
    console.error("drip failed", e);
    res.status(500).json({ error: "faucet transaction failed" });
  }
}
