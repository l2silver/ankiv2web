import type { CardEntity } from "@/features/cards/cardsSlice";

import type { FlashcardFaces } from "@/lib/flashcards/types";
import {
  mainAnswerFront,
  mainQuestionWithOptionalContextBack,
} from "@/lib/flashcards/layouts/noteMainSides";
import {
  followUpQaBlockThenOriginalCardBack,
  pickedFlashcardMoreQuestion,
} from "@/lib/flashcards/moreQuestionsUtility";

/**
 * Knowledge · `card_variant` **`back->front+context`** (legacy: `explain`)
 *
 * - **Front:** `card.back` (the “answer” side you explain from)
 * - **Back:** `card.front`, optional `card.context` under a divider
 * - **With flashcard follow-ups:** same front; back = picked follow-up block + original Q/A
 */
export function resolveKnowledgeBackToFrontPlusContextFlashcard(card: CardEntity): FlashcardFaces {
  const main = {
    front: card.front?.trim() ?? "",
    back: card.back?.trim() ?? "",
    context: card.context?.trim() ?? "",
  };

  const picked = pickedFlashcardMoreQuestion(card);

  const front = mainAnswerFront(main);
  const back = picked ? followUpQaBlockThenOriginalCardBack(card, picked) : mainQuestionWithOptionalContextBack(main);

  return { front, back };
}
