import type { PieceSymbol } from "chess.js";

// Measurements of the 3D chess set (public/set/staunton.gltf, built by tools/build-chess-set.py),
// in board squares.

/** Total height of each piece. */
export const PIECE_HEIGHT: Record<PieceSymbol, number> = { p: 0.91, r: 1.03, n: 1.28, b: 1.46, q: 1.54, k: 1.62 };

/** Share of one stake, out of 39. The king carries none: it cannot be captured. */
export const PIECE_WEIGHT: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

/** Where a piece's core sits on its surface: height, and how far forward of the axis. */
export const ANATOMY: Record<PieceSymbol, { coreY: number; coreZ: number }> = {
  p: { coreY: 0.3, coreZ: 0.14 },
  r: { coreY: 0.56, coreZ: 0.15 },
  n: { coreY: 0.42, coreZ: 0.27 },
  b: { coreY: 0.42, coreZ: 0.125 },
  q: { coreY: 0.47, coreZ: 0.245 },
  k: { coreY: 0.5, coreZ: 0.12 },
};
