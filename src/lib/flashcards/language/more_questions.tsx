import type { CardEntity } from "@/features/cards/cardsSlice";

import type { FlashcardFaces } from "@/lib/flashcards/types";
import { textOrPlaceholder } from "@/lib/flashcards/formatting";
import {
  mainAnswerWithOptionalContextBack,
  mainQuestionFront,
} from "@/lib/flashcards/layouts/noteMainSides";
import {
  answerContextThenOriginalCardBack,
  pickedFlashcardMoreQuestion,
} from "@/lib/flashcards/moreQuestionsUtility";

/**
 * Language · `more_questions`
 *
 * Follow-up question on the front when available; otherwise the base Q/A layout
 * (`card.front` / `card.back` / `card.context`).
 */
export function resolveLanguageMoreQuestionsFlashcard(card: CardEntity): FlashcardFaces {
  const main = {
    front: card.front?.trim() ?? "",
    back: card.back?.trim() ?? "",
    context: card.context?.trim() ?? "",
  };

  const picked = pickedFlashcardMoreQuestion(card);

  if (!picked) {
    return {
      front: mainQuestionFront(main),
      back: mainAnswerWithOptionalContextBack(main),
    };
  }

  return {
    front: textOrPlaceholder(picked.question.trim(), "No follow-up question"),
    back: answerContextThenOriginalCardBack(card, picked),
  };
}
