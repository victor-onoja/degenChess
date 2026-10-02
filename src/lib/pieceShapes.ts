import type { PieceSymbol } from "chess.js";

// The silhouette of each piece as a lathe profile: [radius, height] from the foot up.
// The 3D pieces are these profiles turned on a lathe; the flat icons are the same profiles mirrored.
// One source, so a piece looks like itself everywhere.

export type Profile = [radius: number, height: number][];

/** Shared foot: a wide base with a bevel, narrowing into the stem. */
const FOOT: Profile = [
  [0, 0],
  [0.36, 0],
  [0.38, 0.03],
  [0.38, 0.09],
  [0.33, 0.12],
  [0.3, 0.17],
  [0.24, 0.2],
];

/** Points along a sphere of radius `r` centred at height `cy`, from its lower edge up to the top. */
function ball(r: number, cy: number, fromAngle = -0.9, steps = 8): Profile {
  const points: Profile = [];
  for (let i = 0; i <= steps; i++) {
    const a = fromAngle + ((Math.PI / 2 - fromAngle) * i) / steps;
    points.push([Math.max(Math.cos(a) * r, 0), cy + Math.sin(a) * r]);
  }
  return points;
}

export const PROFILES: Record<Exclude<PieceSymbol, "n">, Profile> = {
  p: [...FOOT, [0.15, 0.3], [0.11, 0.44], [0.2, 0.48], [0.2, 0.52], [0.1, 0.55], ...ball(0.165, 0.69)],
  r: [...FOOT, [0.21, 0.28], [0.19, 0.62], [0.27, 0.68], [0.28, 0.88], [0.2, 0.88], [0.2, 0.78], [0, 0.78]],
  b: [
    ...FOOT,
    [0.17, 0.3],
    [0.11, 0.6],
    [0.21, 0.65],
    [0.21, 0.69],
    [0.12, 0.72],
    [0.17, 0.82],
    [0.16, 0.92],
    [0.1, 1.03],
    [0.035, 1.1],
    ...ball(0.055, 1.14, -0.6, 5),
  ],
  q: [
    ...FOOT,
    [0.18, 0.32],
    [0.115, 0.78],
    [0.23, 0.83],
    [0.23, 0.87],
    [0.13, 0.9],
    [0.17, 1.02],
    [0.26, 1.16],
    [0.2, 1.15],
    [0.16, 1.19],
    [0.08, 1.24],
    ...ball(0.07, 1.29, -0.6, 5),
  ],
  k: [...FOOT, [0.19, 0.34], [0.125, 0.86], [0.24, 0.91], [0.24, 0.95], [0.14, 0.98], [0.18, 1.1], [0.27, 1.26], [0.27, 1.3], [0.2, 1.3], [0.1, 1.36], [0, 1.37]],
};

/** The knight's turned base; its head is modelled separately. */
export const KNIGHT_BASE: Profile = [...FOOT, [0.2, 0.28], [0.17, 0.46], [0.22, 0.5], [0.22, 0.54], [0, 0.56]];

/** Total height of each piece. */
export const PIECE_HEIGHT: Record<PieceSymbol, number> = { p: 0.86, r: 0.88, n: 1.08, b: 1.2, q: 1.36, k: 1.62 };

/** Share of one stake, out of 39. The king carries none: it cannot be captured. */
export const PIECE_WEIGHT: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

/** Where a piece's eyes and core sit: heights, and how far forward of the axis. */
export const ANATOMY: Record<PieceSymbol, { eyeY: number; eyeZ: number; eyeX: number; coreY: number; coreZ: number }> = {
  p: { eyeY: 0.72, eyeZ: 0.14, eyeX: 0.062, coreY: 0.36, coreZ: 0.125 },
  r: { eyeY: 0.76, eyeZ: 0.265, eyeX: 0.09, coreY: 0.43, coreZ: 0.19 },
  b: { eyeY: 0.86, eyeZ: 0.15, eyeX: 0.058, coreY: 0.42, coreZ: 0.135 },
  q: { eyeY: 1.04, eyeZ: 0.165, eyeX: 0.062, coreY: 0.5, coreZ: 0.145 },
  k: { eyeY: 1.13, eyeZ: 0.185, eyeX: 0.07, coreY: 0.56, coreZ: 0.155 },
  n: { eyeY: 0.89, eyeZ: 0.16, eyeX: 0.105, coreY: 0.37, coreZ: 0.175 },
};
