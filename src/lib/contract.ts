import { useReadContract } from "wagmi";
import { useDegenAccount } from "./account";
import { degenChessAbi, erc20Abi } from "../contracts/abi";
import { CHAIN, CONTRACT_ADDRESS, TOKEN_ADDRESS } from "../config";

export enum Status {
  None,
  Open,
  Active,
  Finished,
  Cancelled,
}

export enum Result {
  None,
  WhiteWins,
  BlackWins,
  Draw,
}

export const POLL_MS = 4000;

export const chessContract = { address: CONTRACT_ADDRESS, abi: degenChessAbi, chainId: CHAIN.id } as const;
export const tokenContract = { address: TOKEN_ADDRESS, abi: erc20Abi, chainId: CHAIN.id } as const;

export interface GameInfo {
  white: `0x${string}`;
  black: `0x${string}`;
  stake: bigint;
  whiteBalance: bigint;
  blackBalance: bigint;
  status: Status;
  result: Result;
  drawOfferedBy: `0x${string}`;
  lastMoveAt: bigint;
  moveCount: bigint;
}

export function toGameInfo(
  r: readonly [`0x${string}`, `0x${string}`, bigint, bigint, bigint, number, number, `0x${string}`, bigint, bigint]
): GameInfo {
  const [white, black, stake, whiteBalance, blackBalance, status, result, drawOfferedBy, lastMoveAt, moveCount] = r;
  return { white, black, stake, whiteBalance, blackBalance, status, result, drawOfferedBy, lastMoveAt, moveCount };
}

export function useGame(gameId: bigint | null) {
  const query = useReadContract({
    ...chessContract,
    functionName: "getGame",
    args: gameId !== null ? [gameId] : undefined,
    query: { enabled: gameId !== null, refetchInterval: POLL_MS },
  });
  return { ...query, game: query.data ? toGameInfo(query.data) : undefined };
}

/** The connected wallet's token balance and allowance for the chess contract. */
export function useTokenState() {
  const { address } = useDegenAccount();
  const enabled = { enabled: !!address };
  const balance = useReadContract({
    ...tokenContract,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: enabled,
  });
  const allowance = useReadContract({
    ...tokenContract,
    functionName: "allowance",
    args: address ? [address, CONTRACT_ADDRESS] : undefined,
    query: enabled,
  });
  return { balance: balance.data, allowance: allowance.data };
}

export interface Limits {
  /** Trust tier, 0 for a new account. */
  tier: number;
  /** Largest stake this account may put up. */
  maxStake: bigint;
  /** Seconds a finished game's winnings wait before they can be withdrawn. */
  payoutHold: number;
  /** Unix seconds; in the future while the account is under review. */
  frozenUntil: number;
}

const UNLIMITED = 2n ** 255n;

/** The account's fair-play limits: stake cap, payout hold and any freeze. */
export function useLimits(address: `0x${string}` | null | undefined) {
  const { data } = useReadContract({
    ...chessContract,
    functionName: "limitsOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 30_000 },
  });
  if (!data) return undefined;
  const [tier, maxStake, payoutHold, frozenUntil] = data;
  return { tier, maxStake, payoutHold, frozenUntil: Number(frozenUntil) } as Limits;
}

/** True when the cap is a real limit rather than "no limit set". */
export const isCapped = (l: Limits | undefined) => !!l && l.maxStake < UNLIMITED;

/** "4h 12m", "35m", "20s": for hold countdowns. */
export function formatWait(seconds: number): string {
  if (seconds <= 0) return "now";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${seconds}s`;
}
