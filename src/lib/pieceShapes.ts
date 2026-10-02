import type { PieceSymbol } from "chess.js";

// Measurements of the 3D chess set (public/set/staunton.gltf, built by tools/build-chess-set.py),
// in board squares.

/** Total height of each piece. */
export const PIECE_HEIGHT: Record<PieceSymbol, number> = { p: 0.91, r: 1.03, n: 1.28, b: 1.46, q: 1.54, k: 1.62 };

/** Share of one stake, out of 39. The king carries none: it cannot be captured. */
export const PIECE_WEIGHT: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

/** Where a piece's eyes and core sit on its surface: heights, and how far forward of the axis. */
export const ANATOMY: Record<PieceSymbol, { eyeY: number; eyeZ: number; eyeX: number; coreY: number; coreZ: number }> = {
  p: { eyeY: 0.79, eyeZ: 0.135, eyeX: 0.05, coreY: 0.3, coreZ: 0.14 },
  r: { eyeY: 0.9, eyeZ: 0.245, eyeX: 0.075, coreY: 0.56, coreZ: 0.15 },
  n: { eyeY: 0.99, eyeZ: 0.285, eyeX: 0.085, coreY: 0.42, coreZ: 0.27 },
  b: { eyeY: 1.05, eyeZ: 0.168, eyeX: 0.058, coreY: 0.42, coreZ: 0.125 },
  q: { eyeY: 1.03, eyeZ: 0.2, eyeX: 0.065, coreY: 0.47, coreZ: 0.245 },
  k: { eyeY: 1.0, eyeZ: 0.195, eyeX: 0.065, coreY: 0.5, coreZ: 0.12 },
};
