import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useBalance, useReadContract, useReadContracts } from "wagmi";
import { parseEther } from "viem";
import { Chessboard } from "react-chessboard";
import { Chess, type Move, type PieceSymbol, type Square } from "chess.js";
import { TOKEN_SYMBOL } from "../config";
import { useDegenAccount } from "../lib/account";
import { chessContract, POLL_MS, Result, Status, toGameInfo, useGame } from "../lib/contract";
import { encodeMove, replay } from "../lib/moves";
import { formatClock } from "../lib/clock";
import { formatDuration, formatToken, sameAddress, ZERO_ADDRESS } from "../lib/format";
import { useNames } from "../lib/names";
import { isMuted, setMuted, sfx } from "../lib/sound";
import { useElementSize } from "../lib/useElementSize";
import { AccountBar } from "./AccountBar";
import { parseEventLogs } from "viem";
import { degenChessAbi } from "../contracts/abi";
import { withApproval } from "../lib/stake";
import { Icon } from "./Icon";
import { PieceIcon } from "./PieceIcon";
import { usePieceSet } from "../lib/pieceSet";
import { say, useVoices } from "../lib/voices";
import { nextTrack, useMusic } from "../lib/music";
import { useWatchers } from "../lib/watchers";
import { ShareButton } from "./ShareButton";
import { MoveList } from "./MoveList";
import { BOARD_PIECES } from "./boardPieces";

const WEIGHT: Record<string, bigint> = { p: 1n, n: 3n, b: 3n, r: 5n, q: 9n };
const Arena3D = dynamic(() => import("./arena/Arena3D"), { ssr: false });
const VIEW_PREF = "degenchess.view"; // the view you play in
const WATCH_PREF = "degenchess.watchView"; // the view you watch other people's games in
type ViewMode = "3d" | "2d" | "split";

const LOW_MOVE_GAS = parseEther("0.03"); // about three moves left

function useNow() {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

export function GameView({
  gameId,
  onExit,
  onOpenGame,
}: {
  gameId: bigint;
  onExit: () => void;
  onOpenGame: (id: bigint) => void;
}) {
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
  // The side the creator chose (0 white, 1 black, 2 random); it only matters until someone joins.
  const { data: creatorSide } = useReadContract({ ...chessContract, functionName: "getCreatorSide", args: [gameId] });
  const { data: gameKeys } = useReadContract({ ...chessContract, functionName: "getGameKeys", args: [gameId] });
  // When a referee (the Chainlink CRE workflow's contract) is registered, finished games settle themselves.
  const { data: arbiter } = useReadContract({ ...chessContract, functionName: "arbiter" });
  const { data: clock } = useReadContract({
    ...chessContract,
    functionName: "getClock",
    args: [gameId],
    query: { refetchInterval: POLL_MS },
  });
  const { label } = useNames([info?.white, info?.black]);

  // Rematch: look at the games created after this one for an open game from the opponent at the same stake.
  const { data: gameCount } = useReadContract({ ...chessContract, functionName: "gameCount", query: { refetchInterval: POLL_MS } });
  const laterIds: bigint[] = [];
  if (info?.status === Status.Finished) {
    for (let id = gameId + 1n; id < (gameCount ?? 0n) && laterIds.length < 20; id++) laterIds.push(id);
  }
  const { data: laterGames } = useReadContracts({
    contracts: laterIds.map((id) => ({ ...chessContract, functionName: "getGame" as const, args: [id] as const })),
    query: { enabled: laterIds.length > 0, refetchInterval: POLL_MS },
  });
  const hasReferee = !!arbiter && arbiter !== ZERO_ADDRESS;

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
  const liveHistory = useMemo(() => (pendingMove ? [...history, pendingMove.move] : history), [history, pendingMove]);

  const [pieceSet, setPieceSet] = usePieceSet();
  // Going back through the moves: `viewPly` is how many moves are shown, or null for the live position.
  const [viewPly, setViewPly] = useState<number | null>(null);
  const viewing = viewPly !== null && viewPly < history.length;
  const arenaHistory = useMemo(() => (viewing ? history.slice(0, viewPly) : liveHistory), [viewing, viewPly, history, liveHistory]);
  const viewedFen = useMemo(() => {
    if (!viewing) return null;
    const g = new Chess();
    for (const m of arenaHistory) g.move({ from: m.from, to: m.to, promotion: m.promotion });
    return g.fen();
  }, [viewing, arenaHistory]);
  const step = useCallback(
    (to: number) => {
      const ply = Math.max(0, Math.min(to, history.length));
      setViewPly(ply >= history.length ? null : ply);
    },
    [history.length]
  );
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      const at = viewPly ?? history.length;
      if (e.key === "ArrowLeft") step(at - 1);
      else if (e.key === "ArrowRight") step(at + 1);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [step, viewPly, history.length]);

  // The armies talk as moves land, and warn you once when your clock is nearly out.
  useVoices(liveHistory, pieceSet === "armies" && !viewing, info?.status === Status.Active);
  useMusic(true);
  // The audience: spectators are counted, the two players only see the number.
  const isPlayer = !!info && !!address && (sameAddress(address, info.white) || sameAddress(address, info.black));
  const watchers = useWatchers(gameId, !isPlayer, !!info && info.status === Status.Active);
  const lowTime = useRef<{ color: "w" | "b" | null; left: number; warned: boolean }>({ color: null, left: Infinity, warned: false });
  useEffect(() => {
    const t = lowTime.current;
    if (pieceSet === "armies" && t.color && t.left > 0 && t.left <= 10 && !t.warned) {
      t.warned = true;
      say(t.color, "lowTime", { force: true });
    }
  }, [now, pieceSet]);

  // 3D arena, flat 2D board, or both side by side. Defaults: playing on a phone is 2D (easier to
  // play precisely), playing on anything bigger is 3D, and watching is 3D. A saved choice wins, kept
  // separately for playing and for watching.
  const [views, setViews] = useState<{ play: ViewMode | null; watch: ViewMode | null; phone: boolean }>({ play: null, watch: null, phone: false });
  useEffect(() => {
    const read = (key: string) => {
      try {
        const v = localStorage.getItem(key);
        return v === "2d" || v === "3d" || v === "split" ? v : null;
      } catch {
        return null;
      }
    };
    setViews({ play: read(VIEW_PREF), watch: read(WATCH_PREF), phone: window.innerWidth < 768 });
  }, []);
  const chooseView = (next: ViewMode, watching: boolean) => {
    setViews((v) => (watching ? { ...v, watch: next } : { ...v, play: next }));
    try {
      localStorage.setItem(watching ? WATCH_PREF : VIEW_PREF, next);
    } catch {}
  };
  // The square picked on the flat board for tap-to-move, and a pending promotion choice.
  const [picked, setPicked] = useState<Square | null>(null);
  const [promotionTo, setPromotionTo] = useState<Square | null>(null);
  useEffect(() => {
    setPicked(null);
    setPromotionTo(null);
  }, [history.length]);
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
  // The HUD takes real space above and below the board; the arena frames itself in what's left.
  const [topEl, setTopEl] = useState<HTMLElement | null>(null);
  const [midEl, setMidEl] = useState<HTMLElement | null>(null);
  const [bottomEl, setBottomEl] = useState<HTMLElement | null>(null);
  const topSize = useElementSize(topEl);
  const midSize = useElementSize(midEl);
  const bottomSize = useElementSize(bottomEl);
  // Minimized HUD: a slim score strip and a one-line dock, for more board. Default on phones.
  const [compact, setCompact] = useState(false);
  useEffect(() => setCompact(window.innerWidth < 640), []);

  // Focus: nothing but the board. Uses the browser's fullscreen too where the device allows it.
  const [focus, setFocusState] = useState(false);
  const setFocus = (on: boolean) => {
    if (on) neededAtEntry.current = needsYou.current;
    setFocusState(on);
    if (on && canFullscreen && !document.fullscreenElement) void document.documentElement.requestFullscreen().catch(() => {});
    if (!on && document.fullscreenElement) void document.exitFullscreen().catch(() => {});
  };
  // Leave focus by itself when something needs the player (a draw offer, time up, the end of the game).
  // Only something that happens after entering focus counts, not the state it was entered in.
  const needsYou = useRef(false);
  const neededAtEntry = useRef(false);
  useEffect(() => {
    if (!focus) return;
    if (needsYou.current && !neededAtEntry.current) setFocus(false);
    if (!needsYou.current) neededAtEntry.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now, focus]);

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
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-[var(--field-deep)] p-4">
      <div className="slab flex flex-col items-center gap-4 p-6">
        {content}
        <button className="ghost" onClick={onExit}>
          <Icon name="back" /> Yard
        </button>
      </div>
    </div>
  );
  if (isLoading) return shell(<p>Loading game #{gameId.toString()}...</p>);
  if (!info || info.status === Status.None) return shell(<p>Game #{gameId.toString()} does not exist.</p>);

  const myColor = sameAddress(address, info.white) ? "w" : sameAddress(address, info.black) ? "b" : null;
  const opponent = myColor === "w" ? info.black : info.white;
  // While a game waits, the creator is stored as White; show them where they will actually sit.
  const waitingAsBlack = info.status === Status.Open && Number(creatorSide ?? 0) === 1;
  const seatColor = waitingAsBlack && myColor === "w" ? "b" : myColor;
  const active = info.status === Status.Active;
  // Out of time on the clock: the game is over in all but name until the win is claimed.
  const turn = game.turn();
  const myTurn = active && myColor === turn;
  // Moves are signed by the in-memory game key, which must be the one registered for this game.
  const registeredKey = myColor === "w" ? gameKeys?.[0] : myColor === "b" ? gameKeys?.[1] : undefined;
  const keyReady = unlocked && sameAddress(registeredKey, gameKey ?? undefined);
  // Clock: each stored time is as of that player's turn start, so the side on move is charged the time since then.
  const [clockBase, clockIncrement, whiteTime, blackTime] = clock ?? [0, 0, 0, 0];
  const clockOn = clockBase > 0;
  const sinceLastMove = active ? Math.max(now - Number(info.lastMoveAt), 0) : 0;
  const clockLeft = { w: whiteTime - (turn === "w" ? sinceLastMove : 0), b: blackTime - (turn === "b" ? sinceLastMove : 0) };
  // Seconds until the side to move loses on time.
  const timeLeft = clockOn ? clockLeft[turn] : Number(info.lastMoveAt) + Number(moveTimeout ?? 0n) - now;
  const flagFell = active && timeLeft <= 0;
  lowTime.current.color = clockOn && myTurn && myColor ? myColor : null;
  lowTime.current.left = clockOn && myColor ? clockLeft[myColor] : Infinity;
  if (lowTime.current.left > 20) lowTime.current.warned = false;
  const pieceValue = (t: string) => (info.stake * (WEIGHT[t] ?? 0n)) / 39n;
  const canMove = myTurn && keyReady && pending === null && illegalAt === null && !game.isGameOver() && !flagFell && !viewing;

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

  // Tap to move on the flat board: tap one of your pieces, then a highlighted square.
  const pickedTargets = picked && canMove ? legalTargets(picked) : [];

  function onSquareClick(square: Square) {
    if (!canMove) return;
    const target = picked ? pickedTargets.find((t) => t.to === square) : undefined;
    if (picked && target) {
      if (target.promotion) return setPromotionTo(square);
      setPicked(null);
      void submitMove(picked, square);
      return;
    }
    const piece = game.get(square);
    setPicked(piece && piece.color === myColor && square !== picked ? square : null);
  }

  const lastMove = arenaHistory[arenaHistory.length - 1];
  const squareStyles: Record<string, CSSProperties> = {};
  if (lastMove) {
    squareStyles[lastMove.from] = { boxShadow: "inset 0 0 0 3px rgba(241, 233, 214, 0.45)" };
    squareStyles[lastMove.to] = { boxShadow: "inset 0 0 0 3px rgba(241, 233, 214, 0.9)" };
  }
  if (picked) squareStyles[picked] = { boxShadow: "inset 0 0 0 4px #ffc233" };
  for (const t of pickedTargets) {
    squareStyles[t.to] = game.get(t.to)
      ? { background: "radial-gradient(circle, transparent 58%, rgba(255, 194, 51, 0.85) 60%)" }
      : { background: "radial-gradient(circle, rgba(255, 194, 51, 0.9) 18%, transparent 20%)" };
  }

  // Everything the flat board needs, shared by the 2D and split views.
  const boardProps = {
    id: `game-${gameId}`,
    position: viewedFen ?? pendingMove?.fen ?? game.fen(),
    boardOrientation: (seatColor === "b" ? "black" : "white") as "white" | "black",
    arePiecesDraggable: canMove,
    isDraggablePiece: ({ piece }: { piece: string }) => piece[0] === myColor,
    onPieceDragBegin: () => setPicked(null),
    onPieceDrop: (from: Square, to: Square) => {
      void submitMove(from, to);
      return true;
    },
    onSquareClick,
    showPromotionDialog: promotionTo !== null,
    promotionToSquare: promotionTo,
    onPromotionPieceSelect: (piece?: string, from?: Square, to?: Square) => {
      const source = from ?? picked;
      const target = to ?? promotionTo;
      setPicked(null);
      setPromotionTo(null);
      if (!piece || !source || !target) return false;
      void submitMove(source, target, piece[1].toLowerCase());
      return true;
    },
    customSquareStyles: squareStyles,
    customPieces: BOARD_PIECES,
    customDarkSquareStyle: { backgroundColor: "#44359a" },
    customLightSquareStyle: { backgroundColor: "#7a68ee" },
  };

  const captures = { w: [] as string[], b: [] as string[] };
  for (const m of history) if (m.captured) captures[m.color].push(m.captured);

  const drawOfferedByOpponent =
    active && info.drawOfferedBy !== ZERO_ADDRESS && !sameAddress(info.drawOfferedBy, address) && myColor !== null;
  const iOfferedDraw = active && sameAddress(info.drawOfferedBy, address);
  const myBalance = myColor === "w" ? info.whiteBalance : myColor === "b" ? info.blackBalance : 0n;
  const alreadyWithdrawn = myColor === "w" ? withdrawn?.[0] : myColor === "b" ? withdrawn?.[1] : true;

  let boardNotice: string | null = null;
  if (illegalAt !== null) {
    boardNotice = hasReferee
      ? `Move ${illegalAt + 1} is not a legal chess move. The referee is forfeiting the game for whoever played it.`
      : `Move ${illegalAt + 1} on-chain is not a legal chess move (modified client?). Ask the contract owner to arbitrate.`;
  } else if (active && game.isCheckmate()) {
    boardNotice = hasReferee
      ? `Checkmate${myColor ? (myColor === turn ? " - you lost" : " - you won") : ""}. The referee is settling the game...`
      : myColor === turn
        ? "Checkmate - you lost. Resign to settle the game."
        : myColor
          ? "Checkmate! Your opponent should resign; otherwise claim the win when their move timer runs out."
          : "Checkmate.";
  } else if (flagFell && !(myColor && keyReady)) {
    // Players with a ready board see who ran out of time, and the claim, in the dock below.
    boardNotice = myColor ? "Out of time. Unlock to see what happens next." : "Out of time. The other side can now claim the win.";
  } else if (active && game.isDraw()) {
    boardNotice = hasReferee
      ? "Drawn by the rules of chess. The referee is settling the game..."
      : "The position is drawn by the rules of chess. Offer / accept a draw to settle.";
  }

  // What a shared link says, depending on where the game is.
  const stakeText = `${formatToken(info.stake)} ${TOKEN_SYMBOL}`;
  const sharePitch =
    info.status === Status.Open
      ? myColor === "w"
        ? `Play me at chess for ${stakeText} on Away Chess. Every piece you take pays.`
        : `${label(info.white)} wants a ${stakeText} game of chess on Away Chess. Every piece you take pays.`
      : info.status === Status.Active
        ? `${label(info.white)} v ${label(info.black)}, live for ${stakeText} on Away Chess. Every capture pays.`
        : info.result === Result.Draw
          ? `${label(info.white)} and ${label(info.black)} drew a ${stakeText} game on Away Chess.`
          : `${label(info.result === Result.WhiteWins ? info.white : info.black)} beat ${label(info.result === Result.WhiteWins ? info.black : info.white)} for ${stakeText} on Away Chess. See how.`;

  const resultText =
    info.result === Result.Draw ? "Draw" : info.result === Result.WhiteWins ? "White wins" : "Black wins";

  const total = info.whiteBalance + info.blackBalance;
  const bullShare = total > 0n ? Number((info.whiteBalance * 1000n) / total) / 10 : 50;
  const statusLine =
    info.status === Status.Finished
      ? `Finished - ${resultText}`
      : active
        ? `${turn === "w" ? "White" : "Black"} to move`
        : Status[info.status];

  const plate = (color: "w" | "b") => {
    const bull = color === "w";
    const addr = waitingAsBlack ? (bull ? ZERO_ADDRESS : info.white) : bull ? info.white : info.black;
    const balance = bull ? info.whiteBalance : info.blackBalance;
    const onMove = active && turn === color;
    return (
      <div className={`flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 ${bull ? "" : "flex-row-reverse text-right"} ${onMove ? "on-move" : ""}`}>
        <PieceIcon kind="k" color={color} className="h-9 w-9 shrink-0" />
        <div className="min-w-0">
          <div className="soft truncate text-xs">
            {bull ? "White" : "Black"} &middot; {addr === ZERO_ADDRESS ? "waiting..." : label(addr)}
            {myColor === color ? " (you)" : ""}
          </div>
          <div className="amount text-lg leading-tight">
            {formatToken(balance)} <span className="text-xs font-medium">{TOKEN_SYMBOL}</span>
          </div>
          {clockOn && info.status !== Status.Open && (
            <div className="text-sm font-bold" style={onMove && clockLeft[color] < 20 ? { color: "var(--alert)" } : undefined}>
              {formatClock(clockLeft[color])}
            </div>
          )}
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

  // An open game the opponent created after this one, for the same stake: their rematch offer.
  const rematch =
    laterIds
      .map((id, i) => {
        const r = laterGames?.[i];
        return r?.status === "success" ? { id, ...toGameInfo(r.result) } : null;
      })
      .find((g) => g !== null && g.status === Status.Open && sameAddress(g.white, opponent) && g.stake === info.stake) ?? null;

  // Round so small layout shifts (a status line wrapping) don't re-frame the camera.
  const insets = focus ? { top: 0, bottom: 0 } : { top: Math.ceil(topSize.height / 24) * 24, bottom: Math.ceil(bottomSize.height / 24) * 24 };
  const boardWidth = Math.max(Math.floor(Math.min(midSize.width, midSize.height)) - 16, 0);
  // Side by side needs a wide space: two squares and a gap. Otherwise fall back to 3D (phones in portrait).
  const splitWidth = Math.max(Math.floor(Math.min((midSize.width - 36) / 2, midSize.height - 8)), 0);
  const splitFits = midSize.width === 0 || splitWidth >= 260;
  const wanted: ViewMode = myColor === null ? (views.watch ?? "3d") : (views.play ?? (views.phone ? "2d" : "3d"));
  const mode: ViewMode = wanted === "split" && !splitFits ? "3d" : wanted;
  // The one-line dock is only used mid-game when nothing needs the player's attention.
  const needsAttention =
    !(active && myColor && keyReady) || boardNotice !== null || lowMoveGas || drawOfferedByOpponent || flagFell;
  const slimDock = compact && !needsAttention;
  needsYou.current = boardNotice !== null || drawOfferedByOpponent || flagFell || !active;

  return (
    <div className="fixed inset-0 z-10 flex flex-col overflow-hidden bg-[var(--field-deep)]">
      {mode === "3d" && (
        <Arena3D
          immersive
          insets={insets}
          set={pieceSet}
          pawnLook={Number(gameId % 1000n)}
          onSetChange={focus ? undefined : setPieceSet}
          history={arenaHistory}
          orientation={seatColor ?? "w"}
          movable={canMove && !pendingMove ? myColor : null}
          legalTargets={legalTargets}
          onMove={(from, to, promotion) => void submitMove(from, to, promotion)}
          captureLabel={(kind: PieceSymbol) => `+${formatToken(pieceValue(kind))} ${TOKEN_SYMBOL}`}
        />
      )}

      {focus && (
        <>
          {clockOn && active && (
            <div className="slab pointer-events-none absolute left-3 top-3 z-20 px-3 py-1.5 text-sm font-bold">
              <span className={turn === "w" ? "" : "soft"}>{formatClock(clockLeft.w)}</span>
              <span className="soft"> · </span>
              <span className={turn === "b" ? "" : "soft"}>{formatClock(clockLeft.b)}</span>
            </div>
          )}
          <button className="ghost absolute right-3 top-3 z-20" aria-label="Exit focus" onClick={() => setFocus(false)}>
            <Icon name="fullscreen" />
          </button>
        </>
      )}

      {/* Top HUD: navigation, view controls and the scoreboard. Only the controls catch clicks. */}
      {!focus && (
      <div ref={setTopEl} className="pointer-events-none relative z-10 flex flex-col gap-2 p-3">
        <div className="flex items-center justify-between gap-2">
          <button className="ghost pointer-events-auto" onClick={onExit} aria-label="Back to the yard">
            <Icon name="back" /> <span className="hidden sm:inline">Yard</span>
          </button>
          <div className="pointer-events-auto flex gap-2">
            <button
              className="ghost"
              aria-label={compact ? "Expand HUD" : "Minimize HUD"}
              title={compact ? "Show details" : "Minimize for more board"}
              onClick={() => setCompact(!compact)}
            >
              <Icon name={compact ? "down" : "up"} />
            </button>
            {(["3d", "2d", "split"] as const).map((v) => (
                <button
                  key={v}
                  className={`ghost ${v === "split" ? "hidden sm:inline-flex" : ""}`}
                  aria-pressed={mode === v}
                  title={v === "split" ? "2D and 3D side by side" : `${v.toUpperCase()} board`}
                  onClick={() => chooseView(v, myColor === null)}
                >
                  {v === "split" ? "Split" : v.toUpperCase()}
                </button>
            ))}
            <button
              className="ghost"
              aria-label={muted ? "Unmute" : "Mute"}
              title="Tap to mute. Hold for the next song."
              onClick={() => {
                setMuted(!muted);
                setMutedState(!muted);
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                nextTrack();
              }}
            >
              <Icon name={muted ? "soundOff" : "soundOn"} />
            </button>
            <button className="ghost" aria-label="Focus" title="Just the board" onClick={() => setFocus(true)}>
              <Icon name="fullscreen" />
            </button>
            {unlocked && (
              <button className="ghost" aria-label="Lock" title="Wipe the game key from this tab" onClick={account.lock}>
                <Icon name="lock" />
              </button>
            )}
          </div>
        </div>

        <section className="slab pointer-events-auto mx-auto w-full max-w-2xl px-3 py-2">
          {compact ? (
            <div className="flex items-center gap-2 text-sm font-bold">
              <span className={`flex items-center gap-1.5 ${active && turn === "w" ? "on-move" : ""}`}>
                <PieceIcon kind="k" color="w" className="h-6 w-6" />
                <span className="amount">{formatToken(info.whiteBalance)}</span>
                {myColor === "w" ? " (you)" : ""}
                {clockOn && active ? ` ${formatClock(clockLeft.w)}` : ""}
              </span>
              <div className="split flex-1">
                <div style={{ transform: `scaleX(${bullShare / 100})` }} />
              </div>
              <span className={`flex items-center gap-1.5 ${active && turn === "b" ? "on-move" : ""}`}>
                {clockOn && active ? `${formatClock(clockLeft.b)} ` : ""}
                {myColor === "b" ? "(you) " : ""}
                <span className="amount">{formatToken(info.blackBalance)}</span>
                <PieceIcon kind="k" color="b" className="h-6 w-6" />
              </span>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2">
                {plate("w")}
                <div className="shrink-0 px-1 text-center text-[11px] leading-tight opacity-75">
                  <div>Game #{gameId.toString()}</div>
                  <div>{formatToken(info.stake)} each</div>
                </div>
                {plate("b")}
              </div>
              <div className="split mt-2">
                <div style={{ transform: `scaleX(${bullShare / 100})` }} />
              </div>
            </>
          )}
          <p className="mt-1 text-center text-xs">
            <span className="font-bold">{statusLine}</span>
            {active && (
              <span className="soft">
                {" "}
                &middot; ply {history.length + 1}
                {clockOn
                  ? timeLeft <= 0
                    ? " · out of time"
                    : ` · +${clockIncrement}s per move`
                  : ` · ${timeLeft > 0 ? `${formatDuration(timeLeft)} left` : "move timer expired"}`}
              </span>
            )}
            {active && watchers > 0 && (
              <span className="soft ml-2 inline-flex items-center gap-1 align-middle" title="People watching this game">
                <Icon name="eye" size={14} /> {watchers} watching
              </span>
            )}
          </p>
        </section>
      </div>
      )}

      {/* The board's space. In 3D it is empty (the arena shows through); in 2D it holds the flat board. */}

      <div ref={setMidEl} className={`relative z-10 min-h-0 flex-1 ${mode === "3d" ? "pointer-events-none" : ""}`}>
        {mode === "2d" && boardWidth > 0 && (
          <div className="flex h-full items-center justify-center">
            {/* The board measures its container; passing boardWidth directly breaks its drag-and-drop setup. */}
            <div style={{ width: boardWidth }}>
              <Chessboard {...boardProps} />
            </div>
          </div>
        )}
        {mode === "split" && splitWidth > 0 && (
          <div className="flex h-full items-center justify-center gap-3 px-3">
            <div className="shrink-0" style={{ width: splitWidth }}>
              <Chessboard {...boardProps} />
            </div>
            <div className="shrink-0" style={{ width: splitWidth, height: splitWidth }}>
              <Arena3D
                fill
                set={pieceSet}
                pawnLook={Number(gameId % 1000n)}
                history={arenaHistory}
                orientation={seatColor ?? "w"}
                movable={canMove && !pendingMove ? myColor : null}
                legalTargets={legalTargets}
                onMove={(from, to, promotion) => void submitMove(from, to, promotion)}
                captureLabel={(kind: PieceSymbol) => `+${formatToken(pieceValue(kind))} ${TOKEN_SYMBOL}`}
              />
            </div>
          </div>
        )}
      </div>

      {/* Bottom dock: what you can do right now. */}
      {!focus && (
      <div ref={setBottomEl} className="pointer-events-none relative z-10 p-3">
        {slimDock ? (
          <div className="slab pointer-events-auto mx-auto flex w-full max-w-2xl items-center gap-2 px-3 py-2">
            <button className="ghost !min-w-[40px] !px-0" aria-label="Previous move" disabled={(viewPly ?? history.length) === 0} onClick={() => step((viewPly ?? history.length) - 1)}>
              <Icon name="prev" size={18} />
            </button>
            <p className="min-w-0 flex-1 truncate text-center text-sm">
              {viewing
                ? `Move ${viewPly} of ${history.length}${viewPly! > 0 ? ` · ${history[viewPly! - 1].san}` : ""}`
                : pending
                  ? `${pending}...`
                  : `${myTurn ? "Your move" : `Waiting for ${label(opponent)}`}${lastMove ? ` · last ${lastMove.san}` : ""}`}
            </p>
            <button className="ghost !min-w-[40px] !px-0" aria-label="Next move" disabled={!viewing} onClick={() => step((viewPly ?? history.length) + 1)}>
              <Icon name="next" size={18} />
            </button>
            <button className="ghost" aria-label="Expand HUD" onClick={() => setCompact(false)}>
              <Icon name="more" />
            </button>
          </div>
        ) : (
        <div className="slab pointer-events-auto mx-auto flex w-full max-w-2xl flex-col gap-2 p-3">
          {/* Back down to one line, for more board (only when nothing here needs the player). */}
          {!needsAttention && (
            <button className="-mt-1 mx-auto flex h-6 w-16 items-center justify-center rounded-[3px] soft" aria-label="Shrink panel" title="Shrink" onClick={() => setCompact(true)}>
              <Icon name="down" size={18} />
            </button>
          )}
          {boardNotice && <p className="text-sm font-bold">{boardNotice}</p>}

          {/* Going through the moves: a finished game from start to end, a live one back in time. */}
          {history.length > 0 && info.status !== Status.Open && (
            <div className="flex items-center gap-1.5">
              <button className="ghost !min-w-[40px] !px-0" aria-label="First move" disabled={(viewPly ?? history.length) === 0} onClick={() => step(0)}>
                <Icon name="first" size={18} />
              </button>
              <button className="ghost !min-w-[40px] !px-0" aria-label="Previous move" disabled={(viewPly ?? history.length) === 0} onClick={() => step((viewPly ?? history.length) - 1)}>
                <Icon name="prev" size={18} />
              </button>
              <p className="min-w-0 flex-1 truncate text-center text-sm">
                {viewing ? (
                  <>
                    Move {viewPly} of {history.length}
                    {viewPly! > 0 && <span className="soft"> · {history[viewPly! - 1].san}</span>}
                  </>
                ) : (
                  <span className="soft">
                    {history.length} moves{lastMove ? ` · last ${lastMove.san}` : ""}
                  </span>
                )}
              </p>
              <button className="ghost !min-w-[40px] !px-0" aria-label="Next move" disabled={!viewing} onClick={() => step((viewPly ?? history.length) + 1)}>
                <Icon name="next" size={18} />
              </button>
              <button className="ghost !min-w-[40px] !px-0" aria-label="Last move" disabled={!viewing} onClick={() => step(history.length)}>
                <Icon name="last" size={18} />
              </button>
              {viewing && active && (
                <button className="act act--sm act--bone" onClick={() => step(history.length)}>
                  Live
                </button>
              )}
            </div>
          )}

          {history.length > 0 && info.status !== Status.Open && <MoveList history={history} shown={viewPly ?? history.length} onSelect={step} />}

          {/* What each side has taken: the pieces themselves, and what they were worth. */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            {(["w", "b"] as const).map((c) => (
              <div key={c} className={`flex min-w-0 flex-col gap-0.5 ${c === "b" ? "items-end text-right" : ""}`}>
                <span>
                  <span className="soft">{c === "w" ? "White" : "Black"} took</span>{" "}
                  <span className="amount">
                    +{formatToken(captures[c].reduce((sum, p) => sum + pieceValue(p), 0n))} {TOKEN_SYMBOL}
                  </span>
                </span>
                {captures[c].length > 0 && (
                  <span className={`flex min-w-0 flex-wrap ${c === "b" ? "justify-end" : ""}`}>
                    {captures[c].map((p, i) => (
                      <span key={i} className="taken">
                        <PieceIcon kind={p as PieceSymbol} color={c === "w" ? "b" : "w"} className="h-full w-full" />
                      </span>
                    ))}
                  </span>
                )}
              </div>
            ))}
          </div>

          {info.status === Status.Open && myColor === "w" && (
            <>
              <p className="text-sm">Waiting for an opponent. Send them the link: they can sit down in one tap.</p>
              <ShareButton gameId={gameId} text={sharePitch} label="Share invite link" className="act act--bone w-full" />
              <button className="ghost" disabled={pending !== null} onClick={() => moneyCall("Cancel game", "cancelGame")}>
                {pending ?? "Cancel & Refund"}
              </button>
            </>
          )}

          {info.status === Status.Open && myColor === null && !hasAccount && (
            <p className="text-sm">
              This board is waiting for an opponent. Press Play now to sit down{" "}
              {["as Black", "as White", "(a coin flip picks the sides)"][Number(creatorSide ?? 0)] ?? "as Black"}.
            </p>
          )}
          {info.status === Status.Open && myColor === null && hasAccount && (
            <button
              className="act"
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
              {pending ??
                `${["Join as Black", "Join as White", "Join, coin flip for sides"][Number(creatorSide ?? 0)] ?? "Join as Black"} (${formatToken(info.stake)} ${TOKEN_SYMBOL})`}
            </button>
          )}

          {active && myColor && !unlocked && (
            <button className="act" disabled={pending !== null} onClick={() => void account.unlock()}>
              Unlock with passkey to keep playing
            </button>
          )}
          {active && myColor && unlocked && !keyReady && gameKey && (
            <button className="act" disabled={pending !== null} onClick={() => topUpCall("Enable prompt-free moves")}>
              Enable prompt-free moves on this device
            </button>
          )}

          {active && myColor && keyReady && (
            <>
              {lowMoveGas && (
                <button className="act" disabled={pending !== null} onClick={() => topUpCall("Top up move gas")}>
                  Move gas is running low - top up
                </button>
              )}
              {drawOfferedByOpponent && (
                <button
                  className="act"
                  disabled={pending !== null}
                  onClick={() => sendGame("Accept draw", { ...chessContract, functionName: "acceptDraw", args: [gameId] })}
                >
                  Accept draw offer
                </button>
              )}
              {flagFell && (
                <div className="text-center">
                  <p className="text-lg font-bold">{myTurn ? "You ran out of time" : `${label(opponent)} ran out of time`}</p>
                  <p className="soft text-sm">
                    {myTurn ? `${label(opponent)} can now claim the win.` : "Claim the win to settle the board."}
                  </p>
                </div>
              )}
              {flagFell && !myTurn && (
                <button
                  className="act"
                  disabled={pending !== null}
                  onClick={() => sendGame("Claim timeout win", { ...chessContract, functionName: "claimTimeout", args: [gameId] })}
                >
                  Claim win on timeout
                </button>
              )}
              {!flagFell && (
              <div className="flex items-center gap-2">
                <p className="min-w-0 flex-1 soft truncate text-sm">
                  {pending
                    ? `${pending}...`
                    : myTurn
                      ? "Your move - tap a piece."
                      : `Waiting for ${label(opponent)} to move...`}
                </p>
                <ShareButton gameId={gameId} text={sharePitch} />
                <button
                  className="ghost"
                  disabled={pending !== null || iOfferedDraw}
                  onClick={() => sendGame("Offer draw", { ...chessContract, functionName: "offerDraw", args: [gameId] })}
                >
                  {iOfferedDraw ? "Draw offered" : "Offer draw"}
                </button>
                {/* Resigning settles money, so it is confirmed with the passkey rather than the game key. */}
                <button className="act act--sm danger" disabled={pending !== null} onClick={() => moneyCall("Resign", "resign")}>
                  Resign
                </button>
              </div>
              )}
            </>
          )}

          {info.status === Status.Finished && (
            <>
              <p className="text-center text-lg font-bold">
                {resultText}
                <span className="soft block text-xs font-normal">
                  {info.result === Result.Draw ? "Balances above are final payouts. Draws are free." : "Balances above are final payouts after the 2.5% fee."}
                </span>
              </p>
              <ShareButton gameId={gameId} text={sharePitch} label="Share this game" className="ghost w-full" />
              {myColor && (
                <button
                  className="act"
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
              {myColor &&
                (rematch ? (
                  <button className="act" onClick={() => onOpenGame(rematch.id)}>
                    {label(opponent)} wants a rematch &rarr; game #{rematch.id.toString()}
                  </button>
                ) : (
                  <button
                    className="ghost"
                    disabled={pending !== null}
                    onClick={async () => {
                      const receipt = await sendMoney(`Rematch for ${formatToken(info.stake)} ${TOKEN_SYMBOL}`, async (id) =>
                        withApproval(id.address, info.stake, {
                          ...chessContract,
                          // A rematch swaps colours, as over the board.
                          functionName: "createGameAs",
                          args: [info.stake, id.gameKey, clockBase, clockIncrement, myColor === "w" ? 1 : 0],
                          value: await gameKeyTopUp(id.gameKey),
                        })
                      );
                      const created =
                        receipt && parseEventLogs({ abi: degenChessAbi, logs: receipt.logs, eventName: "GameCreated" })[0];
                      if (created) onOpenGame(created.args.gameId);
                    }}
                  >
                    Rematch ({formatToken(info.stake)} {TOKEN_SYMBOL}, you play {myColor === "w" ? "Black" : "White"})
                  </button>
                ))}
            </>
          )}

          {/* Opened from a shared link or on a fresh device: sign in right here. */}
          {!address && (
            <div className="flex justify-center">
              <AccountBar />
            </div>
          )}

          {info.status === Status.Cancelled && <p className="text-sm">This game was cancelled and refunded.</p>}
          {myColor === null && info.status === Status.Active && (
            <div className="flex items-center gap-2">
              <p className="soft min-w-0 flex-1 text-sm">You are spectating.</p>
              <ShareButton gameId={gameId} text={sharePitch} label="Share" className="ghost" />
            </div>
          )}
          {myColor === null && info.status === Status.Open && <ShareButton gameId={gameId} text={sharePitch} label="Share this board" className="ghost w-full" />}
        </div>
        )}
      </div>
      )}
    </div>
  );
}
