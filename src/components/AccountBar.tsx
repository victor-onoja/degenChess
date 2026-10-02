import { useState } from "react";
import { TOKEN_SYMBOL } from "../config";
import { useDegenAccount } from "../lib/account";
import { useTokenState } from "../lib/contract";
import { formatToken, shortAddress } from "../lib/format";
import { cleanName, NAME_RULE, namesContract, useNames } from "../lib/names";
import { Icon } from "./Icon";

/** Sign-up / unlock / lock. The only account UI in the app: one passkey, no extension, no seed phrase. */
export function AccountBar() {
  const { address, unlocked, returning, busy, signUp, unlock, lock, sendMoney } = useDegenAccount();
  const { balance } = useTokenState();
  const { nameOf } = useNames([address]);
  const name = nameOf(address);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  if (unlocked && address) {
    return (
      <div className="flex min-w-0 items-center justify-end gap-x-3 sm:gap-x-4">
        {editing ? (
          <form
            className="flex items-stretch"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!NAME_RULE.test(draft)) return;
              const ok = await sendMoney("Set username", () => [{ ...namesContract, functionName: "setName", args: [draft] }]);
              if (ok) setEditing(false);
            }}
          >
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(cleanName(e.target.value))}
              placeholder="username"
              aria-label="Username"
              className="min-h-[44px] w-28 px-3 sm:w-36"
              maxLength={16}
            />
            <button type="submit" className="act act--sm" style={{ minHeight: 44, borderRadius: 0 }} disabled={!NAME_RULE.test(draft) || busy !== null}>
              Save
            </button>
            <button type="button" className="link ml-3" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </form>
        ) : (
          <>
            {/* The name is the rename control: tap it to change it. */}
            <button
              className="max-w-[9rem] truncate font-bold underline decoration-[var(--line)] underline-offset-4 sm:max-w-none"
              title={name ? "Rename" : "Set a username"}
              onClick={() => {
                setDraft(name ?? "");
                setEditing(true);
              }}
            >
              {name ?? shortAddress(address)}
            </button>
            <span className="amount shrink-0">
              {formatToken(balance)} {TOKEN_SYMBOL}
            </span>
          </>
        )}
        <button className="ghost" onClick={lock} aria-label="Lock" title="Wipe the game key from this tab">
          <Icon name="lock" />
        </button>
      </div>
    );
  }

  if (returning || address) {
    return (
      <div className="flex items-center justify-end gap-x-4">
        {address && <span className="soft hidden sm:inline">{name ?? shortAddress(address)}, locked</span>}
        <button className="act act--sm" disabled={busy !== null} onClick={() => void unlock()}>
          Unlock<span className="hidden sm:inline">&nbsp;with passkey</span>
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
      <button className="act act--sm" disabled={busy !== null} onClick={() => void signUp()}>
        {busy ?? "Play now"}
      </button>
      <button className="link text-sm" disabled={busy !== null} onClick={() => void unlock()}>
        I have a passkey
      </button>
    </div>
  );
}
