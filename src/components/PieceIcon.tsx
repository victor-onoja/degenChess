import type { Color, PieceSymbol } from "chess.js";
import { ANATOMY, PIECE_HEIGHT, PROFILES } from "../lib/pieceShapes";

// Flat piece icons drawn from the same profiles as the 3D set, with the same eyes.
// 100 x 100 viewBox, feet on the baseline.

const SCALE = 58; // profile units to viewBox units; the king (1.62 tall) just fits

function silhouette(kind: Exclude<PieceSymbol, "n">) {
  const right = PROFILES[kind].map(([r, y]) => `${(50 + r * SCALE).toFixed(1)} ${(97 - y * SCALE).toFixed(1)}`);
  const left = [...PROFILES[kind]].reverse().map(([r, y]) => `${(50 - r * SCALE).toFixed(1)} ${(97 - y * SCALE).toFixed(1)}`);
  return `M ${right.join(" L ")} L ${left.join(" L ")} Z`;
}

const PATHS: Record<PieceSymbol, string> = {
  p: silhouette("p"),
  r: silhouette("r"),
  b: silhouette("b"),
  q: silhouette("q"),
  k: silhouette("k"),
  // The knight faces right: turned base, arched neck, long muzzle, one ear.
  n: "M 28 97 L 72 97 L 72 92 L 69 90 L 67 86 C 70 74 76 66 73 55 L 84 58 C 90 58 91 50 87 45 L 70 30 L 67 20 L 58 28 C 42 30 34 44 34 60 C 34 72 36 80 33 86 L 31 90 L 28 92 Z",
};

/** Eye positions in the viewBox. The knight is in profile, so it shows one eye. */
function eyes(kind: PieceSymbol): [number, number][] {
  if (kind === "n") return [[68, 42]];
  const { eyeY, eyeX } = ANATOMY[kind];
  const y = 97 - eyeY * SCALE;
  return [
    [50 - eyeX * SCALE * 1.5, y],
    [50 + eyeX * SCALE * 1.5, y],
  ];
}

export function PieceIcon({
  kind,
  color,
  className,
  core = false,
}: {
  kind: PieceSymbol;
  color: Color;
  className?: string;
  /** Show the value core in the piece's chest (any piece: on a waiting king it stands for the stake). */
  core?: boolean;
}) {
  const body = color === "w" ? "var(--bone)" : "var(--obsidian)";
  const line = color === "w" ? "var(--obsidian)" : "var(--bone)";
  const coreY = 97 - ANATOMY[kind].coreY * SCALE;
  return (
    <svg viewBox={`0 ${97 - PIECE_HEIGHT.k * SCALE - 3} 100 ${PIECE_HEIGHT.k * SCALE + 6}`} className={className} aria-hidden="true">
      <path d={PATHS[kind]} fill={body} stroke={line} strokeWidth={color === "w" ? 0 : 2.2} strokeLinejoin="round" />
      {kind === "k" && (
        <path d="M 50 3 V 19 M 43.5 10 H 56.5" stroke={body} strokeWidth="5" strokeLinecap="round" fill="none" />
      )}
      {core && <circle className="beat" cx="50" cy={coreY} r={kind === "p" ? 4 : 5.5} fill="var(--gold)" />}
      {eyes(kind).map(([x, y], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r="3.4" fill={color === "w" ? "var(--obsidian)" : "var(--bone)"} />
          <circle cx={x + 0.9} cy={y - 0.7} r="1.1" fill={color === "w" ? "var(--bone)" : "var(--obsidian)"} />
        </g>
      ))}
    </svg>
  );
}
