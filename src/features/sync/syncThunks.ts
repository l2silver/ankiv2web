import { createAsyncThunk } from "@reduxjs/toolkit";

import { isApiReadyForRequests, isPullAvailable, isSyncPullMockEnabled } from "@/lib/api/client";
import { patchSync, postCardsChangedSince, postCardsNewIndex } from "@/lib/api/sync";
import type { CardsChangedSinceRequest } from "@/lib/api/types";
import { deferDueByOneDay, noteVariantCardIds } from "@/lib/cards/crosswordFromCard";
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
type CardSchedulePatch = Partial<Omit<CardEntity, "id" | "dirty">>;

type CardsSlicePick = { cards: { byId: Record<string, CardEntity>; allIds: string[] } };
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

const CONTENT_SEQ_META_KEY = "contentSyncSinceSequence";

function parseContentSeqMeta(s: string | null | undefined): number {
  const n = Number.parseInt(s ?? "0", 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/** True if the server row should replace the local row (non-dirty); prefers `content_change_seq` then `updated_at`. */
function serverRowBeatsLocal(prev: StoredCard | undefined, e: CardEntity): boolean {
  if (!prev) return true;
  const sSeq = e.content_change_seq ?? 0;
  const lSeq = prev.content_change_seq ?? 0;
  if (sSeq !== lSeq) return sSeq > lSeq;
  const localMs = cardUpdatedAtEpochMs(storedToEntity(prev));
  const serverMs = cardUpdatedAtEpochMs(e);
  return serverMs > localMs;
}

async function idbBumpContentSeqFromMerged(merged: CardEntity[]): Promise<void> {
  if (merged.length === 0) return;
  const prev = parseContentSeqMeta(await idbGetMeta(CONTENT_SEQ_META_KEY));
  const fromCards = merged.reduce<number>(
    (m, c) => Math.max(m, Math.trunc(c.content_change_seq ?? 0)),
    0,
  );
  await idbSetMeta(CONTENT_SEQ_META_KEY, String(Math.max(prev, fromCards)));
}

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
        await dispatch(pullContentChangesSince()).unwrap();
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
        if (prev && !serverRowBeatsLocal(prev, e)) {
          continue;
        }
        toStore.push({ ...e });
        toRedux.push({ ...e, dirty: false });
      }
      if (toStore.length) await idbPutCards(toStore);
      if (toRedux.length) dispatch(upsertMany(toRedux));
      await idbBumpContentSeqFromMerged(toRedux);
      const at = new Date().toISOString();
      await idbSetMeta("lastPullAt", at);
      return { pulled: toRedux.length, at };
    } catch (e) {
      return rejectWithValue(e instanceof Error ? e.message : String(e));
    }
  },
);

/**
 * Applies server-led content updates via `POST /cards/changed-since` (monotonic `content_change_seq`).
 * Runs after `pullNewCards` on home load; merge skips dirty cards and uses `content_change_seq` / `updated_at`.
 */
export const pullContentChangesSince = createAsyncThunk(
  "sync/pullContentChangesSince",
  async (_, { dispatch, rejectWithValue }) => {
    try {
      if (!isPullAvailable()) {
        throw new Error(
          "Content pull unavailable: set API URL + key in first-run setup (or NEXT_PUBLIC_API_URL and NEXT_PUBLIC_API_KEY at build time), or enable pull mock with NEXT_PUBLIC_USE_SYNC_MOCK=true or npm run dev:mock",
        );
      }
      if (isSyncPullMockEnabled()) {
        return { pulled: 0, at: null as string | null };
      }
      const base = parseContentSeqMeta(await idbGetMeta(CONTENT_SEQ_META_KEY));
      let afterSeq: number | undefined;
      let cursorFloor = base;
      let pulled = 0;
      for (;;) {
        const body: CardsChangedSinceRequest =
          afterSeq !== undefined
            ? { since_sequence: base, after_sequence: afterSeq }
            : { since_sequence: base };
        const res = await postCardsChangedSince(body);
        const existing = await idbGetAllCards();
        const existingById = new Map(existing.map((r) => [r.id, r]));
        const dirtyIds = new Set(existing.filter((r) => r._dirty).map((r) => r.id));
        const toStore: StoredCard[] = [];
        const toRedux: CardEntity[] = [];
        for (const raw of res.cards) {
          const e = normalizeServerCard(raw as Record<string, unknown>);
          if (!e) continue;
          if (dirtyIds.has(e.id)) continue;
          const prev = existingById.get(e.id);
          if (prev && !serverRowBeatsLocal(prev, e)) continue;
          toStore.push({ ...e });
          toRedux.push({ ...e, dirty: false });
          pulled += 1;
        }
        if (toStore.length) await idbPutCards(toStore);
        if (toRedux.length) dispatch(upsertMany(toRedux));
        if (res.next_after_sequence != null && res.next_after_sequence > 0) {
          cursorFloor = Math.max(cursorFloor, res.next_after_sequence);
        }
        if (!res.has_more) break;
        if (res.next_after_sequence == null || res.next_after_sequence <= 0) break;
        afterSeq = res.next_after_sequence;
      }
      await idbSetMeta(CONTENT_SEQ_META_KEY, String(Math.max(base, cursorFloor)));
      const at = new Date().toISOString();
      await idbSetMeta("lastPullAt", at);
      return { pulled, at };
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

/**
 * After a crossword review, apply the same scheduling fields to every variant row for the same note
 * (`deck_id` + main fields) so crossword and flashcard-style rows stay on one schedule.
 */
export const markScheduleAcrossNoteVariantsLocal = createAsyncThunk(
  "sync/markScheduleAcrossNoteVariantsLocal",
  async (arg: { gradedId: string; fields: CardSchedulePatch }, { dispatch, getState, rejectWithValue }) => {
    try {
      const state = getState() as CardsSlicePick;
      const anchor = state.cards.byId[arg.gradedId];
      if (!anchor) throw new Error(`graded card ${arg.gradedId} not in store`);
      const ids = noteVariantCardIds(anchor, state.cards.byId, state.cards.allIds);
      for (const id of ids) {
        await dispatch(markCardDirtyLocal({ id, fields: arg.fields })).unwrap();
      }
      return ids;
    } catch (e) {
      return rejectWithValue(e instanceof Error ? e.message : String(e));
    }
  },
);

/**
 * After a flashcard review: apply full scheduling to the graded variant only; bump each sibling
 * variant's `due_at` by one day so one review clears related cards from the current session without
 * copying interval/ease onto every variant.
 */
export const markFlashcardReviewDeferSiblingDuesLocal = createAsyncThunk(
  "sync/markFlashcardReviewDeferSiblingDuesLocal",
  async (
    arg: { gradedId: string; fields: CardSchedulePatch; nowMs?: number },
    { dispatch, getState, rejectWithValue },
  ) => {
    try {
      const nowMs = arg.nowMs ?? Date.now();
      const state = getState() as CardsSlicePick;
      const anchor = state.cards.byId[arg.gradedId];
      if (!anchor) throw new Error(`graded card ${arg.gradedId} not in store`);
      const ids = noteVariantCardIds(anchor, state.cards.byId, state.cards.allIds);
      await dispatch(markCardDirtyLocal({ id: arg.gradedId, fields: arg.fields })).unwrap();
      for (const id of ids) {
        if (id === arg.gradedId) continue;
        const sib = state.cards.byId[id];
        const due_at = deferDueByOneDay(sib?.due_at, nowMs);
        await dispatch(markCardDirtyLocal({ id, fields: { due_at } })).unwrap();
      }
      return ids;
    } catch (e) {
      return rejectWithValue(e instanceof Error ? e.message : String(e));
    }
  },
);
