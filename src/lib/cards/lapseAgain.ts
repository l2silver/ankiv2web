import type { CardEntity } from "@/features/cards/cardsSlice";

type CustomLapseGrade = "hard" | "good" | "easy";

/** Default Again delay (minutes); unchanged when a custom max Easy interval is set. */
export const DEFAULT_LAPSE_AGAIN_MINUTES = 10;

/** Upper bound for custom max Easy interval (`lapse_again_days`). */
export const LAPSE_MAX_EASY_DAYS = 180;

/** One-click max Easy presets in browse (days). */
export const LAPSE_AGAIN_PRESET_DAYS = [1, 3, 7, 14, 45] as const;

export function clampLapseAgainDays(days: number): number {
  return Math.max(0, Math.min(LAPSE_MAX_EASY_DAYS, Math.floor(days)));
}

export function hasCustomLapseAgainDays(card: CardEntity): boolean {
  const d = card.lapse_again_days;
  return d != null && Number.isFinite(d) && d > 0;
}

/** `lapse_again_days` stores the Easy (maximum) interval; Hard/Good halve from there. */
export function customLapseMaxEasyDays(card: CardEntity): number {
  return clampLapseAgainDays(card.lapse_again_days ?? 0);
}

export function customLapseIntervalDaysForGrade(maxEasyDays: number, grade: CustomLapseGrade): number {
  switch (grade) {
    case "easy":
      return maxEasyDays;
    case "good":
      return maxEasyDays / 2;
    case "hard":
      return maxEasyDays / 4;
  }
}

export function lapseAgainLabel(card: CardEntity): string {
  if (!hasCustomLapseAgainDays(card)) return `${DEFAULT_LAPSE_AGAIN_MINUTES}m`;
  const d = customLapseMaxEasyDays(card);
  return `${d}d`;
}
