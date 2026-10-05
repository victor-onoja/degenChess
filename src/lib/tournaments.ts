import { useMemo } from "react";
import { useReadContract, useReadContracts } from "wagmi";
import { CHAIN, TOURNAMENTS_ADDRESS } from "../config";
import { tournamentsAbi } from "../contracts/abi";
import { chessContract, POLL_MS, Result, Status, toGameInfo, type GameInfo } from "./contract";

// Tournaments are round-robin leagues of ordinary staked games. The Tournaments contract only lists
// who is in one, its stake and clock, and the first game id that counts. Everything else here
// (pairings, results, standings) is read from the games themselves.

export const tournamentsContract = { address: TOURNAMENTS_ADDRESS, abi: tournamentsAbi, chainId: CHAIN.id } as const;

export interface Tournament {
  id: bigint;
  host: `0x${string}`;
  name: string;
  stake: bigint;
  clockBase: number;
  clockIncrement: number;
  createdAt: bigint;
  firstGameId: bigint;
  started: boolean;
  players: readonly `0x${string}`[];
}
type Raw = readonly [`0x${string}`, string, bigint, number, number, bigint, bigint, boolean, readonly `0x${string}`[]];
const parse = (id: bigint, r: Raw): Tournament => ({
  id,
  host: r[0],
  name: r[1],
  stake: r[2],
  clockBase: r[3],
  clockIncrement: r[4],
  createdAt: r[5],
  firstGameId: r[6],
  started: r[7],
  players: r[8],
});

/** The newest tournaments. */
export function useTournaments(limit = 12): { tournaments: Tournament[]; loading: boolean } {
  const { data: count } = useReadContract({ ...tournamentsContract, functionName: "count", query: { enabled: !!TOURNAMENTS_ADDRESS, refetchInterval: POLL_MS * 3 } });
  const ids: bigint[] = [];
  for (let i = count ?? 0n; i > 0n && ids.length < limit; i--) ids.push(i - 1n);
  const { data, isLoading } = useReadContracts({
    contracts: ids.map((id) => ({ ...tournamentsContract, functionName: "get" as const, args: [id] as const })),
    query: { enabled: ids.length > 0, refetchInterval: POLL_MS * 3 },
  });
  const tournaments = ids.flatMap((id, i) => (data?.[i]?.status === "success" ? [parse(id, data[i].result as unknown as Raw)] : []));
  return { tournaments, loading: isLoading && count !== 0n };
}

export function useTournament(id: bigint | null): { tournament: Tournament | undefined; loading: boolean } {
  const { data, isLoading } = useReadContract({
    ...tournamentsContract,
    functionName: "get",
    args: id !== null ? [id] : undefined,
    query: { enabled: id !== null && !!TOURNAMENTS_ADDRESS, refetchInterval: POLL_MS },
  });
  return { tournament: id !== null && data ? parse(id, data as unknown as Raw) : undefined, loading: isLoading };
}

export interface Fixture {
  a: `0x${string}`;
  b: `0x${string}`;
  /** The game that settles this pairing (the first one the two played), if any. */
  game: (GameInfo & { id: bigint }) | null;
  /** A game one of the two has opened and is waiting in, if the pairing has not been played. */
  open: (GameInfo & { id: bigint }) | null;
}
export interface TournamentRow {
  address: `0x${string}`;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  /** 2 for a win, 1 for a draw: whole numbers, shown halved. */
  points: number;
  net: bigint;
}

const SCAN = 300; // games looked at from the tournament's first game on

/** Every pairing of a started tournament with its game, and the standings those games give. */
export function useFixtures(t: Tournament | undefined): { fixtures: Fixture[]; standings: TournamentRow[] } {
  const { data: gameCount } = useReadContract({ ...chessContract, functionName: "gameCount", query: { enabled: !!t?.started, refetchInterval: POLL_MS } });
  const ids: bigint[] = [];
  if (t?.started) for (let id = t.firstGameId; id < (gameCount ?? 0n) && ids.length < SCAN; id++) ids.push(id);
  const { data } = useReadContracts({
    contracts: ids.map((id) => ({ ...chessContract, functionName: "getGame" as const, args: [id] as const })),
    query: { enabled: ids.length > 0, refetchInterval: POLL_MS },
  });

  return useMemo(() => {
    if (!t) return { fixtures: [], standings: [] };
    const key = (x: string) => x.toLowerCase();
    const inIt = new Set(t.players.map(key));
    const games = ids.flatMap((id, i) => {
      const r = data?.[i];
      if (r?.status !== "success") return [];
      const g = { id, ...toGameInfo(r.result as Parameters<typeof toGameInfo>[0]) };
      return g.stake === t.stake ? [g] : [];
    });

    const fixtures: Fixture[] = [];
    for (let i = 0; i < t.players.length; i++) {
      for (let j = i + 1; j < t.players.length; j++) {
        const [a, b] = [t.players[i], t.players[j]];
        const pair = new Set([key(a), key(b)]);
        const game =
          games.find((g) => (g.status === Status.Active || g.status === Status.Finished) && pair.has(key(g.white)) && pair.has(key(g.black)) && key(g.white) !== key(g.black)) ?? null;
        const open = game ? null : (games.find((g) => g.status === Status.Open && pair.has(key(g.white))) ?? null);
        fixtures.push({ a, b, game, open });
      }
    }

    const rows = new Map<string, TournamentRow>(t.players.map((p) => [key(p), { address: p, played: 0, wins: 0, draws: 0, losses: 0, points: 0, net: 0n }]));
    for (const { game } of fixtures) {
      if (!game || game.status !== Status.Finished || !inIt.has(key(game.white)) || !inIt.has(key(game.black))) continue;
      const white = rows.get(key(game.white))!;
      const black = rows.get(key(game.black))!;
      white.played++;
      black.played++;
      white.net += game.whiteBalance - game.stake;
      black.net += game.blackBalance - game.stake;
      if (game.result === Result.Draw) {
        white.draws++;
        black.draws++;
        white.points += 1;
        black.points += 1;
      } else {
        const [winner, loser] = game.result === Result.WhiteWins ? [white, black] : [black, white];
        winner.wins++;
        winner.points += 2;
        loser.losses++;
      }
    }
    const standings = [...rows.values()].sort((x, y) => y.points - x.points || (x.net === y.net ? 0 : x.net > y.net ? -1 : 1));
    return { fixtures, standings };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t, data, ids.length]);
}
