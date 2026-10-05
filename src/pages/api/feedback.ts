import type { NextApiRequest, NextApiResponse } from "next";
import { IS_LOCAL } from "../../config";

// Feedback from players (bugs, ideas, anything else), posted into a Discord channel through a
// webhook. The webhook address is a secret (DISCORD_FEEDBACK_WEBHOOK): anyone holding it can post
// to the channel, so it stays on the server and the browser only ever talks to this route.

const KINDS = { bug: "Bug", idea: "Idea", other: "Other" } as const;
const COLOURS = { bug: 0xd9534f, idea: 0x8b6cf6, other: 0xf1e9d6 } as const;
const MAX_MESSAGE = 1500;
const WINDOW_MS = 10 * 60_000;
const PER_WINDOW = 5;

const recent = new Map<string, number[]>(); // sender -> when they last wrote (this server's memory)

function webhook() {
  const url = process.env.DISCORD_FEEDBACK_WEBHOOK;
  if (!url) return null;
  // Only ever post to Discord (a local test server is allowed on a local chain).
  return IS_LOCAL || /^https:\/\/(ptb\.|canary\.)?discord(app)?\.com\/api\/webhooks\//.test(url) ? url : null;
}

/** Short, single-line and free of anything Discord would treat as formatting or a mention. */
const tidy = (value: unknown, max: number) =>
  typeof value === "string" ? value.replace(/[\u0000-\u001f`@<>]/g, " ").trim().slice(0, max) : "";

type Body = { ok: true } | { error: string };

export default async function handler(req: NextApiRequest, res: NextApiResponse<Body>) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const url = webhook();
  if (!url) return res.status(503).json({ error: "Feedback is not switched on yet." });

  const { kind, message, from, page, device } = req.body ?? {};
  if (typeof kind !== "string" || !(kind in KINDS)) return res.status(400).json({ error: "Choose what kind of feedback this is." });
  const text = typeof message === "string" ? message.replace(/\u0000/g, "").trim().slice(0, MAX_MESSAGE) : "";
  if (text.length < 5) return res.status(400).json({ error: "Say a little more, so we can act on it." });

  const forwarded = req.headers["x-forwarded-for"];
  const sender = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(",")[0].trim() || req.socket.remoteAddress || "unknown";
  const now = Date.now();
  const times = (recent.get(sender) ?? []).filter((t) => now - t < WINDOW_MS);
  if (times.length >= PER_WINDOW) return res.status(429).json({ error: "That's a lot of feedback. Try again in a few minutes." });
  recent.set(sender, [...times, now]);
  if (recent.size > 5000) recent.clear();

  const k = kind as keyof typeof KINDS;
  try {
    const sent = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "Away Chess feedback",
        allowed_mentions: { parse: [] }, // nobody can ping the channel through this form
        embeds: [
          {
            title: KINDS[k],
            description: text,
            color: COLOURS[k],
            fields: [
              { name: "From", value: tidy(from, 60) || "not signed in", inline: true },
              { name: "Page", value: tidy(page, 120) || "-", inline: true },
              { name: "Device", value: tidy(device, 160) || "-" },
            ],
            timestamp: new Date(now).toISOString(),
          },
        ],
      }),
    });
    if (!sent.ok) throw new Error(`Discord answered ${sent.status}`);
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("feedback:", e instanceof Error ? e.message : e);
    return res.status(502).json({ error: "Could not send that just now. Please try again." });
  }
}
