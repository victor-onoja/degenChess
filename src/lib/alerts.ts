import { createPublicClient, formatEther, http, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { CHAIN, IS_LOCAL } from "../config";

// Server only. Tells the team's Discord when one of the wallets that keep the game running is low on
// MON: the faucet (pays for each new player's first gas, and answers rating requests) and the
// referee (pays for each verdict). Checked whenever the faucet is used or a game is reported, so no
// timer is needed; each wallet is mentioned at most once every few hours per server instance.

/** The always-on referee's wallet (deploy/referee). */
const REFEREE_WALLET = (process.env.REFEREE_WALLET ?? "0xC25D50Ed673B3fC347ae00d1288213F8F3C7eA5C") as `0x${string}`;
const FAUCET_FLOOR = parseEther(process.env.FAUCET_ALERT_MON ?? "10"); // about ten more sign-ups
const REFEREE_FLOOR = parseEther(process.env.REFEREE_ALERT_MON ?? "0.5");
const REPEAT_MS = 6 * 60 * 60 * 1000;
const lastAlert = new Map<string, number>();

function webhook() {
  const url = process.env.DISCORD_ALERTS_WEBHOOK ?? process.env.DISCORD_FEEDBACK_WEBHOOK;
  if (!url) return null;
  return IS_LOCAL || /^https:\/\/(ptb\.|canary\.)?discord(app)?\.com\/api\/webhooks\//.test(url) ? url : null;
}

export interface WalletState {
  name: string;
  address: `0x${string}`;
  mon: string;
  low: boolean;
  /** What stops working when it runs dry. */
  matters: string;
}

/** The balances of the wallets the game depends on. */
export async function walletStates(): Promise<WalletState[]> {
  const publicClient = createPublicClient({ chain: CHAIN, transport: http() });
  const key = process.env.FAUCET_PRIVATE_KEY;
  const wallets: { name: string; address: `0x${string}`; floor: bigint; matters: string }[] = [];
  if (key) {
    const faucet = privateKeyToAccount((key.startsWith("0x") ? key : `0x${key}`) as `0x${string}`).address;
    wallets.push({ name: "Faucet", address: faucet, floor: FAUCET_FLOOR, matters: "new players cannot sign up (each one takes about 1 MON)" });
  }
  wallets.push({ name: "Referee", address: REFEREE_WALLET, floor: REFEREE_FLOOR, matters: "checkmates and draws stop settling by themselves" });
  return Promise.all(
    wallets.map(async (w) => {
      const balance = await publicClient.getBalance({ address: w.address });
      return { name: w.name, address: w.address, mon: Number(formatEther(balance)).toFixed(2), low: balance < w.floor, matters: w.matters };
    })
  );
}

/** Posts to Discord about any wallet that is low. Never throws: an alert must not break what called it. */
export async function alertIfLow(): Promise<void> {
  try {
    const url = webhook();
    if (!url || (IS_LOCAL && process.env.ALERTS_ON_LOCAL !== "1")) return;
    const now = Date.now();
    const low = (await walletStates()).filter((w) => w.low && now - (lastAlert.get(w.address) ?? 0) > REPEAT_MS);
    if (low.length === 0) return;
    for (const w of low) lastAlert.set(w.address, now);
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "Away Chess alerts",
        allowed_mentions: { parse: [] },
        embeds: low.map((w) => ({
          title: `${w.name} wallet is low: ${w.mon} MON`,
          description: `Top it up, or ${w.matters}.\nSend MON on Monad testnet to \`${w.address}\`.`,
          color: 0xd9534f,
          timestamp: new Date(now).toISOString(),
        })),
      }),
    });
  } catch (e) {
    console.error("alert:", e instanceof Error ? e.message.slice(0, 200) : e);
  }
}
