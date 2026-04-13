"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";

import { hydrateFromIDB, markFlashcardReviewDeferSiblingDuesLocal } from "@/features/sync/syncThunks";
import { dueCardIdsForDeck } from "@/lib/cards/deckTree";
import {
  intervalHintForGrade,
  scheduleAfterReview,
  type ReviewGrade,
} from "@/lib/cards/scheduleReview";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { getEffectiveCardVariant } from "@/lib/flashcards/effectiveCardVariant";
import { resolveFlashcardFaces } from "@/lib/flashcards/resolveFlashcardFaces";

type Props = {
  deckPath: string;
};

function titleCaseWords(segment: string): string {
  return segment
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

/** Note-type / variant labels in the study badge (handles language `front->back+context` style names). */
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

function FlashcardVariantBadge({
  noteType,
  storedCardVariant,
  effectiveCardVariant,
}: {
  noteType?: string;
  storedCardVariant?: string;
  effectiveCardVariant: string;
}) {
  const ntRaw = noteType?.trim() ?? "";
  const stored = storedCardVariant?.trim() ?? "";
  const eff = effectiveCardVariant.trim();
  const ntLower = ntRaw.toLowerCase();
  const typedNote = ntLower === "vocab" || ntLower === "language" || ntLower === "knowledge";
  const title = [
    `note_type: ${ntRaw || "—"}`,
    `stored card_variant: ${stored || "(not set)"}`,
    `layout (effective): ${eff || "—"}`,
  ].join("\n");

  return (
    <div
      className="inline-flex max-w-[min(100%,16rem)] flex-col items-end gap-1 rounded-md border border-zinc-700/90 bg-zinc-950/70 px-2.5 py-2 text-right"
      title={title}
    >
      <div className="w-full border-b border-zinc-800/80 pb-1">
        <p className="text-[9px] font-medium uppercase tracking-wider text-zinc-600">Note type</p>
        <p className="mt-0.5 text-[11px] font-semibold leading-tight text-zinc-400">
          {humanizeKindLabel(ntRaw)}
        </p>
      </div>
      <div>
        <p className="text-[9px] font-medium uppercase tracking-wider text-zinc-600">Card variant</p>
        <p className="mt-0.5 text-[11px] font-semibold leading-tight text-zinc-300">
          {humanizeKindLabel(eff)}
        </p>
        {!stored && eff && typedNote ? (
          <p className="mt-0.5 max-w-[14rem] text-[9px] leading-snug text-zinc-600">
            Not on document — default layout
          </p>
        ) : null}
      </div>
    </div>
  );
}

const CUSTOM_DUE_TIERS = [
  { min: 0, max: 10, label: "0–10 days" },
  { min: 10, max: 30, label: "10–30 days" },
  { min: 30, max: 60, label: "30–60 days" },
] as const;

const CUSTOM_DUE_INITIAL_TIER = CUSTOM_DUE_TIERS.length - 1;
const MS_PER_DAY = 86_400_000;

function formatCustomDuePreview(days: number, nowMs: number): string {
  if (days <= 0) return "Due now";
  const t = new Date(nowMs + days * MS_PER_DAY);
  const dateStr = t.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const dayLabel = days === 1 ? "1 day" : `${days} days`;
  return `${dayLabel} · ${dateStr}`;
}

function CustomDueControl({
  disabled,
  nowMs,
  onApply,
}: {
  disabled: boolean;
  nowMs: number;
  onApply: (daysFromNow: number) => void | Promise<void>;
}) {
  const [tier, setTier] = useState(CUSTOM_DUE_INITIAL_TIER);
  const [days, setDays] = useState(45);
  const { min, max, label } = CUSTOM_DUE_TIERS[tier];
  const tierMaxIndex = CUSTOM_DUE_TIERS.length - 1;
  const displayDays = Math.min(max, Math.max(min, days));

  const goTier = (nextTier: number) => {
    if (nextTier < 0 || nextTier > tierMaxIndex || nextTier === tier) return;
    const { min: nmin, max: nmax } = CUSTOM_DUE_TIERS[nextTier];
    const clamped = Math.min(max, Math.max(min, days));
    setTier(nextTier);
    setDays(Math.min(nmax, Math.max(nmin, clamped)));
  };

  return (
    <div className="mt-8 rounded-xl border border-zinc-800/90 bg-zinc-950/40 px-4 py-4">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Custom due</p>
      <p className="mt-1 text-xs text-zinc-600">
        Slide to choose days from now. Use − / + to switch between 30–60, 10–30, and 0–10 day spans (starts at
        30–60).
      </p>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          disabled={disabled || tier <= 0}
          aria-label="Shorter day range (toward 0–10 days)"
          onClick={() => goTier(tier - 1)}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-zinc-600 text-lg font-medium text-zinc-200 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          −
        </button>
        <div className="min-w-[6.5rem] flex-1 text-center text-sm tabular-nums text-zinc-300 sm:min-w-[8rem]">
          {label}
        </div>
        <button
          type="button"
          disabled={disabled || tier >= tierMaxIndex}
          aria-label="Longer day range (toward 30–60 days)"
          onClick={() => goTier(tier + 1)}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-zinc-600 text-lg font-medium text-zinc-200 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          +
        </button>
      </div>
      <div className="mt-4">
        <label htmlFor="custom-due-slider" className="sr-only">
          Days until due in this range
        </label>
        <input
          id="custom-due-slider"
          type="range"
          disabled={disabled}
          min={min}
          max={max}
          step={1}
          value={displayDays}
          onChange={(e) => setDays(Number(e.target.value))}
          className="w-full accent-sky-500 disabled:opacity-50"
        />
        <div className="mt-1 flex justify-between text-xs tabular-nums text-zinc-600">
          <span>{min} d</span>
          <span>{max} d</span>
        </div>
      </div>
      <p className="mt-2 text-center text-sm text-zinc-400">{formatCustomDuePreview(displayDays, nowMs)}</p>
      <button
        type="button"
        disabled={disabled}
        onClick={() => void onApply(displayDays)}
        className="mt-4 w-full rounded-lg border border-zinc-600 bg-zinc-900/80 py-2.5 text-sm font-medium text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
      >
        Apply custom due &amp; next card
      </button>
    </div>
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

export function StudySession({ deckPath }: Props) {
  const dispatch = useAppDispatch();
  const { byId, allIds } = useAppSelector((s) => s.cards);

  useEffect(() => {
    void dispatch(hydrateFromIDB());
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

  const { dueAllIds, queue } = useMemo(() => {
    void dueClock;
    // eslint-disable-next-line react-hooks/purity -- wall-clock for `due_at` vs now
    const nowMs = Date.now();
    return {
      dueAllIds: dueCardIdsForDeck(byId, allIds, deckPath, nowMs, "all"),
      queue: dueCardIdsForDeck(byId, allIds, deckPath, nowMs, "flashcard"),
    };
  }, [byId, allIds, deckPath, dueClock]);

  const crosswordOnlyDue = dueAllIds.length > 0 && queue.length === 0;

  /**
   * Due queue is rebuilt from Redux after every grade (cards may drop out). Always take the next
   * card as `queue[0]`; do not walk by numeric index or finishing one card can leave `index` past
   * the end and incorrectly show "Session complete" while another card is still due.
   */
  const [answeredInSession, setAnsweredInSession] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [isGrading, setIsGrading] = useState(false);
  const gradingLockRef = useRef(false);

  useEffect(() => {
    setAnsweredInSession(0);
    setRevealed(false);
  }, [deckPath]);

  useEffect(() => {
    if (queue.length === 0) {
      setRevealed(false);
    }
  }, [queue.length]);

  const currentId = queue.length > 0 ? queue[0] : undefined;
  const card = currentId ? byId[currentId] : undefined;

  const faces = useMemo(() => {
    if (!card) {
      return { front: null as ReactNode, back: null as ReactNode };
    }
    return resolveFlashcardFaces(card);
  }, [card]);

  const showAnswer = useCallback(() => setRevealed(true), []);

  const submitGrade = useCallback(
    async (grade: ReviewGrade) => {
      if (!card || gradingLockRef.current) return;
      gradingLockRef.current = true;
      setIsGrading(true);
      const nowMs = Date.now();
      const fields = scheduleAfterReview(card, grade, nowMs);
      try {
        await dispatch(markFlashcardReviewDeferSiblingDuesLocal({ gradedId: card.id, fields, nowMs })).unwrap();
        setRevealed(false);
        setAnsweredInSession((n) => n + 1);
      } finally {
        gradingLockRef.current = false;
        setIsGrading(false);
      }
    },
    [card, dispatch],
  );

  const submitCustomDue = useCallback(
    async (daysFromNow: number) => {
      if (!card || gradingLockRef.current) return;
      gradingLockRef.current = true;
      setIsGrading(true);
      const nowMs = Date.now();
      const due_at = new Date(nowMs + daysFromNow * MS_PER_DAY).toISOString();
      const interval_days = daysFromNow;
      try {
        await dispatch(
          markFlashcardReviewDeferSiblingDuesLocal({
            gradedId: card.id,
            nowMs,
            fields: {
              due_at,
              interval_days,
              last_reviewed_at: new Date(nowMs).toISOString(),
              relearn_step: undefined,
            },
          }),
        ).unwrap();
        setRevealed(false);
        setAnsweredInSession((n) => n + 1);
      } finally {
        gradingLockRef.current = false;
        setIsGrading(false);
      }
    },
    [card, dispatch],
  );

  const hintNowMs = useMemo(() => {
    if (!revealed || !currentId) return 0;
    return Date.now();
  }, [revealed, currentId]);

  useEffect(() => {
    if (!card) return;
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
  }, [card, revealed, isGrading, showAnswer, submitGrade]);

  if (queue.length === 0) {
    return (
      <div className="mx-auto max-w-2xl">
        <p className="text-sm text-zinc-500">
          <Link href="/" className="text-sky-400 hover:text-sky-300">
            ← Decks
          </Link>
        </p>
        {answeredInSession > 0 ? (
          <>
            <h1 className="mt-4 text-xl font-semibold text-zinc-100">Session complete</h1>
            <p className="mt-2 text-sm text-zinc-400">
              You went through the due queue for <code className="text-zinc-300">{deckPath}</code>.
            </p>
            <p className="mt-6 text-xs text-zinc-600">
              Scheduling updates are saved locally and marked for sync; they are pushed when the tab hides (or when you
              use Push on the home screen).
            </p>
            <Link
              href="/"
              className="mt-8 inline-flex rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500"
            >
              Back to decks
            </Link>
          </>
        ) : crosswordOnlyDue ? (
          <>
            <h1 className="mt-4 text-xl font-semibold text-zinc-100">Study</h1>
            <p className="mt-2 text-sm text-zinc-400">
              Deck <code className="text-zinc-300">{deckPath}</code>
            </p>
            <p className="mt-8 rounded-xl border border-zinc-800 bg-zinc-900/40 px-5 py-6 text-center text-sm text-zinc-400">
              You have{" "}
              <span className="font-medium tabular-nums text-zinc-200">{dueAllIds.length}</span> due card
              {dueAllIds.length === 1 ? "" : "s"} on <span className="text-zinc-300">more_questions</span> rows with
              crossword-only content (no flashcard drill follow-ups). Open{" "}
              <span className="text-zinc-300">Crossword Game</span> to review them; grading applies the same next
              schedule to every variant of that note, so you will not owe a separate flashcard pass for the same cycle.
            </p>
            <Link
              href={`/study?deck=${encodeURIComponent(deckPath)}&mode=crossword`}
              className="mt-6 inline-flex rounded-lg bg-violet-700 px-4 py-2 text-sm font-medium text-white hover:bg-violet-600"
            >
              Open Crossword Game
            </Link>
          </>
        ) : (
          <>
            <h1 className="mt-4 text-xl font-semibold text-zinc-100">Study</h1>
            <p className="mt-2 text-sm text-zinc-400">
              Deck <code className="text-zinc-300">{deckPath}</code>
            </p>
            <p className="mt-8 rounded-xl border border-zinc-800 bg-zinc-900/40 px-5 py-6 text-center text-sm text-zinc-400">
              Nothing due in this deck right now (including subdecks). Counts use your local card data and
              <code className="mx-1 text-zinc-500"> due_at </code>
              ≤ now.
            </p>
          </>
        )}
      </div>
    );
  }

  if (!card) {
    return (
      <div className="mx-auto max-w-2xl text-sm text-zinc-500">
        <Link href="/" className="text-sky-400 hover:text-sky-300">
          ← Decks
        </Link>
        <p className="mt-6">Loading card…</p>
      </div>
    );
  }

  const position = answeredInSession + 1;
  const totalThisSession = answeredInSession + queue.length;
  const remaining = queue.length - 1;

  return (
    <div className="mx-auto max-w-2xl">
      <p className="text-sm text-zinc-500">
        <Link href="/" className="text-sky-400 hover:text-sky-300">
          ← Decks
        </Link>
      </p>
      <div className="mt-4 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xl font-semibold text-zinc-100">Study</h1>
        <p className="text-sm tabular-nums text-zinc-500">
          {position} / {totalThisSession}
          {remaining > 0 ? <span className="text-zinc-600"> · {remaining} left after this</span> : null}
        </p>
      </div>
      <p className="mt-1 truncate text-xs text-zinc-600" title={deckPath}>
        <span className="text-zinc-500">Deck</span> <span className="text-zinc-400">{deckPath}</span>
      </p>

      <article
        className="mt-8 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6 shadow-lg sm:p-8"
        aria-live="polite"
      >
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Question</p>
        <div className="mt-3 min-h-[5rem] text-lg leading-relaxed text-zinc-100">{faces.front}</div>

        {!revealed ? (
          <div className="mt-8">
            <button
              type="button"
              onClick={showAnswer}
              className="rounded-xl bg-sky-600 px-5 py-3 text-sm font-semibold text-white hover:bg-sky-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
            >
              Show answer
            </button>
            <p className="mt-3 text-xs text-zinc-600">Tip: press Space or Enter</p>
          </div>
        ) : (
          <>
            <div className="my-8 border-t border-zinc-800" />
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Answer</p>
            <div className="mt-3 min-h-[4rem] text-lg leading-relaxed text-zinc-100">{faces.back}</div>
          </>
        )}

        {revealed ? (
          <div className="mt-8">
            <p className="mb-3 text-xs font-medium uppercase tracking-wide text-zinc-500">How hard was it?</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {GRADE_ROWS.map(({ grade, label, className }) => (
                <button
                  key={grade}
                  type="button"
                  disabled={isGrading}
                  onClick={() => void submitGrade(grade)}
                  className={`flex flex-col items-stretch rounded-xl border px-3 py-3 text-left text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 disabled:opacity-50 ${className}`}
                >
                  <span>{label}</span>
                  <span className="mt-1 text-xs font-normal tabular-nums opacity-80">
                    {hintNowMs ? intervalHintForGrade(card, grade, hintNowMs) : "—"}
                  </span>
                </button>
              ))}
            </div>
            <p className="mt-3 text-xs text-zinc-600">Keys 1–4 = Again / Hard / Good / Easy · Space or Enter still shows the answer</p>
            {currentId ? (
              <CustomDueControl
                key={currentId}
                disabled={isGrading}
                nowMs={hintNowMs || Date.now()}
                onApply={submitCustomDue}
              />
            ) : null}
          </div>
        ) : null}

        <div className="mt-6 flex justify-end sm:mt-8">
          <FlashcardVariantBadge
            noteType={card.note_type}
            storedCardVariant={card.card_variant}
            effectiveCardVariant={getEffectiveCardVariant(card)}
          />
        </div>
      </article>
    </div>
  );
}
