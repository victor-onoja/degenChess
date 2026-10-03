import { useEffect, useRef } from "react";
import type { Color, Move } from "chess.js";
import LINES from "./voiceLines.json";
import { isMuted } from "./sound";

// The armies talk: short lines at the moments that matter (a capture, a big capture and the other
// side rallying, check, promotion, castling, checkmate, the start, a low clock). Generated with
// Kokoro by tools/voices/build.mjs. Rate-limited so they stay special; the sound button mutes them.

type Moment = keyof (typeof LINES)["heroes"];
const ARMY: Record<Color, keyof typeof LINES> = { w: "heroes", b: "undead" };
const GAP_MS = 5000;
let lastAt = 0;

export function say(color: Color, moment: Moment, { force = false, delay = 0 } = {}) {
  if (typeof window === "undefined" || isMuted()) return;
  const at = performance.now() + delay;
  if (!force && at - lastAt < GAP_MS) return;
  const options = LINES[ARMY[color]][moment];
  if (!options?.length) return;
  lastAt = at;
  const line = options[Math.floor(Math.random() * options.length)];
  setTimeout(() => {
    if (isMuted()) return;
    const audio = new Audio(`/voices/${line.file}`);
    if (color === "b") {
      // The Undead: slower and lower than any living voice.
      audio.preservesPitch = false;
      audio.playbackRate = 0.84;
    }
    audio.volume = 0.9;
    void audio.play().catch(() => undefined);
  }, delay);
}

/** What the armies say about the move just played. Lines land as the piece arrives. */
function react(move: Move) {
  const mover = move.color;
  const other: Color = mover === "w" ? "b" : "w";
  if (move.san.includes("#")) return say(mover, "mate", { force: true, delay: 900 });
  if (move.promotion) return say(mover, "promotion", { force: true, delay: 700 });
  if (move.captured === "q" || move.captured === "r") {
    say(mover, "bigCapture", { force: true, delay: 900 });
    say(other, "rally", { force: true, delay: 3000 });
    return;
  }
  if (move.san.includes("+")) return say(mover, "check", { delay: 600 });
  if (move.captured && Math.random() < 0.7) return say(mover, "capture", { delay: 900 });
  if ((move.flags.includes("k") || move.flags.includes("q")) && Math.random() < 0.6) say(mover, "castle", { delay: 600 });
}

/**
 * Speaks for new moves as they arrive (never for the moves already on the board when it mounts),
 * and has both armies call out when a game starts.
 */
export function useVoices(history: readonly Move[], enabled: boolean, started: boolean) {
  const seen = useRef<number | null>(null);
  const greeted = useRef(false);
  useEffect(() => {
    if (seen.current === null) seen.current = history.length;
    if (enabled && history.length === seen.current + 1) react(history[history.length - 1]);
    seen.current = history.length;
  }, [history, enabled]);
  useEffect(() => {
    if (!enabled || !started || history.length > 0) {
      if (history.length > 0) greeted.current = true;
      return;
    }
    if (greeted.current) return;
    greeted.current = true;
    say("w", "start", { force: true, delay: 400 });
    say("b", "start", { force: true, delay: 2200 });
  }, [enabled, started, history.length]);
}
