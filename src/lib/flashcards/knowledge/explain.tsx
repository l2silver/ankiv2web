import type { ReactNode } from "react";

import type { CardEntity } from "@/features/cards/cardsSlice";

import { languageProduceFacesNoMq } from "@/lib/flashcards/language/produce";

/** Answer → question + context (same layout as language `produce`). */
export function knowledgeExplainFacesNoMq(card: CardEntity): { front: ReactNode; back: ReactNode } {
  return languageProduceFacesNoMq(card);
}
