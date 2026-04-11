import type { CardEntity } from "@/features/cards/cardsSlice";

import type { FlashcardFaces } from "@/lib/flashcards/types";
import {
  mainAnswerWithOptionalContextBack,
  mainQuestionFront,
} from "@/lib/flashcards/layouts/noteMainSides";
import {
  followUpQaBlockThenOriginalCardBack,
  pickedFlashcardMoreQuestion,
} from "@/lib/flashcards/moreQuestionsUtility";

/**
 * Language · `card_variant` **`front->back+context`** (legacy wire: `translate`)
 *
 * - **Front:** `card.front` (prompt / question)
 * - **Back:** `card.back`, optional `card.context` under a divider
 * - **With flashcard follow-ups:** same front; back = picked follow-up block + original Q/A
 */
export function resolveLanguageFrontToBackPlusContextFlashcard(card: CardEntity): FlashcardFaces {
  const main = {
    front: card.front?.trim() ?? "",
    back: card.back?.trim() ?? "",
    context: card.context?.trim() ?? "",
  };

  const picked = pickedFlashcardMoreQuestion(card);

  const front = mainQuestionFront(main);
  const back = picked ? followUpQaBlockThenOriginalCardBack(card, picked) : mainAnswerWithOptionalContextBack(main);

  return { front, back };
}
