import { useEffect, useRef } from "react";
import type { Color, Move } from "chess.js";
import LINES from "./voiceLines.json";
import { duckMusic } from "./music";
import { isMuted, onMuteChange } from "./sound";

// The armies talk: short lines at the moments that matter (a capture, a big capture and the other
// side rallying, check, promotion, castling, checkmate, the start, a low clock). Generated with
// Kokoro by tools/voices/build.mjs. One voice speaks at a time, ordinary lines are rate-limited so
// they stay special, the music dips under a voice, and the sound button mutes them.

type Moment = keyof (typeof LINES)["heroes"];
const ARMY: Record<Color, keyof typeof LINES> = { w: "heroes", b: "undead" };
const GAP_MS = 5000; // quiet time kept between ordinary lines
const PAUSE_MS = 350; // breath between two lines spoken back to back
let lastAt = 0;
let speaking: HTMLAudioElement | null = null;
/** Important lines waiting for the current one to finish. Never more than two: older ones are dropped. */
const waiting: { color: Color; file: string }[] = [];

function speak(color: Color, file: string) {
  if (isMuted()) return;
  const audio = new Audio(`/voices/${file}`);
  if (color === "b") {
    // The Undead: slower and lower than any living voice.
    audio.preservesPitch = false;
    audio.playbackRate = 0.84;
  }
  audio.volume = 0.9;
  const done = () => {
    if (speaking !== audio) return;
    speaking = null;
    lastAt = performance.now();
    const next = waiting.shift();
    if (next) setTimeout(() => (speaking ? waiting.unshift(next) : speak(next.color, next.file)), PAUSE_MS);
    else duckMusic(false);
  };
  audio.onended = done;
  audio.onerror = done;
  speaking = audio;
  duckMusic(true); // the music steps back while someone is talking
  void audio.play().catch(done);
}

// Muting cuts a line off mid-word and forgets anything waiting.
if (typeof window !== "undefined") {
  onMuteChange((muted) => {
    if (!muted) return;
    waiting.length = 0;
    speaking?.pause();
    speaking = null;
    duckMusic(false);
  });
}

/**
 * Has an army say a line for a moment. One voice at a time: an ordinary line is skipped if someone
 * is talking or spoke in the last few seconds; a `force` line (checkmate, a queen taken...) waits its
 * turn instead, so two lines never talk over each other.
 */
export function say(color: Color, moment: Moment, { force = false, delay = 0 } = {}) {
  if (typeof window === "undefined" || isMuted()) return;
  const options = LINES[ARMY[color]][moment];
  if (!options?.length) return;
  const line = options[Math.floor(Math.random() * options.length)];
  setTimeout(() => {
    if (isMuted()) return;
    if (speaking) {
      if (!force) return;
      if (waiting.length >= 2) waiting.shift();
      waiting.push({ color, file: line.file });
      return;
    }
    if (!force && performance.now() - lastAt < GAP_MS) return;
    speak(color, line.file);
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
