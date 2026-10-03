import { useEffect, useRef } from "react";
import type { Move } from "chess.js";

/**
 * Every move of the game in one scrolling line ("1. e4 e5 2. Nf3 ..."), always showing the latest.
 * Tap a move to see the board as it was then. `shown` is how many moves are on the board.
 */
export function MoveList({ history, shown, onSelect }: { history: readonly Move[]; shown: number; onSelect: (ply: number) => void }) {
  const strip = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = strip.current?.querySelector<HTMLElement>("[data-current]");
    el?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [shown, history.length]);
  if (history.length === 0) return null;
  return (
    <div ref={strip} className="move-list" aria-label="Moves">
      {history.map((m, i) => (
        <span key={i} className="flex items-baseline">
          {i % 2 === 0 && <span className="soft mr-1 text-xs">{i / 2 + 1}.</span>}
          <button
            className="move-list__move"
            aria-pressed={shown === i + 1}
            data-current={shown === i + 1 ? "" : undefined}
            onClick={() => onSelect(i + 1)}
          >
            {m.san}
          </button>
        </span>
      ))}
    </div>
  );
}
