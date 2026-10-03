import { useDegenAccount } from "../lib/account";
import { useNames } from "../lib/names";
import { shareGame } from "../lib/share";
import { Icon } from "./Icon";

/** One tap to share a game. `label` turns the icon into a full button. */
export function ShareButton({ gameId, text, label, className = "ghost" }: { gameId: bigint; text: string; label?: string; className?: string }) {
  // Your links carry your name, so whoever signs up through them is recorded as your invite.
  const { address } = useDegenAccount();
  const { nameOf } = useNames([address]);
  const ref = nameOf(address) ?? address ?? undefined;
  return (
    <button
      type="button"
      className={className}
      aria-label={label ?? "Share this game"}
      title="Share this game"
      onClick={(e) => {
        e.stopPropagation();
        void shareGame(gameId, text, ref);
      }}
    >
      <Icon name="share" size={18} />
      {label}
    </button>
  );
}
