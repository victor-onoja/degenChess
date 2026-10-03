import { useState } from "react";
import { TOKEN_SYMBOL } from "../config";
import { useDegenAccount } from "../lib/account";
import { useTokenState } from "../lib/contract";
import { formatToken, shortAddress } from "../lib/format";
import { useNames } from "../lib/names";
import { Icon } from "./Icon";
import { NameEditor } from "./NameEditor";
import { Wallet } from "./Wallet";

/** Sign-up / unlock / lock. The only account UI in the app: one passkey, no extension, no seed phrase. */
export function AccountBar() {
  const { address, unlocked, returning, busy, signUp, unlock, lock } = useDegenAccount();
  const { balance } = useTokenState();
  const { nameOf } = useNames([address]);
  const name = nameOf(address);
  const [editing, setEditing] = useState(false);
  const [wallet, setWallet] = useState(false);

  if (unlocked && address) {
    return (
      <div className="flex min-w-0 items-center justify-end gap-x-3 sm:gap-x-4">
        {editing ? (
          <NameEditor current={name} onDone={() => setEditing(false)} autoFocus />
        ) : (
          <>
            {name ? (
              // The name is the rename control: tap it to change it.
              <button
                className="max-w-[9rem] truncate font-bold underline decoration-[var(--line)] underline-offset-4 sm:max-w-none"
                title="Rename"
                onClick={() => setEditing(true)}
              >
                {name}
              </button>
            ) : (
              // No name yet: claiming one is the expected next step, so it is the most visible thing here.
              <button className="act act--sm act--bone" onClick={() => setEditing(true)}>
                Choose a username
              </button>
            )}
            <button className="amount shrink-0 underline decoration-[var(--line)] underline-offset-4" title="Add funds or send" onClick={() => setWallet(true)}>
              {formatToken(balance)} {TOKEN_SYMBOL}
            </button>
          </>
        )}
        <button className="ghost" onClick={lock} aria-label="Lock" title="Wipe the game key from this tab">
          <Icon name="lock" />
        </button>
        {wallet && <Wallet onClose={() => setWallet(false)} />}
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
