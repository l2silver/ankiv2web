import type { CardEntity } from "@/features/cards/cardsSlice";

import type { FlashcardFaces } from "../types";
import { resolveVocabBackToFrontPlusContextFlashcard } from "./back_to_front_plus_context";
import { resolveVocabContextToFrontPlusBackFlashcard } from "./context_to_front_plus_back";
import { resolveVocabFrontToBackPlusContextFlashcard } from "./front_to_back_plus_context";
import { resolveVocabMoreQuestionsFlashcard } from "./more_questions";
import {
  canonicalVocabCardVariant,
  VOCAB_VARIANT_BACK_FRONT_CTX,
  VOCAB_VARIANT_CONTEXT_FRONT_BACK_CTX,
  VOCAB_VARIANT_FRONT_BACK_CTX,
  VOCAB_VARIANT_MORE_QUESTIONS,
} from "./vocabVariantNames";

const VOCAB_VARIANTS = new Set<string>([
  VOCAB_VARIANT_FRONT_BACK_CTX,
  VOCAB_VARIANT_BACK_FRONT_CTX,
  VOCAB_VARIANT_CONTEXT_FRONT_BACK_CTX,
  VOCAB_VARIANT_MORE_QUESTIONS,
  "definition",
  "reverse",
  "words",
  "usage_cloze",
]);

export function resolveVocabFlashcardFaces(card: CardEntity): FlashcardFaces {
  const raw = card.card_variant?.trim() ?? VOCAB_VARIANT_FRONT_BACK_CTX;
  const v = VOCAB_VARIANTS.has(raw) ? raw : VOCAB_VARIANT_FRONT_BACK_CTX;
  const kind = canonicalVocabCardVariant(v);

  switch (kind) {
    case VOCAB_VARIANT_BACK_FRONT_CTX:
      return resolveVocabBackToFrontPlusContextFlashcard(card);
    case VOCAB_VARIANT_CONTEXT_FRONT_BACK_CTX:
      return resolveVocabContextToFrontPlusBackFlashcard(card);
    case VOCAB_VARIANT_MORE_QUESTIONS:
      return resolveVocabMoreQuestionsFlashcard(card);
    case VOCAB_VARIANT_FRONT_BACK_CTX:
    default:
      return resolveVocabFrontToBackPlusContextFlashcard(card);
  }
}
