import { configureStore } from "@reduxjs/toolkit";
import gameReducer from "./game_slice";
import contractReducer from "./contract_slice";

export const store = configureStore({
  reducer: {
    game: gameReducer,
    contract: contractReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
