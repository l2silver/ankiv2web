import type { CardEntity } from "@/features/cards/cardsSlice";

import type { FlashcardFaces } from "@/lib/flashcards/types";
import {
  contextScaffoldFront,
  questionThenAnswerBack,
} from "@/lib/flashcards/layouts/noteMainSides";
import {
  followUpQaBlockThenOriginalCardBack,
  pickedFlashcardMoreQuestion,
} from "@/lib/flashcards/moreQuestionsUtility";

/**
 * Vocab · `card_variant` **`context->front+back`** (legacy: `words`, `usage_cloze`)
 *
 * - **Front:** `card.context` (scaffold / hints)
 * - **Back:** `card.front` (question), then `card.back` under a divider
 * - **With flashcard follow-ups:** same front; back = picked follow-up block + original Q/A
 */
export function resolveVocabContextToFrontPlusBackFlashcard(card: CardEntity): FlashcardFaces {
  const main = {
    front: card.front?.trim() ?? "",
    back: card.back?.trim() ?? "",
    context: card.context?.trim() ?? "",
  };

  const picked = pickedFlashcardMoreQuestion(card);

  const front = contextScaffoldFront(main);
  const back = picked ? followUpQaBlockThenOriginalCardBack(card, picked) : questionThenAnswerBack(main);

  return { front, back };
}
