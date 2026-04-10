import type { ReactNode } from "react";

import type { CardEntity } from "@/features/cards/cardsSlice";

import { languageTranslateFacesNoMq } from "@/lib/flashcards/language/translate";

/** Question → answer + context (same layout as language `translate`). */
export function knowledgeQaFacesNoMq(card: CardEntity): { front: ReactNode; back: ReactNode } {
  return languageTranslateFacesNoMq(card);
}
