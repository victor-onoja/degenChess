import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { Chess, Square } from "chess.js";

interface GameState {
  game: Chess;
  gameOver: boolean;
  currentPlayer: string | null;
}

const initialState: GameState = {
  game: new Chess(),
  gameOver: false,
  currentPlayer: null,
};

const gameSlice = createSlice({
  name: "game",
  initialState,
  reducers: {
    makeMove: (state, action: PayloadAction<{ from: Square; to: Square }>) => {
      const { from, to } = action.payload;
      state.game.move({ from, to, promotion: "q" });
      state.gameOver = state.game.isGameOver();
    },
    // makeMove: (state, action: PayloadAction<{ from: Square; to: Square }>) => {
    //   const { from, to } = action.payload;
    //   try {
    //     state.game.move({ from, to, promotion: "q" });
    //     state.gameOver = state.game.isGameOver();
    //     return true; // Move was successful
    //   } catch (error) {
    //     console.error("Invalid move:", error);
    //     return false; // Move was not successful
    //   }
    // },
    setCurrentPlayer: (state, action: PayloadAction<string | null>) => {
      state.currentPlayer = action.payload;
    },
    resetGame: (state) => {
      state.game = new Chess();
      state.gameOver = false;
      state.currentPlayer = null;
    },
  },
});

export const { makeMove, setCurrentPlayer, resetGame } = gameSlice.actions;
export default gameSlice.reducer;
