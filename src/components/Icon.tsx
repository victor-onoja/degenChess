// The icon set: drawn at one weight on a 24 grid. No emoji, no symbol glyphs.

const PATHS = {
  back: "M19 12H5M11 6l-6 6 6 6",
  soundOn: "M4 10v4h3l5 4V6L7 10H4zM16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11",
  soundOff: "M4 10v4h3l5 4V6L7 10H4zM16 9.5l5 5M21 9.5l-5 5",
  fullscreen: "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5",
  lock: "M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3",
  up: "M6 15l6-6 6 6",
  down: "M6 9l6 6 6-6",
  plus: "M12 5v14M5 12h14",
  eye: "M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12zM12 9.25a2.75 2.75 0 1 0 0 5.5 2.75 2.75 0 0 0 0-5.5z",
  more: "M6 12h.01M12 12h.01M18 12h.01",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={name === "more" ? 3 : 1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
