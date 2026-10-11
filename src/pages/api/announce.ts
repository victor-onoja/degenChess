import type { NextApiRequest, NextApiResponse } from "next";
import { createPublicClient, formatUnits, http, zeroAddress } from "viem";
import { CHAIN, CONTRACT_ADDRESS, IS_LOCAL, NAMES_ADDRESS, TOKEN_DECIMALS, TOKEN_SYMBOL } from "../../config";
import { degenChessAbi, playerNamesAbi } from "../../contracts/abi";
import { alertIfLow } from "../../lib/alerts";

// Reports a finished game to the team's Discord: who played, how it ended, what was paid. It is
// called by the referee workflow after it settles a game (cre/referee/main.ts) and by a player's
// browser when their game ends any other way (a resignation, a draw, a win on time).
//
// The caller only names a game. Everything in the message is read from the chain here, so a caller
// cannot make it say anything untrue; the most they can do is ask about a recent finished game
// again, which is ignored while this server remembers reporting it.

const FINISHED = 3;
const RECENT = 40n; // only the newest games are reported, so old ones cannot be replayed into the channel
const reported = new Set<string>();

function webhook() {
  const url = process.env.DISCORD_RESULTS_WEBHOOK ?? process.env.DISCORD_FEEDBACK_WEBHOOK;
  if (!url) return null;
  return IS_LOCAL || /^https:\/\/(ptb\.|canary\.)?discord(app)?\.com\/api\/webhooks\//.test(url) ? url : null;
}
const money = (v: bigint) => formatUnits(v, TOKEN_DECIMALS).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
const short = (a: string) => `${a.slice(0, 6)}...${a.slice(-4)}`;

type Body = { reported: boolean } | { error: string };

export default async function handler(req: NextApiRequest, res: NextApiResponse<Body>) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST" && req.method !== "GET") return res.status(405).json({ error: "GET or POST" });
  const raw = req.method === "GET" ? req.query.game : req.body?.game;
  if (typeof raw !== "string" || !/^\d{1,12}$/.test(raw)) return res.status(400).json({ error: "which game?" });
  const url = webhook();
  if (!url) return res.status(200).json({ reported: false }); // not switched on: nothing to do, and no error for the caller
  if (reported.has(raw)) return res.status(200).json({ reported: false });

  try {
    const id = BigInt(raw);
    const publicClient = createPublicClient({ chain: CHAIN, transport: http() });
    const count = await publicClient.readContract({ address: CONTRACT_ADDRESS, abi: degenChessAbi, functionName: "gameCount" });
    if (id >= count || id + RECENT < count) return res.status(200).json({ reported: false });
    const [white, black, stake, whitePayout, blackPayout, status, result, , , moves] = await publicClient.readContract({
      address: CONTRACT_ADDRESS,
      abi: degenChessAbi,
      functionName: "getGame",
      args: [id],
    });
    if (status !== FINISHED || black === zeroAddress) return res.status(200).json({ reported: false });
    if (reported.has(raw)) return res.status(200).json({ reported: false });
    reported.add(raw);
    if (reported.size > 2000) reported.clear();

    const names = NAMES_ADDRESS
      ? await publicClient.readContract({ address: NAMES_ADDRESS, abi: playerNamesAbi, functionName: "namesOf", args: [[white, black]] }).catch(() => ["", ""])
      : ["", ""];
    const [w, b] = [names[0] || short(white), names[1] || short(black)];
    const title = result === 3 ? `Game #${raw}: ${w} and ${b} drew` : `Game #${raw}: ${result === 1 ? w : b} beat ${result === 1 ? b : w}`;
    const host = req.headers.host ?? "";
    const sent = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "Away Chess results",
        allowed_mentions: { parse: [] },
        embeds: [
          {
            title: title.replace(/[`@<>]/g, ""),
            url: host ? `${host.startsWith("localhost") ? "http" : "https"}://${host}/?game=${raw}` : undefined,
            color: result === 3 ? 0xf1e9d6 : 0x8b6cf6,
            fields: [
              { name: "Stake", value: `${money(stake)} ${TOKEN_SYMBOL} each`, inline: true },
              { name: "Paid out", value: `White ${money(whitePayout)} · Black ${money(blackPayout)}`, inline: true },
              { name: "Moves", value: String(moves), inline: true },
            ],
            timestamp: new Date().toISOString(),
          },
        ],
      }),
    });
    if (!sent.ok) throw new Error(`Discord answered ${sent.status}`);
    await alertIfLow(); // every finished game is a chance to notice the referee's wallet running down
    return res.status(200).json({ reported: true });
  } catch (e) {
    reported.delete(raw);
    console.error("announce:", e instanceof Error ? e.message.slice(0, 200) : e);
    return res.status(502).json({ error: "could not report that game" });
  }
}
