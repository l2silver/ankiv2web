import type { CardEntity } from "@/features/cards/cardsSlice";
import { hasCustomLapseAgainDays, lapseAgainLabel } from "@/lib/cards/lapseAgain";
import { intervalHintForGrade, type ReviewGrade } from "@/lib/cards/scheduleReview";
import { isNeverAnswered } from "@/lib/cards/reviewStatus";

export type BrowseScheduleSideMeta = {
  dueRelative: string;
  dueTitle: string;
  isOverdue: boolean;
  /** Shown on grade buttons after Again — next interval if you press Again now. */
  againHint: string;
  lapses: number;
  relearnStep: number | null;
  intervalDays: number;
  ease: number;
  /** Compact scheduling context (relearn ladder, lapses, interval). */
  stateLine: string | null;
  /** Custom Again delay when configured (e.g. `3d` vs default `10m`). */
  lapseAgainLabel: string;
  hasCustomLapseAgain: boolean;
};

function formatIntervalDays(days: number): string {
  if (days <= 0) return "0d";
  if (days < 1 / 24) return "<1m";
  if (days < 1) {
    const m = Math.round(days * 1440);
    return m < 120 ? `${m}m` : `${Math.round(m / 60)}h`;
  }
  if (days < 14 && Math.abs(days - Math.round(days)) > 0.05) return `${days.toFixed(1)}d`;
  return `${Math.round(days)}d`;
}

/** Relative due label for browse list (e.g. `in 2h`, `3d ago`). */
export function formatDueRelative(due_at: string | undefined, nowMs: number): string {
  if (!due_at?.trim()) return "—";
  const due = Date.parse(due_at);
  if (Number.isNaN(due)) return "—";
  const diffMin = Math.round((due - nowMs) / 60_000);
  if (diffMin === 0) return "due now";
  if (diffMin > 0) {
    if (diffMin < 120) return `in ${diffMin}m`;
    const diffH = Math.round(diffMin / 60);
    if (diffH < 72) return `in ${diffH}h`;
    return `in ${Math.round(diffMin / 1440)}d`;
  }
  const absMin = Math.abs(diffMin);
  if (absMin < 120) return `${absMin}m ago`;
  const absH = Math.round(absMin / 60);
  if (absH < 72) return `${absH}h ago`;
  return `${Math.round(absMin / 1440)}d ago`;
}

export function buildBrowseScheduleSideMeta(card: CardEntity, nowMs: number): BrowseScheduleSideMeta {
  const dueRelative = formatDueRelative(card.due_at, nowMs);
  const dueMs = Date.parse(card.due_at ?? "");
  const isOverdue = Boolean(card.due_at?.trim()) && !Number.isNaN(dueMs) && dueMs <= nowMs;
  const dueTitle = card.due_at?.trim()
    ? new Date(dueMs).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
    : "No due date";

  const lapses = card.lapses ?? 0;
  const reps = card.reps ?? 0;
  const inRelearn = reps === 0 && lapses > 0;
  const relearnStep = inRelearn ? (card.relearn_step ?? 0) : null;
  const intervalDays = card.interval_days ?? 0;
  const ease = card.ease ?? 2.5;

  let stateLine: string | null = null;
  if (inRelearn && relearnStep !== null) {
    stateLine = `Relearn ${relearnStep + 1}/3 · ${lapses} lapse${lapses === 1 ? "" : "s"}`;
  } else if (lapses > 0) {
    stateLine = `${lapses} lapse${lapses === 1 ? "" : "s"}`;
  } else if (intervalDays > 0 || reps > 0) {
    stateLine = `${formatIntervalDays(intervalDays)} ivl · ease ${ease.toFixed(2)}`;
  } else if (isNeverAnswered(card) && hasCustomLapseAgainDays(card)) {
    stateLine = `Again → ${lapseAgainLabel(card)}`;
  }

  return {
    dueRelative,
    dueTitle,
    isOverdue,
    againHint: intervalHintForGrade(card, "again", nowMs),
    lapses,
    relearnStep,
    intervalDays,
    ease,
    stateLine,
    lapseAgainLabel: lapseAgainLabel(card),
    hasCustomLapseAgain: hasCustomLapseAgainDays(card),
  };
}

const BROWSE_GRADE_HINTS: { grade: ReviewGrade; label: string }[] = [
  { grade: "again", label: "Again" },
  { grade: "hard", label: "Hard" },
  { grade: "good", label: "Good" },
  { grade: "easy", label: "Easy" },
];

export function browseGradeHints(card: CardEntity, nowMs: number): { grade: ReviewGrade; label: string; hint: string }[] {
  return BROWSE_GRADE_HINTS.map(({ grade, label }) => ({
    grade,
    label,
    hint: intervalHintForGrade(card, grade, nowMs),
  }));
}
