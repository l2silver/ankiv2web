import type { CardEntity } from "@/features/cards/cardsSlice";

import { PERMANENT_CARD_IDS, PERMANENT_DECK_ID } from "@/lib/permanentDeck/constants";

const PERMANENT_CARD_ID_SET = new Set<string>(PERMANENT_CARD_IDS);

export function isPermanentDeckPath(deckPath: string): boolean {
  const t = deckPath.trim();
  return t === PERMANENT_DECK_ID || t.startsWith(`${PERMANENT_DECK_ID}::`);
}

export function isPermanentDeckCard(card: CardEntity): boolean {
  if (PERMANENT_CARD_ID_SET.has(card.id)) return true;
  const deck = card.deck_id?.trim() ?? "";
  return deck === PERMANENT_DECK_ID || deck.startsWith(`${PERMANENT_DECK_ID}::`);
}
