/** Calendar months — matches backend `ClampDueAt` / `AddDate(0, 6, 0)`. */
export const MAX_DUE_MONTHS = 6;

const MS_PER_DAY = 86_400_000;

/** Latest allowed `due_at` instant for reviews scheduled at `nowMs`. */
export function maxDueAtMs(nowMs: number): number {
  const d = new Date(nowMs);
  d.setUTCMonth(d.getUTCMonth() + MAX_DUE_MONTHS);
  return d.getTime();
}

export function clampDueAtMs(dueMs: number, nowMs: number): number {
  return Math.min(dueMs, maxDueAtMs(nowMs));
}

/** Max whole days from `nowMs` for custom due sliders / manual entry. */
export function maxDueDaysFromNow(nowMs: number): number {
  return Math.max(0, Math.floor((maxDueAtMs(nowMs) - nowMs) / MS_PER_DAY));
}

export type DueAtIntervalFields = {
  due_at?: string;
  interval_days?: number;
};

/** Clamp `due_at` and align `interval_days` when the due date exceeds the ceiling. */
export function clampDueAtIntervalFields<T extends DueAtIntervalFields>(fields: T, nowMs: number): T {
  if (!fields.due_at?.trim()) return fields;
  const dueMs = Date.parse(fields.due_at);
  if (Number.isNaN(dueMs)) return fields;
  const maxMs = maxDueAtMs(nowMs);
  if (dueMs <= maxMs) return fields;
  return {
    ...fields,
    due_at: new Date(maxMs).toISOString(),
    interval_days: (maxMs - nowMs) / MS_PER_DAY,
  };
}
