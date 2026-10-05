import { useEffect, useState } from "react";

// How many people are watching a game (see pages/api/watch.ts). Spectators are counted while the
// game is open in their tab; the two players see the number but are not part of it.

const BEAT_MS = 10_000;

/** A random id for this tab, so a spectator is one head however often they check in. */
function viewerId() {
  try {
    let id = sessionStorage.getItem("degenchess.viewer");
    if (!id) {
      id = Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, "0")).join("");
      sessionStorage.setItem("degenchess.viewer", id);
    }
    return id;
  } catch {
    return "anonymous0";
  }
}

/** Checks in on a game and returns the current audience. `watching` is false for the two players. */
export function useWatchers(gameId: bigint, watching: boolean, enabled = true): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const game = gameId.toString();
    const viewer = viewerId();
    let stopped = false;
    const beat = async (present: boolean) => {
      try {
        const res = await fetch("/api/watch", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ game, viewer, watching: present }),
          keepalive: !present,
        });
        const body = await res.json();
        if (!stopped && typeof body.watching?.[game] === "number") setCount(body.watching[game]);
      } catch {
        // the count is decoration: ignore network trouble
      }
    };
    void beat(watching);
    const timer = setInterval(() => void beat(watching), BEAT_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
      if (watching) void beat(false); // leaving: step out of the count straight away
    };
  }, [gameId, watching, enabled]);
  return count;
}

/** The audience of several games at once, for the boards in the Yard. */
export function useWatcherCounts(ids: bigint[]): Record<string, number> {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const key = ids.map((id) => id.toString()).join(",");
  useEffect(() => {
    if (!key) return;
    let stopped = false;
    const load = async () => {
      try {
        const body = await (await fetch(`/api/watch?games=${key}`)).json();
        if (!stopped && body.watching) setCounts(body.watching);
      } catch {}
    };
    void load();
    const timer = setInterval(() => void load(), BEAT_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [key]);
  return counts;
}
