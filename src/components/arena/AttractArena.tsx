import { useEffect, useRef, useState } from "react";
import { Chess, type Move } from "chess.js";
import Arena3D from "./Arena3D";
import { PIECE_WEIGHT } from "../../lib/pieceShapes";
import { usePieceSet } from "../../lib/pieceSet";

// A short, violent game: captures on both sides, a king hunt and castling.
const DEMO = "e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5 d5 exd5 Nxd5 Nxf7 Kxf7 Qf3+ Ke6 Nc3 Nb4 O-O c6 d4 Qf6 Qe4 Qf5 dxe5 Qxe4 Nxe4".split(" ");
const noTargets = () => [];
const noMove = () => {};

/** The arena as a living backdrop: replays a demo game on a loop while the camera circles. Amounts assume a 10 tUSD stake. */
export default function AttractArena() {
  const game = useRef(new Chess());
  const [history, setHistory] = useState<Move[]>([]);
  const [set] = usePieceSet();
  const [round, setRound] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      const next = DEMO[game.current.history().length];
      if (next) game.current.move(next);
      else {
        game.current = new Chess();
        setRound((r) => r + 1); // each replay brings a different pawn set
      }
      setHistory(game.current.history({ verbose: true }));
    }, 2800);
    return () => clearInterval(timer);
  }, []);

  return (
    <Arena3D
      immersive
      attract
      set={set}
      pawnLook={round}
      history={history}
      orientation="w"
      movable={null}
      legalTargets={noTargets}
      onMove={noMove}
      captureLabel={(kind) => `${((10 * PIECE_WEIGHT[kind]) / 39).toFixed(2)} tUSD`}
    />
  );
}
