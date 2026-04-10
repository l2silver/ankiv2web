import type { ReactNode } from "react";

import type { CardEntity } from "@/features/cards/cardsSlice";

import { vocabReverseFacesNoMq } from "@/lib/flashcards/vocab/reverse";

/** Answer on front; question + context on back (no follow-up rows). */
export function languageProduceFacesNoMq(card: CardEntity): { front: ReactNode; back: ReactNode } {
  return vocabReverseFacesNoMq(card);
}
