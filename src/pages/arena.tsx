import dynamic from "next/dynamic";
import Head from "next/head";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chess, type Move, type PieceSymbol, type Square } from "chess.js";

const Arena3D = dynamic(() => import("../components/arena/Arena3D"), { ssr: false });

// A short game with captures on both sides, castling and a mate: exercises every animation.
const DEMO = "e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5 d5 exd5 Nxd5 Nxf7 Kxf7 Qf3+ Ke6 Nc3 Nb4 O-O c6 d4 Qf6 Qe4 Qf5 dxe5 Qxe4 Nxe4".split(" ");

/** Chain-free sandbox for the 3D arena: play both sides, or watch a scripted game. */
export default function ArenaSandbox() {
  const game = useRef(new Chess());
  const [history, setHistory] = useState<Move[]>([]);
  const [playing, setPlaying] = useState(false);

  const push = useCallback((move: string | { from: Square; to: Square; promotion?: PieceSymbol }) => {
    try {
      game.current.move(move);
      setHistory(game.current.history({ verbose: true }));
      return true;
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => {
      const next = DEMO[game.current.history().length];
      if (!next || !push(next)) setPlaying(false);
    }, 2800);
    return () => clearInterval(timer);
  }, [playing, push]);

  const legalTargets = useCallback(
    (from: Square) =>
      game.current.moves({ square: from, verbose: true }).map((m) => ({ to: m.to, promotion: !!m.promotion })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [history]
  );
  const turn = useMemo(() => (history.length % 2 === 0 ? "w" : "b"), [history]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <Head>
        <title>DegenChess arena sandbox</title>
      </Head>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h1 className="panel-title !mb-0">Board sandbox</h1>
        <button
          className="act act--sm act--bone"
          onClick={() => {
            game.current = new Chess();
            setHistory([]);
            setPlaying(true);
          }}
        >
          Play demo game
        </button>
        <button
          className="act act--sm act--bone"
          onClick={() => {
            setPlaying(false);
            game.current = new Chess();
            setHistory([]);
          }}
        >
          Reset
        </button>
        <span data-testid="ply">ply {history.length}</span>
        <span className="soft">{turn === "w" ? "White" : "Black"} to move</span>
      </div>
      <Arena3D
        history={history}
        orientation="w"
        movable={playing ? null : turn}
        legalTargets={legalTargets}
        onMove={(from, to, promotion) => void push({ from, to, promotion })}
        captureLabel={(kind) => `${{ p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 }[kind]}/39 of the stake`}
      />
    </div>
  );
}
