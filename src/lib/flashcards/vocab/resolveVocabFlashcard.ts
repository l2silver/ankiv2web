import type { CardEntity } from "@/features/cards/cardsSlice";

import type { FlashcardFaces } from "../types";
import { eligibleFlashcardMoreQuestions } from "../moreQuestionEligible";
import { pickSeededIndex } from "../pickSeededIndex";
import { textOrPlaceholder } from "@/lib/flashcards/formatting";
import { vocabDefinitionFacesNoMq } from "./definition";
import {
  moreQuestionAnswerContextAndOriginalBack,
  vocabMoreQuestionAndOriginalBack,
} from "./moreQuestionBack";
import { vocabReverseFacesNoMq } from "./reverse";
import { vocabUsageClozeFacesNoMq } from "./usageCloze";

/** Matches `NOTE_TYPE_CARD_VARIANTS.vocab` (`words` + legacy `usage_cloze` for stored rows). */
const VOCAB_VARIANTS = new Set(["definition", "reverse", "words", "usage_cloze", "more_questions"]);

export function resolveVocabFlashcardFaces(card: CardEntity): FlashcardFaces {
  const variant = card.card_variant?.trim() ?? "definition";
  const effectiveVariant = VOCAB_VARIANTS.has(variant) ? variant : "definition";

  const eligible = eligibleFlashcardMoreQuestions(card);
  const picked = eligible.length > 0 ? eligible[pickSeededIndex(card.id, eligible.length)] : undefined;

  if (effectiveVariant === "more_questions") {
    if (picked) {
      return {
        front: textOrPlaceholder(picked.question.trim(), "No follow-up question"),
        back: moreQuestionAnswerContextAndOriginalBack(card, picked),
      };
    }
    return vocabDefinitionFacesNoMq(card);
  }

  let main: FlashcardFaces;
  switch (effectiveVariant) {
    case "reverse":
      main = vocabReverseFacesNoMq(card);
      break;
    case "words":
    case "usage_cloze":
      main = vocabUsageClozeFacesNoMq(card);
      break;
    case "definition":
    default:
      main = vocabDefinitionFacesNoMq(card);
      break;
  }

  if (!picked) {
    return main;
  }

  return {
    front: main.front,
    back: vocabMoreQuestionAndOriginalBack(card, picked),
  };
}
