import { useMemo } from "react";
import { useReadContract, useReadContracts } from "wagmi";
import type { Cell } from "../components/MiniBoard";
import { describeClock } from "./clock";
import { chessContract, type GameInfo, POLL_MS, Status, toGameInfo } from "./contract";
import { replay } from "./moves";

export interface ListedGame extends GameInfo {
  id: bigint;
  /** "5 + 3", or "No clock". */
  clock: string;
  /** The side the creator chose: 0 white, 1 black, 2 random. */
  creatorSide: number;
}

const RECENT_GAMES = 30;
const LIVE_BOARDS = 8;

/** The most recent games on the contract, newest first, refreshed every few seconds. */
export function useRecentGames(): { games: ListedGame[]; total: bigint | undefined } {
  const { data: gameCount } = useReadContract({
    ...chessContract,
    functionName: "gameCount",
    query: { refetchInterval: POLL_MS },
  });
  const ids: bigint[] = [];
  for (let i = gameCount ?? 0n; i > 0n && ids.length < RECENT_GAMES; i--) ids.push(i - 1n);

  const { data } = useReadContracts({
    contracts: ids.flatMap((id) => [
      { ...chessContract, functionName: "getGame" as const, args: [id] as const },
      { ...chessContract, functionName: "getClock" as const, args: [id] as const },
      { ...chessContract, functionName: "getCreatorSide" as const, args: [id] as const },
    ]),
    query: { enabled: ids.length > 0, refetchInterval: POLL_MS },
  });

  const games: ListedGame[] = [];
  ids.forEach((id, i) => {
    const game = data?.[i * 3];
    const clock = data?.[i * 3 + 1];
    const side = data?.[i * 3 + 2];
    if (game?.status !== "success") return;
    const [base, increment] = clock?.status === "success" ? (clock.result as readonly number[]) : [0, 0];
    const creatorSide = side?.status === "success" ? Number(side.result) : 0;
    games.push({ id, clock: describeClock(base, increment), creatorSide, ...toGameInfo(game.result as Parameters<typeof toGameInfo>[0]) });
  });
  return { games, total: gameCount };
}

/** The real position of each game still being played or just finished, for the boards in the yard. */
export function usePositions(games: ListedGame[]): Map<string, Cell[][]> {
  const shown = games.filter((g) => g.status === Status.Active || g.status === Status.Finished).slice(0, LIVE_BOARDS);
  const { data } = useReadContracts({
    contracts: shown.map((g) => ({ ...chessContract, functionName: "getMoves" as const, args: [g.id] as const })),
    query: { enabled: shown.length > 0, refetchInterval: POLL_MS },
  });
  const key = shown.map((g) => g.id.toString()).join(",");
  return useMemo(() => {
    const positions = new Map<string, Cell[][]>();
    shown.forEach((g, i) => {
      const moves = data?.[i];
      if (moves?.status !== "success") return;
      const board = replay(moves.result as readonly number[]).game.board();
      positions.set(g.id.toString(), board.map((row) => row.map((sq) => (sq ? { type: sq.type, color: sq.color } : null))));
    });
    return positions;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, data]);
}
