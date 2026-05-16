"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";

import { NoteContentFieldsForm } from "@/components/NoteContentFieldsForm";
import {
  BROWSE_RANDOM_DUE_MAX_DAYS,
  clampBrowseDueDayRange,
} from "@/lib/cards/randomDueInRange";
import {
  hydrateFromIDB,
  markBulkLapseAgainDaysLocal,
  markBulkRandomDueDatesLocal,
  markCardDirtyLocal,
} from "@/features/sync/syncThunks";
import { clampLapseAgainDays } from "@/lib/cards/lapseAgain";
import type { CardEntity } from "@/features/cards/cardsSlice";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import {
  aggregateDeckPathsForBrowser,
  buildDeckTree,
  orderedCardIdsInDeckSubtree,
  orderedFlaggedCardIds,
  type DeckTreeNode,
} from "@/lib/cards/deckTree";
import { filterCardIdsByBrowseText } from "@/lib/cards/browseTextSearch";
import { browseGradeHints, buildBrowseScheduleSideMeta } from "@/lib/cards/browseScheduleDisplay";
import { filterNeverAnsweredCardIds, isNeverAnswered } from "@/lib/cards/reviewStatus";
import { scheduleNoteKey } from "@/lib/cards/crosswordFromCard";
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
  const parts = [card.front, card.back, card.context, card.extended]
    .map((s) => s?.trim())
    .filter(Boolean) as string[];
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

type NoteBrowseList = {
  /** Ordered anchor card ids (one per note). */
  anchorIds: string[];
  /** All card ids that match scope (before grouping). */
  scopedCardIds: string[];
  /** Maps note key -> chosen anchor card id. */
  noteKeyToAnchorId: Map<string, string>;
};

function applyBrowseScopeToParams(
  next: URLSearchParams,
  opts: { filterQ: string | null; deckQ: string | null; neverAnswered: boolean; textQ?: string },
) {
  if (opts.filterQ === "flagged") next.set("filter", "flagged");
  else if (opts.deckQ?.trim()) next.set("deck", opts.deckQ.trim());
  if (opts.neverAnswered) next.set("neverAnswered", "1");
  const t = opts.textQ?.trim();
  if (t) next.set("q", t);
}

function buildNoteBrowseList(byId: Record<string, CardEntity>, scopedCardIds: string[]): NoteBrowseList {
  // `scopedCardIds` is already ordered by due_at then id; choosing first-seen per note yields
  // a stable representative and preserves "earliest due for that note" ordering.
  const noteKeyToAnchorId = new Map<string, string>();
  const anchorIds: string[] = [];
  for (const id of scopedCardIds) {
    const c = byId[id];
    if (!c) continue;
    const k = scheduleNoteKey(c);
    if (noteKeyToAnchorId.has(k)) continue;
    noteKeyToAnchorId.set(k, id);
    anchorIds.push(id);
  }
  return { anchorIds, scopedCardIds, noteKeyToAnchorId };
}

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

function BrowseScheduleAside({ card, nowMs }: { card: CardEntity; nowMs: number }) {
  const meta = useMemo(() => buildBrowseScheduleSideMeta(card, nowMs), [card, nowMs]);
  return (
    <div
      className="flex w-[4.75rem] shrink-0 flex-col justify-center gap-0.5 border-l border-zinc-800/60 py-3 pr-3 pl-2 text-right leading-snug"
      aria-label={`Due ${meta.dueRelative}; Again ${meta.againHint}`}
    >
      <p
        className={`text-[10px] font-medium tabular-nums ${meta.isOverdue ? "text-amber-400/95" : "text-zinc-400"}`}
        title={meta.dueTitle}
      >
        {meta.dueRelative}
      </p>
      <p
        className="text-[10px] tabular-nums text-zinc-500"
        title={
          meta.hasCustomLapseAgain
            ? `Again interval if graded now (custom: ${meta.lapseAgainLabel})`
            : "Again interval if graded now"
        }
      >
        ↻ {meta.againHint}
      </p>
      {meta.stateLine ? (
        <p className="text-[9px] leading-tight text-zinc-600" title="Scheduling state">
          {meta.stateLine}
        </p>
      ) : null}
    </div>
  );
}

function BrowseSchedulePanel({ card, nowMs }: { card: CardEntity; nowMs: number }) {
  const meta = useMemo(() => buildBrowseScheduleSideMeta(card, nowMs), [card, nowMs]);
  const gradeHints = useMemo(() => browseGradeHints(card, nowMs), [card, nowMs]);
  const reps = card.reps ?? 0;
  const lastReview = card.last_reviewed_at?.trim();

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 text-xs">
      <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">Schedule</p>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-zinc-300">
        <dt className="text-zinc-600">Due</dt>
        <dd className="tabular-nums" title={meta.dueTitle}>
          <span className={meta.isOverdue ? "text-amber-300/95" : undefined}>{meta.dueRelative}</span>
          {card.due_at?.trim() ? (
            <span className="mt-0.5 block text-[10px] font-normal text-zinc-500">{meta.dueTitle}</span>
          ) : null}
        </dd>
        <dt className="text-zinc-600">Interval</dt>
        <dd className="tabular-nums">{meta.intervalDays > 0 ? `${meta.intervalDays}d` : "—"}</dd>
        <dt className="text-zinc-600">Ease</dt>
        <dd className="tabular-nums">{meta.ease.toFixed(2)}</dd>
        <dt className="text-zinc-600">Reps</dt>
        <dd className="tabular-nums">{reps}</dd>
        <dt className="text-zinc-600">Lapses</dt>
        <dd className="tabular-nums">{meta.lapses}</dd>
        <dt className="text-zinc-600">Again lapse</dt>
        <dd className="tabular-nums" title="Delay after pressing Again (new cards default to 10m)">
          {meta.lapseAgainLabel}
          {meta.hasCustomLapseAgain ? (
            <span className="ml-1 text-[10px] font-normal text-zinc-500">custom</span>
          ) : null}
        </dd>
        {meta.relearnStep !== null ? (
          <>
            <dt className="text-zinc-600">Relearn</dt>
            <dd className="tabular-nums">step {meta.relearnStep + 1} of 3</dd>
          </>
        ) : null}
        {lastReview ? (
          <>
            <dt className="text-zinc-600">Last review</dt>
            <dd className="text-[11px] text-zinc-400">
              {new Date(lastReview).toLocaleString(undefined, {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </dd>
          </>
        ) : null}
      </dl>
      <p className="mt-3 text-[10px] font-medium uppercase tracking-wide text-zinc-600">If graded now</p>
      <ul className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 p-0">
        {gradeHints.map(({ grade, label, hint }) => (
          <li key={grade} className="flex justify-between gap-2 tabular-nums text-zinc-400">
            <span>{label}</span>
            <span className="text-zinc-300">{hint}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CardViewerBody({ card }: { card: CardEntity }) {
  const conceptsById = useAppSelector((s) => s.concepts.byId);
  const faces = useMemo(() => resolveFlashcardFaces(card, { conceptsById }), [card, conceptsById]);
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
  const [selectedAnchorIds, setSelectedAnchorIds] = useState<Set<string>>(() => new Set());
  const [assignMinDays, setAssignMinDays] = useState(0);
  const [assignMaxDays, setAssignMaxDays] = useState(30);
  const [assigningDue, setAssigningDue] = useState(false);
  const [assignDueMessage, setAssignDueMessage] = useState<string | null>(null);
  const [lapseAgainDaysInput, setLapseAgainDaysInput] = useState("3");
  const [assigningLapseAgain, setAssigningLapseAgain] = useState(false);
  /** Tick so due-relative labels refresh (same pattern as home deck due counts). */
  const [dueClock, setDueClock] = useState(0);

  useEffect(() => {
    void dispatch(hydrateFromIDB());
  }, [dispatch]);

  useEffect(() => {
    const id = window.setInterval(() => setDueClock((n) => n + 1), 60_000);
    const onVis = () => {
      if (document.visibilityState === "visible") setDueClock((n) => n + 1);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  const nowMs = useMemo(() => {
    void dueClock;
    // eslint-disable-next-line react-hooks/purity -- intentional wall-clock snapshot
    return Date.now();
  }, [dueClock]);

  useEffect(() => {
    try {
      window.localStorage.setItem(OPEN_DECKS_STORAGE_KEY, JSON.stringify([...openPaths]));
    } catch {
      // ignore
    }
  }, [openPaths]);

  const filterQ = sp.get("filter");
  const deckQ = sp.get("deck");
  const neverAnsweredOnly = sp.get("neverAnswered") === "1";
  const textQFromUrl = sp.get("q") ?? "";
  const [textFilter, setTextFilter] = useState(textQFromUrl);
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

  const scopedCardIds = useMemo(() => {
    if (scope.kind === "flagged") return orderedFlaggedCardIds(byId, allIds);
    if (scope.kind === "deck") return orderedCardIdsInDeckSubtree(byId, allIds, scope.path);
    return [];
  }, [scope, byId, allIds]);

  const noteListUnfiltered = useMemo(
    () => buildNoteBrowseList(byId, scopedCardIds),
    [byId, scopedCardIds],
  );

  const textFilterActive = textFilter.trim().length > 0;

  const noteList = useMemo(() => {
    let ids = neverAnsweredOnly ? filterNeverAnsweredCardIds(byId, scopedCardIds) : scopedCardIds;
    if (textFilterActive) ids = filterCardIdsByBrowseText(byId, ids, textFilter);
    return buildNoteBrowseList(byId, ids);
  }, [byId, scopedCardIds, neverAnsweredOnly, textFilter, textFilterActive]);

  /** Anchor ids for notes currently shown in the list (after all list filters). */
  const visibleAnchorIds = useMemo(() => noteList.anchorIds, [noteList.anchorIds]);
  const visibleAnchorIdSet = useMemo(() => new Set(visibleAnchorIds), [visibleAnchorIds]);

  const hasListFilters = neverAnsweredOnly || textFilterActive;

  const scopeKey =
    scope.kind === "none"
      ? "none"
      : scope.kind === "flagged"
        ? `flagged${neverAnsweredOnly ? ":never" : ""}${textFilterActive ? `:q:${textFilter.trim()}` : ""}`
        : `deck:${scope.path}${neverAnsweredOnly ? ":never" : ""}${textFilterActive ? `:q:${textFilter.trim()}` : ""}`;

  useEffect(() => {
    setTextFilter(textQFromUrl);
  }, [textQFromUrl]);

  useEffect(() => {
    setSelectedAnchorIds(new Set());
    setAssignDueMessage(null);
  }, [scopeKey]);

  useEffect(() => {
    setSelectedAnchorIds((prev) => {
      const next = new Set([...prev].filter((id) => visibleAnchorIdSet.has(id)));
      if (next.size === prev.size) {
        for (const id of prev) {
          if (!visibleAnchorIdSet.has(id)) return next;
        }
        return prev;
      }
      return next;
    });
  }, [visibleAnchorIdSet]);

  // URL can point at any card id in-scope; we normalize to the note's anchor card id.
  const selectedAnchorId = useMemo(() => {
    if (!cardParam) return undefined;
    const raw = byId[cardParam];
    if (!raw || raw.deleted_at?.trim()) return undefined;
    if (!noteList.scopedCardIds.includes(cardParam)) return undefined;
    const k = scheduleNoteKey(raw);
    return noteList.noteKeyToAnchorId.get(k);
  }, [cardParam, byId, noteList.noteKeyToAnchorId, noteList.scopedCardIds]);

  const selectedCard = selectedAnchorId ? byId[selectedAnchorId] : undefined;

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

  const browseScopeParams = useMemo(
    () => ({ filterQ, deckQ, neverAnswered: neverAnsweredOnly, textQ: textFilter }),
    [filterQ, deckQ, neverAnsweredOnly, textFilter],
  );

  useEffect(() => {
    if (scope.kind === "none") return;
    const trimmed = textFilter.trim();
    const urlTrimmed = textQFromUrl.trim();
    if (trimmed === urlTrimmed) return;
    const t = window.setTimeout(() => {
      const next = new URLSearchParams(sp.toString());
      if (trimmed) next.set("q", trimmed);
      else next.delete("q");
      pushBrowseUrl(next);
    }, 300);
    return () => window.clearTimeout(t);
  }, [textFilter, textQFromUrl, scope.kind, sp, pushBrowseUrl]);

  const selectFlagged = useCallback(() => {
    const next = new URLSearchParams();
    applyBrowseScopeToParams(next, { ...browseScopeParams, filterQ: "flagged", deckQ: null });
    pushBrowseUrl(next);
    setForceDecksPanel(false);
  }, [pushBrowseUrl, browseScopeParams]);

  const selectDeck = useCallback(
    (path: string) => {
      const next = new URLSearchParams();
      applyBrowseScopeToParams(next, { ...browseScopeParams, filterQ: null, deckQ: path });
      pushBrowseUrl(next);
      setForceDecksPanel(false);
    },
    [pushBrowseUrl, browseScopeParams],
  );

  const selectCardId = useCallback(
    (id: string) => {
      const next = new URLSearchParams();
      applyBrowseScopeToParams(next, browseScopeParams);
      next.set("card", id);
      pushBrowseUrl(next);
      setForceDecksPanel(false);
    },
    [browseScopeParams, pushBrowseUrl],
  );

  const toggleNeverAnsweredOnly = useCallback(() => {
    const next = new URLSearchParams(sp.toString());
    if (neverAnsweredOnly) next.delete("neverAnswered");
    else next.set("neverAnswered", "1");
    pushBrowseUrl(next);
  }, [neverAnsweredOnly, pushBrowseUrl, sp]);

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
      ? "Flagged notes"
      : scope.kind === "deck"
        ? scope.path
        : "Select a deck or Flags";

  const toggleFlag = useCallback(async () => {
    if (!selectedCard) return;
    const next = !Boolean(selectedCard.flag);
    await dispatch(markCardDirtyLocal({ id: selectedCard.id, fields: { flag: next } })).unwrap();
  }, [selectedCard, dispatch]);

  const selectedVisibleCount = useMemo(() => {
    let n = 0;
    for (const id of selectedAnchorIds) {
      if (visibleAnchorIdSet.has(id)) n++;
    }
    return n;
  }, [selectedAnchorIds, visibleAnchorIdSet]);

  const allVisibleSelected =
    visibleAnchorIds.length > 0 && visibleAnchorIds.every((id) => selectedAnchorIds.has(id));

  const toggleNoteSelected = useCallback((id: string) => {
    setSelectedAnchorIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setAssignDueMessage(null);
  }, []);

  const selectAllVisible = useCallback(() => {
    setSelectedAnchorIds(new Set(visibleAnchorIds));
    setAssignDueMessage(null);
  }, [visibleAnchorIds]);

  const clearVisibleSelection = useCallback(() => {
    setSelectedAnchorIds((prev) => {
      const next = new Set([...prev].filter((id) => !visibleAnchorIdSet.has(id)));
      return next.size === prev.size ? prev : next;
    });
    setAssignDueMessage(null);
  }, [visibleAnchorIdSet]);

  const clearSelection = useCallback(() => {
    setSelectedAnchorIds(new Set());
    setAssignDueMessage(null);
  }, []);

  const toggleSelectAllVisible = useCallback(() => {
    if (allVisibleSelected) clearVisibleSelection();
    else selectAllVisible();
  }, [allVisibleSelected, clearVisibleSelection, selectAllVisible]);

  const assignRandomDueDates = useCallback(async () => {
    const ids = [...selectedAnchorIds].filter((id) => visibleAnchorIdSet.has(id));
    if (ids.length === 0) return;
    const { minDays, maxDays } = clampBrowseDueDayRange(assignMinDays, assignMaxDays);
    setAssigningDue(true);
    setAssignDueMessage(null);
    try {
      const { updated } = await dispatch(
        markBulkRandomDueDatesLocal({ anchorIds: ids, minDays, maxDays }),
      ).unwrap();
      setAssignDueMessage(
        `Assigned random due dates (${minDays}–${maxDays} days) to ${updated} note${updated === 1 ? "" : "s"}. Push from home to sync.`,
      );
      setSelectedAnchorIds(new Set());
    } catch (e) {
      setAssignDueMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setAssigningDue(false);
    }
  }, [selectedAnchorIds, visibleAnchorIdSet, assignMinDays, assignMaxDays, dispatch]);

  const assignLapseAgainDays = useCallback(async () => {
    const ids = [...selectedAnchorIds].filter((id) => visibleAnchorIdSet.has(id));
    if (ids.length === 0) return;
    const parsed = Number(lapseAgainDaysInput);
    if (!Number.isFinite(parsed)) {
      setAssignDueMessage("Enter a valid number of days for Again lapse.");
      return;
    }
    const days = clampLapseAgainDays(parsed);
    setAssigningLapseAgain(true);
    setAssignDueMessage(null);
    try {
      const { updated } = await dispatch(
        markBulkLapseAgainDaysLocal({ anchorIds: ids, lapseAgainDays: days }),
      ).unwrap();
      setAssignDueMessage(
        `Set Again lapse to ${days} day${days === 1 ? "" : "s"} on ${updated} note${updated === 1 ? "" : "s"} (local; not synced to server).`,
      );
    } catch (e) {
      setAssignDueMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setAssigningLapseAgain(false);
    }
  }, [selectedAnchorIds, visibleAnchorIdSet, lapseAgainDaysInput, dispatch]);

  const resetLapseAgainToDefault = useCallback(async () => {
    const ids = [...selectedAnchorIds].filter((id) => visibleAnchorIdSet.has(id));
    if (ids.length === 0) return;
    setAssigningLapseAgain(true);
    setAssignDueMessage(null);
    try {
      const { updated } = await dispatch(
        markBulkLapseAgainDaysLocal({ anchorIds: ids, lapseAgainDays: null }),
      ).unwrap();
      setAssignDueMessage(
        `Reset Again lapse to default (10m) on ${updated} note${updated === 1 ? "" : "s"}.`,
      );
    } catch (e) {
      setAssignDueMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setAssigningLapseAgain(false);
    }
  }, [selectedAnchorIds, visibleAnchorIdSet, dispatch]);

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
    ) : noteList.anchorIds.length === 0 ? (
      <p className="px-4 py-8 text-center text-sm text-zinc-500">
        {textFilterActive && noteListUnfiltered.anchorIds.length > 0
          ? "No notes match your search."
          : neverAnsweredOnly && noteListUnfiltered.anchorIds.length > 0
            ? "No never-answered notes in this scope."
            : "No notes in this scope."}
      </p>
    ) : (
      <ul
        className="divide-y divide-zinc-800/80 p-0"
        aria-label={
          scope.kind === "flagged"
            ? "Flagged notes"
            : scope.kind === "deck"
              ? `Notes in ${scope.path}`
              : "Notes"
        }
      >
        {noteList.anchorIds.map((id) => {
          const c = byId[id];
          if (!c) return null;
          const active = selectedAnchorId === id;
          const checked = selectedAnchorIds.has(id);
          return (
            <li key={id} className="list-none">
              <div
                className={`flex items-stretch transition hover:bg-zinc-900/60 ${
                  active ? "bg-sky-950/25" : checked ? "bg-zinc-900/40" : ""
                }`}
              >
                <label className="flex shrink-0 cursor-pointer items-center px-3 py-3">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleNoteSelected(id)}
                    aria-label={`Select note ${listPreviewLine(c)}`}
                    className="h-4 w-4 rounded border-zinc-600 bg-zinc-950 text-sky-600 focus:ring-sky-600/50"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => selectCardId(id)}
                  className="flex min-w-0 flex-1 items-stretch text-left"
                >
                  <span className="flex min-w-0 flex-1 flex-col gap-1 py-3 pl-0 pr-2">
                    <span className="line-clamp-2 text-sm text-zinc-100">{listPreviewLine(c)}</span>
                    <span className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                      <span className="truncate">{c.deck_id?.trim() || "(no deck)"}</span>
                      {c.flag ? (
                        <span className="shrink-0 rounded border border-amber-800/60 px-1.5 py-0.5 text-amber-200/90">
                          Flagged
                        </span>
                      ) : null}
                      {isNeverAnswered(c) ? (
                        <span className="shrink-0 rounded border border-zinc-600/80 px-1.5 py-0.5 text-zinc-400">
                          New
                        </span>
                      ) : null}
                    </span>
                  </span>
                  <BrowseScheduleAside card={c} nowMs={nowMs} />
                </button>
              </div>
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
          <span className="mt-0.5 block text-xs font-normal text-zinc-500">All flagged notes</span>
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-600">Decks</p>
        {deckRoots.length === 0 ? (
          <p className="text-sm text-zinc-500">No notes to browse.</p>
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
          {hasListFilters && noteListUnfiltered.anchorIds.length > noteList.anchorIds.length
            ? `${noteList.anchorIds.length} of ${noteListUnfiltered.anchorIds.length} notes`
            : `${noteList.anchorIds.length} note${noteList.anchorIds.length === 1 ? "" : "s"}`}
        </p>
        {scope.kind !== "none" ? (
          <div className="mt-2 space-y-2">
            <label className="block text-[10px] font-medium uppercase tracking-wide text-zinc-600">
              Search
              <div className="relative mt-0.5">
                <input
                  type="search"
                  value={textFilter}
                  onChange={(e) => setTextFilter(e.target.value)}
                  placeholder="Filter by text…"
                  aria-label="Filter notes by text"
                  className="w-full rounded border border-zinc-700 bg-zinc-950 py-1.5 pr-8 pl-2 text-sm text-zinc-100 placeholder:text-zinc-600"
                />
                {textFilterActive ? (
                  <button
                    type="button"
                    onClick={() => setTextFilter("")}
                    aria-label="Clear search"
                    className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded px-1.5 py-0.5 text-xs text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
                  >
                    ×
                  </button>
                ) : null}
              </div>
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-400">
              <input
                type="checkbox"
                checked={neverAnsweredOnly}
                onChange={toggleNeverAnsweredOnly}
                className="h-3.5 w-3.5 rounded border-zinc-600 bg-zinc-950 text-sky-600 focus:ring-sky-600/50"
              />
              Never answered only
            </label>
          </div>
        ) : null}
        {scope.kind !== "none" && noteList.anchorIds.length > 0 ? (
          <div className="mt-3 space-y-2 border-t border-zinc-800/80 pt-3">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-zinc-500">
                {selectedVisibleCount > 0
                  ? `${selectedVisibleCount} selected`
                  : "Select notes to schedule"}
              </span>
              <button
                type="button"
                onClick={toggleSelectAllVisible}
                className="text-sky-400 hover:text-sky-300"
              >
                {allVisibleSelected
                  ? "Clear shown"
                  : hasListFilters
                    ? "Select all shown"
                    : "Select all"}
              </button>
              {selectedVisibleCount > 0 ? (
                <button type="button" onClick={clearVisibleSelection} className="text-zinc-400 hover:text-zinc-300">
                  Clear
                </button>
              ) : null}
            </div>
            {selectedVisibleCount > 0 ? (
              <>
              <div className="flex flex-wrap items-end gap-2">
                <label className="flex flex-col gap-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-600">
                  Min days
                  <input
                    type="number"
                    min={0}
                    max={BROWSE_RANDOM_DUE_MAX_DAYS}
                    value={assignMinDays}
                    onChange={(e) => {
                      setAssignMinDays(Number(e.target.value));
                      setAssignDueMessage(null);
                    }}
                    className="w-16 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm text-zinc-100"
                  />
                </label>
                <label className="flex flex-col gap-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-600">
                  Max days
                  <input
                    type="number"
                    min={0}
                    max={BROWSE_RANDOM_DUE_MAX_DAYS}
                    value={assignMaxDays}
                    onChange={(e) => {
                      setAssignMaxDays(Number(e.target.value));
                      setAssignDueMessage(null);
                    }}
                    className="w-16 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm text-zinc-100"
                  />
                </label>
                <button
                  type="button"
                  disabled={assigningDue || assigningLapseAgain}
                  onClick={() => void assignRandomDueDates()}
                  className="rounded-lg border border-sky-800/80 bg-sky-950/50 px-3 py-1.5 text-xs font-semibold text-sky-200 hover:bg-sky-950/80 disabled:opacity-50"
                >
                  {assigningDue ? "Assigning…" : "Assign random due"}
                </button>
              </div>
              <div className="flex flex-wrap items-end gap-2 border-t border-zinc-800/60 pt-2">
                <label className="flex flex-col gap-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-600">
                  Again lapse (days)
                  <input
                    type="number"
                    min={0}
                    max={BROWSE_RANDOM_DUE_MAX_DAYS}
                    value={lapseAgainDaysInput}
                    onChange={(e) => {
                      setLapseAgainDaysInput(e.target.value);
                      setAssignDueMessage(null);
                    }}
                    title="When you press Again on a new card, wait this many days instead of 10 minutes"
                    className="w-16 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm text-zinc-100"
                  />
                </label>
                <button
                  type="button"
                  disabled={assigningLapseAgain || assigningDue}
                  onClick={() => void assignLapseAgainDays()}
                  className="rounded-lg border border-violet-900/70 bg-violet-950/40 px-3 py-1.5 text-xs font-semibold text-violet-200 hover:bg-violet-950/70 disabled:opacity-50"
                >
                  {assigningLapseAgain ? "Saving…" : "Set Again lapse"}
                </button>
                <button
                  type="button"
                  disabled={assigningLapseAgain || assigningDue}
                  onClick={() => void resetLapseAgainToDefault()}
                  className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-400 hover:bg-zinc-900/60 disabled:opacity-50"
                >
                  Default (10m)
                </button>
              </div>
              </>
            ) : null}
            {assignDueMessage ? (
              <p className="text-xs text-zinc-400" role="status">
                {assignDueMessage}
              </p>
            ) : null}
          </div>
        ) : null}
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
          <p className="text-sm text-zinc-500">Select a note from the list to preview both sides.</p>
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
            <BrowseSchedulePanel card={selectedCard} nowMs={nowMs} />
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
            <h1 className="text-lg font-semibold tracking-tight">Browse notes</h1>
            <p className="mt-0.5 text-xs text-zinc-500">
              Inspect decks and flagged notes; select multiple notes to assign random due dates.
            </p>
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
                    applyBrowseScopeToParams(next, browseScopeParams);
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
