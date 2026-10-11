import { headline } from "../lib/rating";
import type { LinkedRating } from "../lib/ratings";

/**
 * A verified chess.com rating, worn after a player's name: the chess.com pawn, the number, and a
 * soft glow that says this player has shown who they are.
 */
export function Rated({ rating }: { rating: LinkedRating | null }) {
  const value = rating ? headline(rating) : 0;
  if (!rating) return null;
  return (
    <span className="rated" title={`Verified on chess.com as ${rating.handle}: rapid ${rating.rapid || "\u2013"}, blitz ${rating.blitz || "\u2013"}, bullet ${rating.bullet || "\u2013"}`}>
      <span className="mark" style={{ ["--mark" as string]: "url(/brand/chesscom-mark.svg)", width: "0.8em", height: "1em" }} />
      {value || "linked"}
    </span>
  );
}
