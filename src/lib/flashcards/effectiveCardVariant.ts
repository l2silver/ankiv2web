import type { CardEntity } from "@/features/cards/cardsSlice";

import { CARD_VARIANT_FRONT_BACK_PLUS_CONTEXT } from "@/lib/flashcards/sharedArrowCardVariants";
import {
  canonicalLanguageCardVariant,
  LANGUAGE_VARIANT_BACK_FRONT_CTX,
  LANGUAGE_VARIANT_FRONT_BACK_CTX,
  LANGUAGE_VARIANT_MORE_QUESTIONS,
} from "@/lib/flashcards/language/languageVariantNames";
import {
  canonicalKnowledgeCardVariant,
  KNOWLEDGE_VARIANT_BACK_FRONT_CTX,
  KNOWLEDGE_VARIANT_FRONT_BACK_CTX,
  KNOWLEDGE_VARIANT_MORE_QUESTIONS,
} from "@/lib/flashcards/knowledge/knowledgeVariantNames";
import {
  canonicalVocabCardVariant,
  VOCAB_VARIANT_BACK_FRONT_CTX,
  VOCAB_VARIANT_CONTEXT_FRONT_BACK_CTX,
  VOCAB_VARIANT_FRONT_BACK_CTX,
  VOCAB_VARIANT_MORE_QUESTIONS,
} from "@/lib/flashcards/vocab/vocabVariantNames";

/** Keep in sync with `vocab/resolveVocabFlashcard.ts` and per-variant files under `vocab/`. */
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

/** Keep in sync with `language/resolveLanguageFlashcard.ts` and per-variant files under `language/`. */
const LANGUAGE_VARIANTS = new Set([
  LANGUAGE_VARIANT_FRONT_BACK_CTX,
  LANGUAGE_VARIANT_BACK_FRONT_CTX,
  LANGUAGE_VARIANT_MORE_QUESTIONS,
  "translate",
  "produce",
  "grammar",
]);

/** Keep in sync with `knowledge/resolveKnowledgeFlashcard.ts` and per-variant files under `knowledge/`. */
const KNOWLEDGE_VARIANTS = new Set<string>([
  KNOWLEDGE_VARIANT_FRONT_BACK_CTX,
  KNOWLEDGE_VARIANT_BACK_FRONT_CTX,
  KNOWLEDGE_VARIANT_MORE_QUESTIONS,
  "qa",
  "explain",
]);

/**
 * Variant string actually used by `resolveFlashcardFaces` (defaults when `card_variant` is missing or unknown).
 * Use for UI labels so legacy docs without `card_variant` still show the correct layout name.
 */
export function getEffectiveCardVariant(card: CardEntity): string {
  const noteType = card.note_type?.trim().toLowerCase() ?? "";

  if (noteType === "vocab") {
    const variant = card.card_variant?.trim() ?? CARD_VARIANT_FRONT_BACK_PLUS_CONTEXT;
    if (!VOCAB_VARIANTS.has(variant)) {
      return CARD_VARIANT_FRONT_BACK_PLUS_CONTEXT;
    }
    return canonicalVocabCardVariant(variant);
  }
  if (noteType === "language") {
    const variant = card.card_variant?.trim() ?? LANGUAGE_VARIANT_FRONT_BACK_CTX;
    if (!LANGUAGE_VARIANTS.has(variant)) {
      return LANGUAGE_VARIANT_FRONT_BACK_CTX;
    }
    return canonicalLanguageCardVariant(variant);
  }
  if (noteType === "knowledge") {
    const variant = card.card_variant?.trim() ?? CARD_VARIANT_FRONT_BACK_PLUS_CONTEXT;
    if (!KNOWLEDGE_VARIANTS.has(variant)) {
      return CARD_VARIANT_FRONT_BACK_PLUS_CONTEXT;
    }
    return canonicalKnowledgeCardVariant(variant);
  }

  return card.card_variant?.trim() ?? "";
}
