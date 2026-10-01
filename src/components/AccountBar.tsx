import { TOKEN_SYMBOL } from "../config";
import { useDegenAccount } from "../lib/account";
import { useTokenState } from "../lib/contract";
import { formatToken, shortAddress } from "../lib/format";

/** Sign-up / unlock / lock. The only "wallet" UI in the app: one passkey, no extension, no seed phrase. */
export function AccountBar() {
  const { address, unlocked, returning, busy, signUp, unlock, lock, signOut } = useDegenAccount();
  const { balance } = useTokenState();

  if (unlocked && address) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <span title={address}>
          {shortAddress(address)} &middot; {formatToken(balance)} {TOKEN_SYMBOL}
        </span>
        <button className="retro-button-sm" onClick={lock} title="Wipe the game key from this tab">
          Lock
        </button>
      </div>
    );
  }

  if (returning || address) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        {address && <span className="opacity-80">{shortAddress(address)} (locked)</span>}
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
