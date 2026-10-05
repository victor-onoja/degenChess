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

export interface Prize {
  entryFee: bigint;
  /** 0 = winner takes all, 1 = top three 50/30/20. */
  mode: number;
  deadline: bigint;
  pot: bigint;
  settled: boolean;
  cancelled: boolean;
  recorded: number;
  /** What each player was paid, by lower-case address (after the payout). */
  prizes: Map<string, bigint>;
}

/** The prize side of a tournament: its pot, deadline, and who was paid what. */
export function usePrize(t: Tournament | undefined): Prize | undefined {
  const { data } = useReadContract({
    ...tournamentsContract,
    functionName: "getPrize",
    args: t ? [t.id] : undefined,
    query: { enabled: !!t && !!TOURNAMENTS_ADDRESS, refetchInterval: POLL_MS },
  });
  return useMemo(() => {
    if (!t || !data) return undefined;
    const [entryFee, mode, deadline, pot, settled, cancelled, recorded, , prizes] = data;
    return { entryFee, mode, deadline, pot, settled, cancelled, recorded, prizes: new Map(t.players.map((p, i) => [p.toLowerCase(), prizes[i] ?? 0n])) };
  }, [t, data]);
}

type Game = GameInfo & { id: bigint };
const key = (x: string) => x.toLowerCase();

/** The games that came back from a batch of `getGame` reads, with their ids. */
function readGames(ids: bigint[], data: readonly { status: string; result?: unknown }[] | undefined): Game[] {
  return ids.flatMap((id, i) => {
    const r = data?.[i];
    return r?.status === "success" ? [{ id, ...toGameInfo(r.result as Parameters<typeof toGameInfo>[0]) }] : [];
  });
}

/** A tournament's pairings and standings, worked out from the games played since it started. */
function tableOf(t: Tournament, all: Game[]): { fixtures: Fixture[]; standings: TournamentRow[] } {
  const inIt = new Set(t.players.map(key));
  const games = all.filter((g) => g.id >= t.firstGameId && g.stake === t.stake);
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
}

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
    return tableOf(t, readGames(ids, data));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t, data, ids.length]);
}

export interface ListedTournament {
  t: Tournament;
  /** open: taking entries. running: started, games still to play or a pot still to pay. finished: over. */
  state: "open" | "running" | "finished";
  cancelled: boolean;
  entryFee: bigint;
  /** Everything paid in: the entry fee times the players (0 without a pot). */
  pot: bigint;
  deadline: bigint;
  /** Games finished, of the games the league needs. */
  done: number;
  total: number;
  /** The pot can be paid now: every game is played, or the deadline has passed. */
  payable: boolean;
  /** Who came first once it is over (more than one when they tied), and what first place paid each. */
  winners: `0x${string}`[];
  firstPrize: bigint;
}

const LIST_SCAN = 400; // the most recent games looked at to score the tournaments in a list

/**
 * The newest tournaments with where each one stands. A pot tournament is over when its pot is paid;
 * a free one, which the contract never closes, is over when every pairing has a finished game.
 */
export function useTournamentList(limit = 30): { list: ListedTournament[]; loading: boolean } {
  const { tournaments, loading } = useTournaments(limit);
  const { data: prizes, isLoading: loadingPrizes } = useReadContracts({
    contracts: tournaments.map((t) => ({ ...tournamentsContract, functionName: "getPrize" as const, args: [t.id] as const })),
    query: { enabled: tournaments.length > 0, refetchInterval: POLL_MS * 3 },
  });
  // Games are only needed for tournaments that have started and whose pot (if any) is not yet paid.
  const settled = (i: number) => {
    const p = prizes?.[i]?.result;
    return !!p && (p[4] || p[5]);
  };
  const live = tournaments.filter((t, i) => t.started && !settled(i));
  const { data: gameCount } = useReadContract({ ...chessContract, functionName: "gameCount", query: { enabled: live.length > 0, refetchInterval: POLL_MS * 3 } });
  const ids: bigint[] = [];
  if (live.length > 0 && gameCount !== undefined) {
    let from = live.reduce((min, t) => (t.firstGameId < min ? t.firstGameId : min), gameCount);
    if (gameCount - from > BigInt(LIST_SCAN)) from = gameCount - BigInt(LIST_SCAN);
    for (let id = from; id < gameCount; id++) ids.push(id);
  }
  const { data: games, isLoading: loadingGames } = useReadContracts({
    contracts: ids.map((id) => ({ ...chessContract, functionName: "getGame" as const, args: [id] as const })),
    query: { enabled: ids.length > 0, refetchInterval: POLL_MS * 3 },
  });

  const list = useMemo(() => {
    const all = readGames(ids, games);
    const now = BigInt(Math.floor(Date.now() / 1000));
    return tournaments.map((t, i): ListedTournament => {
      const p = prizes?.[i]?.result;
      const [entryFee, , deadline, , paid, cancelled] = p ?? [0n, 0, 0n, 0n, false, false];
      const total = (t.players.length * (t.players.length - 1)) / 2;
      const base = { t, cancelled, entryFee, pot: entryFee * BigInt(t.players.length), deadline, total, done: 0, payable: false, winners: [], firstPrize: 0n };
      if (cancelled) return { ...base, state: "finished" };
      if (!t.started) return { ...base, state: "open" };
      if (paid && p) {
        const firstPrize = p[8].reduce((max, x) => (x > max ? x : max), 0n);
        return { ...base, state: "finished", done: p[6], firstPrize, winners: firstPrize > 0n ? t.players.filter((_, j) => p[8][j] === firstPrize) : [] };
      }
      const { fixtures, standings } = tableOf(t, all);
      const done = fixtures.filter((f) => f.game?.status === Status.Finished).length;
      const allPlayed = total > 0 && done === total;
      if (entryFee > 0n) return { ...base, state: "running", done, payable: allPlayed || (deadline > 0n && now >= deadline) };
      const top = standings[0]?.points ?? 0;
      return allPlayed
        ? { ...base, state: "finished", done, winners: standings.filter((s) => s.points === top).map((s) => s.address) }
        : { ...base, state: "running", done };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournaments, prizes, games, ids.length]);

  return { list, loading: loading || (tournaments.length > 0 && loadingPrizes) || (ids.length > 0 && loadingGames) };
}
