import type { CardEntity } from "@/features/cards/cardsSlice";

/** True when the card has never been graded in study (matches scheduler "brand new" state). */
export function isNeverAnswered(card: CardEntity): boolean {
  return (card.reps ?? 0) === 0 && (card.lapses ?? 0) === 0;
}

/** Keep only cards that have never been answered; preserves input order. */
export function filterNeverAnsweredCardIds(
  byId: Record<string, CardEntity>,
  ids: string[],
): string[] {
  return ids.filter((id) => {
    const c = byId[id];
    return Boolean(c && isNeverAnswered(c));
  });
}
