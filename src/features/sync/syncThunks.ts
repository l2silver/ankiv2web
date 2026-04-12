import { createAsyncThunk } from "@reduxjs/toolkit";

import { isApiReadyForRequests, isPullAvailable } from "@/lib/api/client";
import { patchSync, postCardsByIds, postCardsNewIndex } from "@/lib/api/sync";
import { normalizeServerCard } from "@/lib/cards/normalize";
import { cardUpdatedAtEpochMs } from "@/lib/cards/updatedAt";
import { storedCardToSyncPatch } from "@/lib/cards/syncPatch";
import {
  clearDirtyForIds,
  hydrateCards,
  resetCards,
  upsertMany,
  type CardEntity,
} from "@/features/cards/cardsSlice";
import {
  idbClearDirtyMany,
  idbDeleteEntireDatabase,
  idbGetAllCards,
  idbGetAllIds,
  idbGetMeta,
  idbPutCard,
  idbPutCards,
  idbSetMeta,
  type StoredCard,
} from "@/lib/db/cardsDb";
import { entityToStored, storedToEntity } from "@/lib/db/storedCard";

export const clearIndexedDbCards = createAsyncThunk(
  "sync/clearIndexedDbCards",
  async (
    arg: { repull?: boolean } | undefined,
    { dispatch, rejectWithValue },
  ) => {
    const repull = arg?.repull !== false;
    const canPull = repull && isPullAvailable();
    try {
      await idbDeleteEntireDatabase();
      dispatch(resetCards());
      await dispatch(hydrateFromIDB()).unwrap();
      if (canPull) {
        await dispatch(pullNewCards()).unwrap();
      }
      return { repulled: canPull };
    } catch (e) {
      return rejectWithValue(e instanceof Error ? e.message : String(e));
    }
  },
);

export const hydrateFromIDB = createAsyncThunk(
  "sync/hydrateFromIDB",
  async (_, { dispatch, rejectWithValue }) => {
    try {
      const rows = await idbGetAllCards();
      const entities = rows.map(storedToEntity);
      dispatch(hydrateCards(entities));
      const [lastPullAt, lastPushAt] = await Promise.all([
        idbGetMeta("lastPullAt"),
        idbGetMeta("lastPushAt"),
      ]);
      return {
        count: entities.length,
        lastPullAt: lastPullAt ?? null,
        lastPushAt: lastPushAt ?? null,
      };
    } catch (e) {
      return rejectWithValue(e instanceof Error ? e.message : String(e));
    }
  },
);

export const pullNewCards = createAsyncThunk(
  "sync/pullNewCards",
  async (_, { dispatch, rejectWithValue }) => {
    try {
      if (!isPullAvailable()) {
        throw new Error(
          "Pull unavailable: set API URL + key in first-run setup (or NEXT_PUBLIC_API_URL and NEXT_PUBLIC_API_KEY at build time), or enable pull mock with NEXT_PUBLIC_USE_SYNC_MOCK=true or npm run dev:mock",
        );
      }
      const ids = await idbGetAllIds();
      const { cards } = await postCardsNewIndex({ ids });
      const existing = await idbGetAllCards();
      const existingById = new Map(existing.map((r) => [r.id, r]));
      const dirtyIds = new Set(existing.filter((r) => r._dirty).map((r) => r.id));
      const toStore: StoredCard[] = [];
      const toRedux: CardEntity[] = [];
      for (const raw of cards) {
        const e = normalizeServerCard(raw as Record<string, unknown>);
        if (!e) continue;
        if (dirtyIds.has(e.id)) {
          continue;
        }
        const prev = existingById.get(e.id);
        if (prev) {
          const localMs = cardUpdatedAtEpochMs(storedToEntity(prev));
          const serverMs = cardUpdatedAtEpochMs(e);
          if (localMs >= serverMs) {
            continue;
          }
        }
        toStore.push({ ...e });
        toRedux.push({ ...e, dirty: false });
      }
      if (toStore.length) await idbPutCards(toStore);
      if (toRedux.length) dispatch(upsertMany(toRedux));
      const at = new Date().toISOString();
      await idbSetMeta("lastPullAt", at);
      return { pulled: toRedux.length, at };
    } catch (e) {
      return rejectWithValue(e instanceof Error ? e.message : String(e));
    }
  },
);

/**
 * Fetches full card rows from the server for ids already in IndexedDB (batches of 200).
 * Merges when server `updated_at` is newer than local and the card is not dirty — use after server-side edits
 * to `more_questions` (e.g. Crossword rows), because `pullNewCards` only returns ids **not** already held locally.
 */
export const refreshCardBodiesFromServer = createAsyncThunk(
  "sync/refreshCardBodiesFromServer",
  async (_, { dispatch, rejectWithValue }) => {
    try {
      if (!isPullAvailable()) {
        throw new Error(
          "Refresh unavailable: set API URL + key in first-run setup (or NEXT_PUBLIC_API_URL and NEXT_PUBLIC_API_KEY at build time). Pull mock cannot refresh by id.",
        );
      }
      const all = await idbGetAllIds();
      const existing = await idbGetAllCards();
      const existingById = new Map(existing.map((r) => [r.id, r]));
      const dirtyIds = new Set(existing.filter((r) => r._dirty).map((r) => r.id));
      const batchSize = 200;
      let refreshed = 0;
      for (let i = 0; i < all.length; i += batchSize) {
        const chunk = all.slice(i, i + batchSize);
        const { cards } = await postCardsByIds({ ids: chunk });
        const toStore: StoredCard[] = [];
        const toRedux: CardEntity[] = [];
        for (const raw of cards) {
          const e = normalizeServerCard(raw as Record<string, unknown>);
          if (!e) continue;
          if (dirtyIds.has(e.id)) continue;
          const prev = existingById.get(e.id);
          if (prev) {
            const localMs = cardUpdatedAtEpochMs(storedToEntity(prev));
            const serverMs = cardUpdatedAtEpochMs(e);
            if (serverMs <= localMs) continue;
          }
          toStore.push({ ...e });
          toRedux.push({ ...e, dirty: false });
          refreshed += 1;
        }
        if (toStore.length) await idbPutCards(toStore);
        if (toRedux.length) dispatch(upsertMany(toRedux));
      }
      const at = new Date().toISOString();
      await idbSetMeta("lastPullAt", at);
      return { refreshed, at };
    } catch (e) {
      return rejectWithValue(e instanceof Error ? e.message : String(e));
    }
  },
);

export const pushDirtyCards = createAsyncThunk(
  "sync/pushDirtyCards",
  async (_, { dispatch, rejectWithValue }) => {
    try {
      if (!isApiReadyForRequests()) {
        throw new Error(
          "API is not configured: complete first-run API URL + key setup (or set NEXT_PUBLIC_API_URL and NEXT_PUBLIC_API_KEY at build time)",
        );
      }
      const rows = await idbGetAllCards();
      const dirty = rows.filter((r) => r._dirty);
      if (dirty.length === 0) {
        return { updated: 0, at: null as string | null };
      }
      const patches = dirty
        .map(storedCardToSyncPatch)
        .filter((p): p is NonNullable<typeof p> => p != null);
      if (patches.length === 0) {
        return { updated: 0, at: null as string | null };
      }
      const res = await patchSync({ cards: patches });
      const ids = dirty.map((d) => d.id);
      await idbClearDirtyMany(ids);
      dispatch(clearDirtyForIds(ids));
      const at = new Date().toISOString();
      await idbSetMeta("lastPushAt", at);
      return { updated: res.updated, at };
    } catch (e) {
      return rejectWithValue(e instanceof Error ? e.message : String(e));
    }
  },
);

export const markCardDirtyLocal = createAsyncThunk(
  "sync/markCardDirtyLocal",
  async (
    arg: { id: string; fields: Partial<Omit<CardEntity, "id" | "dirty">> },
    { dispatch, rejectWithValue },
  ) => {
    try {
      const rows = await idbGetAllCards();
      const existing = rows.find((r) => r.id === arg.id);
      const base: StoredCard = existing ?? { id: arg.id };
      const merged: CardEntity = {
        ...storedToEntity(base),
        ...arg.fields,
        id: arg.id,
      };
      for (const key of Object.keys(arg.fields) as (keyof typeof arg.fields)[]) {
        if (arg.fields[key] === undefined) {
          delete (merged as Record<string, unknown>)[key as string];
        }
      }
      merged.updated_at = new Date().toISOString();
      const stored = entityToStored(merged, true);
      await idbPutCard(stored);
      dispatch(upsertMany([storedToEntity(stored)]));
      return arg.id;
    } catch (e) {
      return rejectWithValue(e instanceof Error ? e.message : String(e));
    }
  },
);
