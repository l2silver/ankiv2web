"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { NoteContentFieldsForm } from "@/components/NoteContentFieldsForm";
import type { CardEntity } from "@/features/cards/cardsSlice";
import { hydrateFromIDB, markCardDirtyLocal, markFlashcardReviewDeferSiblingDuesLocal } from "@/features/sync/syncThunks";
import {
  intervalHintForGrade,
  scheduleAfterReview,
  type ReviewGrade,
} from "@/lib/cards/scheduleReview";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { getEffectiveCardVariant } from "@/lib/flashcards/effectiveCardVariant";
import { resolveFlashcardFaces } from "@/lib/flashcards/resolveFlashcardFaces";
import {
  JEOPARDY_COL_COUNT,
  JEOPARDY_ROW_COUNT,
  buildJeopardyPlacements,
  cellKey,
  jeopardySourceCardIdsForDeck,
  placementsFingerprint,
  stakeForRow,
  type JeopardyCellPlacement,
} from "@/lib/jeopardy/boardLayout";
import {
  buildJeopardyDraftBlob,
  clearJeopardyDraft,
  loadJeopardyDraft,
  saveJeopardyDraft,
  type JeopardyClearOutcome,
} from "@/lib/jeopardy/jeopardyDraftStorage";

type Props = {
  deckPath: string;
};

const GRADE_ROWS: { grade: ReviewGrade; label: string; className: string }[] = [
  {
    grade: "again",
    label: "Again",
    className:
      "border-rose-900/80 bg-rose-950/50 text-rose-100 hover:bg-rose-950/80 focus-visible:ring-rose-500",
  },
  {
    grade: "hard",
    label: "Hard",
    className:
      "border-amber-900/70 bg-amber-950/40 text-amber-100 hover:bg-amber-950/70 focus-visible:ring-amber-500",
  },
  {
    grade: "good",
    label: "Good",
    className:
      "border-emerald-900/70 bg-emerald-950/40 text-emerald-100 hover:bg-emerald-950/70 focus-visible:ring-emerald-500",
  },
  {
    grade: "easy",
    label: "Easy",
    className: "border-sky-900/70 bg-sky-950/40 text-sky-100 hover:bg-sky-950/70 focus-visible:ring-sky-500",
  },
];

function FlashcardVariantBadgeSmall({ card }: { card: CardEntity }) {
  const eff = getEffectiveCardVariant(card);
  const title = [`note_type: ${card.note_type ?? "—"}`, `layout: ${eff || "—"}`].join("\n");
  return (
    <div
      className="rounded-md border border-zinc-800/90 bg-zinc-950/50 px-2 py-1 text-[10px] text-zinc-500"
      title={title}
    >
      Variant: <span className="text-zinc-400">{eff}</span>
    </div>
  );
}

export function JeopardyGameStudy({ deckPath }: Props) {
  const dispatch = useAppDispatch();
  const { byId, allIds } = useAppSelector((s) => s.cards);

  /** False until hydrateFromIDB settles so we don't lock livePack before draft cards appear in Redux. */
  const [idbHydrated, setIdbHydrated] = useState(false);
  useEffect(() => {
    setIdbHydrated(false);
    void dispatch(hydrateFromIDB())
      .unwrap()
      .catch(() => undefined)
      .finally(() => {
        setIdbHydrated(true);
      });
  }, [dispatch]);

  const [dueClock, setDueClock] = useState(0);
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

  const livePack = useMemo(() => {
    void dueClock;
    const nowMs = Date.now();
    return jeopardySourceCardIdsForDeck(byId, allIds, deckPath, nowMs);
  }, [byId, allIds, deckPath, dueClock]);

  const [phase, setPhase] = useState<"board" | "clue">("board");
  const [activeClue, setActiveClue] = useState<JeopardyCellPlacement | null>(null);
  const [frozenSourceIds, setFrozenSourceIds] = useState<string[] | null>(null);
  const [usingNotDueFallback, setUsingNotDueFallback] = useState(false);
  const [clearedKeys, setClearedKeys] = useState<Set<string>>(() => new Set());
  const [sessionScore, setSessionScore] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [isGrading, setIsGrading] = useState(false);
  /** Good/Easy = win ✓ · Again/Hard = loss ✕ (persisted with draft for redo). */
  const [clearedOutcomes, setClearedOutcomes] = useState<Record<string, JeopardyClearOutcome>>(() => ({}));

  /** Locked once per visit so schedules / stats updates do not reshuffle squares mid-round. */
  const [frozenPlacements, setFrozenPlacements] = useState<JeopardyCellPlacement[] | null>(null);

  /** Skip once per mount: initial load must not wipe draft-derived state before layout restore runs. */
  const skipInitialDeckResetRef = useRef(true);
  useEffect(() => {
    if (skipInitialDeckResetRef.current) {
      skipInitialDeckResetRef.current = false;
      return;
    }
    setFrozenSourceIds(null);
    setFrozenPlacements(null);
    setPhase("board");
    setActiveClue(null);
    setRevealed(false);
    setClearedKeys(new Set());
    setClearedOutcomes({});
    setSessionScore(0);
  }, [deckPath]);

  const restoredLayoutKeyRef = useRef<string>("");

  useLayoutEffect(() => {
    if (frozenSourceIds !== null) return;

    const d = loadJeopardyDraft(deckPath);

    if (d?.v === 1 && Array.isArray(d.sourceCardIds) && d.sourceCardIds.length > 0) {
      const draftCardMissingFromStore = d.sourceCardIds.some((id) => !byId[id]);
      if (draftCardMissingFromStore && !idbHydrated) return;

      if (!draftCardMissingFromStore) {
        const pl = buildJeopardyPlacements(d.sourceCardIds, byId);
        if (placementsFingerprint(pl) === d.placementsFingerprint) {
          setFrozenSourceIds([...d.sourceCardIds]);
          setUsingNotDueFallback(d.usingNotDueFallback);
          return;
        }
      }
    }

    if (livePack.sourceCardIds.length === 0) return;
    const allLiveKnown = livePack.sourceCardIds.every((id) => Boolean(byId[id]));
    if (!allLiveKnown) return;
    setFrozenSourceIds([...livePack.sourceCardIds]);
    setUsingNotDueFallback(livePack.usingNotDueFallback);
  }, [byId, deckPath, idbHydrated, livePack, frozenSourceIds]);

  const sourceCardIds = frozenSourceIds ?? livePack.sourceCardIds;

  useLayoutEffect(() => {
    if (!frozenSourceIds || frozenPlacements !== null) return;
    setFrozenPlacements(buildJeopardyPlacements(frozenSourceIds, byId));
  }, [frozenSourceIds, frozenPlacements, byId]);

  const placements = useMemo(() => frozenPlacements ?? [], [frozenPlacements]);

  const placementsFp = placements.length ? placementsFingerprint(placements) : "";

  useEffect(() => {
    restoredLayoutKeyRef.current = "";
  }, [deckPath]);

  useEffect(() => {
    if (!frozenSourceIds || placements.length === 0) return;
    const lk = `${deckPath}|${placementsFp}`;
    if (restoredLayoutKeyRef.current === lk) return;
    restoredLayoutKeyRef.current = lk;

    const d = loadJeopardyDraft(deckPath);
    const validKeys = new Set(placements.map((p) => cellKey(p.col, p.row)));
    if (d?.placementsFingerprint === placementsFp) {
      const keys = d.clearedKeys.filter((k) => validKeys.has(k));
      setClearedKeys(new Set(keys));
      setSessionScore(d.scoreEarned);
      const rawOc = d.clearedOutcomes ?? {};
      const oc: Record<string, JeopardyClearOutcome> = {};
      for (const k of keys) {
        if (rawOc[k] === "win" || rawOc[k] === "loss") oc[k] = rawOc[k];
      }
      setClearedOutcomes(oc);
    } else {
      setClearedKeys(new Set());
      setSessionScore(0);
      setClearedOutcomes({});
    }
  }, [deckPath, placementsFp, placements, frozenSourceIds]);

  const gradingLockRef = useRef(false);

  const matrix = useMemo(() => {
    const grid: ({ cardId: string; stake: number } | null)[][] = [];
    for (let c = 0; c < JEOPARDY_COL_COUNT; c++) {
      grid[c] = [];
      for (let r = 0; r < JEOPARDY_ROW_COUNT; r++) {
        grid[c][r] = null;
      }
    }
    for (const p of placements) {
      grid[p.col][p.row] = { cardId: p.cardId, stake: p.stake };
    }
    return grid;
  }, [placements]);

  const puzzleComplete =
    placements.length > 0 && placements.every((p) => clearedKeys.has(cellKey(p.col, p.row)));

  const persistSnapshotRef = useRef<{
    deckPath: string;
    placementsFp: string;
    sourceCardIds: string[];
    clearedKeys: Set<string>;
    clearedOutcomes: Record<string, JeopardyClearOutcome>;
    scoreEarned: number;
    usingNotDueFallback: boolean;
  } | null>(null);

  if (!puzzleComplete && placements.length > 0) {
    persistSnapshotRef.current = {
      deckPath,
      placementsFp,
      sourceCardIds,
      clearedKeys,
      clearedOutcomes,
      scoreEarned: sessionScore,
      usingNotDueFallback,
    };
  } else {
    persistSnapshotRef.current = null;
  }

  const draftSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (puzzleComplete) clearJeopardyDraft(deckPath);
  }, [puzzleComplete, deckPath]);

  useEffect(() => {
    if (puzzleComplete || placements.length === 0) {
      if (draftSaveTimerRef.current) {
        clearTimeout(draftSaveTimerRef.current);
        draftSaveTimerRef.current = null;
      }
      return;
    }
    if (draftSaveTimerRef.current) clearTimeout(draftSaveTimerRef.current);
    draftSaveTimerRef.current = setTimeout(() => {
      draftSaveTimerRef.current = null;
      saveJeopardyDraft(
        deckPath,
        buildJeopardyDraftBlob({
          sourceCardIds,
          placementsFingerprint: placementsFp,
          clearedKeys,
          clearedOutcomes,
          scoreEarned: sessionScore,
          usingNotDueFallback,
        }),
      );
    }, 280);
    return () => {
      if (draftSaveTimerRef.current) {
        clearTimeout(draftSaveTimerRef.current);
        draftSaveTimerRef.current = null;
      }
    };
  }, [
    deckPath,
    placements.length,
    puzzleComplete,
    sourceCardIds,
    placementsFp,
    clearedKeys,
    clearedOutcomes,
    sessionScore,
    usingNotDueFallback,
  ]);

  useEffect(() => {
    const flush = () => {
      const snap = persistSnapshotRef.current;
      if (!snap || snap.placementsFp !== placementsFp) return;
      saveJeopardyDraft(
        snap.deckPath,
        buildJeopardyDraftBlob({
          sourceCardIds: snap.sourceCardIds,
          placementsFingerprint: snap.placementsFp,
          clearedKeys: snap.clearedKeys,
          clearedOutcomes: snap.clearedOutcomes,
          scoreEarned: snap.scoreEarned,
          usingNotDueFallback: snap.usingNotDueFallback,
        }),
      );
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [placementsFp]);

  const openClue = useCallback((p: JeopardyCellPlacement) => {
    const k = cellKey(p.col, p.row);
    if (clearedKeys.has(k)) return;
    setActiveClue(p);
    setPhase("clue");
    setRevealed(false);
  }, [clearedKeys]);

  const redoClueCell = useCallback((col: number, row: number, stake: number, outcome: JeopardyClearOutcome | undefined) => {
    const k = cellKey(col, row);
    setClearedKeys((prev) => {
      const next = new Set(prev);
      next.delete(k);
      return next;
    });
    setClearedOutcomes((prev) => {
      const next = { ...prev };
      delete next[k];
      return next;
    });
    setSessionScore((score) => {
      if (outcome === "win") return score - stake;
      if (outcome === "loss") return score + stake;
      return score;
    });
  }, []);

  const clueCard = activeClue ? byId[activeClue.cardId] : undefined;

  const faces = useMemo(() => {
    if (!clueCard) {
      return { front: null as ReactNode, back: null as ReactNode };
    }
    return resolveFlashcardFaces(clueCard);
  }, [clueCard]);

  useLayoutEffect(() => {
    setRevealed(false);
  }, [activeClue?.cardId]);

  const showAnswer = useCallback(() => setRevealed(true), []);

  const hintNowMs = useMemo(() => {
    if (!revealed || !clueCard) return 0;
    return Date.now();
  }, [revealed, clueCard]);

  const submitGrade = useCallback(
    async (grade: ReviewGrade) => {
      if (!clueCard || !activeClue || gradingLockRef.current) return;
      gradingLockRef.current = true;
      setIsGrading(true);
      setRevealed(false);
      const nowMs = Date.now();
      const fields = scheduleAfterReview(clueCard, grade, nowMs);
      const k = cellKey(activeClue.col, activeClue.row);
      const stake = activeClue.stake;
      const earnsClue = grade === "good" || grade === "easy";
      /** Again/Hard = wrong for scoring (Jeopardy: lose the clue value). */
      const scoreDelta = earnsClue ? stake : -stake;
      try {
        await dispatch(markFlashcardReviewDeferSiblingDuesLocal({ gradedId: clueCard.id, fields, nowMs })).unwrap();
        setClearedKeys((prev) => new Set(prev).add(k));
        setClearedOutcomes((prev) => ({ ...prev, [k]: earnsClue ? "win" : "loss" }));
        setSessionScore((s) => s + scoreDelta);
        setPhase("board");
        setActiveClue(null);
      } finally {
        gradingLockRef.current = false;
        setIsGrading(false);
      }
    },
    [clueCard, activeClue, dispatch],
  );

  const toggleFlag = useCallback(async () => {
    if (!clueCard || gradingLockRef.current) return;
    const next = !Boolean(clueCard.flag);
    await dispatch(markCardDirtyLocal({ id: clueCard.id, fields: { flag: next } })).unwrap();
  }, [clueCard, dispatch]);

  useEffect(() => {
    if (phase !== "clue" || !clueCard) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || isGrading) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (!revealed) {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          showAnswer();
        }
        return;
      }
      const map: Record<string, ReviewGrade> = {
        "1": "again",
        "2": "hard",
        "3": "good",
        "4": "easy",
      };
      const g = map[e.key];
      if (g) {
        e.preventDefault();
        void submitGrade(g);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, clueCard, revealed, isGrading, showAnswer, submitGrade]);

  if (livePack.sourceCardIds.length > 0 && frozenSourceIds === null) {
    return (
      <div className="mx-auto max-w-xl text-sm text-zinc-400">
        <Link href="/" className="text-sky-400 hover:text-sky-300">
          ← Decks
        </Link>
        <p className="mt-6">Building your Jeopardy board…</p>
      </div>
    );
  }

  if (
    frozenSourceIds !== null &&
    frozenPlacements === null &&
    frozenSourceIds.length > 0
  ) {
    return (
      <div className="mx-auto max-w-xl text-sm text-zinc-400">
        <Link href="/" className="text-sky-400 hover:text-sky-300">
          ← Decks
        </Link>
        <p className="mt-6">Arranging clues by difficulty…</p>
      </div>
    );
  }

  if (frozenSourceIds === null && livePack.sourceCardIds.length === 0) {
    return (
      <div className="mx-auto max-w-2xl">
        <p className="text-sm text-zinc-500">
          <Link href="/" className="text-sky-400 hover:text-sky-300">
            ← Decks
          </Link>
        </p>
        <h1 className="mt-4 text-xl font-semibold text-zinc-100">Jeopardy</h1>
        <p className="mt-2 text-sm text-zinc-400">
          Deck <code className="text-zinc-300">{deckPath}</code>
        </p>
        <p className="mt-8 rounded-xl border border-zinc-800 bg-zinc-900/40 px-5 py-6 text-center text-sm text-zinc-400">
          No playable flashcards in this deck right now. Try flashcard study or add cards with a standard drill layout.
        </p>
        <button
          type="button"
          onClick={() => window.history.back()}
          className="mt-6 text-sm text-indigo-400 hover:text-indigo-300"
        >
          ← Back
        </button>
      </div>
    );
  }

  if (puzzleComplete && placements.length > 0) {
    return (
      <div className="mx-auto max-w-2xl">
        <p className="text-sm text-zinc-500">
          <Link href="/" className="text-sky-400 hover:text-sky-300">
            ← Decks
          </Link>
        </p>
        <h1 className="mt-4 text-xl font-semibold text-emerald-200">Round complete!</h1>
        <p className="mt-2 text-sm text-zinc-400">
          Deck <code className="text-zinc-300">{deckPath}</code>
        </p>
        <p className="mt-6 text-4xl font-bold tabular-nums text-amber-200">${sessionScore.toLocaleString()}</p>
        <p className="mt-2 text-sm text-zinc-500">
          Includes Good/Easy wins (+clue value) and Again/Hard misses (−clue value).
        </p>
        <p className="mt-6 text-xs text-zinc-600">
          Schedules sync like flashcards. Open Jeopardy again for a fresh board when you have due cards (and extras to
          fill the grid).
        </p>
        <Link href="/" className="mt-8 inline-flex rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500">
          Back to decks
        </Link>
      </div>
    );
  }

  if (phase === "clue" && activeClue && clueCard) {
    return (
      <div className="mx-auto max-w-2xl">
        <p className="text-sm text-zinc-500">
          <button
            type="button"
            disabled={isGrading}
            onClick={() => {
              if (isGrading) return;
              setPhase("board");
              setActiveClue(null);
              setRevealed(false);
            }}
            className="text-indigo-400 hover:text-indigo-300 disabled:opacity-50"
          >
            ← Board
          </button>
          <span className="mx-2 text-zinc-600">·</span>
          <Link href="/" className="text-sky-400 hover:text-sky-300">
            Decks
          </Link>
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-xl font-semibold text-zinc-100">Jeopardy clue</h1>
          <p className="text-lg font-bold tabular-nums text-indigo-300">${activeClue.stake.toLocaleString()}</p>
        </div>
        <p className="mt-1 text-xs text-zinc-600">
          Level {activeClue.col + 1} · Column {activeClue.col + 1} (higher columns are tougher cards overall)
        </p>

        <article className="mt-8 rounded-2xl border border-indigo-900/50 bg-gradient-to-br from-indigo-950/40 via-zinc-900/70 to-zinc-950 p-6 shadow-inner sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-indigo-300/90">Answer with a grade</p>
            <button
              type="button"
              disabled={isGrading}
              onClick={() => void toggleFlag()}
              className={`inline-flex items-center rounded-lg border px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50 ${
                clueCard.flag
                  ? "border-amber-600/70 bg-amber-950/30 text-amber-200"
                  : "border-zinc-700 bg-zinc-950/40 text-zinc-300"
              }`}
            >
              {clueCard.flag ? "Flagged" : "Flag"}
            </button>
          </div>
          <div key={`jf-${activeClue.cardId}`} className="mt-4 min-h-[5rem] text-lg leading-relaxed text-zinc-100">
            {faces.front}
          </div>

          {!revealed ? (
            <div className="mt-8">
              <button
                type="button"
                onClick={showAnswer}
                className="rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white hover:bg-indigo-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
              >
                Show answer
              </button>
              <p className="mt-3 text-xs text-zinc-600">Space or Enter</p>
            </div>
          ) : (
            <>
              <div className="my-8 border-t border-zinc-800" />
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Answer</p>
              <div key={`jb-${activeClue.cardId}`} className="mt-3 min-h-[4rem] text-lg leading-relaxed text-zinc-100">
                {faces.back}
              </div>
            </>
          )}

          {revealed ? (
            <>
              <div className="h-6" />
              <div className="-mx-6 mt-8 border-t border-zinc-800 sm:-mx-8" />
              <div className="sticky bottom-0 -mx-6 bg-zinc-950/80 px-6 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 backdrop-blur sm:-mx-8 sm:px-8">
                <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-zinc-500">How hard was it?</p>
                <div className="flex gap-2">
                  {GRADE_ROWS.map(({ grade, label, className }) => (
                    <button
                      key={grade}
                      type="button"
                      disabled={isGrading}
                      onClick={() => void submitGrade(grade)}
                      className={`flex min-w-0 flex-1 flex-col rounded-xl border px-2 py-2 text-[12px] font-semibold leading-tight transition focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 disabled:opacity-50 ${className}`}
                    >
                      <span>{label}</span>
                      <span className="mt-0.5 text-[10px] font-normal tabular-nums opacity-80">
                        {hintNowMs ? intervalHintForGrade(clueCard, grade, hintNowMs) : "—"}
                      </span>
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-[11px] text-zinc-600">
                  Good / Easy = correct (+
                  <span className="tabular-nums">
                    ${activeClue.stake.toLocaleString()}
                  </span>
                  ); Again / Hard = wrong (−
                  <span className="tabular-nums">
                    ${activeClue.stake.toLocaleString()}
                  </span>
                  ). Keys 1–4 · then back to board.
                </p>
              </div>
            </>
          ) : null}

          <div className="mt-8">
            <NoteContentFieldsForm anchorCard={clueCard} disabled={isGrading} />
          </div>
          <div className="mt-4 flex justify-end">
            <FlashcardVariantBadgeSmall card={clueCard} />
          </div>
        </article>
      </div>
    );
  }

  /** Board phase */
  return (
    <div className="mx-auto max-w-5xl pb-24">
      <p className="text-sm text-zinc-500">
        <Link href="/" className="text-sky-400 hover:text-sky-300">
          ← Decks
        </Link>
      </p>
      <div className="mt-4 flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">Jeopardy</h1>
          <p className="mt-1 truncate text-xs text-zinc-600" title={deckPath}>
            <span className="text-zinc-500">Deck</span> <span className="text-zinc-400">{deckPath}</span>
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm text-zinc-500">Score</p>
          <p className="text-3xl font-bold tabular-nums text-amber-200">${sessionScore.toLocaleString()}</p>
        </div>
      </div>

      {usingNotDueFallback ? (
        <p className="mt-4 rounded-lg border border-amber-900/50 bg-amber-950/20 px-4 py-2 text-sm text-amber-200/90">
          No flashcards due in this subtree — filler clues are earliest-upcoming reviews from your deck so the board stays
          full.
        </p>
      ) : null}

      <div className="mt-8 overflow-x-auto">
        {/* Narrow columns below sm (~55px/col), desktop ~110px/col */}
        <div className="min-w-[275px] sm:min-w-[550px]">
          {/* Column headers */}
          <div
            className="grid gap-1 sm:gap-2"
            style={{ gridTemplateColumns: `repeat(${JEOPARDY_COL_COUNT}, minmax(0,1fr))` }}
          >
            {Array.from({ length: JEOPARDY_COL_COUNT }, (_, c) => (
              <div
                key={c}
                className="rounded-t-lg border border-b-0 border-indigo-700/70 bg-indigo-950/70 px-1 py-1.5 text-center shadow-[inset_0_-2px_0_rgba(30,58,138,0.5)] sm:px-2 sm:py-3"
              >
                <p className="text-[9px] font-semibold uppercase tracking-wider text-indigo-100/95 sm:text-[11px]">
                  Level {c + 1}
                </p>
                <p className="mt-0.5 text-[7px] leading-tight text-indigo-300/80 sm:mt-1 sm:text-[9px]">
                  {c === 0 ? "Easiest band" : c === JEOPARDY_COL_COUNT - 1 ? "Hardest band" : "← →"}
                </p>
              </div>
            ))}
          </div>

          {/* Rows (Jeopardy: low money top) */}
          <div className="grid gap-1 rounded-b-xl border border-indigo-800/70 bg-[#08124a]/90 p-1 shadow-inner sm:gap-2 sm:p-2">
            {Array.from({ length: JEOPARDY_ROW_COUNT }, (_, rowIdx) => (
              <div
                key={rowIdx}
                className="grid gap-1 sm:gap-2"
                style={{ gridTemplateColumns: `repeat(${JEOPARDY_COL_COUNT}, minmax(0,1fr))` }}
              >
                {Array.from({ length: JEOPARDY_COL_COUNT }, (_, colIdx) => {
                  const cell = matrix[colIdx][rowIdx];
                  const k = cellKey(colIdx, rowIdx);
                  const done = clearedKeys.has(k);
                  const outcome = clearedOutcomes[k];
                  const isLoss = outcome === "loss";
                  if (!cell) {
                    return (
                      <div
                        key={k}
                        className="flex min-h-[2.25rem] items-center justify-center rounded-md border border-zinc-800/50 bg-zinc-950/30 text-[10px] text-zinc-600 sm:min-h-[4.5rem] sm:text-xs"
                      >
                        —
                      </div>
                    );
                  }
                  return (
                    <button
                      key={k}
                      type="button"
                      title={done ? "Tap to play this clue again" : "Open clue"}
                      aria-label={
                        done
                          ? `Replay clue${isLoss ? " (missed)" : " (cleared)"}, $${cell.stake}`
                          : `Open clue for $${cell.stake}`
                      }
                      onClick={() => {
                        if (done) {
                          redoClueCell(colIdx, rowIdx, cell.stake, outcome);
                          return;
                        }
                        openClue({
                          col: colIdx,
                          row: rowIdx,
                          cardId: cell.cardId,
                          stake: cell.stake,
                        });
                      }}
                      className={`flex min-h-[2.25rem] flex-col items-center justify-center rounded-md border px-1 py-1.5 text-center transition focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 sm:min-h-[4.5rem] sm:px-2 sm:py-3 ${
                        done
                          ? isLoss
                            ? "cursor-pointer border-rose-800/55 bg-rose-950/25 opacity-95 hover:bg-rose-950/40"
                            : "cursor-pointer border-emerald-900/45 bg-emerald-950/20 opacity-90 hover:bg-emerald-950/35"
                          : "border-[#4169e8]/80 bg-gradient-to-br from-[#1e40af] via-[#1d4ed8] to-[#162456] hover:brightness-110 active:brightness-125"
                      }`}
                    >
                      {done ? (
                        isLoss ? (
                          <span
                            className="text-base font-bold leading-none text-rose-400 sm:text-2xl"
                            title="Missed — tap to retry"
                            aria-hidden
                          >
                            ✕
                          </span>
                        ) : (
                          <span
                            className="text-sm text-emerald-300/90 sm:text-lg"
                            title="Cleared — tap to replay"
                            aria-hidden
                          >
                            ✓
                          </span>
                        )
                      ) : (
                        <span className="text-sm font-bold tabular-nums text-[#fcd34d] sm:text-xl">
                          ${stakeForRow(rowIdx)}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      <p className="mt-6 max-w-xl text-xs text-zinc-600">
        Cards are grouped into five bands from easiest (Level 1) to hardest (Level 5) using lapse count, ease, interval,
        and repetitions — same row value across bands. Good/Easy scores the clue; Again/Hard counts as a miss (−value).
        Cleared cells show ✓ or ✕; tap either to open the card again (score adjusts back, then you can re-grade).
        Scheduling always follows your SRS grades. Progress survives refresh via local draft.
      </p>
    </div>
  );
}
