import {
  createPasskeyWithPrfOutput,
  createSecp256k1SigningSession,
  getEvmAddress,
  getPasskeyPrfOutput,
  isMeraError,
  type Secp256k1SigningSession,
} from "@category-labs/mera";
import { toViemAccount } from "@category-labs/mera/viem";
import { HDKey } from "@scure/bip32";
import { entropyToMnemonic, mnemonicToSeedSync } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import type { LocalAccount } from "viem";

// One passkey, two keys (see README "Accounts"):
//   MONEY - holds funds. Only derived for the length of one money action, then wiped.
//   GAME  - registered with the contract as a game key. Lives in memory so moves need no prompt,
//           and the contract never lets it resign, cancel or withdraw.
const MONEY_PATH = "m/44'/60'/0'/0/0";
const GAME_PATH = "m/44'/60'/0'/0/1";

// Non-secret hint so the browser offers the same passkey next time. Losing it (cleared storage,
// new device) is fine: sign-in then falls back to any discoverable passkey for this site.
const CREDENTIAL_HINT = "degenchess.credential";

export interface KeySession {
  address: `0x${string}`;
  account: LocalAccount;
  /** Wipes the private key; the account can't sign afterwards. */
  end: () => void;
}

function open(seed: Uint8Array, path: string): KeySession {
  const node = HDKey.fromMasterSeed(seed).derive(path);
  if (node.privateKey === null) throw new Error("key derivation failed");
  const session: Secp256k1SigningSession = createSecp256k1SigningSession({ privateKey: node.privateKey });
  node.wipePrivateData();
  return {
    address: getEvmAddress(session.publicKey),
    account: toViemAccount(session),
    end: () => session.end(),
  };
}

function toSessions(prfOutput: Uint8Array) {
  const seed = mnemonicToSeedSync(entropyToMnemonic(prfOutput, wordlist));
  try {
    return { money: open(seed, MONEY_PATH), game: open(seed, GAME_PATH) };
  } finally {
    seed.fill(0);
    prfOutput.fill(0);
  }
}

function readHint() {
  try {
    const stored = localStorage.getItem(CREDENTIAL_HINT);
    return stored ? JSON.parse(stored) : undefined;
  } catch {
    return undefined;
  }
}

function writeHint(hint: unknown) {
  try {
    localStorage.setItem(CREDENTIAL_HINT, JSON.stringify(hint));
  } catch {
    // storage unavailable: sign-in still works through discoverable credentials
  }
}

/** First visit: one passkey ceremony creates the passkey and both keys. */
export async function createAccount() {
  const created = await createPasskeyWithPrfOutput({
    rp: { id: location.hostname, name: "Away Chess" },
    user: { name: `player-${Date.now().toString(36)}`, displayName: "Away Chess player" },
  });
  writeHint({ credentialId: created.credentialId, transports: created.transports });
  return toSessions(created.prfOutput);
}

/** Returning visit, new device, or cleared storage: one ceremony recomputes the same keys. */
export async function unlockAccount() {
  const known = readHint();
  const { prfOutput, credentialId } = await getPasskeyPrfOutput({ rpId: location.hostname, credential: known });
  writeHint(known?.credentialId === credentialId ? known : { credentialId });
  return toSessions(prfOutput);
}

export function hasCredentialHint() {
  return readHint() !== undefined;
}

export function forgetCredentialHint() {
  try {
    localStorage.removeItem(CREDENTIAL_HINT);
  } catch {}
}

export function passkeyErrorMessage(e: unknown): string {
  if (isMeraError(e)) {
    if (e.code === "PRF_UNAVAILABLE") {
      return "This passkey provider can't derive keys (no PRF support). Try iCloud Keychain, Google Password Manager or 1Password.";
    }
    if (e.code === "PASSKEY_OPERATION_FAILED") return "Passkey prompt was cancelled or failed.";
    return e.message;
  }
  return e instanceof Error ? e.message : String(e);
}
