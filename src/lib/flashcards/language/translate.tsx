import type { ReactNode } from "react";

import type { CardEntity } from "@/features/cards/cardsSlice";

import { vocabDefinitionFacesNoMq } from "@/lib/flashcards/vocab/definition";

/** Question on front; answer + context on back (no follow-up rows). */
export function languageTranslateFacesNoMq(card: CardEntity): { front: ReactNode; back: ReactNode } {
  return vocabDefinitionFacesNoMq(card);
}
