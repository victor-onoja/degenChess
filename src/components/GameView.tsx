import { useEffect, useMemo, useState } from "react";
import { useAccount, useReadContract } from "wagmi";
import { Chessboard } from "react-chessboard";
import { Chess, Square } from "chess.js";
import { zeroAddress } from "viem";
import { TOKEN_SYMBOL } from "../config";
import { chessContract, POLL_MS, Result, Status, tokenContract, useGame, useTokenState } from "../lib/contract";
import { encodeMove, replay } from "../lib/moves";
import { formatDuration, formatToken, sameAddress, shortAddress, ZERO_ADDRESS } from "../lib/format";
import { useTx } from "../lib/useTx";

const WEIGHT: Record<string, bigint> = { p: 1n, n: 3n, b: 3n, r: 5n, q: 9n };
const PIECE_SYMBOL: Record<string, string> = { p: "♟", n: "♞", b: "♝", r: "♜", q: "♛" };

function useNow() {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

export function GameView({ gameId }: { gameId: bigint }) {
  const { address } = useAccount();
  const { game: info, isLoading } = useGame(gameId);
  const { allowance } = useTokenState();
  const { send, pending } = useTx();
  const now = useNow();

  const { data: moves } = useReadContract({
    ...chessContract,
    functionName: "getMoves",
    args: [gameId],
    query: { refetchInterval: POLL_MS },
  });
  const { data: withdrawn } = useReadContract({ ...chessContract, functionName: "getWithdrawn", args: [gameId] });
  const { data: moveTimeout } = useReadContract({ ...chessContract, functionName: "moveTimeout" });

  const { game, history, illegalAt } = useMemo(() => replay(moves ?? []), [moves]);
  const [optimisticFen, setOptimisticFen] = useState<string | null>(null);
  useEffect(() => setOptimisticFen(null), [moves?.length]);

  if (isLoading) return <div className="retro-panel">Loading game #{gameId.toString()}...</div>;
  if (!info || info.status === Status.None) {
    return <div className="retro-panel">Game #{gameId.toString()} does not exist.</div>;
  }

  const myColor = sameAddress(address, info.white) ? "w" : sameAddress(address, info.black) ? "b" : null;
  const opponent = myColor === "w" ? info.black : info.white;
  const active = info.status === Status.Active;
  const turn = game.turn();
  const myTurn = active && myColor === turn;
  const deadline = Number(info.lastMoveAt) + Number(moveTimeout ?? 0n);
  const timeLeft = deadline - now;
  const pieceValue = (t: string) => (info.stake * WEIGHT[t]) / 39n;

  async function submitMove(from: Square, to: Square, promotion?: string) {
    const next = new Chess(game.fen());
    let move;
    try {
      move = next.move({ from, to, promotion });
    } catch {
      return false; // illegal: snap the piece back
    }
    setOptimisticFen(next.fen());
    const ok = await send(`Move ${move.san}`, {
      ...chessContract,
      functionName: "makeMove",
      args: [gameId, encodeMove(move)],
    });
    if (!ok) setOptimisticFen(null);
    return true;
  }

  const lastMove = history[history.length - 1];
  const squareStyles = lastMove
    ? {
        [lastMove.from]: { background: "rgba(0, 255, 65, 0.25)" },
        [lastMove.to]: { background: "rgba(0, 255, 65, 0.4)" },
      }
    : {};

  const captures = { w: [] as string[], b: [] as string[] };
  for (const m of history) if (m.captured) captures[m.color].push(m.captured);

  const drawOfferedByOpponent =
    active && info.drawOfferedBy !== ZERO_ADDRESS && !sameAddress(info.drawOfferedBy, address) && myColor !== null;
  const iOfferedDraw = active && sameAddress(info.drawOfferedBy, address);
  const myBalance = myColor === "w" ? info.whiteBalance : myColor === "b" ? info.blackBalance : 0n;
  const alreadyWithdrawn = myColor === "w" ? withdrawn?.[0] : myColor === "b" ? withdrawn?.[1] : true;

  let boardNotice: string | null = null;
  if (illegalAt !== null) {
    boardNotice = `Move ${illegalAt + 1} on-chain is not a legal chess move (modified client?). Ask the contract owner to arbitrate.`;
  } else if (active && game.isCheckmate()) {
    boardNotice =
      myColor === turn
        ? "Checkmate - you lost. Resign to settle the game."
        : myColor
          ? "Checkmate! Your opponent should resign; otherwise claim the win when their move timer runs out."
          : "Checkmate.";
  } else if (active && game.isDraw()) {
    boardNotice = "The position is drawn by the rules of chess. Offer / accept a draw to settle.";
  }

  const resultText =
    info.result === Result.Draw ? "Draw" : info.result === Result.WhiteWins ? "White wins" : "Black wins";

  const player = (label: string, addr: string, balance: bigint, color: "w" | "b") => (
    <div className={`flex justify-between ${active && turn === color ? "text-retroGreenLight" : ""}`}>
      <span>
        {active && turn === color ? "▶ " : ""}
        {label}: {addr === ZERO_ADDRESS ? "waiting..." : shortAddress(addr)}
        {myColor === color ? " (you)" : ""}
      </span>
      <span>
        {formatToken(balance)} {TOKEN_SYMBOL}
      </span>
    </div>
  );

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      <div className="w-full lg:w-1/2">
        <Chessboard
          id={`game-${gameId}`}
          position={optimisticFen ?? game.fen()}
          boardOrientation={myColor === "b" ? "black" : "white"}
          arePiecesDraggable={myTurn && pending === null && illegalAt === null && !game.isGameOver()}
          isDraggablePiece={({ piece }) => piece[0] === myColor}
          onPieceDrop={(from, to) => {
            void submitMove(from, to);
            return true;
          }}
          onPromotionPieceSelect={(piece, from, to) => {
            if (!piece || !from || !to) return false;
            void submitMove(from, to, piece[1].toLowerCase());
            return true;
          }}
          customSquareStyles={squareStyles}
          customDarkSquareStyle={{ backgroundColor: "#1f6b3a" }}
          customLightSquareStyle={{ backgroundColor: "#b8d8b0" }}
        />
        {boardNotice && <p className="retro-panel mt-4 text-yellow-300">{boardNotice}</p>}
      </div>

      <div className="w-full lg:w-1/2 flex flex-col gap-4">
        <section className="retro-panel">
          <h2 className="panel-title">
            Game #{gameId.toString()} &middot; {Status[info.status]}
            {info.status === Status.Finished && ` - ${resultText}`}
          </h2>
          <p className="mb-2">
            Stake: {formatToken(info.stake)} {TOKEN_SYMBOL} each
          </p>
          {player("White", info.white, info.whiteBalance, "w")}
          {player("Black", info.black, info.blackBalance, "b")}
          {active && (
            <p className="mt-2">
              {turn === "w" ? "White" : "Black"} to move &middot; ply {history.length + 1} &middot;{" "}
              {timeLeft > 0 ? `${formatDuration(timeLeft)} left` : "move timer expired"}
            </p>
          )}
          {info.status === Status.Finished && (
            <p className="mt-2 opacity-80">Balances above are final payouts after the 2.5% fee.</p>
          )}
        </section>

        <section className="retro-panel">
          <h2 className="panel-title">Captures</h2>
          {(["w", "b"] as const).map((c) => (
            <p key={c}>
              {c === "w" ? "White" : "Black"}: {captures[c].map((p) => PIECE_SYMBOL[p]).join(" ") || "-"}{" "}
              <span className="opacity-80">
                (+{formatToken(captures[c].reduce((sum, p) => sum + pieceValue(p), 0n))} {TOKEN_SYMBOL})
              </span>
            </p>
          ))}
        </section>

        <section className="retro-panel flex flex-col gap-2">
          <h2 className="panel-title">Actions</h2>

          {info.status === Status.Open && myColor === "w" && (
            <>
              <p>Waiting for an opponent. Share game ID #{gameId.toString()} or this page&apos;s URL.</p>
              <button
                className="retro-button"
                disabled={pending !== null}
                onClick={() => send("Cancel game", { ...chessContract, functionName: "cancelGame", args: [gameId] })}
              >
                {pending ?? "Cancel & Refund"}
              </button>
            </>
          )}

          {info.status === Status.Open && myColor === null && (
            <button
              className="retro-button"
              disabled={!address || pending !== null}
              onClick={() =>
                (allowance ?? 0n) < info.stake
                  ? send(`Approve ${TOKEN_SYMBOL}`, {
                      ...tokenContract,
                      functionName: "approve",
                      args: [chessContract.address, info.stake],
                    })
                  : send("Join game", { ...chessContract, functionName: "joinGame", args: [gameId, zeroAddress] })
              }
            >
              {pending ??
                ((allowance ?? 0n) < info.stake
                  ? `Approve ${formatToken(info.stake)} ${TOKEN_SYMBOL}`
                  : `Join as Black (${formatToken(info.stake)} ${TOKEN_SYMBOL})`)}
            </button>
          )}

          {active && myColor && (
            <>
              {drawOfferedByOpponent && (
                <button
                  className="retro-button"
                  disabled={pending !== null}
                  onClick={() => send("Accept draw", { ...chessContract, functionName: "acceptDraw", args: [gameId] })}
                >
                  Accept draw offer
                </button>
              )}
              {!myTurn && timeLeft <= 0 && (
                <button
                  className="retro-button"
                  disabled={pending !== null}
                  onClick={() =>
                    send("Claim timeout win", { ...chessContract, functionName: "claimTimeout", args: [gameId] })
                  }
                >
                  Claim win on timeout
                </button>
              )}
              <div className="flex gap-2">
                <button
                  className="retro-button flex-1"
                  disabled={pending !== null || iOfferedDraw}
                  onClick={() => send("Offer draw", { ...chessContract, functionName: "offerDraw", args: [gameId] })}
                >
                  {iOfferedDraw ? "Draw offered" : "Offer draw"}
                </button>
                <button
                  className="retro-button flex-1 danger"
                  disabled={pending !== null}
                  onClick={() => {
                    if (window.confirm("Resign this game?")) {
                      void send("Resign", { ...chessContract, functionName: "resign", args: [gameId] });
                    }
                  }}
                >
                  Resign
                </button>
              </div>
              {pending && <p className="opacity-80">{pending}...</p>}
              {!myTurn && !pending && <p className="opacity-80">Waiting for {shortAddress(opponent)} to move...</p>}
            </>
          )}

          {info.status === Status.Finished && myColor && (
            <button
              className="retro-button"
              disabled={pending !== null || alreadyWithdrawn || myBalance === 0n}
              onClick={() => send("Withdraw", { ...chessContract, functionName: "withdraw", args: [gameId] })}
            >
              {alreadyWithdrawn
                ? "Withdrawn"
                : myBalance === 0n
                  ? "Nothing to withdraw"
                  : `Withdraw ${formatToken(myBalance)} ${TOKEN_SYMBOL}`}
            </button>
          )}

          {info.status === Status.Cancelled && <p>This game was cancelled and refunded.</p>}
          {myColor === null && info.status !== Status.Open && <p className="opacity-80">You are spectating.</p>}
        </section>
      </div>
    </div>
  );
}
