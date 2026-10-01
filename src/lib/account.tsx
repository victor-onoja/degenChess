import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  BaseError,
  createPublicClient,
  createWalletClient,
  http,
  maxUint256,
  parseEther,
  type Abi,
  type LocalAccount,
  type TransactionReceipt,
} from "viem";
import { toast } from "react-toastify";
import { CHAIN, CONTRACT_ADDRESS, TOKEN_ADDRESS } from "../config";
import { erc20Abi } from "../contracts/abi";
import {
  createAccount,
  forgetCredentialHint,
  hasCredentialHint,
  passkeyErrorMessage,
  unlockAccount,
  type KeySession,
} from "./mera";

export interface Call {
  address: `0x${string}`;
  abi: Abi | readonly unknown[];
  functionName: string;
  args?: readonly unknown[];
  value?: bigint;
}

interface Identity {
  address: `0x${string}`;
  gameKey: `0x${string}`;
}

interface AccountContext {
  /** The player's money address (their identity in games). Null until first unlock on this device. */
  address: `0x${string}` | null;
  /** The game key address, known once unlocked. */
  gameKey: `0x${string}` | null;
  /** True while the game key is live in memory: moves are prompt-free. */
  unlocked: boolean;
  /** A passkey has been used here before (non-secret hint). */
  returning: boolean;
  /** Label of the action in flight, if any. */
  busy: string | null;
  /** Set after sign-up: how long it took to reach the first confirmed transaction. */
  onboarding: { seconds: number } | null;
  signUp: () => Promise<void>;
  unlock: () => Promise<boolean>;
  lock: () => void;
  signOut: () => void;
  /** Prompt-free: signed by the in-memory game key. */
  sendGame: (label: string, call: Call) => Promise<TransactionReceipt | null>;
  /** Re-prompts for the passkey, then signs the calls in order with the money key. */
  sendMoney: (label: string, calls: (id: Identity) => Call[] | Promise<Call[]>) => Promise<TransactionReceipt | null>;
  /** MON to attach to createGame/joinGame so the game key can pay for a full game of moves. */
  gameKeyTopUp: (gameKey: `0x${string}`) => Promise<bigint>;
}

const Ctx = createContext<AccountContext | null>(null);

export const publicClient = createPublicClient({ chain: CHAIN, transport: http() });

const ADDRESS_HINT = "degenchess.address";
const SESSION_IDLE_MS = 30 * 60 * 1000;
const GAME_KEY_GAS_TARGET = parseEther("0.35"); // ~40 moves on Monad testnet
const LOW_GAS = parseEther("0.5"); // below this, ask the faucet before a money action
const SETTLE_BLOCKS = 3n; // Monad checks gas affordability against the balance from 3 blocks back

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function shortError(e: unknown): string {
  if (e instanceof BaseError) return e.shortMessage.split("\n")[0];
  return e instanceof Error ? e.message : String(e);
}

const isLaggedBalance = (e: unknown) =>
  e instanceof BaseError && /insufficient balance|reserve balance/i.test(`${e.details} ${e.shortMessage}`);

/** Wait until funds received in `block` are spendable (or ~1.5s on chains that don't keep producing blocks). */
async function settle(block: bigint) {
  const deadline = Date.now() + 1500;
  while (Date.now() < deadline) {
    if ((await publicClient.getBlockNumber()) >= block + SETTLE_BLOCKS) return;
    await sleep(250);
  }
}

async function write(account: LocalAccount, call: Call): Promise<TransactionReceipt> {
  const wallet = createWalletClient({ account, chain: CHAIN, transport: http() });
  for (let attempt = 0; ; attempt++) {
    try {
      const request = call as any;
      const estimate = await publicClient.estimateContractGas({ ...request, account: account.address });
      // Monad bills the gas limit, so keep the safety margin small.
      const hash = await wallet.writeContract({ ...request, gas: (estimate * 115n) / 100n });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("transaction reverted");
      return receipt;
    } catch (e) {
      if (attempt < 3 && isLaggedBalance(e)) {
        await sleep(1200);
        continue;
      }
      throw e;
    }
  }
}

async function drip(address: string): Promise<bigint | null> {
  const res = await fetch("/api/drip", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ address }),
  });
  if (!res.ok) return null;
  const body = await res.json();
  return body.blockNumber ? BigInt(body.blockNumber) : null;
}

export function AccountProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [address, setAddress] = useState<`0x${string}` | null>(null);
  const [gameKey, setGameKey] = useState<`0x${string}` | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const [returning, setReturning] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [onboarding, setOnboarding] = useState<{ seconds: number } | null>(null);
  const game = useRef<KeySession | null>(null);
  const lastActivity = useRef(Date.now());

  // Restore the (non-secret) identity hint after mount so server and client render the same HTML.
  useEffect(() => {
    setReturning(hasCredentialHint());
    try {
      const hint = localStorage.getItem(ADDRESS_HINT);
      if (hint) setAddress(hint as `0x${string}`);
    } catch {}
  }, []);

  const adopt = useCallback((sessions: { money: KeySession; game: KeySession }) => {
    game.current?.end();
    game.current = sessions.game;
    lastActivity.current = Date.now();
    setAddress(sessions.money.address);
    setGameKey(sessions.game.address);
    setUnlocked(true);
    setReturning(true);
    try {
      localStorage.setItem(ADDRESS_HINT, sessions.money.address);
    } catch {}
  }, []);

  const lock = useCallback(() => {
    game.current?.end();
    game.current = null;
    setUnlocked(false);
  }, []);

  // Session expiry: the game key is wiped after a stretch of inactivity (and always when the tab closes).
  useEffect(() => {
    const timer = setInterval(() => {
      if (game.current && Date.now() - lastActivity.current > SESSION_IDLE_MS) {
        lock();
        toast.info("Session expired after 30 minutes idle. Unlock with your passkey to keep playing.");
      }
    }, 15_000);
    return () => clearInterval(timer);
  }, [lock]);
  useEffect(() => () => game.current?.end(), []);

  /** Runs `job`, reporting progress through one toast. */
  const track = useCallback(
    async <T,>(label: string, job: () => Promise<T>): Promise<T | null> => {
      setBusy(label);
      const id = toast.loading(`${label}...`);
      try {
        const result = await job();
        toast.update(id, { render: `${label}: done`, type: "success", isLoading: false, autoClose: 3000 });
        await queryClient.invalidateQueries();
        return result;
      } catch (e) {
        const message = e instanceof BaseError ? shortError(e) : passkeyErrorMessage(e);
        toast.update(id, { render: `${label} failed: ${message}`, type: "error", isLoading: false, autoClose: 8000 });
        return null;
      } finally {
        setBusy(null);
      }
    },
    [queryClient]
  );

  const signUp = useCallback(async () => {
    const started = Date.now();
    await track("Creating your account", async () => {
      const sessions = await createAccount();
      adopt(sessions);
      try {
        const fundedAt = await drip(sessions.money.address);
        if (fundedAt !== null) await settle(fundedAt);
        // The player's first transaction: a one-time approval so later stakes are a single transaction.
        await write(sessions.money.account, {
          address: TOKEN_ADDRESS,
          abi: erc20Abi,
          functionName: "approve",
          args: [CONTRACT_ADDRESS, maxUint256],
        });
        setOnboarding({ seconds: (Date.now() - started) / 1000 });
      } finally {
        sessions.money.end();
      }
    });
  }, [adopt, track]);

  const unlock = useCallback(async () => {
    const ok = await track("Unlocking", async () => {
      const sessions = await unlockAccount();
      sessions.money.end();
      adopt(sessions);
      void drip(sessions.money.address); // top up in the background if running low
      return true;
    });
    return ok === true;
  }, [adopt, track]);

  const signOut = useCallback(() => {
    lock();
    setAddress(null);
    setGameKey(null);
    setReturning(false);
    setOnboarding(null);
    forgetCredentialHint();
    try {
      localStorage.removeItem(ADDRESS_HINT);
    } catch {}
  }, [lock]);

  const sendGame = useCallback(
    (label: string, call: Call) =>
      track(label, async () => {
        const session = game.current;
        if (!session) throw new Error("Unlock with your passkey first.");
        lastActivity.current = Date.now();
        return write(session.account, call);
      }),
    [track]
  );

  const sendMoney = useCallback(
    (label: string, calls: (id: Identity) => Call[] | Promise<Call[]>) =>
      track(label, async () => {
        // Every money action is confirmed with a fresh passkey ceremony; the money key never outlives it.
        const sessions = await unlockAccount();
        try {
          if (address && sessions.money.address !== address) {
            sessions.game.end();
            throw new Error("That passkey belongs to a different account.");
          }
          adopt(sessions);
          if ((await publicClient.getBalance({ address: sessions.money.address })) < LOW_GAS) {
            const fundedAt = await drip(sessions.money.address);
            if (fundedAt !== null) await settle(fundedAt);
          }
          let receipt: TransactionReceipt | null = null;
          let fundedGameKey = false;
          for (const call of await calls({ address: sessions.money.address, gameKey: sessions.game.address })) {
            receipt = await write(sessions.money.account, call);
            fundedGameKey ||= (call.value ?? 0n) > 0n;
          }
          if (receipt && fundedGameKey) await settle(receipt.blockNumber);
          return receipt as TransactionReceipt;
        } finally {
          sessions.money.end();
        }
      }),
    [address, adopt, track]
  );

  const gameKeyTopUp = useCallback(async (key: `0x${string}`) => {
    const balance = await publicClient.getBalance({ address: key });
    return balance >= GAME_KEY_GAS_TARGET ? 0n : GAME_KEY_GAS_TARGET - balance;
  }, []);

  const value = useMemo(
    () => ({ address, gameKey, unlocked, returning, busy, onboarding, signUp, unlock, lock, signOut, sendGame, sendMoney, gameKeyTopUp }),
    [address, gameKey, unlocked, returning, busy, onboarding, signUp, unlock, lock, signOut, sendGame, sendMoney, gameKeyTopUp]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDegenAccount() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useDegenAccount must be used inside <AccountProvider>");
  return ctx;
}
