"use client";

import { useEffect, useMemo, useState } from "react";

import { syncErrorCleared } from "@/features/sync/syncSlice";
import {
  clearIndexedDbCards,
  hydrateFromIDB,
  markCardDirtyLocal,
  pullNewCards,
  pullContentChangesSince,
  pushDirtyCards,
} from "@/features/sync/syncThunks";
import {
  getDisplayApiBaseUrl,
  hasFullBuildTimeApiConfig,
  isApiConfigured,
  isApiReadyForRequests,
  isPullAvailable,
  isSyncPullMockEnabled,
} from "@/lib/api/client";
import {
  aggregateDeckPaths,
  buildDeckTree,
  countDueCards,
  NESTED_DECK_SEPARATOR,
} from "@/lib/cards/deckTree";
import { DeckTreeRows } from "@/components/DeckTreeRows";
import { clearStoredCredentials } from "@/lib/settings/apiCredentials";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";

export function HomePage() {
  const dispatch = useAppDispatch();
  const [isClearingIdb, setIsClearingIdb] = useState(false);
  const sync = useAppSelector((s) => s.sync);
  const cards = useAppSelector((s) => s.cards);
  const cardCount = cards.allIds.length;
  const dirtyCount = cards.allIds.filter((id) => cards.byId[id]?.dirty).length;
  const apiReady = isApiReadyForRequests();
  const pullReady = isPullAvailable();
  const pullMock = isSyncPullMockEnabled();
  const hasBaseUrl = isApiConfigured();
  const displayBaseUrl = getDisplayApiBaseUrl();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await dispatch(hydrateFromIDB());
      if (cancelled) return;
      if (!isPullAvailable()) return;
      await dispatch(pullNewCards());
      if (cancelled) return;
      await dispatch(pullContentChangesSince());
    })();
    return () => {
      cancelled = true;
    };
  }, [dispatch]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "hidden" && dirtyCount > 0 && apiReady) {
        void dispatch(pushDirtyCards());
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [dispatch, dirtyCount, apiReady]);

  const firstId = cards.allIds[0];

  const { deckRoots, totalDue } = useMemo(() => {
    // Due snapshot tied to card data updates; not a live clock tick.
    // eslint-disable-next-line react-hooks/purity -- Date.now() snapshot when `cards` deps change
    const nowMs = Date.now();
    const map = aggregateDeckPaths(cards.byId, cards.allIds, nowMs);
    const totalDueCount = countDueCards(cards.byId, cards.allIds, nowMs);
    return { deckRoots: buildDeckTree(map), totalDue: totalDueCount };
  }, [cards.allIds, cards.byId]);

  return (
    <div className="flex min-h-full flex-1 flex-col bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 px-6 py-4">
        <h1 className="text-xl font-semibold tracking-tight">Anki2</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Deck list and due counts only (no card previews) — spec:{" "}
          <code className="text-zinc-500">ankiv2/ANKI2-FRONTEND-DESIGN.md</code> §2.
        </p>
      </header>
      <main className="flex flex-1 flex-col gap-6 px-6 py-8">
        <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
          <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">Decks</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Nested decks use <code className="text-zinc-600">{NESTED_DECK_SEPARATOR}</code> in{" "}
            <code className="text-zinc-600">deck_id</code> (Anki-style). Deeper rows are indented; subdecks sit
            under a vertical bar. Counts roll up to parents. Due = <code className="text-zinc-600">due_at</code>{" "}
            ≤ now, not suspended, not buried.             Tap <span className="text-zinc-400">N due</span> when N &gt; 0 to open study and choose Flashcards or
            Crossword Game.
          </p>

          {deckRoots.length === 0 ? (
            <p className="mt-6 text-center text-sm text-zinc-500">
              No cards yet. After sync finishes, decks will appear here.
            </p>
          ) : (
            <DeckTreeRows nodes={deckRoots} />
          )}

          {deckRoots.length > 0 && totalDue === 0 ? (
            <p className="mt-6 rounded-lg border border-zinc-800/80 bg-zinc-950/40 px-4 py-3 text-center text-sm text-zinc-500">
              Nothing due right now — all caught up (or schedules are in the future).
            </p>
          ) : null}
        </section>

        <details className="rounded-xl border border-zinc-800 bg-zinc-900/30">
          <summary className="cursor-pointer select-none px-5 py-3 text-sm font-medium text-zinc-400 hover:text-zinc-300">
            Sync &amp; developer tools
          </summary>
          <div className="border-t border-zinc-800 px-5 py-4">
            {pullMock ? (
              <p className="mb-3 text-xs text-amber-400/90">
                Pull mock on — new cards from{" "}
                <code className="text-amber-500/90">src/lib/mock/cards-new-index.response.json</code>
              </p>
            ) : null}
            <p className="mb-3 text-xs text-zinc-500">
              Use <span className="text-zinc-400">Reset app</span> to wipe this browser&apos;s copy of all cards and
              start over (same as a fresh install for local data). API credentials stay unless you clear them below.
            </p>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-zinc-500">isPulling</dt>
                <dd className="font-mono text-zinc-300">{String(sync.isPulling)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-zinc-500">isPushing</dt>
                <dd className="font-mono text-zinc-300">{String(sync.isPushing)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-zinc-500">lastPullAt</dt>
                <dd className="truncate font-mono text-xs text-zinc-400">{sync.lastPullAt ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-zinc-500">lastPushAt</dt>
                <dd className="truncate font-mono text-xs text-zinc-400">{sync.lastPushAt ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-zinc-500">lastError</dt>
                <dd className="max-w-[60%] break-words font-mono text-xs text-amber-400">
                  {sync.lastError ?? "—"}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-zinc-500">cards (local)</dt>
                <dd className="font-mono text-zinc-300">{cardCount}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-zinc-500">dirty (unsynced)</dt>
                <dd className="font-mono text-zinc-300">{dirtyCount}</dd>
              </div>
            </dl>
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void dispatch(hydrateFromIDB())}
                disabled={sync.isPulling || sync.isPushing}
                className="rounded-lg border border-zinc-600 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
              >
                Reload from IndexedDB
              </button>
              <button
                type="button"
                onClick={() => void dispatch(pullNewCards())}
                disabled={!pullReady || sync.isPulling || sync.isPushing}
                className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-50"
              >
                {sync.isPulling ? "Pulling…" : "Pull new cards"}
              </button>
              <button
                type="button"
                onClick={() => void dispatch(pushDirtyCards())}
                disabled={!apiReady || sync.isPulling || sync.isPushing || dirtyCount === 0}
                className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
              >
                {sync.isPushing ? "Pushing…" : "Push dirty cards"}
              </button>
              <button
                type="button"
                onClick={() => dispatch(syncErrorCleared())}
                className="rounded-lg border border-zinc-600 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
              >
                Clear error
              </button>
              <button
                type="button"
                onClick={() => {
                  if (
                    !window.confirm(
                      "Erase all local Anki2 data?\n\n" +
                        "This deletes the IndexedDB database (every card, dirty flags, last pull/push timestamps). " +
                        "Your API URL and key in this browser are not removed.\n\n" +
                        "Afterwards the app reloads from empty state and will pull new cards from the server if pull is available.",
                    )
                  ) {
                    return;
                  }
                  setIsClearingIdb(true);
                  void dispatch(clearIndexedDbCards({}))
                    .unwrap()
                    .catch(() => {
                      /* sync.lastError */
                    })
                    .finally(() => setIsClearingIdb(false));
                }}
                disabled={isClearingIdb || sync.isPulling || sync.isPushing}
                className="rounded-lg border border-rose-900/80 bg-rose-950/40 px-4 py-2 text-sm font-medium text-rose-100 hover:bg-rose-950/70 disabled:opacity-50"
              >
                {isClearingIdb ? "Resetting…" : "Reset app (erase local data)"}
              </button>
              {!hasFullBuildTimeApiConfig() ? (
                <button
                  type="button"
                  onClick={() => {
                    clearStoredCredentials();
                    window.location.reload();
                  }}
                  className="rounded-lg border border-zinc-600 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
                >
                  Change API URL &amp; key…
                </button>
              ) : null}
            </div>
            <div className="mt-3 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => {
                  if (!firstId) return;
                  void dispatch(
                    markCardDirtyLocal({
                      id: firstId,
                      fields: { due_at: new Date().toISOString() },
                    }),
                  );
                }}
                disabled={!firstId}
                className="rounded-lg border border-amber-900/80 bg-amber-950/40 px-4 py-2 text-sm text-amber-100 hover:bg-amber-950/70 disabled:opacity-50"
              >
                Mark first card dirty (demo)
              </button>
            </div>
            <p className="mt-4 text-xs text-zinc-600">
              <span className="text-zinc-500">API base URL</span>{" "}
              <code className="text-zinc-500">
                {hasBaseUrl
                  ? displayBaseUrl ?? "—"
                  : "(optional while pull mock is on)"}
              </code>
              {" · "}
              <span className="text-zinc-500">API key</span>{" "}
              <code className="text-zinc-500">
                {process.env.NEXT_PUBLIC_API_KEY?.trim()
                  ? "from NEXT_PUBLIC_API_KEY"
                  : "saved in local storage"}
              </code>
            </p>
          </div>
        </details>
      </main>
    </div>
  );
}
