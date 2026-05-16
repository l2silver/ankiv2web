import type { CardEntity } from "@/features/cards/cardsSlice";

import { BROWSE_RANDOM_DUE_MAX_DAYS } from "@/lib/cards/randomDueInRange";

/** Default Again delay when `lapse_again_days` is not set (minutes). */
export const DEFAULT_LAPSE_AGAIN_MINUTES = 10;

export function clampLapseAgainDays(days: number): number {
  return Math.max(0, Math.min(BROWSE_RANDOM_DUE_MAX_DAYS, Math.floor(days)));
}

export function hasCustomLapseAgainDays(card: CardEntity): boolean {
  const d = card.lapse_again_days;
  return d != null && Number.isFinite(d) && d >= 0;
}

export function lapseAgainLabel(card: CardEntity): string {
  if (!hasCustomLapseAgainDays(card)) return `${DEFAULT_LAPSE_AGAIN_MINUTES}m`;
  const d = card.lapse_again_days!;
  return d === 0 ? "0d" : `${d}d`;
}
