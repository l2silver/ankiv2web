import type { CardEntity } from "@/features/cards/cardsSlice";

/**
 * "Due now" for the deck list (see `ANKI2-FRONTEND-DESIGN.md` §2): local check only.
 * Card counts as due when `due_at` is on or before `now`, and it is not suspended or buried.
 */
export function isCardDueNow(card: CardEntity, nowMs: number): boolean {
  if (card.suspended) return false;
  if (card.buried) return false;
  if (!card.due_at?.trim()) return false;
  const t = Date.parse(card.due_at);
  if (Number.isNaN(t)) return false;
  return t <= nowMs;
}
