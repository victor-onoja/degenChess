import { useAccount, useReadContract } from "wagmi";
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
  const { address } = useAccount();
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
