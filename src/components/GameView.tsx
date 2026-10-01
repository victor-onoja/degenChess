import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useBalance, useReadContract } from "wagmi";
import { parseEther } from "viem";
import { Chessboard } from "react-chessboard";
import { Chess, type Move, type PieceSymbol, type Square } from "chess.js";
import { TOKEN_SYMBOL } from "../config";
import { useDegenAccount } from "../lib/account";
import { chessContract, POLL_MS, Result, Status, useGame } from "../lib/contract";
import { encodeMove, replay } from "../lib/moves";
import { formatDuration, formatToken, sameAddress, shortAddress, ZERO_ADDRESS } from "../lib/format";
import { isMuted, setMuted, sfx } from "../lib/sound";
import { AccountBar } from "./AccountBar";
import { withApproval } from "./Lobby";

const WEIGHT: Record<string, bigint> = { p: 1n, n: 3n, b: 3n, r: 5n, q: 9n };
const Arena3D = dynamic(() => import("./arena/Arena3D"), { ssr: false });
const VIEW_PREF = "degenchess.view";

// Roughly the height of the scoreboard and the action dock, which float over the arena.
const HUD_INSETS = { top: 170, bottom: 150 };
const LOW_MOVE_GAS = parseEther("0.03"); // about three moves left
const PIECE_SYMBOL: Record<string, string> = { p: "♟", n: "♞", b: "♝", r: "♜", q: "♛" };

function useNow() {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

export function GameView({ gameId, onExit }: { gameId: bigint; onExit: () => void }) {
  const account = useDegenAccount();
  const { unlocked, gameKey, busy: pending, sendGame, sendMoney, gameKeyTopUp } = account;
  const address = account.address ?? undefined;
  const { game: info, isLoading } = useGame(gameId);
  const now = useNow();

  const { data: moves } = useReadContract({
    ...chessContract,
    functionName: "getMoves",
    args: [gameId],
    query: { refetchInterval: POLL_MS },
  });
  const { data: withdrawn } = useReadContract({ ...chessContract, functionName: "getWithdrawn", args: [gameId] });
  const { data: moveTimeout } = useReadContract({ ...chessContract, functionName: "moveTimeout" });
  const { data: gameKeys } = useReadContract({ ...chessContract, functionName: "getGameKeys", args: [gameId] });

  const { data: keyGas } = useBalance({
    address: gameKey ?? undefined,
    chainId: chessContract.chainId,
    query: { enabled: !!gameKey, refetchInterval: POLL_MS * 3 },
  });
  const lowMoveGas = keyGas !== undefined && keyGas.value < LOW_MOVE_GAS;

  const { game, history, illegalAt } = useMemo(() => replay(moves ?? []), [moves]);
  // A move shown on the board while its transaction confirms; `ply` pins it to the position it was made in.
  const [optimistic, setOptimistic] = useState<{ ply: number; fen: string; move: Move } | null>(null);
  const pendingMove = optimistic && optimistic.ply === history.length ? optimistic : null;
  const arenaHistory = useMemo(() => (pendingMove ? [...history, pendingMove.move] : history), [history, pendingMove]);

  const [view, setView] = useState<"3d" | "2d">("3d");
  useEffect(() => {
    try {
      const saved = localStorage.getItem(VIEW_PREF);
      if (saved === "2d" || saved === "3d") setView(saved);
    } catch {}
  }, []);
  const chooseView = (next: "3d" | "2d") => {
    setView(next);
    try {
      localStorage.setItem(VIEW_PREF, next);
    } catch {}
  };
  const legalTargets = useCallback(
    (from: Square) => game.moves({ square: from, verbose: true }).map((m) => ({ to: m.to, promotion: !!m.promotion })),
    [game]
  );

  const [muted, setMutedState] = useState(false);
  const [canFullscreen, setCanFullscreen] = useState(false);
  useEffect(() => {
    setMutedState(isMuted());
    setCanFullscreen(typeof document.documentElement.requestFullscreen === "function");
  }, []);
  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen().catch(() => {});
  };

  // Fanfare when the game settles while you're watching (not when opening an already-finished game).
  const lastStatus = useRef<Status | null>(null);
  useEffect(() => {
    if (!info) return;
    if (lastStatus.current === Status.Active && info.status === Status.Finished) {
      const mine = sameAddress(address, info.white) ? Result.WhiteWins : sameAddress(address, info.black) ? Result.BlackWins : null;
      if (info.result === Result.Draw || mine === null || info.result === mine) sfx.win();
      else sfx.lose();
    }
    lastStatus.current = info.status;
  }, [info, address]);

  const shell = (content: ReactNode) => (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-[#060908] p-4">
      <div className="glass flex flex-col items-center gap-4 p-6">
        {content}
        <button className="btn-ghost" onClick={onExit}>
          &larr; Lobby
        </button>
      </div>
    </div>
  );
  if (isLoading) return shell(<p>Loading game #{gameId.toString()}...</p>);
  if (!info || info.status === Status.None) return shell(<p>Game #{gameId.toString()} does not exist.</p>);

  const myColor = sameAddress(address, info.white) ? "w" : sameAddress(address, info.black) ? "b" : null;
  const opponent = myColor === "w" ? info.black : info.white;
  const active = info.status === Status.Active;
  const turn = game.turn();
  const myTurn = active && myColor === turn;
  // Moves are signed by the in-memory game key, which must be the one registered for this game.
  const registeredKey = myColor === "w" ? gameKeys?.[0] : myColor === "b" ? gameKeys?.[1] : undefined;
  const keyReady = unlocked && sameAddress(registeredKey, gameKey ?? undefined);
  const deadline = Number(info.lastMoveAt) + Number(moveTimeout ?? 0n);
  const timeLeft = deadline - now;
  const pieceValue = (t: string) => (info.stake * (WEIGHT[t] ?? 0n)) / 39n;
  const canMove = myTurn && keyReady && pending === null && illegalAt === null && !game.isGameOver();

  async function submitMove(from: Square, to: Square, promotion?: string) {
    const next = new Chess(game.fen());
    let move;
    try {
      move = next.move({ from, to, promotion });
    } catch {
      return false; // illegal: snap the piece back
    }
    setOptimistic({ ply: history.length, fen: next.fen(), move });
    const ok = await sendGame(`Move ${move.san}`, {
      ...chessContract,
      functionName: "makeMove",
      args: [gameId, encodeMove(move)],
    });
    if (!ok) setOptimistic(null);
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
    info.result === Result.Draw ? "Draw" : info.result === Result.WhiteWins ? "Bulls win" : "Bears win";

  const total = info.whiteBalance + info.blackBalance;
  const bullShare = total > 0n ? Number((info.whiteBalance * 1000n) / total) / 10 : 50;
  const statusLine =
    info.status === Status.Finished
      ? `Finished - ${resultText}`
      : active
        ? `${turn === "w" ? "Bulls" : "Bears"} to move`
        : Status[info.status];

  const plate = (color: "w" | "b") => {
    const bull = color === "w";
    const addr = bull ? info.white : info.black;
    const balance = bull ? info.whiteBalance : info.blackBalance;
    const onMove = active && turn === color;
    return (
      <div
        className={`flex min-w-0 flex-1 items-center gap-2 rounded-xl px-2 py-1 ${bull ? "" : "flex-row-reverse text-right"} ${
          onMove ? (bull ? "turn-glow-bull" : "turn-glow-bear") : ""
        }`}
      >
        <span className="text-2xl">{bull ? "🐂" : "🐻"}</span>
        <div className="min-w-0">
          <div className="truncate text-xs opacity-75">
            {bull ? "Bulls" : "Bears"} &middot; {addr === ZERO_ADDRESS ? "waiting..." : shortAddress(addr)}
            {myColor === color ? " (you)" : ""}
          </div>
          <div className={`text-lg font-bold leading-tight ${bull ? "text-[#3dff8b]" : "text-[#ff6b84]"}`}>
            {formatToken(balance)} <span className="text-xs font-medium opacity-70">{TOKEN_SYMBOL}</span>
          </div>
        </div>
      </div>
    );
  };

  const moneyCall = (label: string, functionName: string) =>
    sendMoney(label, () => [{ ...chessContract, functionName, args: [gameId] }]);
  const topUpCall = (label: string) =>
    sendMoney(label, async (id) => [
      { ...chessContract, functionName: "setGameKey", args: [gameId, id.gameKey], value: await gameKeyTopUp(id.gameKey) },
    ]);
  const hasAccount = !!address || account.returning;

  return (
    <div className="fixed inset-0 z-10 overflow-hidden bg-[#060908]">
      {view === "3d" ? (
        <Arena3D
          immersive
          insets={HUD_INSETS}
          history={arenaHistory}
          orientation={myColor ?? "w"}
          movable={canMove && !pendingMove ? myColor : null}
          legalTargets={legalTargets}
          onMove={(from, to, promotion) => void submitMove(from, to, promotion)}
          captureLabel={(kind: PieceSymbol) => `+${formatToken(pieceValue(kind))} ${TOKEN_SYMBOL}`}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center px-3 pb-48 pt-36">
          <div className="w-full" style={{ maxWidth: "min(100%, calc(100dvh - 22rem))" }}>
            <Chessboard
              id={`game-${gameId}`}
              position={pendingMove?.fen ?? game.fen()}
              boardOrientation={myColor === "b" ? "black" : "white"}
              arePiecesDraggable={canMove}
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
          </div>
        </div>
      )}

      {/* Top HUD: navigation, view controls and the scoreboard. Only the controls catch clicks. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col gap-2 p-3">
        <div className="flex items-center justify-between gap-2">
          <button className="btn-ghost pointer-events-auto" onClick={onExit}>
            &larr; Lobby
          </button>
          <div className="pointer-events-auto flex gap-2">
            <button className="btn-ghost" onClick={() => chooseView(view === "3d" ? "2d" : "3d")} title="Switch board view">
              {view === "3d" ? "2D" : "3D"}
            </button>
            <button
              className="btn-ghost"
              aria-label={muted ? "Unmute" : "Mute"}
              onClick={() => {
                setMuted(!muted);
                setMutedState(!muted);
              }}
            >
              {muted ? "🔇" : "🔊"}
            </button>
            {canFullscreen && (
              <button className="btn-ghost" aria-label="Fullscreen" onClick={toggleFullscreen}>
                ⛶
              </button>
            )}
            {unlocked && (
              <button className="btn-ghost" aria-label="Lock" title="Wipe the game key from this tab" onClick={account.lock}>
                🔒
              </button>
            )}
          </div>
        </div>

        <section className="glass pointer-events-auto mx-auto w-full max-w-2xl px-3 py-2">
          <div className="flex items-center gap-2">
            {plate("w")}
            <div className="shrink-0 px-1 text-center text-[11px] leading-tight opacity-75">
              <div>Game #{gameId.toString()}</div>
              <div>{formatToken(info.stake)} each</div>
            </div>
            {plate("b")}
          </div>
          <div className="stake-bar mt-2">
            <div style={{ width: `${bullShare}%` }} />
          </div>
          <p className="mt-1 text-center text-xs">
            <span className="font-bold">{statusLine}</span>
            {active && (
              <span className="opacity-70">
                {" "}
                &middot; ply {history.length + 1} &middot;{" "}
                {timeLeft > 0 ? `${formatDuration(timeLeft)} left` : "move timer expired"}
              </span>
            )}
          </p>
        </section>
      </div>

      {/* Bottom dock: what you can do right now. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 p-3">
        <div className="glass pointer-events-auto mx-auto flex w-full max-w-2xl flex-col gap-2 p-3">
          {boardNotice && <p className="text-sm text-yellow-300">{boardNotice}</p>}

          <div className="flex justify-between gap-3 text-xs opacity-85">
            {(["w", "b"] as const).map((c) => (
              <span key={c} className={c === "b" ? "text-right" : ""}>
                {c === "w" ? "Bulls" : "Bears"} took {captures[c].map((p) => PIECE_SYMBOL[p]).join(" ") || "nothing yet"}{" "}
                <span className="text-[#ffd23f]">
                  +{formatToken(captures[c].reduce((sum, p) => sum + pieceValue(p), 0n))} {TOKEN_SYMBOL}
                </span>
              </span>
            ))}
          </div>

          {info.status === Status.Open && myColor === "w" && (
            <>
              <p className="text-sm">Waiting for an opponent. Share game ID #{gameId.toString()} or this page&apos;s URL.</p>
              <button className="btn-ghost" disabled={pending !== null} onClick={() => moneyCall("Cancel game", "cancelGame")}>
                {pending ?? "Cancel & Refund"}
              </button>
            </>
          )}

          {info.status === Status.Open && myColor === null && (
            <button
              className="btn"
              disabled={!hasAccount || pending !== null}
              onClick={() =>
                sendMoney(`Stake ${formatToken(info.stake)} ${TOKEN_SYMBOL} & join`, async (id) =>
                  withApproval(id.address, info.stake, {
                    ...chessContract,
                    functionName: "joinGame",
                    args: [gameId, id.gameKey],
                    value: await gameKeyTopUp(id.gameKey),
                  })
                )
              }
            >
              {pending ?? (hasAccount ? `Join as Bears (${formatToken(info.stake)} ${TOKEN_SYMBOL})` : "Sign in below to join")}
            </button>
          )}

          {active && myColor && !unlocked && (
            <button className="btn" disabled={pending !== null} onClick={() => void account.unlock()}>
              Unlock with passkey to keep playing
            </button>
          )}
          {active && myColor && unlocked && !keyReady && gameKey && (
            <button className="btn" disabled={pending !== null} onClick={() => topUpCall("Enable prompt-free moves")}>
              Enable prompt-free moves on this device
            </button>
          )}

          {active && myColor && keyReady && (
            <>
              {lowMoveGas && (
                <button className="btn" disabled={pending !== null} onClick={() => topUpCall("Top up move gas")}>
                  Move gas is running low - top up
                </button>
              )}
              {drawOfferedByOpponent && (
                <button
                  className="btn"
                  disabled={pending !== null}
                  onClick={() => sendGame("Accept draw", { ...chessContract, functionName: "acceptDraw", args: [gameId] })}
                >
                  Accept draw offer
                </button>
              )}
              {!myTurn && timeLeft <= 0 && (
                <button
                  className="btn"
                  disabled={pending !== null}
                  onClick={() => sendGame("Claim timeout win", { ...chessContract, functionName: "claimTimeout", args: [gameId] })}
                >
                  Claim win on timeout
                </button>
              )}
              <div className="flex items-center gap-2">
                <p className="min-w-0 flex-1 truncate text-sm opacity-80">
                  {pending
                    ? `${pending}...`
                    : myTurn
                      ? "Your move - tap a piece."
                      : `Waiting for ${shortAddress(opponent)} to move...`}
                </p>
                <button
                  className="btn-ghost"
                  disabled={pending !== null || iOfferedDraw}
                  onClick={() => sendGame("Offer draw", { ...chessContract, functionName: "offerDraw", args: [gameId] })}
                >
                  {iOfferedDraw ? "Draw offered" : "Offer draw"}
                </button>
                {/* Resigning settles money, so it is confirmed with the passkey rather than the game key. */}
                <button className="btn danger !px-4 !py-2" disabled={pending !== null} onClick={() => moneyCall("Resign", "resign")}>
                  Resign
                </button>
              </div>
            </>
          )}

          {info.status === Status.Finished && (
            <>
              <p className="text-center text-lg font-bold">
                {info.result === Result.Draw ? "🤝 Draw" : `🏆 ${resultText}`}
                <span className="block text-xs font-normal opacity-70">Balances above are final payouts after the 2.5% fee.</span>
              </p>
              {myColor && (
                <button
                  className="btn"
                  disabled={pending !== null || alreadyWithdrawn || myBalance === 0n}
                  onClick={() => moneyCall("Withdraw", "withdraw")}
                >
                  {alreadyWithdrawn
                    ? "Withdrawn"
                    : myBalance === 0n
                      ? "Nothing to withdraw"
                      : `Withdraw ${formatToken(myBalance)} ${TOKEN_SYMBOL}`}
                </button>
              )}
            </>
          )}

          {/* Opened from a shared link or on a fresh device: sign in right here. */}
          {!address && (
            <div className="flex justify-center">
              <AccountBar />
            </div>
          )}

          {info.status === Status.Cancelled && <p className="text-sm">This game was cancelled and refunded.</p>}
          {myColor === null && info.status !== Status.Open && <p className="text-sm opacity-80">You are spectating.</p>}
        </div>
      </div>
    </div>
  );
}
