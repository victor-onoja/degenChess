import Head from "next/head";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { Chessboard } from "react-chessboard";
import { Chess, type Move, type PieceSymbol, type Square } from "chess.js";
import { BOARD_PIECES } from "../components/boardPieces";
import { Icon } from "../components/Icon";
import { PieceIcon } from "../components/PieceIcon";
import { PIECE_WEIGHT } from "../lib/pieceShapes";
import { usePieceSet } from "../lib/pieceSet";
import { useElementSize } from "../lib/useElementSize";
import { useVoices } from "../lib/voices";
import { useMusic } from "../lib/music";
import { isMuted, setMuted } from "../lib/sound";

const Arena3D = dynamic(() => import("../components/arena/Arena3D"), { ssr: false });

// A practice board: one person plays both sides with the real boards, the armies and the money
// moving exactly as in a staked game, but nothing is staked and nothing touches the chain. For demos
// and quick tests. Not linked from the site; NEXT_PUBLIC_SANDBOX=off turns it off.

const ENABLED = process.env.NEXT_PUBLIC_SANDBOX !== "off";
const STAKES = [1, 10, 100];
type View = "3d" | "2d" | "split";

/** Replays moves and works out each side's balance: every capture moves the piece's share of the stake. */
function settle(moves: Move[], stake: number) {
  const balance = { w: stake, b: stake };
  const gains = { w: 0, b: 0 };
  const taken = { w: [] as PieceSymbol[], b: [] as PieceSymbol[] };
  for (const m of moves) {
    if (!m.captured) continue;
    const victim = m.color === "w" ? "b" : "w";
    const value = Math.min((stake * PIECE_WEIGHT[m.captured]) / 39, balance[victim]);
    balance[victim] -= value;
    balance[m.color] += value;
    gains[m.color] += value;
    taken[m.color].push(m.captured);
  }
  return { balance, gains, taken };
}

const money = (n: number) => (n >= 10 ? n.toFixed(2) : n.toFixed(4)).replace(/\.?0+$/, "") || "0";

export default function Sandbox() {
  const [stake, setStake] = useState(10);
  const [history, setHistory] = useState<Move[]>([]);
  const [pawnLook, setPawnLook] = useState(0);
  const [view, setView] = useState<View>("3d");
  const [set, setSet] = usePieceSet();
  const [picked, setPicked] = useState<Square | null>(null);
  const [muted, setMutedState] = useState(false);
  useEffect(() => setMutedState(isMuted()), []);
  const [stageEl, setStageEl] = useState<HTMLDivElement | null>(null);
  const stage = useElementSize(stageEl);

  useEffect(() => {
    // The same defaults as a game: 2D on a phone, 3D on anything bigger.
    if (window.innerWidth < 768) setView("2d");
  }, []);

  const game = useMemo(() => {
    const g = new Chess();
    for (const m of history) g.move({ from: m.from, to: m.to, promotion: m.promotion });
    return g;
  }, [history]);
  useVoices(history, set === "armies", true);
  useMusic(true);
  const turn = game.turn();
  const over = game.isGameOver();
  const { balance, gains, taken } = settle(history, stake);

  // At the end, as the contract settles it: the winner takes the loser's balance except what the
  // loser won by capturing; a draw leaves the balances and is free; otherwise the fee is 2.5% of the pot.
  const payout = useMemo(() => {
    if (!over) return null;
    const pot = stake * 2;
    let w = balance.w;
    let b = balance.b;
    if (game.isCheckmate()) {
      const winner = turn === "w" ? "b" : "w";
      const loser = turn;
      const kept = Math.min(gains[loser], loser === "w" ? w : b);
      if (winner === "w") (w = pot - kept), (b = kept);
      else (b = pot - kept), (w = kept);
    }
    if (!game.isCheckmate()) return { w, b, text: "Draw. No fee" };
    return { w: w * 0.975, b: b * 0.975, text: `Checkmate. ${turn === "w" ? "Black" : "White"} wins` };
  }, [over, balance.w, balance.b, gains, game, turn, stake]);

  const play = useCallback(
    (from: Square, to: Square, promotion?: string) => {
      const next = new Chess(game.fen());
      try {
        const move = next.move({ from, to, promotion: promotion ?? "q" });
        setHistory((h) => [...h, move]);
        setPicked(null);
        return true;
      } catch {
        return false;
      }
    },
    [game]
  );
  const legalTargets = useCallback(
    (from: Square) => game.moves({ square: from, verbose: true }).map((m) => ({ to: m.to, promotion: !!m.promotion })),
    [game]
  );

  const targets = picked ? legalTargets(picked) : [];
  const squareStyles: Record<string, CSSProperties> = {};
  const last = history[history.length - 1];
  if (last) {
    squareStyles[last.from] = { boxShadow: "inset 0 0 0 3px rgba(241, 233, 214, 0.45)" };
    squareStyles[last.to] = { boxShadow: "inset 0 0 0 3px rgba(241, 233, 214, 0.9)" };
  }
  if (picked) squareStyles[picked] = { boxShadow: "inset 0 0 0 4px #ffc233" };
  for (const t of targets)
    squareStyles[t.to] = game.get(t.to)
      ? { background: "radial-gradient(circle, transparent 58%, rgba(255, 194, 51, 0.85) 60%)" }
      : { background: "radial-gradient(circle, rgba(255, 194, 51, 0.9) 18%, transparent 20%)" };

  const board2d = (width: number) => (
    <div style={{ width }}>
      <Chessboard
        id="sandbox"
        position={game.fen()}
        arePiecesDraggable={!over}
        isDraggablePiece={({ piece }) => piece[0] === turn}
        onPieceDragBegin={() => setPicked(null)}
        onPieceDrop={(from, to, piece) => play(from, to, piece[1]?.toLowerCase() === "p" ? undefined : piece[1]?.toLowerCase())}
        onSquareClick={(square) => {
          if (over) return;
          if (picked && targets.some((t) => t.to === square)) return void play(picked, square);
          const piece = game.get(square);
          setPicked(piece && piece.color === turn && square !== picked ? square : null);
        }}
        customSquareStyles={squareStyles}
        customPieces={BOARD_PIECES}
        customDarkSquareStyle={{ backgroundColor: "#44359a" }}
        customLightSquareStyle={{ backgroundColor: "#7a68ee" }}
      />
    </div>
  );
  const arena = (props: { immersive?: boolean; fill?: boolean }) => (
    <Arena3D
      {...props}
      history={history}
      orientation="w"
      movable={over ? null : turn}
      legalTargets={legalTargets}
      onMove={(from, to, promotion) => void play(from, to, promotion)}
      captureLabel={(kind) => `${money((stake * PIECE_WEIGHT[kind]) / 39)} tUSD`}
      set={set}
      pawnLook={pawnLook}
      onSetChange={props.immersive ? setSet : undefined}
    />
  );

  if (!ENABLED) {
    return (
      <main className="mx-auto max-w-md p-10">
        <p>The practice board is turned off.</p>
        <Link className="link" href="/">
          Back to DegenChess
        </Link>
      </main>
    );
  }

  const side = Math.max(Math.min(stage.width - 24, stage.height - 24), 240);
  const half = Math.max(Math.min((stage.width - 36) / 2, stage.height - 24), 240);
  const shown = payout ?? balance;
  const share = shown.w + shown.b > 0 ? (shown.w / (shown.w + shown.b)) * 100 : 50;

  return (
    <div className="fixed inset-0 flex flex-col bg-[var(--field-deep)]">
      <Head>
        <title>Practice board | DegenChess</title>
        <meta name="robots" content="noindex" />
      </Head>

      <header className="relative z-10 flex flex-wrap items-center gap-2 p-3">
        <Link href="/" className="ghost" aria-label="Back to the yard">
          <Icon name="back" />
        </Link>
        <span className="mr-auto min-w-0 truncate text-sm font-bold">
          Practice board <span className="soft hidden font-normal sm:inline">· you play both sides · nothing staked</span>
        </span>
        <div className="flex gap-2">
          <button
            className="ghost"
            aria-label={muted ? "Sound on" : "Sound off"}
            onClick={() => {
              setMuted(!muted);
              setMutedState(!muted);
            }}
          >
            <Icon name={muted ? "soundOff" : "soundOn"} />
          </button>
          {(["3d", "2d", "split"] as const).map((v) => (
            <button key={v} className={`ghost uppercase ${v === "split" ? "hidden lg:inline-flex" : ""}`} aria-pressed={view === v} onClick={() => setView(v)}>
              {v === "split" ? "Split" : v}
            </button>
          ))}
        </div>
      </header>

      {/* The scoreboard: the same live split of the pot as a staked game. */}
      <div className="relative z-10 mx-3 mb-2 sm:mx-auto sm:w-full sm:max-w-2xl">
        <div className="slab p-3">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span>
              White <span className="amount">{money(payout?.w ?? balance.w)}</span>
            </span>
            <span className="soft">{payout ? payout.text : `${turn === "w" ? "White" : "Black"} to move · ply ${history.length + 1}`}</span>
            <span>
              <span className="amount">{money(payout?.b ?? balance.b)}</span> Black
            </span>
          </div>
          <div className="split mt-2">
            <div style={{ transform: `scaleX(${share / 100})` }} />
          </div>
          <div className="mt-2 grid grid-cols-2 gap-3 text-xs">
            {(["w", "b"] as const).map((c) => (
              <div key={c} className={`flex min-h-5 flex-wrap ${c === "b" ? "justify-end" : ""}`}>
                {taken[c].map((p, i) => (
                  <PieceIcon key={i} kind={p} color={c === "w" ? "b" : "w"} className="h-5 w-5" />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div ref={setStageEl} className="relative min-h-0 flex-1">
        {view === "3d" && arena({ immersive: true })}
        {view === "2d" && stage.width > 0 && <div className="flex h-full items-center justify-center">{board2d(side)}</div>}
        {view === "split" && stage.width > 0 && (
          <div className="flex h-full items-center justify-center gap-3 px-3">
            {board2d(half)}
            <div style={{ width: half, height: half }}>{arena({ fill: true })}</div>
          </div>
        )}
      </div>

      <footer className="relative z-10 flex flex-wrap items-center justify-center gap-2 p-3">
        <span className="soft text-sm">Stake each</span>
        <div className="rank">
          {STAKES.map((s) => (
            <button key={s} className="rank__square !min-h-[40px] !px-4" aria-pressed={stake === s} onClick={() => setStake(s)}>
              {s} tUSD
            </button>
          ))}
        </div>
        <button className="ghost" disabled={history.length === 0} onClick={() => setHistory((h) => h.slice(0, -1))}>
          Undo
        </button>
        <button
          className="act act--sm act--bone"
          onClick={() => {
            setHistory([]);
            setPawnLook((n) => n + 1); // a new game, a new pawn set
          }}
        >
          New game
        </button>
      </footer>
    </div>
  );
}
