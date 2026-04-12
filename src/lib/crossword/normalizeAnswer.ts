/** Lowercase a–z only; strips spaces, punctuation, diacritics (basic). Case in `raw` is ignored. */
export function normalizeCrosswordAnswer(raw: string): string {
  const noCombining = raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return noCombining
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}

const EMPTY_SLOT = ".";

/**
 * Canonical per-cell storage for a word of length `max`: exactly `max` chars, each `a–z` or `.` (empty).
 * Legacy input without dots is treated as a left-filled prefix. Letter case in `raw` is normalized to lowercase.
 */
export function toSlotString(raw: string, max: number): string {
  if (max <= 0) return "";
  const u = raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z.]/g, "");
  if (u.includes(EMPTY_SLOT)) {
    return u.slice(0, max).padEnd(max, EMPTY_SLOT);
  }
  const letters = u.replace(/\./g, "");
  return letters.slice(0, max).padEnd(max, EMPTY_SLOT);
}

/** True when every cell has a letter (no empty slots). */
export function isCrosswordSlotComplete(slotStr: string, answerLen: number): boolean {
  if (answerLen <= 0) return false;
  const s = toSlotString(slotStr, answerLen);
  return s.length === answerLen && !s.includes(EMPTY_SLOT);
}
