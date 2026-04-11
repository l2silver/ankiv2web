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
 * Knowledge · `more_questions`
 *
 * - **Front:** picked follow-up `question` (or falls back to `front->back+context`: `card.front`)
 * - **Back:** picked answer + optional context + original Q/A (or that layout’s back)
 */
export function resolveKnowledgeMoreQuestionsFlashcard(card: CardEntity): FlashcardFaces {
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
