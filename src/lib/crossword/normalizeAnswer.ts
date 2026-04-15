/** True when `ch` is one Unicode letter (e.g. a–z, é, ç). */
export function isCrosswordLetterChar(ch: string): boolean {
  return ch.length > 0 && /\p{L}/u.test(ch);
}

/**
 * NFC + lowercase; keeps Unicode letters including accents; strips spaces, punctuation, digits.
 * Plain `e` and `é` are distinct — diacritics are not folded away.
 */
export function normalizeCrosswordAnswer(raw: string): string {
  const nfc = raw.normalize("NFC").toLowerCase();
  const out: string[] = [];
  for (const ch of nfc) {
    if (isCrosswordLetterChar(ch)) out.push(ch);
  }
  return out.join("");
}

const EMPTY_SLOT = ".";

/**
 * Canonical per-cell storage for a word of length `max`: exactly `max` chars, each a Unicode letter or `.` (empty).
 * Legacy input without dots is treated as a left-filled prefix. Casing is normalized with Unicode lowercase rules.
 */
export function toSlotString(raw: string, max: number): string {
  if (max <= 0) return "";
  const nfc = raw.normalize("NFC").toLowerCase();
  let u = "";
  for (const ch of nfc) {
    if (ch === EMPTY_SLOT) u += ch;
    else if (isCrosswordLetterChar(ch)) u += ch;
  }
  if (u.includes(EMPTY_SLOT)) {
    return [...u].slice(0, max).join("").padEnd(max, EMPTY_SLOT);
  }
  const letters = [...u];
  return letters.slice(0, max).join("").padEnd(max, EMPTY_SLOT);
}

/** True when every cell has a letter (no empty slots). */
export function isCrosswordSlotComplete(slotStr: string, answerLen: number): boolean {
  if (answerLen <= 0) return false;
  const s = toSlotString(slotStr, answerLen);
  return s.length === answerLen && !s.includes(EMPTY_SLOT);
}
