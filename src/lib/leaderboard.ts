import { useMemo } from "react";
import { useReadContract, useReadContracts } from "wagmi";
import { chessContract, Result, Status, toGameInfo } from "./contract";

// The leaderboard, worked out from the chain: every finished game counts a result and the money each
// player took out of it (their payout minus their stake). No server keeps score.

export interface Standing {
  address: `0x${string}`;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  /** Payouts minus stakes over these games, in token units (can be negative). */
  net: bigint;
}

const HISTORY = 200; // games looked at, newest first
const REFRESH_MS = 30_000;

export function useLeaderboard(): { standings: Standing[]; games: number; loading: boolean } {
  const { data: gameCount } = useReadContract({ ...chessContract, functionName: "gameCount", query: { refetchInterval: REFRESH_MS } });
  const ids: bigint[] = [];
  for (let i = gameCount ?? 0n; i > 0n && ids.length < HISTORY; i--) ids.push(i - 1n);
  const { data, isLoading } = useReadContracts({
    contracts: ids.map((id) => ({ ...chessContract, functionName: "getGame" as const, args: [id] as const })),
    query: { enabled: ids.length > 0, refetchInterval: REFRESH_MS },
  });

  return useMemo(() => {
    const table = new Map<string, Standing>();
    const row = (address: `0x${string}`) => {
      const key = address.toLowerCase();
      if (!table.has(key)) table.set(key, { address, played: 0, wins: 0, draws: 0, losses: 0, net: 0n });
      return table.get(key)!;
    };
    let games = 0;
    for (const r of data ?? []) {
      if (r.status !== "success") continue;
      const g = toGameInfo(r.result as Parameters<typeof toGameInfo>[0]);
      if (g.status !== Status.Finished) continue;
      games++;
      const white = row(g.white);
      const black = row(g.black);
      white.played++;
      black.played++;
      white.net += g.whiteBalance - g.stake;
      black.net += g.blackBalance - g.stake;
      if (g.result === Result.Draw) {
        white.draws++;
        black.draws++;
      } else {
        const whiteWon = g.result === Result.WhiteWins;
        (whiteWon ? white : black).wins++;
        (whiteWon ? black : white).losses++;
      }
    }
    const standings = [...table.values()].sort((a, b) => (a.net === b.net ? b.wins - a.wins : a.net > b.net ? -1 : 1));
    return { standings, games, loading: isLoading && gameCount !== 0n };
  }, [data, isLoading, gameCount]);
}
