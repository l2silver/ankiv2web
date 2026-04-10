import type { CardEntity } from "@/features/cards/cardsSlice";

import type { FlashcardFaces } from "../types";
import { eligibleFlashcardMoreQuestions } from "../moreQuestionEligible";
import { pickSeededIndex } from "../pickSeededIndex";
import {
  moreQuestionAnswerContextAndOriginalBack,
  vocabMoreQuestionAndOriginalBack,
} from "../vocab/moreQuestionBack";
import { languageProduceFacesNoMq } from "./produce";
import { languageTranslateFacesNoMq } from "./translate";
import { textOrPlaceholder } from "@/lib/flashcards/formatting";

const LANGUAGE_VARIANTS = new Set(["translate", "produce", "grammar", "more_questions"]);

export function resolveLanguageFlashcardFaces(card: CardEntity): FlashcardFaces {
  const variant = card.card_variant?.trim() ?? "translate";
  const effectiveVariant = LANGUAGE_VARIANTS.has(variant) ? variant : "translate";

  const eligible = eligibleFlashcardMoreQuestions(card);
  const picked = eligible.length > 0 ? eligible[pickSeededIndex(card.id, eligible.length)] : undefined;

  if (effectiveVariant === "grammar" || effectiveVariant === "more_questions") {
    if (picked) {
      return {
        front: textOrPlaceholder(picked.question.trim(), "No follow-up question"),
        back: moreQuestionAnswerContextAndOriginalBack(card, picked),
      };
    }
    return languageTranslateFacesNoMq(card);
  }

  const main: FlashcardFaces =
    effectiveVariant === "produce" ? languageProduceFacesNoMq(card) : languageTranslateFacesNoMq(card);

  if (!picked) {
    return main;
  }

  return {
    front: main.front,
    back: vocabMoreQuestionAndOriginalBack(card, picked),
  };
}
