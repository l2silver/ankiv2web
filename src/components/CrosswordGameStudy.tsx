"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { hydrateFromIDB, markScheduleAcrossNoteVariantsLocal } from "@/features/sync/syncThunks";
import { CrosswordBoard } from "@/components/crossword/CrosswordBoard";
import { CrosswordFlashcardPopup } from "@/components/crossword/CrosswordFlashcardPopup";
import { CrosswordLetterKeyboard } from "@/components/crossword/CrosswordLetterKeyboard";
import { buildPuzzle } from "@/lib/crossword/buildPuzzle";
import {
  isCrosswordSlotComplete,
  normalizeCrosswordAnswer,
  toSlotString,
} from "@/lib/crossword/normalizeAnswer";
import {
  buildCrosswordDraft,
  clearCrosswordDraft,
  loadCrosswordDraft,
  puzzleFingerprint,
  saveCrosswordDraft,
  wordRestoreKey,
} from "@/lib/crossword/crosswordDraftStorage";
import { CROSSWORD_MAX, type CrosswordView } from "@/lib/crossword/types";
import { cardMatchesDeckPath, dueCardIdsForDeck } from "@/lib/cards/deckTree";
import { isCardDueNow } from "@/lib/cards/due";
import {
  intervalHintForGrade,
  scheduleAfterReview,
  type ReviewGrade,
} from "@/lib/cards/scheduleReview";
import { cardIdFromPlacedWordId } from "@/lib/crossword/wordIdCard";
import { wordStartNumberByCell } from "@/lib/crossword/wordNumbers";
import type { CardEntity } from "@/features/cards/cardsSlice";
import {
  cardHasPlayableCrossword,
  crosswordQuestionsFromCard,
  resolveCrosswordGradeCardId,
} from "@/lib/cards/crosswordFromCard";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";

type Props = {
  deckPath: string;
};

/**
 * Prefer the same due queue as flashcards; if nothing is due in this subtree, fall back to any
 * non-suspended card in the deck that has at least one playable Crossword clue so practice is possible.
 */
function crosswordSourceCardIdsForDeck(
  byId: Record<string, CardEntity>,
  allIds: readonly string[],
  deckPath: string,
  nowMs: number,
): { sourceCardIds: string[]; usingNotDueFallback: boolean } {
  const strict = dueCardIdsForDeck(byId, [...allIds], deckPath, nowMs, "all");
  if (strict.length > 0) return { sourceCardIds: strict, usingNotDueFallback: false };

  const fb = allIds.filter((id) => {
    const c = byId[id];
    if (!c || c.suspended || c.buried || !cardMatchesDeckPath(c, deckPath)) return false;
    return cardHasPlayableCrossword(c);
  });
  fb.sort((a, b) => {
    const ta = Date.parse(byId[a]?.due_at ?? "") || 0;
    const tb = Date.parse(byId[b]?.due_at ?? "") || 0;
    if (ta !== tb) return ta - tb;
    return a.localeCompare(b);
  });
  return { sourceCardIds: fb, usingNotDueFallback: true };
}

/** Same note as `sameNote` in crosswordFromCard — group variant siblings for clue ordering. */
function noteKeyForCrosswordClue(
  byId: Record<string, CardEntity>,
  gradeId: string,
  carrier: CardEntity,
): string {
  const g = byId[gradeId] ?? carrier;
  return JSON.stringify([g.deck_id ?? "", g.front ?? "", g.back ?? "", g.context ?? ""]);
}

type ClueScratch = { gradeId: string; question: string; answer: string };

/**
 * Build crossword clue list from due cards, then reorder so clues from the same note (including
 * different variant / grade card ids) are interleaved with other notes. Within one note, order
 * follows the original due walk; when only one note supplies clues, order is unchanged.
 */
function clueInputsFromDueCards(
  byId: Parameters<typeof dueCardIdsForDeck>[0],
  sourceCardIds: string[],
  allIds: readonly string[],
): { clues: { id: string; question: string; answer: string; variantType?: string }[]; answersTruncatedToGridMax: number } {
  const seenClue = new Set<string>();
  const buckets = new Map<string, (ClueScratch & { variantType?: string })[]>();
  const noteKeyOrder: string[] = [];
  let answersTruncatedToGridMax = 0;

  for (const cardId of sourceCardIds) {
    const card = byId[cardId];
    if (!card) continue;
    const cq = crosswordQuestionsFromCard(card);
    if (!cq.length) continue;
    for (const q of cq) {
      const full = normalizeCrosswordAnswer(q.answer ?? "");
      if (full.length < 2) continue;
      if (full.length > CROSSWORD_MAX) answersTruncatedToGridMax += 1;
      const answer = full.slice(0, CROSSWORD_MAX);
      const gradeId = resolveCrosswordGradeCardId(
        card,
        q.variantType ?? (q as { variant_type?: string }).variant_type,
        byId,
        allIds,
      );
      const variantType = (q.variantType ?? (q as { variant_type?: string }).variant_type)?.trim() || undefined;
      const question = q.question?.trim() || "(no clue)";
      const dedupeKey = `${gradeId}\t${answer}\t${question}`;
      if (seenClue.has(dedupeKey)) continue;
      seenClue.add(dedupeKey);

      const noteKey = noteKeyForCrosswordClue(byId, gradeId, card);
      if (!buckets.has(noteKey)) {
        buckets.set(noteKey, []);
        noteKeyOrder.push(noteKey);
      }
      buckets.get(noteKey)!.push({ gradeId, question, answer, variantType });
    }
  }

  const out: { id: string; question: string; answer: string; variantType?: string }[] = [];
  let seq = 0;
  for (;;) {
    let progressed = false;
    for (const nk of noteKeyOrder) {
      const q = buckets.get(nk);
      if (!q || q.length === 0) continue;
      const c = q.shift()!;
      out.push({ id: `${c.gradeId}::${seq}`, question: c.question, answer: c.answer, variantType: c.variantType });
      seq += 1;
      progressed = true;
    }
    if (!progressed) break;
  }

  return { clues: out, answersTruncatedToGridMax };
}

function titleCaseWords(segment: string): string {
  return segment
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function humanizeVariantType(raw: string): string {
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

function CrosswordDataDebugPanel({ deckPath, payload }: { deckPath: string; payload: Record<string, unknown> }) {
  return (
    <details className="mt-6 rounded-lg border border-zinc-700 bg-zinc-950/80 p-3 text-left open:pb-4">
      <summary className="cursor-pointer select-none text-xs font-semibold text-zinc-400">
        Crossword debug — what the app sees <span className="font-normal text-zinc-600">({deckPath})</span>
      </summary>
      <pre className="mt-3 max-h-[min(70vh,32rem)] overflow-auto whitespace-pre-wrap break-all font-mono text-[10px] leading-snug text-zinc-300 sm:text-xs">
        {JSON.stringify(payload, null, 2)}
      </pre>
    </details>
  );
}

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

function CrosswordGradeButtons({
  card,
  disabled,
  onGrade,
}: {
  card: CardEntity;
  disabled: boolean;
  onGrade: (grade: ReviewGrade) => void;
}) {
  const hintNowMs = useMemo(
    () => {
      return Date.now();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh interval hints after schedule writes bump `updated_at`
    [card.updated_at],
  );

  return (
    <div className="mt-4 border-t border-zinc-800/80 pt-4">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">How hard was it?</p>
      <p className="mt-1 text-[11px] text-zinc-600">
        Same scheduler as flashcards. Updates the <span className="text-zinc-500">card variant</span> for this clue
        (see <span className="text-zinc-500">variantType</span> on Crossword rows when set).
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {GRADE_ROWS.map(({ grade, label, className }) => (
          <button
            key={grade}
            type="button"
            disabled={disabled}
            onClick={() => void onGrade(grade)}
            className={`flex flex-col items-stretch rounded-xl border px-2 py-2.5 text-left text-xs font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 disabled:opacity-50 sm:px-3 sm:text-sm ${className}`}
          >
            <span>{label}</span>
            <span className="mt-1 text-[10px] font-normal tabular-nums opacity-80 sm:text-xs">
              {hintNowMs ? intervalHintForGrade(card, grade, hintNowMs) : "—"}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function CrosswordGameStudy({ deckPath }: Props) {
  const dispatch = useAppDispatch();
  const { byId, allIds } = useAppSelector((s) => s.cards);
  const gradingLockRef = useRef(false);

  useEffect(() => {
    void dispatch(hydrateFromIDB());
  }, [dispatch]);

  /**
   * Live due queue (and fallback) changes after every grade when cards leave "due" — that used to rebuild the whole
   * puzzle, new word ids, and wipe draft/selection. Freeze the card-id list for this screen visit until `deckPath`
   * changes so the grid and clue numbers stay stable while you play.
   */
  const liveSourcePack = useMemo(() => {
    const nowMs = Date.now();
    return crosswordSourceCardIdsForDeck(byId, allIds, deckPath, nowMs);
  }, [byId, allIds, deckPath]);

  const [frozenSourcePack, setFrozenSourcePack] = useState<{
    sourceCardIds: string[];
    usingNotDueFallback: boolean;
  } | null>(null);

  useEffect(() => {
    setFrozenSourcePack(null);
  }, [deckPath]);

  useLayoutEffect(() => {
    if (frozenSourcePack !== null) return;
    if (liveSourcePack.sourceCardIds.length === 0) return;
    setFrozenSourcePack({
      sourceCardIds: liveSourcePack.sourceCardIds.slice(),
      usingNotDueFallback: liveSourcePack.usingNotDueFallback,
    });
  }, [liveSourcePack, frozenSourcePack]);

  const sourceCardIds = frozenSourcePack?.sourceCardIds ?? liveSourcePack.sourceCardIds;
  const usingNotDueFallback = frozenSourcePack?.usingNotDueFallback ?? liveSourcePack.usingNotDueFallback;

  const { clues: flatClues, answersTruncatedToGridMax } = useMemo(
    () => clueInputsFromDueCards(byId, sourceCardIds, allIds),
    [byId, sourceCardIds, allIds],
  );

  const deckDebug = useMemo(() => {
    let inDeck = 0;
    let withMq = 0;
    let withPlayableCross = 0;
    let dueInDeck = 0;
    const nowMs = Date.now();
    for (const id of allIds) {
      const c = byId[id];
      if (!c || !cardMatchesDeckPath(c, deckPath)) continue;
      inDeck++;
      if (c.more_questions?.length) withMq++;
      if (cardHasPlayableCrossword(c)) withPlayableCross++;
      if (isCardDueNow(c, nowMs)) dueInDeck++;
    }
    return { inDeck, withMq, withPlayableCross, dueInDeck };
  }, [allIds, byId, deckPath]);

  const crosswordDebugPayload = useMemo(() => {
    const truncateMq = (mq: CardEntity["more_questions"]): unknown => {
      if (!Array.isArray(mq)) return mq;
      const max = 40;
      if (mq.length <= max) return mq;
      return [...mq.slice(0, max), { _note: `${mq.length - max} more_questions rows omitted in this view` }];
    };

    let card: CardEntity | undefined;
    const scanOrder = sourceCardIds.length > 0 ? sourceCardIds : allIds;
    for (const id of scanOrder) {
      const c = byId[id];
      if (!c) continue;
      if (sourceCardIds.length === 0 && !cardMatchesDeckPath(c, deckPath)) continue;
      if (c.more_questions != null && c.more_questions.length > 0) {
        card = c;
        break;
      }
    }

    const derived = card ? crosswordQuestionsFromCard(card) : [];
    const sample = card
      ? {
          id: card.id,
          deck_id: card.deck_id,
          card_variant: card.card_variant,
          note_type: card.note_type,
          due_at: card.due_at,
          more_questions_on_card: truncateMq(card.more_questions),
          crossword_type_rows_only: (card.more_questions ?? []).filter(
            (r) => String(r.type ?? "").trim().toLowerCase() === "crossword",
          ),
          crosswordQuestionsFromCard_derived: derived,
          normalized_each_derived_clue: derived.map((q) => {
            const norm = normalizeCrosswordAnswer(q.answer ?? "");
            return {
              question: q.question,
              raw_answer: q.answer,
              normalized_full: norm,
              normalized_full_length: norm.length,
              grid_answer_used: norm.slice(0, CROSSWORD_MAX),
              grid_answer_length: Math.min(norm.length, CROSSWORD_MAX),
              variantType: q.variantType,
            };
          }),
        }
      : null;

    return {
      deck_path_from_url: deckPath,
      grid_max_word_length: CROSSWORD_MAX,
      subtree_counts: deckDebug,
      using_not_due_fallback: usingNotDueFallback,
      source_card_ids_count: sourceCardIds.length,
      source_card_ids_first_12: sourceCardIds.slice(0, 12),
      flat_clues_after_pipeline_count: flatClues.length,
      clues_truncated_to_first_15_letters: answersTruncatedToGridMax,
      flat_clues_preview_first_5: flatClues.slice(0, 5),
      first_card_in_path_with_more_questions: sample,
    };
  }, [allIds, byId, deckDebug, deckPath, flatClues, answersTruncatedToGridMax, sourceCardIds, usingNotDueFallback]);

  const puzzle = useMemo(() => buildPuzzle(flatClues), [flatClues]);

  const wordStartNumbers = useMemo(() => (puzzle ? wordStartNumberByCell(puzzle) : new Map<string, number>()), [puzzle]);

  const [view, setView] = useState<CrosswordView>("across");
  const [blindMode, setBlindMode] = useState(true);
  const [inputByWord, setInputByWord] = useState<Record<string, string>>({});
  const [selectedWordId, setSelectedWordId] = useState<string | null>(null);
  const [isGrading, setIsGrading] = useState(false);
  const [gradedWordIds, setGradedWordIds] = useState(() => new Set<string>());
  const [showCardPopup, setShowCardPopup] = useState(false);
  /** Set when user tries to grade a full slot that does not match the answer; cleared when they edit that word. */
  const [clueGradeErrorWordId, setClueGradeErrorWordId] = useState<string | null>(null);

  const draftSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persistSnapshotRef = useRef<{
    deckPath: string;
    puzzle: NonNullable<typeof puzzle>;
    inputByWord: Record<string, string>;
    view: CrosswordView;
    blindMode: boolean;
    selectedWordId: string | null;
    gradedWordIds: Set<string>;
  } | null>(null);

  useEffect(() => {
    if (!puzzle) return;
    setClueGradeErrorWordId(null);
    const fp = puzzleFingerprint(puzzle.words);
    const draft = loadCrosswordDraft(deckPath);
    const matching = Boolean(draft && draft.v === 1 && draft.fingerprint === fp);

    if (!matching) {
      setGradedWordIds(new Set());
      setBlindMode(true);
      setView("across");
      setSelectedWordId(null);
    } else {
      const d = draft!;
      setBlindMode(d.blindMode);
      setView(d.view);
      setGradedWordIds(
        new Set(puzzle.words.filter((w) => d.gradedKeys.includes(wordRestoreKey(w))).map((w) => w.id)),
      );
      const selId = d.selectedKey
        ? (puzzle.words.find((w) => wordRestoreKey(w) === d.selectedKey)?.id ?? null)
        : null;
      setSelectedWordId(selId);
    }

    setInputByWord((prev) => {
      const next: Record<string, string> = { ...prev };
      for (const w of puzzle.words) {
        const k = wordRestoreKey(w);
        const fromDraft = matching ? draft!.slots[k] : undefined;
        if (fromDraft !== undefined) {
          next[w.id] = toSlotString(fromDraft, w.answer.length);
        } else if (next[w.id] === undefined) {
          next[w.id] = ".".repeat(w.answer.length);
        } else {
          next[w.id] = toSlotString(next[w.id], w.answer.length);
        }
      }
      return next;
    });
  }, [puzzle, deckPath]);

  const allWordsFilled = useMemo(() => {
    if (!puzzle || puzzle.words.length === 0) return false;
    return puzzle.words.every((w) => isCrosswordSlotComplete(inputByWord[w.id] ?? "", w.answer.length));
  }, [puzzle, inputByWord]);

  const allWordsGraded = useMemo(() => {
    if (!puzzle || puzzle.words.length === 0) return false;
    return puzzle.words.every((w) => gradedWordIds.has(w.id));
  }, [puzzle, gradedWordIds]);

  /** Filled grid is not enough: each word must be graded (scheduler / due date) before the session ends. */
  const puzzleSessionComplete = allWordsFilled && allWordsGraded;

  if (puzzle && !puzzleSessionComplete) {
    persistSnapshotRef.current = {
      deckPath,
      puzzle,
      inputByWord,
      view,
      blindMode,
      selectedWordId,
      gradedWordIds,
    };
  } else {
    persistSnapshotRef.current = null;
  }

  useEffect(() => {
    if (puzzleSessionComplete) clearCrosswordDraft(deckPath);
  }, [puzzleSessionComplete, deckPath]);

  useEffect(() => {
    if (!puzzle || puzzleSessionComplete) {
      if (draftSaveTimerRef.current) {
        clearTimeout(draftSaveTimerRef.current);
        draftSaveTimerRef.current = null;
      }
      return;
    }
    if (draftSaveTimerRef.current) clearTimeout(draftSaveTimerRef.current);
    draftSaveTimerRef.current = setTimeout(() => {
      draftSaveTimerRef.current = null;
      saveCrosswordDraft(
        deckPath,
        buildCrosswordDraft({
          puzzle,
          inputByWord,
          view,
          blindMode,
          selectedWordId,
          gradedWordIds,
        }),
      );
    }, 280);
    return () => {
      if (draftSaveTimerRef.current) {
        clearTimeout(draftSaveTimerRef.current);
        draftSaveTimerRef.current = null;
      }
    };
  }, [puzzle, deckPath, inputByWord, view, blindMode, selectedWordId, gradedWordIds, puzzleSessionComplete]);

  useEffect(() => {
    const flush = () => {
      const snap = persistSnapshotRef.current;
      if (!snap) return;
      saveCrosswordDraft(snap.deckPath, buildCrosswordDraft(snap));
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
  }, []);

  useEffect(() => {
    if (!puzzle) return;
    const active = puzzle.words.filter((w) => w.dir === view);
    if (active.length === 0) return;
    setSelectedWordId((prev) => {
      if (prev && active.some((w) => w.id === prev)) return prev;
      return active[0]!.id;
    });
  }, [puzzle, view]);

  /** Words whose typed answer equals the puzzle word (for decoy / reveal logic only — not shown as “correct”). */
  const matchedAcross = useMemo(() => {
    const s = new Set<string>();
    if (!puzzle) return s;
    for (const w of puzzle.words) {
      if (w.dir !== "across") continue;
      const slot = toSlotString(inputByWord[w.id] ?? "", w.answer.length);
      if (!slot.includes(".") && slot === w.answer) s.add(w.id);
    }
    return s;
  }, [puzzle, inputByWord]);

  const matchedDown = useMemo(() => {
    const s = new Set<string>();
    if (!puzzle) return s;
    for (const w of puzzle.words) {
      if (w.dir !== "down") continue;
      const slot = toSlotString(inputByWord[w.id] ?? "", w.answer.length);
      if (!slot.includes(".") && slot === w.answer) s.add(w.id);
    }
    return s;
  }, [puzzle, inputByWord]);

  const selectedWord = useMemo(() => {
    if (!puzzle || !selectedWordId) return undefined;
    return puzzle.words.find((w) => w.id === selectedWordId);
  }, [puzzle, selectedWordId]);

  const onSelectWord = useCallback((wordId: string) => {
    setSelectedWordId(wordId);
  }, []);

  const onChangeSelectedAnswer = useCallback(
    (value: string) => {
      setClueGradeErrorWordId((errId) => (errId != null && errId === selectedWordId ? null : errId));
      if (!selectedWordId || !selectedWord) return;
      const max = selectedWord.answer.length;
      setInputByWord((p) => ({ ...p, [selectedWordId]: toSlotString(value, max) }));
    },
    [selectedWord, selectedWordId],
  );

  const onRevealSelectedAnswer = useCallback(() => {
    if (!selectedWordId || !selectedWord) return;
    setClueGradeErrorWordId((errId) => (errId === selectedWordId ? null : errId));
    const len = selectedWord.answer.length;
    setInputByWord((p) => ({ ...p, [selectedWordId]: toSlotString(selectedWord.answer, len) }));
  }, [selectedWord, selectedWordId]);

  const cardForSelectedWord = useMemo(() => {
    if (!selectedWordId) return undefined;
    const cid = cardIdFromPlacedWordId(selectedWordId);
    return cid ? byId[cid] : undefined;
  }, [byId, selectedWordId]);

  useEffect(() => {
    setShowCardPopup(false);
  }, [selectedWordId]);

  const answerValueForSelected = selectedWordId ? (inputByWord[selectedWordId] ?? "") : "";

  const selectedWordFullyFilled = useMemo(() => {
    if (!selectedWord) return false;
    return isCrosswordSlotComplete(answerValueForSelected, selectedWord.answer.length);
  }, [selectedWord, answerValueForSelected]);

  const submitWordGrade = useCallback(
    async (grade: ReviewGrade) => {
      if (!selectedWordId || !selectedWordFullyFilled || gradingLockRef.current) return;
      const cid = cardIdFromPlacedWordId(selectedWordId);
      const card = cid ? byId[cid] : undefined;
      if (!card || !selectedWord) return;

      const slot = toSlotString(inputByWord[selectedWordId] ?? "", selectedWord.answer.length);
      if (slot !== selectedWord.answer) {
        setClueGradeErrorWordId(selectedWordId);
        return;
      }

      gradingLockRef.current = true;
      setIsGrading(true);
      setClueGradeErrorWordId(null);
      const nowMs = Date.now();
      const fields = scheduleAfterReview(card, grade, nowMs);
      try {
        await dispatch(markScheduleAcrossNoteVariantsLocal({ gradedId: card.id, fields })).unwrap();
        const wid = selectedWordId;
        setGradedWordIds((prev) => {
          const next = new Set(prev);
          next.add(wid);
          return next;
        });
        if (puzzle) {
          const active = puzzle.words.filter((w) => w.dir === view);
          const idx = active.findIndex((w) => w.id === wid);
          const nextGraded = new Set(gradedWordIds);
          nextGraded.add(wid);
          if (idx >= 0) {
            for (let step = 1; step < active.length; step++) {
              const w = active[(idx + step) % active.length]!;
              if (!nextGraded.has(w.id)) {
                setSelectedWordId(w.id);
                break;
              }
            }
          }
        }
      } finally {
        gradingLockRef.current = false;
        setIsGrading(false);
      }
    },
    [byId, dispatch, gradedWordIds, inputByWord, puzzle, selectedWord, selectedWordFullyFilled, selectedWordId, view],
  );

  if (sourceCardIds.length === 0) {
    return (
      <div className="mx-auto max-w-2xl">
        <p className="text-sm text-zinc-500">
          <Link href="/" className="text-sky-400 hover:text-sky-300">
            ← Decks
          </Link>
        </p>
        <h1 className="mt-4 text-xl font-semibold text-zinc-100">Crossword Game</h1>
        <p className="mt-1 truncate text-xs text-zinc-600" title={deckPath}>
          <span className="text-zinc-500">Deck</span> <span className="text-zinc-400">{deckPath}</span>
        </p>
        <p className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900/40 px-5 py-6 text-sm text-zinc-400">
          No cards in this deck path have playable Crossword clues, or none match after filters (suspended / buried
          excluded). Crossword needs{" "}
          <code className="rounded bg-zinc-900 px-1 text-zinc-300">more_questions</code> with{" "}
          <code className="rounded bg-zinc-900 px-1 text-zinc-300">type: &quot;Crossword&quot;</code> and answers that
          yield at least 2 letters (a–z) after normalization.
        </p>
        <p className="mt-4 text-xs leading-relaxed text-zinc-600">
          Local snapshot for this path:{" "}
          <span className="text-zinc-500">
            {deckDebug.inDeck} card(s) in subtree, {deckDebug.dueInDeck} due now, {deckDebug.withMq} with{" "}
            <code className="text-zinc-500">more_questions</code>, {deckDebug.withPlayableCross} with a playable
            Crossword answer.
          </span>{" "}
          If counts are zero, the <span className="text-zinc-500">deck path</span> may not match{" "}
          <code className="text-zinc-500">deck_id</code> on your cards (e.g. <code className="text-zinc-500">French3</code>{" "}
          vs <code className="text-zinc-500">French</code>), or cards have not been pulled into this device yet.
        </p>
        <CrosswordDataDebugPanel deckPath={deckPath} payload={crosswordDebugPayload} />
      </div>
    );
  }

  if (!puzzle) {
    return (
      <div className="mx-auto max-w-2xl">
        <p className="text-sm text-zinc-500">
          <Link href="/" className="text-sky-400 hover:text-sky-300">
            ← Decks
          </Link>
        </p>
        <h1 className="mt-4 text-xl font-semibold text-zinc-100">Crossword Game</h1>
        <p className="mt-1 truncate text-xs text-zinc-600" title={deckPath}>
          <span className="text-zinc-500">Deck</span> <span className="text-zinc-400">{deckPath}</span>
        </p>
        <p className="mt-6 rounded-xl border border-amber-900/50 bg-amber-950/20 px-5 py-6 text-sm text-amber-200/90">
          No playable clues from the selected cards: each Crossword row needs{" "}
          <code className="rounded bg-zinc-900 px-1 text-zinc-300">question</code> and{" "}
          <code className="rounded bg-zinc-900 px-1 text-zinc-300">answer</code>. After normalization (a–z only), the
          answer must normalize to at least 2 letters (a–z). Answers longer than {CROSSWORD_MAX} letters are truncated
          to the first {CROSSWORD_MAX} for the grid (the on-screen cap is {CROSSWORD_MAX}×{CROSSWORD_MAX}).
        </p>
        <p className="mt-4 text-xs leading-relaxed text-zinc-600">
          {deckDebug.dueInDeck > 0 && flatClues.length === 0 ? (
            <>
              You have <span className="text-zinc-500">{deckDebug.dueInDeck}</span> due card(s) in this subtree, but
              none produced clues — check that <code className="text-zinc-500">more_questions</code> survived sync
              (API field <code className="text-zinc-500">more_questions</code> or{" "}
              <code className="text-zinc-500">moreQuestions</code>).
            </>
          ) : null}
        </p>
        <CrosswordDataDebugPanel deckPath={deckPath} payload={crosswordDebugPayload} />
      </div>
    );
  }

  if (puzzleSessionComplete) {
    return (
      <div className="mx-auto max-w-2xl">
        <p className="text-sm text-zinc-500">
          <Link href="/" className="text-sky-400 hover:text-sky-300">
            ← Decks
          </Link>
        </p>
        <h1 className="mt-4 text-xl font-semibold text-zinc-100">Crossword</h1>
        <p className="mt-2 text-sm text-zinc-400">
          You&apos;ve filled every word and set the next due for each clue in this grid for{" "}
          <code className="text-zinc-300">{deckPath}</code>.
        </p>
        <p className="mt-6 text-xs text-zinc-600">
          Again / Hard / Good / Easy on each full word updates scheduling for that note; sync matches the rest of the
          app.
        </p>
        <Link
          href="/"
          className="mt-8 inline-flex rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500"
        >
          Back to decks
        </Link>
        <CrosswordDataDebugPanel deckPath={deckPath} payload={crosswordDebugPayload} />
      </div>
    );
  }

  const answerValue = answerValueForSelected;
  const answerLen = selectedWord?.answer.length ?? 0;

  return (
    <div className="mx-auto max-w-3xl min-w-0 px-3 sm:px-4">
      <p className="text-sm text-zinc-500">
        <Link href="/" className="text-sky-400 hover:text-sky-300">
          ← Decks
        </Link>
      </p>
      <h1 className="mt-4 text-xl font-semibold text-zinc-100">Crossword Game</h1>
      <p className="mt-1 truncate text-xs text-zinc-600" title={deckPath}>
        <span className="text-zinc-500">Deck</span> <span className="text-zinc-400">{deckPath}</span>
      </p>

      {usingNotDueFallback ? (
        <p className="mt-3 rounded-lg border border-violet-900/50 bg-violet-950/25 px-3 py-2 text-xs text-violet-200/95">
          No cards are <span className="font-medium text-violet-100">due right now</span> in this path. Showing
          Crossword clues from other cards in the same deck anyway so you can still practice (scheduling still applies
          when you grade a word).
        </p>
      ) : null}

      <p className="mt-4 text-sm leading-relaxed text-zinc-400">
        This is not a classic crossword: at crossings the <strong className="font-medium text-zinc-200">across</strong>{" "}
        and <strong className="font-medium text-zinc-200">down</strong> answers use{" "}
        <strong className="font-medium text-zinc-200">different</strong> letters in the same cell. Toggle views to work
        in each direction. Click a square to pick a word, then enter letters with the on-screen keyboard (or your
        physical keyboard).{" "}
        <strong className="font-medium text-zinc-200">Blind mode</strong> (default) hides crossing-direction hint
        letters; turn on <strong className="font-medium text-zinc-200">Hints</strong> to bring back rose-tinted
        stand-ins when the perpendicular word has letters. Nothing in the UI labels a clue as right or wrong. When the
        word is full length in the letter slots, rate with the same buttons as flashcards to set the next due.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">View</span>
          <div className="flex rounded-lg border border-zinc-700 bg-zinc-900/80 p-0.5">
            <button
              type="button"
              onClick={() => setView("across")}
              className={`rounded-md px-4 py-2 text-sm font-medium ${
                view === "across" ? "bg-sky-600 text-white" : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Across
            </button>
            <button
              type="button"
              onClick={() => setView("down")}
              className={`rounded-md px-4 py-2 text-sm font-medium ${
                view === "down" ? "bg-violet-600 text-white" : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Down
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">Crossings</span>
          <div className="flex rounded-lg border border-zinc-700 bg-zinc-900/80 p-0.5">
            <button
              type="button"
              onClick={() => setBlindMode(true)}
              className={`rounded-md px-4 py-2 text-sm font-medium ${
                blindMode ? "bg-zinc-600 text-white" : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Blind
            </button>
            <button
              type="button"
              onClick={() => setBlindMode(false)}
              className={`rounded-md px-4 py-2 text-sm font-medium ${
                !blindMode ? "bg-teal-600 text-white" : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Hints
            </button>
          </div>
        </div>
      </div>

      <div className="mt-8 flex flex-col gap-10 lg:flex-row lg:items-start">
        <section>
          <h2 className="text-xs font-medium uppercase tracking-wide text-zinc-500">Grid</h2>
          <p className="mt-1 max-w-sm text-xs text-zinc-600">
            Max {puzzle.size}×{puzzle.size} (cap 15×15). Click a square for the current view ({view}).
            {blindMode
              ? " Blind mode: only letters you type in the active direction appear in that view."
              : " Rose letters = provisional crossing hints from the perpendicular direction."}
          </p>
          <div className="mt-4 w-full min-w-0 max-w-full">
            <CrosswordBoard
              puzzle={puzzle}
              view={view}
              inputByWord={inputByWord}
              matchedAcross={matchedAcross}
              matchedDown={matchedDown}
              decoySeedPrefix={deckPath}
              selectedWordId={selectedWordId}
              onSelectWord={onSelectWord}
              wordStartNumbers={wordStartNumbers}
              gradedWordIds={gradedWordIds}
              blindMode={blindMode}
            />
          </div>
        </section>

        <section className="min-w-0 flex-1">
          {selectedWord ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
              <p
                className={`min-w-0 flex-1 text-sm leading-snug ${
                  clueGradeErrorWordId === selectedWord.id
                    ? "font-medium text-rose-400"
                    : "text-zinc-300"
                }`}
              >
                {selectedWord.question}
              </p>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                {cardForSelectedWord ? (
                  <button
                    type="button"
                    onClick={() => setShowCardPopup(true)}
                    className="rounded-lg border border-zinc-600 bg-zinc-900/80 px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-zinc-500 hover:bg-zinc-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 sm:text-sm"
                  >
                    View card
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={onRevealSelectedAnswer}
                  className="rounded-lg border border-zinc-600 bg-zinc-900/80 px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-zinc-500 hover:bg-zinc-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 sm:text-sm"
                >
                  Reveal answer
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-zinc-500">Select a word to type.</p>
          )}
          <div className="mt-4">
            <CrosswordLetterKeyboard
              value={answerValue}
              slotCount={answerLen}
              disabled={!selectedWord}
              onValueChange={onChangeSelectedAnswer}
              selectionKey={selectedWordId ?? ""}
            />
          </div>
          {selectedWordFullyFilled && cardForSelectedWord && selectedWord ? (
            <>
              <CrosswordGradeButtons
                card={cardForSelectedWord}
                disabled={isGrading}
                onGrade={submitWordGrade}
              />
              {selectedWord.variantType ? (
                <div className="mt-3 text-right text-[11px] text-zinc-500">
                  <span className="text-zinc-600">Variant type</span>{" "}
                  <span className="font-medium text-zinc-300">
                    {humanizeVariantType(selectedWord.variantType)}
                  </span>
                </div>
              ) : null}
            </>
          ) : null}
        </section>
      </div>

      {cardForSelectedWord ? (
        <CrosswordFlashcardPopup
          open={showCardPopup}
          card={cardForSelectedWord}
          title="Flashcard"
          onClose={() => setShowCardPopup(false)}
        />
      ) : null}

      <CrosswordDataDebugPanel deckPath={deckPath} payload={crosswordDebugPayload} />
    </div>
  );
}
