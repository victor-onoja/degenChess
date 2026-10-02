import type { PieceSymbol } from "chess.js";

// The silhouette of each piece as a lathe profile: [radius, height] from the hem up. Each piece is a
// small figure in a robe that keeps the head of its chess piece, so it is still read at a glance.
// The 3D pieces are these profiles turned on a lathe; the flat icons are the same profiles mirrored.
// One source, so a piece looks like itself everywhere.

export type Profile = [radius: number, height: number][];

/** How tall and how wide each piece's robe is: [height to the neck, radius at the hem]. */
export const ROBE: Record<PieceSymbol, { h: number; w: number }> = {
  p: { h: 0.46, w: 0.29 },
  n: { h: 0.48, w: 0.33 },
  b: { h: 0.6, w: 0.31 },
  r: { h: 0.6, w: 0.35 },
  q: { h: 0.78, w: 0.34 },
  k: { h: 0.86, w: 0.36 },
};

/**
 * The body below the head: a small figure in a floor-length robe. A rolled hem on the ground,
 * cloth narrowing to a waist, then shoulders, then the neck where the piece's own head begins.
 */
function robe({ h, w }: { h: number; w: number }): Profile {
  return [
    [0, 0],
    [w, 0],
    [w + 0.02, 0.025],
    [w, 0.055],
    [w * 0.9, h * 0.22],
    [w * 0.74, h * 0.48],
    [w * 0.62, h * 0.66],
    [w * 0.7, h * 0.8],
    [w * 0.68, h * 0.9],
    [w * 0.4, h],
  ];
}

/** Radius of a robe at a height, as a fraction of the robe's height (0 = hem, 1 = neck). */
export function robeRadius(kind: PieceSymbol, t: number): number {
  const profile = robe(ROBE[kind]);
  const y = ROBE[kind].h * t;
  for (let i = 1; i < profile.length; i++) {
    const [r0, y0] = profile[i - 1];
    const [r1, y1] = profile[i];
    if (y >= y0 && y <= y1 && y1 > y0) return r0 + ((r1 - r0) * (y - y0)) / (y1 - y0);
  }
  return profile[profile.length - 1][0];
}

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
  p: [...robe(ROBE.p), [0.2, 0.48], [0.2, 0.52], [0.1, 0.55], ...ball(0.165, 0.69)],
  r: [...robe(ROBE.r), [0.27, 0.68], [0.28, 0.88], [0.2, 0.88], [0.2, 0.78], [0, 0.78]],
  b: [
    ...robe(ROBE.b),
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
    ...robe(ROBE.q),
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
  k: [...robe(ROBE.k), [0.24, 0.91], [0.24, 0.95], [0.14, 0.98], [0.18, 1.1], [0.27, 1.26], [0.27, 1.3], [0.2, 1.3], [0.1, 1.36], [0, 1.37]],
};

/** The knight's turned base; its head is modelled separately. */
export const KNIGHT_BASE: Profile = [...robe(ROBE.n), [0.22, 0.5], [0.22, 0.54], [0, 0.56]];

/** Total height of each piece. */
export const PIECE_HEIGHT: Record<PieceSymbol, number> = { p: 0.86, r: 0.88, n: 1.08, b: 1.2, q: 1.36, k: 1.62 };

/** Share of one stake, out of 39. The king carries none: it cannot be captured. */
export const PIECE_WEIGHT: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

/** Where a piece's eyes and core sit: heights, and how far forward of the axis. */
export const ANATOMY: Record<PieceSymbol, { eyeY: number; eyeZ: number; eyeX: number; coreY: number; coreZ: number }> = {
  p: { eyeY: 0.72, eyeZ: 0.14, eyeX: 0.062, coreY: ROBE.p.h * 0.8, coreZ: robeRadius("p", 0.8) - 0.01 },
  r: { eyeY: 0.76, eyeZ: 0.265, eyeX: 0.09, coreY: ROBE.r.h * 0.8, coreZ: robeRadius("r", 0.8) - 0.01 },
  b: { eyeY: 0.86, eyeZ: 0.15, eyeX: 0.058, coreY: ROBE.b.h * 0.8, coreZ: robeRadius("b", 0.8) - 0.01 },
  q: { eyeY: 1.04, eyeZ: 0.165, eyeX: 0.062, coreY: ROBE.q.h * 0.8, coreZ: robeRadius("q", 0.8) - 0.01 },
  k: { eyeY: 1.13, eyeZ: 0.185, eyeX: 0.07, coreY: ROBE.k.h * 0.8, coreZ: robeRadius("k", 0.8) - 0.01 },
  n: { eyeY: 0.89, eyeZ: 0.16, eyeX: 0.105, coreY: ROBE.n.h * 0.8, coreZ: robeRadius("n", 0.8) - 0.01 },
};
