import { createSlice } from "@reduxjs/toolkit";

import {
  clearIndexedDbCards,
  hydrateFromIDB,
  markCardDirtyLocal,
  pullNewCards,
  pushDirtyCards,
  refreshCardBodiesFromServer,
} from "@/features/sync/syncThunks";

type SyncState = {
  isPulling: boolean;
  isPushing: boolean;
  lastError: string | null;
  lastPullAt: string | null;
  lastPushAt: string | null;
};

const initialState: SyncState = {
  isPulling: false,
  isPushing: false,
  lastError: null,
  lastPullAt: null,
  lastPushAt: null,
};

const syncSlice = createSlice({
  name: "sync",
  initialState,
  reducers: {
    syncErrorCleared(state) {
      state.lastError = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(hydrateFromIDB.pending, (state) => {
        state.lastError = null;
      })
      .addCase(hydrateFromIDB.fulfilled, (state, action) => {
        state.lastPullAt = action.payload.lastPullAt;
        state.lastPushAt = action.payload.lastPushAt;
      })
      .addCase(hydrateFromIDB.rejected, (state, action) => {
        state.lastError = String(action.payload ?? action.error.message ?? "hydrate failed");
      })
      .addCase(pullNewCards.pending, (state) => {
        state.isPulling = true;
        state.lastError = null;
      })
      .addCase(pullNewCards.fulfilled, (state, action) => {
        state.isPulling = false;
        if (action.payload.at) state.lastPullAt = action.payload.at;
      })
      .addCase(pullNewCards.rejected, (state, action) => {
        state.isPulling = false;
        state.lastError = String(action.payload ?? action.error.message ?? "pull failed");
      })
      .addCase(refreshCardBodiesFromServer.pending, (state) => {
        state.isPulling = true;
        state.lastError = null;
      })
      .addCase(refreshCardBodiesFromServer.fulfilled, (state, action) => {
        state.isPulling = false;
        if (action.payload.at) state.lastPullAt = action.payload.at;
      })
      .addCase(refreshCardBodiesFromServer.rejected, (state, action) => {
        state.isPulling = false;
        state.lastError = String(action.payload ?? action.error.message ?? "refresh bodies failed");
      })
      .addCase(pushDirtyCards.pending, (state) => {
        state.isPushing = true;
        state.lastError = null;
      })
      .addCase(pushDirtyCards.fulfilled, (state, action) => {
        state.isPushing = false;
        if (action.payload.at) state.lastPushAt = action.payload.at;
      })
      .addCase(pushDirtyCards.rejected, (state, action) => {
        state.isPushing = false;
        state.lastError = String(action.payload ?? action.error.message ?? "push failed");
      })
      .addCase(markCardDirtyLocal.rejected, (state, action) => {
        state.lastError = String(action.payload ?? action.error.message ?? "local edit failed");
      })
      .addCase(clearIndexedDbCards.pending, (state) => {
        state.lastError = null;
      })
      .addCase(clearIndexedDbCards.rejected, (state, action) => {
        state.lastError = String(action.payload ?? action.error.message ?? "clear IndexedDB failed");
      });
  },
});

export const { syncErrorCleared } = syncSlice.actions;
export default syncSlice.reducer;
