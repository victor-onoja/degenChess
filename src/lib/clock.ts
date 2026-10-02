/** Time controls offered when creating a game: thinking time per player plus seconds added per move. */
export const TIME_CONTROLS = [
  { label: "3 + 2", hint: "Blitz", base: 180, increment: 2 },
  { label: "5 + 3", hint: "Blitz", base: 300, increment: 3 },
  { label: "10 + 5", hint: "Rapid", base: 600, increment: 5 },
  { label: "None", hint: "24h a move", base: 0, increment: 0 },
] as const;

export function describeClock(base: number, increment: number) {
  return base === 0 ? "No clock" : `${Math.round(base / 60)} + ${increment}`;
}

/** 4:05, or 0:07.3 under ten seconds. */
export function formatClock(seconds: number) {
  const s = Math.max(seconds, 0);
  const whole = Math.floor(s);
  const mm = Math.floor(whole / 60);
  const ss = String(whole % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}
