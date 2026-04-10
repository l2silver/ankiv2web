import type { CardEntity } from "@/features/cards/cardsSlice";

/** Keep in sync with `vocab/resolveVocabFlashcard.ts`. */
const VOCAB_VARIANTS = new Set(["definition", "reverse", "words", "usage_cloze", "more_questions"]);

/** Keep in sync with `language/resolveLanguageFlashcard.ts`. */
const LANGUAGE_VARIANTS = new Set(["translate", "produce", "grammar", "more_questions"]);

/** Keep in sync with `knowledge/resolveKnowledgeFlashcard.ts`. */
const KNOWLEDGE_VARIANTS = new Set(["qa", "explain", "more_questions"]);

/**
 * Variant string actually used by `resolveFlashcardFaces` (defaults when `card_variant` is missing or unknown).
 * Use for UI labels so legacy docs without `card_variant` still show the correct layout name.
 */
export function getEffectiveCardVariant(card: CardEntity): string {
  const noteType = card.note_type?.trim().toLowerCase() ?? "";

  if (noteType === "vocab") {
    const variant = card.card_variant?.trim() ?? "definition";
    return VOCAB_VARIANTS.has(variant) ? variant : "definition";
  }
  if (noteType === "language") {
    const variant = card.card_variant?.trim() ?? "translate";
    return LANGUAGE_VARIANTS.has(variant) ? variant : "translate";
  }
  if (noteType === "knowledge") {
    const variant = card.card_variant?.trim() ?? "qa";
    return KNOWLEDGE_VARIANTS.has(variant) ? variant : "qa";
  }

  return card.card_variant?.trim() ?? "";
}
