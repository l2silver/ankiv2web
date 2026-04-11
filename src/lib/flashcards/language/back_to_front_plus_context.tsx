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
 * Language · `card_variant` **`back->front+context`** (legacy wire: `produce`)
 *
 * - **Front:** `card.back` (target wording / cue on the back field)
 * - **Back:** `card.front`, optional `card.context` under a divider
 * - **With flashcard follow-ups:** same front; back = picked follow-up block + original Q/A
 */
export function resolveLanguageBackToFrontPlusContextFlashcard(card: CardEntity): FlashcardFaces {
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
