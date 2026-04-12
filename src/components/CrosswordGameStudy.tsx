"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { hydrateFromIDB, markCardDirtyLocal } from "@/features/sync/syncThunks";
import { CrosswordBoard } from "@/components/crossword/CrosswordBoard";
import { CrosswordLetterKeyboard } from "@/components/crossword/CrosswordLetterKeyboard";
import { buildPuzzle } from "@/lib/crossword/buildPuzzle";
import {
  isCrosswordSlotComplete,
  normalizeCrosswordAnswer,
  toSlotString,
} from "@/lib/crossword/normalizeAnswer";
import type { CrosswordView } from "@/lib/crossword/types";
import { dueCardIdsForDeck } from "@/lib/cards/deckTree";
import {
  intervalHintForGrade,
  scheduleAfterReview,
  type ReviewGrade,
} from "@/lib/cards/scheduleReview";
import { cardIdFromPlacedWordId } from "@/lib/crossword/wordIdCard";
import { wordStartNumberByCell } from "@/lib/crossword/wordNumbers";
import type { CardEntity } from "@/features/cards/cardsSlice";
import {
  crosswordQuestionsFromCard,
  resolveCrosswordGradeCardId,
} from "@/lib/cards/crosswordFromCard";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";

type Props = {
  deckPath: string;
};

function clueInputsFromDueCards(
  byId: Parameters<typeof dueCardIdsForDeck>[0],
  dueIds: string[],
  allIds: readonly string[],
): { id: string; question: string; answer: string }[] {
  const out: { id: string; question: string; answer: string }[] = [];
  const seenClue = new Set<string>();
  let seq = 0;
  for (const cardId of dueIds) {
    const card = byId[cardId];
    if (!card) continue;
    const cq = crosswordQuestionsFromCard(card);
    if (!cq.length) continue;
    for (const q of cq) {
      const answer = normalizeCrosswordAnswer(q.answer ?? "");
      if (answer.length < 2) continue;
      const gradeId = resolveCrosswordGradeCardId(
        card,
        q.variantType ?? (q as { variant_type?: string }).variant_type,
        byId,
        allIds,
      );
      const question = q.question?.trim() || "(no clue)";
      const dedupeKey = `${gradeId}\t${answer}\t${question}`;
      if (seenClue.has(dedupeKey)) continue;
      seenClue.add(dedupeKey);
      const id = `${gradeId}::${seq}`;
      seq += 1;
      out.push({ id, question, answer });
    }
  }
  return out;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh interval hints after `markCardDirtyLocal` bumps `updated_at`
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

  const dueIds = useMemo(() => {
    const nowMs = Date.now();
    return dueCardIdsForDeck(byId, allIds, deckPath, nowMs);
  }, [byId, allIds, deckPath]);

  const flatClues = useMemo(() => clueInputsFromDueCards(byId, dueIds, allIds), [byId, dueIds, allIds]);

  const puzzle = useMemo(() => buildPuzzle(flatClues), [flatClues]);

  const wordStartNumbers = useMemo(() => (puzzle ? wordStartNumberByCell(puzzle) : new Map<string, number>()), [puzzle]);

  const [view, setView] = useState<CrosswordView>("across");
  const [blindMode, setBlindMode] = useState(true);
  const [inputByWord, setInputByWord] = useState<Record<string, string>>({});
  const [selectedWordId, setSelectedWordId] = useState<string | null>(null);
  const [isGrading, setIsGrading] = useState(false);
  const [gradedWordIds, setGradedWordIds] = useState(() => new Set<string>());

  useEffect(() => {
    setGradedWordIds(new Set());
    setBlindMode(true);
  }, [puzzle]);

  useEffect(() => {
    setInputByWord((prev) => {
      if (!puzzle) return prev;
      const next = { ...prev };
      for (const w of puzzle.words) {
        if (next[w.id] === undefined) {
          next[w.id] = ".".repeat(w.answer.length);
        } else {
          next[w.id] = toSlotString(next[w.id], w.answer.length);
        }
      }
      return next;
    });
  }, [puzzle]);

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
      if (!selectedWordId || !selectedWord) return;
      const max = selectedWord.answer.length;
      setInputByWord((p) => ({ ...p, [selectedWordId]: toSlotString(value, max) }));
    },
    [selectedWord, selectedWordId],
  );

  const cardForSelectedWord = useMemo(() => {
    if (!selectedWordId) return undefined;
    const cid = cardIdFromPlacedWordId(selectedWordId);
    return cid ? byId[cid] : undefined;
  }, [byId, selectedWordId]);

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
      if (!card) return;
      gradingLockRef.current = true;
      setIsGrading(true);
      const nowMs = Date.now();
      const fields = scheduleAfterReview(card, grade, nowMs);
      try {
        await dispatch(markCardDirtyLocal({ id: card.id, fields })).unwrap();
        const wid = selectedWordId;
        const gradedCid = cid;
        setGradedWordIds((prev) => {
          const next = new Set(prev);
          next.add(wid);
          return next;
        });
        if (puzzle) {
          const active = puzzle.words.filter((w) => w.dir === view);
          const idx = active.findIndex((w) => w.id === wid);
          if (idx >= 0) {
            for (let step = 1; step < active.length; step++) {
              const w = active[(idx + step) % active.length]!;
              const wCid = cardIdFromPlacedWordId(w.id);
              if (wCid && wCid !== gradedCid) {
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
    [byId, dispatch, puzzle, selectedWordFullyFilled, selectedWordId, view],
  );

  const allWordsFilled = useMemo(() => {
    if (!puzzle || puzzle.words.length === 0) return false;
    return puzzle.words.every((w) => isCrosswordSlotComplete(inputByWord[w.id] ?? "", w.answer.length));
  }, [puzzle, inputByWord]);

  if (dueIds.length === 0) {
    return (
      <div className="mx-auto max-w-2xl">
        <p className="text-sm text-zinc-500">
          <Link href="/" className="text-sky-400 hover:text-sky-300">
            ← Decks
          </Link>
        </p>
        <h1 className="mt-4 text-xl font-semibold text-zinc-100">Crossword Game</h1>
        <p className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900/40 px-5 py-6 text-sm text-zinc-400">
          Nothing due in this deck right now — crossword uses the same due queue as flashcards.
        </p>
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
          No playable clues: add{" "}
          <code className="rounded bg-zinc-900 px-1 text-zinc-300">more_questions</code> entries (each{" "}
          <code className="rounded bg-zinc-900 px-1 text-zinc-300">type: &quot;Crossword&quot;</code>, plus{" "}
          <code className="rounded bg-zinc-900 px-1 text-zinc-300">question</code> /{" "}
          <code className="rounded bg-zinc-900 px-1 text-zinc-300">answer</code>) with answers of at least{" "}
          2 letters (letters only; case is ignored) on due cards in this deck.
        </p>
      </div>
    );
  }

  if (allWordsFilled) {
    return (
      <div className="mx-auto max-w-2xl">
        <p className="text-sm text-zinc-500">
          <Link href="/" className="text-sky-400 hover:text-sky-300">
            ← Decks
          </Link>
        </p>
        <h1 className="mt-4 text-xl font-semibold text-zinc-100">Crossword</h1>
        <p className="mt-2 text-sm text-zinc-400">
          You&apos;ve filled every word in this grid for <code className="text-zinc-300">{deckPath}</code>.
        </p>
        <p className="mt-6 text-xs text-zinc-600">
          Rate clues with Again / Hard / Good / Easy while you play to update scheduling; sync matches the rest of the
          app.
        </p>
        <Link
          href="/"
          className="mt-8 inline-flex rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500"
        >
          Back to decks
        </Link>
      </div>
    );
  }

  const answerValue = answerValueForSelected;
  const answerLen = selectedWord?.answer.length ?? 0;

  return (
    <div className="mx-auto max-w-3xl">
      <p className="text-sm text-zinc-500">
        <Link href="/" className="text-sky-400 hover:text-sky-300">
          ← Decks
        </Link>
      </p>
      <h1 className="mt-4 text-xl font-semibold text-zinc-100">Crossword Game</h1>
      <p className="mt-1 truncate text-xs text-zinc-600" title={deckPath}>
        <span className="text-zinc-500">Deck</span> <span className="text-zinc-400">{deckPath}</span>
      </p>

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
          <div className="mt-4 overflow-x-auto">
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
            <p className="text-sm text-zinc-300">{selectedWord.question}</p>
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
          {selectedWordFullyFilled && cardForSelectedWord ? (
            <CrosswordGradeButtons card={cardForSelectedWord} disabled={isGrading} onGrade={submitWordGrade} />
          ) : null}
        </section>
      </div>
    </div>
  );
}
