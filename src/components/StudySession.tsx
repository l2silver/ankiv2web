"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";

import { NoteContentFieldsForm } from "@/components/NoteContentFieldsForm";
import { hydrateFromIDB, markCardDirtyLocal, markFlashcardReviewDeferSiblingDuesLocal } from "@/features/sync/syncThunks";
import { dueCardIdsForDeck } from "@/lib/cards/deckTree";
import { suspendStudyCardVariant } from "@/lib/cards/studySuspend";
import { maxDueDaysFromNow } from "@/lib/cards/dueCeiling";
import {
  intervalHintForGrade,
  scheduleAfterReview,
  type ReviewGrade,
} from "@/lib/cards/scheduleReview";
import { assignPermanentSessionImages } from "@/lib/permanentDeck/assignPermanentImages";
import { isPermanentDeckCard, isPermanentDeckPath } from "@/lib/permanentDeck/isPermanentDeck";
import {
  permanentIntervalHint,
  schedulePermanentReview,
} from "@/lib/permanentDeck/schedulePermanentReview";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { getEffectiveCardVariant } from "@/lib/flashcards/effectiveCardVariant";
import { resolveFlashcardFaces } from "@/lib/flashcards/resolveFlashcardFaces";
import {
  appendQueueHeadToSessionTrailIfAtEnd,
  canGoBackInSessionTrail,
  emptySessionTrailState,
  goBackInSessionTrail,
  initSessionTrailIfEmpty,
  sessionTrailDisplayId,
  truncateSessionTrailOnFinish,
  type SessionTrailState,
} from "@/lib/study/studySessionTrail";

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

function seededOrderKey(seed: string, cardId: string): number {
  const payload = `${seed}\0${cardId}`;
  let h = 2166136261;
  for (let i = 0; i < payload.length; i++) {
    h ^= payload.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function sessionSeedString(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    // ignore
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function CustomDueStickyBar({
  disabled,
  onApply,
}: {
  disabled: boolean;
  onApply: (daysFromNow: number) => void | Promise<void>;
}) {
  const [tier, setTier] = useState(CUSTOM_DUE_INITIAL_TIER);
  const [days, setDays] = useState(45);
  const { min, max } = CUSTOM_DUE_TIERS[tier];
  const tierMaxIndex = CUSTOM_DUE_TIERS.length - 1;
  const displayDays = Math.min(max, Math.max(min, days));

  const goTier = (nextTier: number) => {
    if (nextTier < 0 || nextTier > tierMaxIndex || nextTier === tier) return;
    const { min: nmin, max: nmax } = CUSTOM_DUE_TIERS[nextTier];
    const clamped = Math.min(max, Math.max(min, days));
    setTier(nextTier);
    setDays(Math.min(nmax, Math.max(nmin, clamped)));
  };

  const apply = useCallback(() => {
    void onApply(displayDays);
  }, [displayDays, onApply]);

  return (
    <div className="mb-2.5 flex items-center gap-2">
      <button
        type="button"
        disabled={disabled || tier <= 0}
        aria-label="Shorter custom due range"
        onClick={() => goTier(tier - 1)}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-zinc-700 text-base font-medium text-zinc-300 hover:bg-zinc-900 disabled:opacity-40"
      >
        −
      </button>
      <input
        type="range"
        disabled={disabled}
        min={min}
        max={max}
        step={1}
        value={displayDays}
        aria-label="Custom due days"
        onChange={(e) => setDays(Number(e.target.value))}
        onPointerUp={apply}
        onKeyUp={(e) => {
          if (e.key === "Enter" || e.key === " ") apply();
        }}
        className="min-w-0 flex-1 accent-sky-500 disabled:opacity-50"
      />
      <button
        type="button"
        disabled={disabled}
        onClick={apply}
        aria-label={`Apply custom due in ${displayDays} days`}
        className="w-9 shrink-0 text-right text-sm font-semibold tabular-nums text-zinc-100 hover:text-sky-300 disabled:opacity-50"
      >
        {displayDays}
      </button>
      <button
        type="button"
        disabled={disabled || tier >= tierMaxIndex}
        aria-label="Longer custom due range"
        onClick={() => goTier(tier + 1)}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-zinc-700 text-base font-medium text-zinc-300 hover:bg-zinc-900 disabled:opacity-40"
      >
        +
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
  const conceptsById = useAppSelector((s) => s.concepts.byId);

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

  const [studyOrderSeed, setStudyOrderSeed] = useState(() => sessionSeedString());

  const { dueAllIds, queue } = useMemo(() => {
    void dueClock;
    const nowMs = Date.now();
    const dueAllIds = dueCardIdsForDeck(byId, allIds, deckPath, nowMs, "all");
    const rawQueue = dueCardIdsForDeck(byId, allIds, deckPath, nowMs, "flashcard");
    const queue = [...rawQueue].sort(
      (a, b) => seededOrderKey(studyOrderSeed, a) - seededOrderKey(studyOrderSeed, b),
    );
    return { dueAllIds, queue };
  }, [byId, allIds, deckPath, dueClock, studyOrderSeed]);

  const crosswordOnlyDue = dueAllIds.length > 0 && queue.length === 0;

  /**
   * Due queue is rebuilt from Redux after every grade (cards may drop out). Always take the next
   * card as `queue[0]`; do not walk by numeric index or finishing one card can leave `index` past
   * the end and incorrectly show "Session complete" while another card is still due.
   */
  const [answeredInSession, setAnsweredInSession] = useState(0);
  const [sessionTrailState, setSessionTrailState] = useState<SessionTrailState>(emptySessionTrailState);
  const [revealed, setRevealed] = useState(false);
  const [isGrading, setIsGrading] = useState(false);
  const [permanentImagesReady, setPermanentImagesReady] = useState(() => !isPermanentDeckPath(deckPath));
  const gradingLockRef = useRef(false);
  /** Avoid re-assigning images when Redux updates after `upsertMany` (same study session). */
  const permanentImagesAssignedForSeedRef = useRef<string | null>(null);
  const permanentImagesAssignInFlightRef = useRef<string | null>(null);

  /** Due id list only — stable across `front` updates on the same cards. */
  const permanentDueIdsKey = useMemo(() => {
    if (!isPermanentDeckPath(deckPath)) return "";
    void dueClock;
    const nowMs = Date.now();
    return dueCardIdsForDeck(byId, allIds, deckPath, nowMs, "flashcard")
      .slice()
      .sort()
      .join(",");
  }, [deckPath, studyOrderSeed, dueClock, byId, allIds]);

  const permanentDueCardsLoaded = useMemo(() => {
    if (!permanentDueIdsKey) return true;
    return permanentDueIdsKey.split(",").every((id) => Boolean(byId[id]));
  }, [permanentDueIdsKey, byId]);

  useEffect(() => {
    setAnsweredInSession(0);
    setSessionTrailState(emptySessionTrailState());
    setRevealed(false);
    setStudyOrderSeed(sessionSeedString());
    permanentImagesAssignedForSeedRef.current = null;
    permanentImagesAssignInFlightRef.current = null;
  }, [deckPath]);

  /** Permanent deck: assign a fresh unique image per due card once at session start. */
  useEffect(() => {
    if (!isPermanentDeckPath(deckPath)) {
      setPermanentImagesReady(true);
      return;
    }

    if (permanentImagesAssignedForSeedRef.current === studyOrderSeed) {
      setPermanentImagesReady(true);
      return;
    }

    if (permanentImagesAssignInFlightRef.current === studyOrderSeed) {
      return;
    }

    const ids = permanentDueIdsKey ? permanentDueIdsKey.split(",") : [];
    if (ids.length === 0) {
      setPermanentImagesReady(true);
      return;
    }

    if (!permanentDueCardsLoaded) {
      setPermanentImagesReady(false);
      return;
    }

    let cancelled = false;
    permanentImagesAssignInFlightRef.current = studyOrderSeed;
    setPermanentImagesReady(false);
    void assignPermanentSessionImages(dispatch, (id) => byId[id], ids)
      .then(() => {
        if (!cancelled) {
          permanentImagesAssignedForSeedRef.current = studyOrderSeed;
          setPermanentImagesReady(true);
        }
      })
      .catch(() => {
        if (!cancelled) setPermanentImagesReady(true);
      })
      .finally(() => {
        if (permanentImagesAssignInFlightRef.current === studyOrderSeed) {
          permanentImagesAssignInFlightRef.current = null;
        }
      });

    return () => {
      cancelled = true;
    };
  }, [deckPath, studyOrderSeed, permanentDueIdsKey, permanentDueCardsLoaded, dispatch]);

  useEffect(() => {
    if (queue.length === 0) {
      setRevealed(false);
    }
  }, [queue.length]);

  const queueHeadId = queue.length > 0 ? queue[0] : undefined;

  useEffect(() => {
    if (!queueHeadId) {
      setSessionTrailState(emptySessionTrailState());
      return;
    }
    setSessionTrailState((prev) => initSessionTrailIfEmpty(prev, queueHeadId));
  }, [queueHeadId]);

  /** When at the end of the trail, append the new due head after grading advances the queue. */
  useEffect(() => {
    setSessionTrailState((prev) => appendQueueHeadToSessionTrailIfAtEnd(prev, queueHeadId));
  }, [queueHeadId, sessionTrailState.trailIndex, sessionTrailState.trail.length]);

  const displayId = sessionTrailDisplayId(sessionTrailState, queueHeadId);
  const card = displayId ? byId[displayId] : undefined;
  const canGoBack = canGoBackInSessionTrail(sessionTrailState);

  const finishCardAndAdvance = useCallback(() => {
    setRevealed(false);
    setSessionTrailState((prev) => truncateSessionTrailOnFinish(prev));
  }, []);

  const goBack = useCallback(() => {
    if (gradingLockRef.current || !canGoBackInSessionTrail(sessionTrailState)) return;
    setSessionTrailState((prev) => goBackInSessionTrail(prev));
    setRevealed(false);
  }, [sessionTrailState]);

  // Prevent flashing the previous card’s "revealed" UI on the next card.
  useLayoutEffect(() => {
    setRevealed(false);
  }, [displayId]);

  const faces = useMemo(() => {
    if (!card) {
      return { front: null as ReactNode, back: null as ReactNode };
    }
    return resolveFlashcardFaces(card, { conceptsById });
  }, [card, conceptsById]);

  const noAnswerFace = faces.back === null;
  const showAnswer = useCallback(() => setRevealed(true), []);

  const toggleFlag = useCallback(async () => {
    if (!card || gradingLockRef.current) return;
    const next = !Boolean(card.flag);
    await dispatch(markCardDirtyLocal({ id: card.id, fields: { flag: next } })).unwrap();
  }, [card, dispatch]);

  const deleteCard = useCallback(async () => {
    if (!card || gradingLockRef.current) return;
    if (
      !window.confirm(
        "Delete this card?\n\nThis removes it from study on all devices after sync. You can’t undo this from the web app.",
      )
    ) {
      return;
    }
    await dispatch(
      markCardDirtyLocal({
        id: card.id,
        fields: { deleted_at: new Date().toISOString() },
      }),
    ).unwrap();
    finishCardAndAdvance();
    setAnsweredInSession((n) => n + 1);
  }, [card, dispatch, finishCardAndAdvance]);

  const suspendCard = useCallback(async () => {
    const did = await suspendStudyCardVariant(card, gradingLockRef.current, dispatch);
    if (!did) return;
    finishCardAndAdvance();
    setAnsweredInSession((n) => n + 1);
  }, [card, dispatch, finishCardAndAdvance]);

  const submitGrade = useCallback(
    async (grade: ReviewGrade) => {
      if (!card || gradingLockRef.current) return;
      gradingLockRef.current = true;
      setIsGrading(true);
      finishCardAndAdvance();
      const nowMs = Date.now();
      const fields = isPermanentDeckCard(card)
        ? schedulePermanentReview(card, grade, nowMs)
        : scheduleAfterReview(card, grade, nowMs);
      try {
        await dispatch(markFlashcardReviewDeferSiblingDuesLocal({ gradedId: card.id, fields, nowMs })).unwrap();
        setAnsweredInSession((n) => n + 1);
      } finally {
        gradingLockRef.current = false;
        setIsGrading(false);
      }
    },
    [card, dispatch, finishCardAndAdvance],
  );

  const submitCustomDue = useCallback(
    async (daysFromNow: number) => {
      if (!card || gradingLockRef.current) return;
      gradingLockRef.current = true;
      setIsGrading(true);
      finishCardAndAdvance();
      const nowMs = Date.now();
      const cappedDays = Math.min(daysFromNow, maxDueDaysFromNow(nowMs));
      const due_at = new Date(nowMs + cappedDays * MS_PER_DAY).toISOString();
      const interval_days = cappedDays;
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
        setAnsweredInSession((n) => n + 1);
      } finally {
        gradingLockRef.current = false;
        setIsGrading(false);
      }
    },
    [card, dispatch, finishCardAndAdvance],
  );

  const hintNowMs = useMemo(() => {
    if (!revealed || !displayId) return 0;
    return Date.now();
  }, [revealed, displayId]);

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
        } else if (e.key === "ArrowLeft" && canGoBack) {
          e.preventDefault();
          goBack();
        }
        return;
      }
      if (e.key === "ArrowLeft" && canGoBack) {
        e.preventDefault();
        goBack();
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
  }, [card, revealed, isGrading, showAnswer, submitGrade, canGoBack, goBack]);

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

  if (!card || (isPermanentDeckPath(deckPath) && !permanentImagesReady)) {
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

  /** Space for fixed study footer so content can scroll above it. */
  const studyFooterReserveClass = revealed
    ? noAnswerFace
      ? "pb-[max(11rem,calc(env(safe-area-inset-bottom)+9.5rem))]"
      : "pb-[max(16rem,calc(env(safe-area-inset-bottom)+14.5rem))]"
    : "pb-[max(13rem,calc(env(safe-area-inset-bottom)+11.5rem))]";

  return (
    <div className={`relative mx-auto max-w-2xl ${studyFooterReserveClass}`}>
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
        <p className="truncate text-[11px] text-zinc-500" title={card.deck_id?.trim() ? card.deck_id.trim() : ""}>
          <span className="text-zinc-600">Deck</span>{" "}
          <span className="text-zinc-400">{card.deck_id?.trim() ? card.deck_id.trim() : "(no deck)"}</span>
        </p>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Question</p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isGrading}
              onClick={() => void suspendCard()}
              className="inline-flex items-center rounded-lg border border-zinc-600 bg-zinc-950/40 px-3 py-1.5 text-xs font-semibold text-zinc-300 transition hover:bg-zinc-900/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 disabled:opacity-50"
              title="Hide this card variant from study"
            >
              Suspend
            </button>
            <button
              type="button"
              disabled={isGrading}
              onClick={() => void deleteCard()}
              className="inline-flex items-center rounded-lg border border-rose-900/80 bg-rose-950/40 px-3 py-1.5 text-xs font-semibold text-rose-100 transition hover:bg-rose-950/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 disabled:opacity-50"
              title="Delete this card"
            >
              Delete…
            </button>
            <button
              type="button"
              disabled={isGrading}
              onClick={() => void toggleFlag()}
              className={`inline-flex items-center rounded-lg border px-3 py-1.5 text-xs font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 disabled:opacity-50 ${
                card.flag
                  ? "border-amber-600/70 bg-amber-950/30 text-amber-200 hover:bg-amber-950/50"
                  : "border-zinc-700 bg-zinc-950/40 text-zinc-300 hover:bg-zinc-900/60"
              }`}
              aria-pressed={Boolean(card.flag)}
              title={card.flag ? "Unflag this card" : "Flag this card"}
            >
              {card.flag ? "Flagged" : "Flag"}
            </button>
          </div>
        </div>
        <div key={`front-${displayId ?? ""}`} className="mt-3 min-h-[5rem] text-lg leading-relaxed text-zinc-100">
          {faces.front}
        </div>

        {revealed && !noAnswerFace ? (
          <>
            <div className="my-8 border-t border-zinc-800" />
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Answer</p>
            <div
              key={`back-${displayId ?? ""}`}
              className="mt-3 min-h-[4rem] text-lg leading-relaxed text-zinc-100"
            >
              {faces.back}
            </div>
          </>
        ) : null}

        {!noAnswerFace ? (
          <div className="mt-8">
            <NoteContentFieldsForm anchorCard={card} disabled={isGrading} />
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

      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50">
        <div className="pointer-events-auto mx-auto w-full max-w-2xl border-t border-zinc-700/90 bg-zinc-950/90 px-6 pt-3 shadow-[0_-12px_40px_rgba(0,0,0,0.45)] backdrop-blur-md pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {!revealed ? (
            <>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={isGrading || !canGoBack}
                  onClick={goBack}
                  aria-label="Previous card"
                  className="shrink-0 rounded-xl border border-zinc-600 bg-zinc-900/80 px-4 py-3 text-sm font-semibold text-zinc-200 hover:bg-zinc-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Back
                </button>
                <button
                  type="button"
                  disabled={isGrading}
                  onClick={showAnswer}
                  className="min-w-0 flex-1 rounded-xl bg-sky-600 px-5 py-3 text-sm font-semibold text-white hover:bg-sky-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 disabled:opacity-50"
                >
                  {noAnswerFace ? "Continue" : "Show answer"}
                </button>
              </div>
              <p className="mt-2 text-[11px] text-zinc-600">
                Tip: Space or Enter to reveal
                {canGoBack ? " · ← for previous card" : ""}
              </p>
            </>
          ) : (
            <>
              {!noAnswerFace ? (
                <CustomDueStickyBar
                  key={displayId}
                  disabled={isGrading}
                  onApply={submitCustomDue}
                />
              ) : null}
              <div className="flex gap-2">
                {canGoBack ? (
                  <button
                    type="button"
                    disabled={isGrading}
                    onClick={goBack}
                    aria-label="Previous card"
                    className="shrink-0 rounded-xl border border-zinc-600 bg-zinc-900/80 px-3 py-2 text-xs font-semibold text-zinc-200 hover:bg-zinc-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    ←
                  </button>
                ) : null}
                {GRADE_ROWS.map(({ grade, label, className }) => (
                  <button
                    key={grade}
                    type="button"
                    disabled={isGrading}
                    onClick={() => void submitGrade(grade)}
                    className={`flex min-w-0 flex-1 flex-col items-stretch rounded-xl border px-2.5 py-2 text-left text-[12px] font-semibold leading-tight transition focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 disabled:opacity-50 ${className}`}
                  >
                    <span className="whitespace-nowrap">{label}</span>
                    <span className="mt-0.5 whitespace-nowrap text-[10px] font-normal tabular-nums opacity-80">
                      {hintNowMs
                        ? card && isPermanentDeckCard(card)
                          ? permanentIntervalHint(card, grade)
                          : intervalHintForGrade(card, grade, hintNowMs)
                        : "—"}
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
