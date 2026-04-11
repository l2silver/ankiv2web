import {
  CARD_VARIANT_BACK_FRONT_PLUS_CONTEXT,
  CARD_VARIANT_CONTEXT_FRONT_PLUS_BACK,
  CARD_VARIANT_FRONT_BACK_PLUS_CONTEXT,
  CARD_VARIANT_MORE_QUESTIONS,
} from "@/lib/flashcards/sharedArrowCardVariants";

export const VOCAB_VARIANT_FRONT_BACK_CTX = CARD_VARIANT_FRONT_BACK_PLUS_CONTEXT;
export const VOCAB_VARIANT_BACK_FRONT_CTX = CARD_VARIANT_BACK_FRONT_PLUS_CONTEXT;
export const VOCAB_VARIANT_CONTEXT_FRONT_BACK_CTX = CARD_VARIANT_CONTEXT_FRONT_PLUS_BACK;
export const VOCAB_VARIANT_MORE_QUESTIONS = CARD_VARIANT_MORE_QUESTIONS;

const LEGACY_TO_CANONICAL: Record<string, string> = {
  definition: VOCAB_VARIANT_FRONT_BACK_CTX,
  reverse: VOCAB_VARIANT_BACK_FRONT_CTX,
  words: VOCAB_VARIANT_CONTEXT_FRONT_BACK_CTX,
  usage_cloze: VOCAB_VARIANT_CONTEXT_FRONT_BACK_CTX,
};

/** Normalize legacy vocab `card_variant` labels to current wire names. */
export function canonicalVocabCardVariant(raw: string): string {
  const t = raw.trim();
  return LEGACY_TO_CANONICAL[t] ?? t;
}
