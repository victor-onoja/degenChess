import { PieceIcon } from "./PieceIcon";

// The flat board uses the same living pieces as everywhere else.
export const BOARD_PIECES = Object.fromEntries(
  (["w", "b"] as const).flatMap((color) =>
    (["p", "n", "b", "r", "q", "k"] as const).map((kind) => [
      `${color}${kind.toUpperCase()}`,
      ({ squareWidth }: { squareWidth: number }) => (
        <div style={{ width: squareWidth, height: squareWidth, padding: "4% 6% 2%" }}>
          <PieceIcon kind={kind} color={color} className="h-full w-full" />
        </div>
      ),
    ])
  )
);
