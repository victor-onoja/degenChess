import { useState } from "react";
import { TOKEN_SYMBOL } from "../config";
import { useDegenAccount } from "../lib/account";
import { useTokenState } from "../lib/contract";
import { formatToken, shortAddress } from "../lib/format";
import { cleanName, NAME_RULE, namesContract, useNames } from "../lib/names";

/** Sign-up / unlock / lock. The only "wallet" UI in the app: one passkey, no extension, no seed phrase. */
export function AccountBar() {
  const { address, unlocked, returning, busy, signUp, unlock, lock, signOut, sendMoney } = useDegenAccount();
  const { balance } = useTokenState();
  const { nameOf } = useNames([address]);
  const name = nameOf(address);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  if (unlocked && address) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        {editing ? (
          <form
            className="flex items-center gap-2"
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
              className="w-36 !py-1"
              maxLength={16}
            />
            <button type="submit" className="retro-button-sm" disabled={!NAME_RULE.test(draft) || busy !== null}>
              Save
            </button>
            <button type="button" className="underline opacity-80" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </form>
        ) : (
          <>
            <span title={address}>
              <span className="font-bold text-white">{name ?? shortAddress(address)}</span> &middot; {formatToken(balance)}{" "}
              {TOKEN_SYMBOL}
            </span>
            <button
              className="underline opacity-80"
              onClick={() => {
                setDraft(name ?? "");
                setEditing(true);
              }}
            >
              {name ? "Rename" : "Set username"}
            </button>
          </>
        )}
        <button className="retro-button-sm" onClick={lock} title="Wipe the game key from this tab">
          Lock
        </button>
      </div>
    );
  }

  if (returning || address) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        {address && <span className="opacity-80">{name ?? shortAddress(address)} (locked)</span>}
        <button className="retro-button" disabled={busy !== null} onClick={() => void unlock()}>
          Unlock with passkey
        </button>
        <button className="underline opacity-80" disabled={busy !== null} onClick={signOut}>
          Switch account
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button className="retro-button" disabled={busy !== null} onClick={() => void signUp()}>
        {busy ?? "Play now"}
      </button>
      <button className="underline opacity-80" disabled={busy !== null} onClick={() => void unlock()}>
        I have a passkey
      </button>
    </div>
  );
}
