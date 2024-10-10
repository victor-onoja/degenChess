import { createSlice, PayloadAction } from "@reduxjs/toolkit";

interface ContractState {
  gameId: number | null;
  player1Stake: number;
  player2Stake: number;
  player1Joined: boolean;
  player2Joined: boolean;
  isCreatingGame: boolean;
  isJoiningGame: boolean;
  isWithdrawing: boolean;
  //   gameStarted: boolean;
}

const initialState: ContractState = {
  gameId: null,
  player1Stake: 0,
  player2Stake: 0,
  player1Joined: false,
  player2Joined: false,
  isCreatingGame: false,
  isJoiningGame: false,
  isWithdrawing: false,
  //   gameStarted: false,
};

const contractSlice = createSlice({
  name: "contract",
  initialState,
  reducers: {
    setGameId: (state, action: PayloadAction<number | null>) => {
      state.gameId = action.payload;
    },
    setStakes: (
      state,
      action: PayloadAction<{ player1: number; player2: number }>
    ) => {
      state.player1Stake = action.payload.player1;
      state.player2Stake = action.payload.player2;
    },
    setPlayerJoined: (
      state,
      action: PayloadAction<{ player: "player1" | "player2"; joined: boolean }>
    ) => {
      state[`${action.payload.player}Joined`] = action.payload.joined;
    },
    setCreatingGame: (state, action: PayloadAction<boolean>) => {
      state.isCreatingGame = action.payload;
    },
    setJoiningGame: (state, action: PayloadAction<boolean>) => {
      state.isJoiningGame = action.payload;
    },
    setWithdrawing: (state, action: PayloadAction<boolean>) => {
      state.isWithdrawing = action.payload;
    },
    // setGameStarted: (state, action: PayloadAction<boolean>) => {
    //   state.gameStarted = action.payload;
    // },
  },
});

export const {
  setGameId,
  setStakes,
  setPlayerJoined,
  setCreatingGame,
  setJoiningGame,
  setWithdrawing,
  //   setGameStarted,
} = contractSlice.actions;
export default contractSlice.reducer;
