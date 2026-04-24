"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";

import { NoteContentFieldsForm } from "@/components/NoteContentFieldsForm";
import { hydrateFromIDB, markCardDirtyLocal } from "@/features/sync/syncThunks";
import type { CardEntity } from "@/features/cards/cardsSlice";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import {
  aggregateDeckPathsForBrowser,
  buildDeckTree,
  orderedCardIdsInDeckSubtree,
  orderedFlaggedCardIds,
  type DeckTreeNode,
} from "@/lib/cards/deckTree";
import { getEffectiveCardVariant } from "@/lib/flashcards/effectiveCardVariant";
import { resolveFlashcardFaces } from "@/lib/flashcards/resolveFlashcardFaces";

const OPEN_DECKS_STORAGE_KEY = "ankiv2.cardBrowser.openPaths.v1";

function loadOpenDeckPathsFromStorage(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(OPEN_DECKS_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    const next = new Set<string>();
    for (const v of parsed) {
      if (typeof v === "string" && v.trim()) next.add(v);
    }
    return next;
  } catch {
    return new Set();
  }
}

function hasChildren(node: DeckTreeNode): boolean {
  return node.children.length > 0;
}

function titleCaseWords(segment: string): string {
  return segment
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function humanizeKindLabel(raw: string): string {
  const s = raw.trim();
  if (!s) return "—";
  if (s.includes("->")) {
    return s
      .split("->")
      .map((part) =>
        part
          .split("+")
          .map((chunk) => titleCaseWords(chunk))
          .join(" + "),
      )
      .join(" → ");
  }
  return titleCaseWords(s);
}

function listPreviewLine(card: CardEntity): string {
  const parts = [card.front, card.back, card.context].map((s) => s?.trim()).filter(Boolean) as string[];
  const t = parts[0] ?? "";
  const oneLine = t.replace(/\s+/g, " ").trim();
  if (!oneLine) return `(${card.id.slice(0, 8)}…)`;
  return oneLine.length > 100 ? `${oneLine.slice(0, 97)}…` : oneLine;
}

type BrowseScope =
  | { kind: "none" }
  | { kind: "flagged" }
  | { kind: "deck"; path: string };

type MobileStep = "decks" | "list" | "card";

function subscribeMinLg(cb: () => void) {
  if (typeof window === "undefined") return () => {};
  const mq = window.matchMedia("(min-width: 1024px)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

function snapshotMinLg(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches;
}

/** Avoid duplicating list + viewer in the DOM (hidden mobile branch still breaks strict a11y queries). */
function useIsLargeScreen(): boolean {
  return useSyncExternalStore(subscribeMinLg, snapshotMinLg, () => false);
}

function FlashcardMetaBadges({ card }: { card: CardEntity }) {
  const ntRaw = card.note_type?.trim() ?? "";
  const stored = card.card_variant?.trim() ?? "";
  const eff = getEffectiveCardVariant(card).trim();
  const title = [
    `note_type: ${ntRaw || "—"}`,
    `stored card_variant: ${stored || "(not set)"}`,
    `layout (effective): ${eff || "—"}`,
  ].join("\n");

  return (
    <div
      className="inline-flex max-w-full flex-col gap-1 rounded-md border border-zinc-700/90 bg-zinc-950/70 px-2.5 py-2 text-left"
      title={title}
    >
      <p className="text-[9px] font-medium uppercase tracking-wider text-zinc-600">Note type</p>
      <p className="text-[11px] font-semibold leading-tight text-zinc-400">{humanizeKindLabel(ntRaw)}</p>
      <p className="mt-1 text-[9px] font-medium uppercase tracking-wider text-zinc-600">Variant</p>
      <p className="text-[11px] font-semibold leading-tight text-zinc-300">{humanizeKindLabel(eff)}</p>
    </div>
  );
}

function BrowserDeckSubtree({
  node,
  depth,
  selectedPath,
  isOpen,
  toggleOpen,
  onSelectDeck,
}: {
  node: DeckTreeNode;
  depth: number;
  selectedPath: string | null;
  isOpen: (path: string) => boolean;
  toggleOpen: (path: string) => void;
  onSelectDeck: (path: string) => void;
}) {
  const rowPadLeft = 12 + depth * 24;
  const expandable = hasChildren(node);
  const open = isOpen(node.path);
  const selected = selectedPath !== null && node.path === selectedPath;

  return (
    <li className="list-none">
      <div
        className={`flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 rounded-md border py-2 pr-2 ${
          selected ? "border-sky-700/80 bg-sky-950/30" : "border-zinc-800/80 bg-zinc-900/40"
        }`}
        style={{ paddingLeft: rowPadLeft }}
      >
        <span className="min-w-0 text-zinc-100">
          <span className="inline-flex min-w-0 items-baseline gap-1.5">
            {expandable ? (
              <button
                type="button"
                onClick={() => toggleOpen(node.path)}
                aria-expanded={open}
                aria-label={open ? `Collapse ${node.label}` : `Expand ${node.label}`}
                className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border border-zinc-700/80 bg-zinc-950/20 text-xs text-zinc-300 hover:bg-zinc-950/50"
              >
                <span aria-hidden="true">{open ? "▾" : "▸"}</span>
              </button>
            ) : (
              <span className="inline-block h-5 w-5 shrink-0" aria-hidden="true" />
            )}
            <button
              type="button"
              onClick={() => onSelectDeck(node.path)}
              className="min-w-0 truncate text-left text-sm text-zinc-100 hover:text-sky-200"
            >
              {node.label}
            </button>
          </span>
        </span>
        <span className="shrink-0 tabular-nums text-xs text-zinc-500">{node.total}</span>
      </div>
      {expandable && open ? (
        <ul className="mt-2 ml-1 list-none space-y-2 border-l-2 border-sky-800/60 pl-3">
          {node.children.map((child) => (
            <BrowserDeckSubtree
              key={child.path}
              node={child}
              depth={depth + 1}
              selectedPath={selectedPath}
              isOpen={isOpen}
              toggleOpen={toggleOpen}
              onSelectDeck={onSelectDeck}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function CardViewerBody({ card }: { card: CardEntity }) {
  const faces = useMemo(() => resolveFlashcardFaces(card), [card]);
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Question</p>
        <div className="mt-2 min-h-[3rem] text-base leading-relaxed text-zinc-100">{faces.front}</div>
      </div>
      <div className="border-t border-zinc-800 pt-6">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Answer</p>
        <div className="mt-2 min-h-[3rem] text-base leading-relaxed text-zinc-100">{faces.back}</div>
      </div>
    </div>
  );
}

export function CardBrowserPage() {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const sp = useSearchParams();
  const { byId, allIds } = useAppSelector((s) => s.cards);

  const [openPaths, setOpenPaths] = useState<Set<string>>(() => loadOpenDeckPathsFromStorage());
  /** Mobile only: user tapped “← Decks” to see the sidebar while keeping the URL scope. */
  const [forceDecksPanel, setForceDecksPanel] = useState(false);

  useEffect(() => {
    void dispatch(hydrateFromIDB());
  }, [dispatch]);

  useEffect(() => {
    try {
      window.localStorage.setItem(OPEN_DECKS_STORAGE_KEY, JSON.stringify([...openPaths]));
    } catch {
      // ignore
    }
  }, [openPaths]);

  const filterQ = sp.get("filter");
  const deckQ = sp.get("deck");
  const scope = useMemo((): BrowseScope => {
    if (filterQ === "flagged") return { kind: "flagged" };
    const d = deckQ?.trim();
    if (d) return { kind: "deck", path: d };
    return { kind: "none" };
  }, [filterQ, deckQ]);
  const cardParam = sp.get("card");

  const deckRoots = useMemo(() => {
    const map = aggregateDeckPathsForBrowser(byId, allIds);
    return buildDeckTree(map);
  }, [byId, allIds]);

  const sortedListIds = useMemo(() => {
    if (scope.kind === "flagged") return orderedFlaggedCardIds(byId, allIds);
    if (scope.kind === "deck") return orderedCardIdsInDeckSubtree(byId, allIds, scope.path);
    return [];
  }, [scope, byId, allIds]);

  const selectedCard =
    cardParam && byId[cardParam] && !byId[cardParam]?.deleted_at?.trim() && sortedListIds.includes(cardParam)
      ? byId[cardParam]
      : undefined;

  /** Drop invalid `card` from URL once list is known. */
  useEffect(() => {
    if (!cardParam) return;
    if (selectedCard) return;
    const next = new URLSearchParams(sp.toString());
    next.delete("card");
    const q = next.toString();
    router.replace(q ? `/browse?${q}` : "/browse", { scroll: false });
  }, [cardParam, selectedCard, router, sp]);

  /** Prefix paths that must read as expanded for the current `deck` query (deep links). */
  const autoExpandPrefixPaths = useMemo(() => {
    if (filterQ === "flagged") return new Set<string>();
    const full = deckQ?.trim();
    if (!full?.includes("::")) return new Set<string>();
    const segments = full.split("::").map((s) => s.trim()).filter(Boolean);
    const s = new Set<string>();
    for (let i = 0; i < segments.length - 1; i++) {
      s.add(segments.slice(0, i + 1).join("::"));
    }
    return s;
  }, [filterQ, deckQ]);

  const mobilePanel = useMemo((): MobileStep => {
    if (forceDecksPanel) return "decks";
    if (cardParam && selectedCard) return "card";
    if (scope.kind !== "none") return "list";
    return "decks";
  }, [forceDecksPanel, cardParam, selectedCard, scope.kind]);

  const isLargeScreen = useIsLargeScreen();

  const isFlaggedScope = scope.kind === "flagged";
  const selectedDeckPath = scope.kind === "deck" ? scope.path : null;

  const pushBrowseUrl = useCallback(
    (next: URLSearchParams) => {
      const q = next.toString();
      router.replace(q ? `/browse?${q}` : "/browse", { scroll: false });
    },
    [router],
  );

  const selectFlagged = useCallback(() => {
    const next = new URLSearchParams();
    next.set("filter", "flagged");
    pushBrowseUrl(next);
    setForceDecksPanel(false);
  }, [pushBrowseUrl]);

  const selectDeck = useCallback(
    (path: string) => {
      const next = new URLSearchParams();
      next.set("deck", path);
      pushBrowseUrl(next);
      setForceDecksPanel(false);
    },
    [pushBrowseUrl],
  );

  const selectCardId = useCallback(
    (id: string) => {
      const next = new URLSearchParams();
      if (filterQ === "flagged") next.set("filter", "flagged");
      else if (deckQ?.trim()) next.set("deck", deckQ.trim());
      next.set("card", id);
      pushBrowseUrl(next);
      setForceDecksPanel(false);
    },
    [filterQ, deckQ, pushBrowseUrl],
  );

  const isOpen = useCallback(
    (path: string) => openPaths.has(path) || autoExpandPrefixPaths.has(path),
    [openPaths, autoExpandPrefixPaths],
  );
  const toggleOpen = useCallback(
    (path: string) => {
      if (autoExpandPrefixPaths.has(path)) return;
      setOpenPaths((prev) => {
        const n = new Set(prev);
        if (n.has(path)) n.delete(path);
        else n.add(path);
        return n;
      });
    },
    [autoExpandPrefixPaths],
  );

  const scopeTitle =
    scope.kind === "flagged"
      ? "Flagged cards"
      : scope.kind === "deck"
        ? scope.path
        : "Select a deck or Flags";

  const toggleFlag = useCallback(async () => {
    if (!selectedCard) return;
    const next = !Boolean(selectedCard.flag);
    await dispatch(markCardDirtyLocal({ id: selectedCard.id, fields: { flag: next } })).unwrap();
  }, [selectedCard, dispatch]);

  const studyHref =
    scope.kind === "deck"
      ? `/study?deck=${encodeURIComponent(scope.path)}`
      : selectedCard?.deck_id
        ? `/study?deck=${encodeURIComponent(selectedCard.deck_id.trim())}`
        : null;

  const listBody =
    scope.kind === "none" ? (
      <p className="px-4 py-8 text-center text-sm text-zinc-500">
        Choose <span className="text-zinc-400">Flags</span> or a deck
        <span className="hidden lg:inline"> on the left</span>
        <span className="lg:hidden"> above</span>.
      </p>
    ) : sortedListIds.length === 0 ? (
      <p className="px-4 py-8 text-center text-sm text-zinc-500">No cards in this scope.</p>
    ) : (
      <ul
        className="divide-y divide-zinc-800/80 p-0"
        aria-label={
          scope.kind === "flagged"
            ? "Flagged cards"
            : scope.kind === "deck"
              ? `Cards in ${scope.path}`
              : "Cards"
        }
      >
        {sortedListIds.map((id) => {
          const c = byId[id];
          if (!c) return null;
          const active = cardParam === id;
          return (
            <li key={id} className="list-none">
              <button
                type="button"
                onClick={() => selectCardId(id)}
                className={`flex w-full flex-col gap-1 px-4 py-3 text-left transition hover:bg-zinc-900/60 ${
                  active ? "bg-sky-950/25" : ""
                }`}
              >
                <span className="line-clamp-2 text-sm text-zinc-100">{listPreviewLine(c)}</span>
                <span className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                  <span className="truncate">{c.deck_id?.trim() || "(no deck)"}</span>
                  {c.flag ? (
                    <span className="shrink-0 rounded border border-amber-800/60 px-1.5 py-0.5 text-amber-200/90">
                      Flagged
                    </span>
                  ) : null}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    );

  const sidebar = (
    <aside className="flex h-full min-h-0 flex-col border-zinc-800 lg:w-[17rem] lg:shrink-0 lg:border-r">
      <div className="border-b border-zinc-800 p-3">
        <button
          type="button"
          onClick={selectFlagged}
          aria-pressed={isFlaggedScope}
          className={`w-full rounded-lg border px-3 py-2 text-left text-sm font-medium transition ${
            isFlaggedScope
              ? "border-amber-600/70 bg-amber-950/40 text-amber-100"
              : "border-zinc-700 bg-zinc-900/50 text-zinc-200 hover:bg-zinc-800/80"
          }`}
        >
          Flags
          <span className="mt-0.5 block text-xs font-normal text-zinc-500">All flagged cards</span>
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-600">Decks</p>
        {deckRoots.length === 0 ? (
          <p className="text-sm text-zinc-500">No cards to browse.</p>
        ) : (
          <ul className="list-none space-y-2 p-0">
            {deckRoots.map((node) => (
              <BrowserDeckSubtree
                key={node.path}
                node={node}
                depth={0}
                selectedPath={isFlaggedScope ? null : selectedDeckPath}
                isOpen={isOpen}
                toggleOpen={toggleOpen}
                onSelectDeck={selectDeck}
              />
            ))}
          </ul>
        )}
      </div>
    </aside>
  );

  const listSection = (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col border-zinc-800 lg:border-r">
      <div className="border-b border-zinc-800 px-4 py-3">
        <h2 className="truncate text-sm font-semibold text-zinc-200">{scopeTitle}</h2>
        <p className="mt-0.5 text-xs text-zinc-500">
          {sortedListIds.length} card{sortedListIds.length === 1 ? "" : "s"}
        </p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">{listBody}</div>
    </section>
  );

  const viewer = (
    <section className="flex min-h-0 w-full flex-col lg:w-[min(28rem,100%)] lg:shrink-0">
      <div className="border-b border-zinc-800 px-4 py-3">
        <h2 className="text-sm font-semibold text-zinc-200">Card</h2>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {!selectedCard ? (
          <p className="text-sm text-zinc-500">Select a card from the list to preview both sides.</p>
        ) : (
          <article className="space-y-4">
            <p className="truncate text-[11px] text-zinc-500" title={selectedCard.deck_id?.trim() ?? ""}>
              <span className="text-zinc-600">Deck</span>{" "}
              <span className="text-zinc-400">{selectedCard.deck_id?.trim() || "(no deck)"}</span>
            </p>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <FlashcardMetaBadges card={selectedCard} />
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => void toggleFlag()}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                    selectedCard.flag
                      ? "border-amber-600/70 bg-amber-950/30 text-amber-200 hover:bg-amber-950/50"
                      : "border-zinc-700 bg-zinc-950/40 text-zinc-300 hover:bg-zinc-900/60"
                  }`}
                  aria-pressed={Boolean(selectedCard.flag)}
                >
                  {selectedCard.flag ? "Flagged" : "Flag"}
                </button>
                {studyHref ? (
                  <Link
                    href={studyHref}
                    className="rounded-lg border border-sky-800/80 bg-sky-950/40 px-3 py-1.5 text-center text-xs font-semibold text-sky-200 hover:bg-sky-950/70"
                  >
                    Study deck…
                  </Link>
                ) : null}
              </div>
            </div>
            <CardViewerBody card={selectedCard} />
            <div className="mt-6">
              <NoteContentFieldsForm anchorCard={selectedCard} />
            </div>
          </article>
        )}
      </div>
    </section>
  );

  return (
    <div className="flex min-h-full flex-1 flex-col bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 px-4 py-3 lg:px-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Browse cards</h1>
            <p className="mt-0.5 text-xs text-zinc-500">Inspect decks and flagged cards; flag changes sync like study.</p>
          </div>
          <Link href="/" className="text-sm text-sky-400 hover:text-sky-300">
            ← Home
          </Link>
        </div>
      </header>

      {isLargeScreen ? (
        <div className="flex min-h-0 flex-1">
          {sidebar}
          {listSection}
          {viewer}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          {mobilePanel === "decks" ? (
            <>
              {sidebar}
              <div className="border-t border-zinc-800 p-4 text-center text-sm text-zinc-500">
                Pick Flags or a deck, then choose a card from the list.
              </div>
            </>
          ) : null}
          {mobilePanel === "list" ? (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="border-b border-zinc-800 px-3 py-2">
                <button
                  type="button"
                  onClick={() => setForceDecksPanel(true)}
                  className="text-sm text-sky-400 hover:text-sky-300"
                >
                  ← Decks
                </button>
              </div>
              {listSection}
            </div>
          ) : null}
          {mobilePanel === "card" ? (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="border-b border-zinc-800 px-3 py-2">
                <button
                  type="button"
                  onClick={() => {
                    const next = new URLSearchParams();
                    if (filterQ === "flagged") next.set("filter", "flagged");
                    else if (deckQ?.trim()) next.set("deck", deckQ.trim());
                    pushBrowseUrl(next);
                  }}
                  className="text-sm text-sky-400 hover:text-sky-300"
                >
                  ← Cards
                </button>
              </div>
              {viewer}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
