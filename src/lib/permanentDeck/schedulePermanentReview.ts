import type { CardEntity } from "@/features/cards/cardsSlice";
import type { ReviewGrade } from "@/lib/cards/scheduleReview";
import type { ScheduledReviewFields } from "@/lib/cards/scheduleReview";

const MS_PER_DAY = 86_400_000;

/** Permanent deck cards are always scheduled ~1 day out after any grade. */
export function schedulePermanentReview(
  card: CardEntity,
  _grade: ReviewGrade,
  nowMs: number,
): ScheduledReviewFields {
  const interval_days = 1;
  return {
    due_at: new Date(nowMs + MS_PER_DAY).toISOString(),
    interval_days,
    ease: card.ease ?? 2.5,
    reps: (card.reps ?? 0) + 1,
    lapses: card.lapses ?? 0,
    last_reviewed_at: new Date(nowMs).toISOString(),
    relearn_step: undefined,
  };
}

export function permanentIntervalHint(_card: CardEntity, _grade: ReviewGrade): string {
  return "1d";
}
