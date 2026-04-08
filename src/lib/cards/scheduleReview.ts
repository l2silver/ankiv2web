import type { CardEntity } from "@/features/cards/cardsSlice";

/** Anki-style recall outcome; drives local SM-2–like scheduling. */
export type ReviewGrade = "again" | "hard" | "good" | "easy";

const EASE_MIN = 1.3;
const EASE_MAX = 3.0;

/** ± this fraction of the target interval (deterministic per card + grade + pre-review state). */
const FUZZ_FRAC = 0.05;

const RELEARN_AGAIN_MINUTES = 10;
const RELEARN_GOOD_STEP0_MINUTES = 60;
const RELEARN_GOOD_STEP1_DAYS = 6 / 24; // 6h
const RELEARN_GRADUATE_DAYS = 1;

/** Fields written by the scheduler (relearn_step is client-only, not sent in PATCH /sync). */
export type ScheduledReviewFields = Pick<
  CardEntity,
  "due_at" | "interval_days" | "ease" | "reps" | "lapses" | "last_reviewed_at"
> & {
  /** 0 = just lapsed / first relearn delay; 1–2 = short-interval steps. Omitted or cleared after graduation. */
  relearn_step?: number;
};

function isoFromNowMs(nowMs: number, days: number): string {
  return new Date(nowMs + days * 86_400_000).toISOString();
}

function isoFromNowMinutes(nowMs: number, minutes: number): string {
  return new Date(nowMs + minutes * 60_000).toISOString();
}

/** FNV-1a 32-bit → multiplier in [1 - FUZZ_FRAC, 1 + FUZZ_FRAC]. */
function fuzzMultiplier(card: CardEntity, grade: ReviewGrade): number {
  const payload = `${card.id}\0${grade}\0${card.reps ?? 0}\0${card.lapses ?? 0}\0${card.relearn_step ?? ""}\0${card.interval_days ?? 0}\0${card.ease ?? 0}`;
  let h = 2166136261;
  for (let i = 0; i < payload.length; i++) {
    h ^= payload.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const u = (h >>> 0) / 0xffff_ffff;
  return 1 - FUZZ_FRAC + u * (2 * FUZZ_FRAC);
}

function fuzzDays(days: number, card: CardEntity, grade: ReviewGrade): number {
  if (days <= 0) return days;
  const f = Math.max(1 / 1440, days * fuzzMultiplier(card, grade));
  return f;
}

function fuzzMinutes(minutes: number, card: CardEntity, grade: ReviewGrade): number {
  return Math.max(1, minutes * fuzzMultiplier(card, grade));
}

function withClearedRelearnStep(base: ScheduledReviewFields): ScheduledReviewFields {
  return { ...base, relearn_step: undefined };
}

/**
 * Computes new scheduling fields after a review (client-owned; persisted via PATCH /sync).
 * - SM-2–shaped intervals for review cards, with deterministic ±5% fuzz to reduce due-date clumping.
 * - Short relearning ladder after lapses (reps = 0 & lapses > 0): ~10m → ~1h → ~6h → graduate to 1d.
 */
export function scheduleAfterReview(
  card: CardEntity,
  grade: ReviewGrade,
  nowMs: number,
): ScheduledReviewFields {
  const reps = card.reps ?? 0;
  let lapses = card.lapses ?? 0;
  let ease = card.ease ?? 2.5;
  const ivl = Math.max(0, card.interval_days ?? 0);
  const last_reviewed_at = new Date(nowMs).toISOString();

  const isBrandNew = reps === 0 && lapses === 0;
  const inRelearn = reps === 0 && lapses > 0;
  const relearnStep = card.relearn_step ?? 0;

  switch (grade) {
    case "again": {
      lapses += 1;
      ease = Math.max(EASE_MIN, ease - 0.2);
      const m = fuzzMinutes(RELEARN_AGAIN_MINUTES, card, grade);
      return {
        due_at: isoFromNowMinutes(nowMs, m),
        interval_days: 0,
        ease,
        reps: 0,
        lapses,
        last_reviewed_at,
        relearn_step: 0,
      };
    }
    case "hard": {
      ease = Math.max(EASE_MIN, ease - 0.15);

      if (inRelearn) {
        if (relearnStep <= 0) {
          const m = fuzzMinutes(30, card, grade);
          return {
            due_at: isoFromNowMinutes(nowMs, m),
            interval_days: m / 1440,
            ease,
            reps: 0,
            lapses,
            last_reviewed_at,
            relearn_step: 0,
          };
        }
        if (relearnStep === 1) {
          const m = fuzzMinutes(120, card, grade);
          return {
            due_at: isoFromNowMinutes(nowMs, m),
            interval_days: m / 1440,
            ease,
            reps: 0,
            lapses,
            last_reviewed_at,
            relearn_step: 1,
          };
        }
        const interval_days = fuzzDays(0.75, card, grade);
        return withClearedRelearnStep({
          due_at: isoFromNowMs(nowMs, interval_days),
          interval_days,
          ease,
          reps: 1,
          lapses,
          last_reviewed_at,
        });
      }

      let interval_days: number;
      if (isBrandNew) {
        interval_days = fuzzDays(0.5, card, grade);
      } else if (ivl <= 0) {
        interval_days = fuzzDays(1, card, grade);
      } else {
        interval_days = fuzzDays(Math.max(1 / 24, ivl * ease * 0.55), card, grade);
      }
      return withClearedRelearnStep({
        due_at: isoFromNowMs(nowMs, interval_days),
        interval_days,
        ease,
        reps: reps + 1,
        lapses,
        last_reviewed_at,
      });
    }
    case "good": {
      if (inRelearn) {
        if (relearnStep <= 0) {
          const m = fuzzMinutes(RELEARN_GOOD_STEP0_MINUTES, card, grade);
          return {
            due_at: isoFromNowMinutes(nowMs, m),
            interval_days: m / 1440,
            ease,
            reps: 0,
            lapses,
            last_reviewed_at,
            relearn_step: 1,
          };
        }
        if (relearnStep === 1) {
          const interval_days = fuzzDays(RELEARN_GOOD_STEP1_DAYS, card, grade);
          return {
            due_at: isoFromNowMs(nowMs, interval_days),
            interval_days,
            ease,
            reps: 0,
            lapses,
            last_reviewed_at,
            relearn_step: 2,
          };
        }
        const interval_days = fuzzDays(RELEARN_GRADUATE_DAYS, card, grade);
        return withClearedRelearnStep({
          due_at: isoFromNowMs(nowMs, interval_days),
          interval_days,
          ease,
          reps: 1,
          lapses,
          last_reviewed_at,
        });
      }

      let interval_days: number;
      if (isBrandNew) {
        interval_days = fuzzDays(1, card, grade);
      } else if (ivl <= 0) {
        interval_days = fuzzDays(1, card, grade);
      } else {
        interval_days = fuzzDays(Math.max(1 / 24, ivl * ease), card, grade);
      }
      return withClearedRelearnStep({
        due_at: isoFromNowMs(nowMs, interval_days),
        interval_days,
        ease,
        reps: reps + 1,
        lapses,
        last_reviewed_at,
      });
    }
    case "easy": {
      ease = Math.min(EASE_MAX, ease + 0.15);

      if (inRelearn) {
        const interval_days = fuzzDays(2, card, grade);
        return withClearedRelearnStep({
          due_at: isoFromNowMs(nowMs, interval_days),
          interval_days,
          ease,
          reps: 1,
          lapses,
          last_reviewed_at,
        });
      }

      let interval_days: number;
      if (isBrandNew) {
        interval_days = fuzzDays(4, card, grade);
      } else if (ivl <= 0) {
        interval_days = fuzzDays(2, card, grade);
      } else {
        interval_days = fuzzDays(Math.max(1 / 24, ivl * ease * 1.35), card, grade);
      }
      return withClearedRelearnStep({
        due_at: isoFromNowMs(nowMs, interval_days),
        interval_days,
        ease,
        reps: reps + 1,
        lapses,
        last_reviewed_at,
      });
    }
  }
}

/** Short label for the next interval (for grade buttons). */
export function intervalHintForGrade(card: CardEntity, grade: ReviewGrade, nowMs: number): string {
  const s = scheduleAfterReview(card, grade, nowMs);
  const due = Date.parse(s.due_at ?? "");
  if (Number.isNaN(due)) return "—";
  const diffMin = Math.round((due - nowMs) / 60_000);
  if (diffMin < 1) return "<1m";
  if (diffMin < 120) return `${diffMin}m`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 72) return `${diffH}h`;
  const d = s.interval_days ?? 0;
  if (d < 14 && Math.abs(d - Math.round(d)) > 0.05) return `${d.toFixed(1)}d`;
  return `${Math.round(d)}d`;
}
