import { useMemo } from "react";
import { useReadContract } from "wagmi";
import { chessContract } from "./contract";

// The leaderboard. The game contract keeps every player's record as games finish (wins, draws,
// losses, and payouts minus stakes), so the table is exact however many games have been played.

export interface Standing {
  address: `0x${string}`;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  /** Payouts minus stakes over all their games, in token units (can be negative). */
  net: bigint;
}

const PAGE = 500n; // players read in one call
const REFRESH_MS = 30_000;

export function useLeaderboard(): { standings: Standing[]; players: number; loading: boolean } {
  const { data, isLoading } = useReadContract({
    ...chessContract,
    functionName: "getPlayers",
    args: [0n, PAGE],
    query: { refetchInterval: REFRESH_MS },
  });
  return useMemo(() => {
    const [addresses, records] = data ?? [[], []];
    const standings: Standing[] = addresses.map((address, i) => {
      const r = records[i];
      return { address, wins: r.wins, draws: r.draws, losses: r.losses, played: r.wins + r.draws + r.losses, net: r.net };
    });
    standings.sort((a, b) => (a.net === b.net ? b.wins - a.wins : a.net > b.net ? -1 : 1));
    return { standings, players: standings.length, loading: isLoading };
  }, [data, isLoading]);
}
