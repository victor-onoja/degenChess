// Tiny synthesized sound effects (Web Audio): no audio files to download or license.
// The AudioContext is created on first use, which browsers only allow after a user gesture;
// until then every call is a silent no-op.

const MUTE_PREF = "degenchess.muted";
let ctx: AudioContext | null = null;
let muted = false;

try {
  muted = typeof localStorage !== "undefined" && localStorage.getItem(MUTE_PREF) === "1";
} catch {}

function audio(): AudioContext | null {
  if (muted || typeof window === "undefined") return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx.state === "running" ? ctx : null;
  } catch {
    return null;
  }
}

function tone(freq: number, at: number, duration: number, type: OscillatorType, gain: number, slideTo?: number) {
  const a = audio();
  if (!a) return;
  const osc = a.createOscillator();
  const amp = a.createGain();
  const t0 = a.currentTime + at;
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + duration);
  amp.gain.setValueAtTime(0.0001, t0);
  amp.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(amp).connect(a.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

function noise(at: number, duration: number, gain: number, cutoff: number) {
  const a = audio();
  if (!a) return;
  const buffer = a.createBuffer(1, Math.ceil(a.sampleRate * duration), a.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const source = a.createBufferSource();
  const filter = a.createBiquadFilter();
  const amp = a.createGain();
  source.buffer = buffer;
  filter.type = "lowpass";
  filter.frequency.value = cutoff;
  amp.gain.value = gain;
  source.connect(filter).connect(amp).connect(a.destination);
  source.start(a.currentTime + at);
}

export const sfx = {
  /** A piece is picked up. */
  select: () => tone(660, 0, 0.07, "triangle", 0.08),
  /** Footsteps for a walk lasting `seconds`. */
  steps: (seconds: number) => {
    for (let t = 0; t < seconds; t += 0.26) noise(t, 0.07, 0.16, 900);
  },
  /** A piece touching down after a quiet move. */
  land: (at = 0) => {
    noise(at, 0.06, 0.2, 700);
    tone(180, at, 0.09, "sine", 0.16, 90);
  },
  /** The strike landing. */
  hit: (at = 0) => {
    noise(at, 0.22, 0.5, 1400);
    tone(140, at, 0.25, "sine", 0.4, 45);
  },
  /** Coins flying to the vault. */
  coins: (at = 0) => {
    [1318, 1568, 1760, 2093, 2637].forEach((f, i) => tone(f, at + i * 0.07, 0.22, "triangle", 0.09));
  },
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.14, 0.4, "triangle", 0.14)),
  lose: () => [392, 330, 262].forEach((f, i) => tone(f, i * 0.2, 0.5, "sawtooth", 0.07)),
};

export const isMuted = () => muted;

export function setMuted(next: boolean) {
  muted = next;
  try {
    localStorage.setItem(MUTE_PREF, next ? "1" : "0");
  } catch {}
}
