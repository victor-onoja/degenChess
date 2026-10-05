import type { NextApiRequest, NextApiResponse } from "next";

// Who is watching which game, right now. Every open game page checks in every few seconds; a viewer
// who stops checking in drops off the count. Kept in this server's memory: it is a live head-count,
// not a record, and it resets when the server restarts (with several server instances it can
// under-count, which is acceptable for an audience number).

const STALE_MS = 25_000;
const watchers = new Map<string, Map<string, number>>(); // game -> viewer -> last seen

function count(game: string, now: number) {
  const viewers = watchers.get(game);
  if (!viewers) return 0;
  for (const [viewer, seen] of viewers) if (now - seen > STALE_MS) viewers.delete(viewer);
  if (viewers.size === 0) watchers.delete(game);
  return viewers.size;
}

type Body = { watching: Record<string, number> } | { error: string };

export default function handler(req: NextApiRequest, res: NextApiResponse<Body>) {
  const now = Date.now();
  res.setHeader("Cache-Control", "no-store");

  // GET /api/watch?games=3,4,7 : the head-count for several games (the Yard).
  if (req.method === "GET") {
    const games = String(req.query.games ?? "").split(",").filter((g) => /^\d{1,12}$/.test(g)).slice(0, 40);
    return res.status(200).json({ watching: Object.fromEntries(games.map((g) => [g, count(g, now)])) });
  }

  // POST { game, viewer, watching } : check in. Players pass watching: false, so they are not counted.
  if (req.method === "POST") {
    const { game, viewer, watching } = req.body ?? {};
    if (typeof game !== "string" || !/^\d{1,12}$/.test(game) || typeof viewer !== "string" || !/^[a-z0-9]{8,32}$/.test(viewer)) {
      return res.status(400).json({ error: "bad request" });
    }
    if (watching === true) {
      if (!watchers.has(game)) watchers.set(game, new Map());
      const viewers = watchers.get(game)!;
      if (viewers.size < 5000) viewers.set(viewer, now);
    } else watchers.get(game)?.delete(viewer);
    return res.status(200).json({ watching: { [game]: count(game, now) } });
  }
  return res.status(405).json({ error: "GET or POST" });
}
