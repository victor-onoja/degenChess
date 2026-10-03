import { useState } from "react";
import { useDegenAccount } from "../lib/account";
import { cleanName, NAME_HINT, namesContract, useNameStatus } from "../lib/names";

/**
 * Claim or change a username: checks availability as you type, then claims it with one passkey prompt.
 * Usernames are unique, and they replace your address everywhere in the game.
 */
export function NameEditor({ current, onDone, autoFocus = false }: { current?: string; onDone?: () => void; autoFocus?: boolean }) {
  const { address, busy, sendMoney } = useDegenAccount();
  const [draft, setDraft] = useState(current ?? "");
  const status = useNameStatus(draft, address);
  const ok = status === "available";

  return (
    <form
      className="flex flex-col gap-1.5"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!ok) return;
        const done = await sendMoney("Claim username", () => [{ ...namesContract, functionName: "setName", args: [draft] }]);
        if (done) onDone?.();
      }}
    >
      <div className="flex items-stretch">
        <input
          autoFocus={autoFocus}
          value={draft}
          onChange={(e) => setDraft(cleanName(e.target.value))}
          placeholder="username"
          aria-label="Username"
          aria-describedby="name-hint"
          className="min-h-[44px] w-full min-w-0 px-3 sm:w-44"
          maxLength={16}
          autoComplete="off"
        />
        <button type="submit" className="act act--sm shrink-0" style={{ minHeight: 44, borderRadius: 0 }} disabled={!ok || busy !== null}>
          {current ? "Save" : "Claim"}
        </button>
        {onDone && (
          <button type="button" className="link ml-3 shrink-0 text-sm" onClick={onDone}>
            Cancel
          </button>
        )}
      </div>
      <span
        id="name-hint"
        className="text-xs"
        style={{ color: status === "taken" ? "var(--alert)" : status === "available" ? "var(--gold)" : "var(--bone-soft)" }}
      >
        {NAME_HINT[status]}
      </span>
    </form>
  );
}
