import type { NextApiRequest, NextApiResponse } from "next";
import { alertIfLow, walletStates, type WalletState } from "../../lib/alerts";

// The wallets the game depends on and whether any is running low. Addresses and balances are public
// on-chain, so this shows nothing secret. Opening it also runs the low-balance check.
export default async function handler(_req: NextApiRequest, res: NextApiResponse<{ wallets: WalletState[] } | { error: string }>) {
  res.setHeader("Cache-Control", "no-store");
  try {
    const wallets = await walletStates();
    await alertIfLow();
    res.status(200).json({ wallets });
  } catch {
    res.status(502).json({ error: "could not read the balances" });
  }
}
