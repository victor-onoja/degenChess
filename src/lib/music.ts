import { useEffect } from "react";
import TRACKS from "./music.json";
import { isMuted, onMuteChange } from "./sound";

// The soundtrack: public-domain orchestra (Wagner, Grieg, Saint-Saëns, Holst) shuffled with
// shakuhachi, erhu, guzheng and koto, Japanese festival drums, balafon and djembe. Fetched from
// Wikimedia Commons by tools/music/fetch.mjs; credits are on /credits. It plays quietly under the
// game, starts on the first tap (browsers allow nothing sooner) and follows the mute button.

const VOLUME = 0.22;
let audio: HTMLAudioElement | null = null;
let queue: number[] = [];
let wanted = 0; // how many mounted views want music

function shuffled() {
  const order = TRACKS.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

function playNext() {
  if (!queue.length) queue = shuffled();
  const track = TRACKS[queue.shift()!];
  audio?.pause();
  audio = new Audio(`/music/${track.file}`);
  audio.volume = VOLUME;
  audio.onended = playNext;
  audio.onerror = () => setTimeout(playNext, 1000);
  void audio.play().catch(() => undefined);
}

function start() {
  if (wanted === 0 || isMuted()) return;
  if (audio && !audio.paused) return;
  if (audio && audio.paused && audio.currentTime > 0 && !audio.ended) void audio.play().catch(() => undefined);
  else playNext();
}

/** Plays the soundtrack while the component is mounted and `enabled` (from the first tap on). */
export function useMusic(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    wanted++;
    const gesture = () => start();
    window.addEventListener("pointerdown", gesture);
    window.addEventListener("keydown", gesture);
    const off = onMuteChange((muted) => (muted ? audio?.pause() : start()));
    start(); // already allowed if the visitor has tapped anything on this page
    return () => {
      wanted--;
      window.removeEventListener("pointerdown", gesture);
      window.removeEventListener("keydown", gesture);
      off();
      if (wanted === 0) audio?.pause();
    };
  }, [enabled]);
}
