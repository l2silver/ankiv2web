import { clampDueAtIntervalFields, type DueAtIntervalFields } from "@/lib/cards/dueCeiling";

const MS_PER_DAY = 86_400_000;

/** Upper bound for browse-mode random due assignment (days from now). */
export const BROWSE_RANDOM_DUE_MAX_DAYS = 60;

export function clampBrowseDueDayRange(
  minDays: number,
  maxDays: number,
): { minDays: number; maxDays: number } {
  const a = Math.max(0, Math.min(BROWSE_RANDOM_DUE_MAX_DAYS, Math.floor(minDays)));
  const b = Math.max(0, Math.min(BROWSE_RANDOM_DUE_MAX_DAYS, Math.floor(maxDays)));
  return { minDays: Math.min(a, b), maxDays: Math.max(a, b) };
}

/** Pick a whole-day offset in `[minDays, maxDays]` and return clamped schedule fields. */
export function randomScheduleFieldsInDayRange(
  minDays: number,
  maxDays: number,
  nowMs: number,
  random: () => number = Math.random,
): DueAtIntervalFields {
  const { minDays: min, maxDays: max } = clampBrowseDueDayRange(minDays, maxDays);
  const span = max - min + 1;
  const days = min + Math.floor(random() * span);
  const dueMs = nowMs + days * MS_PER_DAY;
  return clampDueAtIntervalFields(
    {
      due_at: new Date(dueMs).toISOString(),
      interval_days: days,
    },
    nowMs,
  );
}
