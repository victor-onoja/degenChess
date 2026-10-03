import { shareGame } from "../lib/share";
import { Icon } from "./Icon";

/** One tap to share a game. `label` turns the icon into a full button. */
export function ShareButton({ gameId, text, label, className = "ghost" }: { gameId: bigint; text: string; label?: string; className?: string }) {
  return (
    <button
      type="button"
      className={className}
      aria-label={label ?? "Share this game"}
      title="Share this game"
      onClick={(e) => {
        e.stopPropagation();
        void shareGame(gameId, text);
      }}
    >
      <Icon name="share" size={18} />
      {label}
    </button>
  );
}
