import type { CardEntity } from "@/features/cards/cardsSlice";

import type { FlashcardFaces } from "../types";
import { resolveLanguageBackToFrontPlusContextFlashcard } from "./back_to_front_plus_context";
import { resolveLanguageFrontToBackPlusContextFlashcard } from "./front_to_back_plus_context";
import {
  canonicalLanguageCardVariant,
  LANGUAGE_VARIANT_BACK_FRONT_CTX,
  LANGUAGE_VARIANT_FRONT_BACK_CTX,
  LANGUAGE_VARIANT_MORE_QUESTIONS,
} from "./languageVariantNames";
import { resolveLanguageMoreQuestionsFlashcard } from "./more_questions";

const LANGUAGE_VARIANTS = new Set<string>([
  LANGUAGE_VARIANT_FRONT_BACK_CTX,
  LANGUAGE_VARIANT_BACK_FRONT_CTX,
  LANGUAGE_VARIANT_MORE_QUESTIONS,
  "translate",
  "produce",
  "grammar",
]);

export function resolveLanguageFlashcardFaces(card: CardEntity): FlashcardFaces {
  const raw = card.card_variant?.trim() ?? LANGUAGE_VARIANT_FRONT_BACK_CTX;
  const v = LANGUAGE_VARIANTS.has(raw) ? raw : LANGUAGE_VARIANT_FRONT_BACK_CTX;
  const kind = canonicalLanguageCardVariant(v);

  switch (kind) {
    case LANGUAGE_VARIANT_BACK_FRONT_CTX:
      return resolveLanguageBackToFrontPlusContextFlashcard(card);
    case LANGUAGE_VARIANT_MORE_QUESTIONS:
      return resolveLanguageMoreQuestionsFlashcard(card);
    case LANGUAGE_VARIANT_FRONT_BACK_CTX:
    default:
      return resolveLanguageFrontToBackPlusContextFlashcard(card);
  }
}
