import type { CardEntity } from "@/features/cards/cardsSlice";

import type { FlashcardFaces } from "../types";
import { textOrPlaceholder } from "@/lib/flashcards/formatting";
import { eligibleFlashcardMoreQuestions } from "../moreQuestionEligible";
import { pickSeededIndex } from "../pickSeededIndex";
import { knowledgeExplainFacesNoMq } from "./explain";
import { knowledgeQaFacesNoMq } from "./qa";
import {
  moreQuestionAnswerContextAndOriginalBack,
  vocabMoreQuestionAndOriginalBack,
} from "../vocab/moreQuestionBack";

const KNOWLEDGE_VARIANTS = new Set(["qa", "explain", "more_questions"]);

/** Same rules as language: `qa`≈translate, `explain`≈produce, `more_questions`≈grammar drill. */
export function resolveKnowledgeFlashcardFaces(card: CardEntity): FlashcardFaces {
  const variant = card.card_variant?.trim() ?? "qa";
  const effectiveVariant = KNOWLEDGE_VARIANTS.has(variant) ? variant : "qa";

  const eligible = eligibleFlashcardMoreQuestions(card);
  const picked = eligible.length > 0 ? eligible[pickSeededIndex(card.id, eligible.length)] : undefined;

  if (effectiveVariant === "more_questions") {
    if (picked) {
      return {
        front: textOrPlaceholder(picked.question.trim(), "No follow-up question"),
        back: moreQuestionAnswerContextAndOriginalBack(card, picked),
      };
    }
    return knowledgeQaFacesNoMq(card);
  }

  const main: FlashcardFaces =
    effectiveVariant === "explain" ? knowledgeExplainFacesNoMq(card) : knowledgeQaFacesNoMq(card);

  if (!picked) {
    return main;
  }

  return {
    front: main.front,
    back: vocabMoreQuestionAndOriginalBack(card, picked),
  };
}
