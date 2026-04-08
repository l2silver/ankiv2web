import { combineReducers, configureStore } from "@reduxjs/toolkit";

import cardsReducer from "@/features/cards/cardsSlice";
import syncReducer from "@/features/sync/syncSlice";

const rootReducer = combineReducers({
  cards: cardsReducer,
  sync: syncReducer,
});

export function makeStore() {
  return configureStore({
    reducer: rootReducer,
    devTools: process.env.NODE_ENV !== "production",
  });
}

export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<typeof rootReducer>;
export type AppDispatch = AppStore["dispatch"];
