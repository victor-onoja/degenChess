import type { Color, PieceSymbol } from "chess.js";
import { STANDARD_PIECES } from "../lib/standardPieces";

// Flat pieces: the standard tournament set, in bone and obsidian. Used on the 2D board, the small
// boards in the yard and wherever a piece appears in the interface.

export function PieceIcon({ kind, color, className }: { kind: PieceSymbol; color: Color; className?: string }) {
  return (
    <svg
      viewBox="0 0 45 45"
      className={className}
      aria-hidden="true"
      // A hairline of bone keeps the dark pieces legible on dark squares and panels.
      style={color === "b" ? { filter: "drop-shadow(0 0 0.7px rgba(241, 233, 214, 0.85))" } : undefined}
      dangerouslySetInnerHTML={{ __html: STANDARD_PIECES[`${color}${kind.toUpperCase()}`] }}
    />
  );
}
