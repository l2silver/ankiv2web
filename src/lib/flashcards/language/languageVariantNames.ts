import {
  CARD_VARIANT_BACK_FRONT_PLUS_CONTEXT,
  CARD_VARIANT_FRONT_BACK_PLUS_CONTEXT,
  CARD_VARIANT_MORE_QUESTIONS,
} from "@/lib/flashcards/sharedArrowCardVariants";

/** Canonical `card_variant` strings for `note_type: language` (wire + UI). */
export const LANGUAGE_VARIANT_FRONT_BACK_CTX = CARD_VARIANT_FRONT_BACK_PLUS_CONTEXT;
export const LANGUAGE_VARIANT_BACK_FRONT_CTX = CARD_VARIANT_BACK_FRONT_PLUS_CONTEXT;
export const LANGUAGE_VARIANT_MORE_QUESTIONS = CARD_VARIANT_MORE_QUESTIONS;

const LEGACY_TO_CANONICAL: Record<string, string> = {
  translate: LANGUAGE_VARIANT_FRONT_BACK_CTX,
  produce: LANGUAGE_VARIANT_BACK_FRONT_CTX,
  grammar: LANGUAGE_VARIANT_MORE_QUESTIONS,
};

/** Normalize legacy `card_variant` labels to current wire names. */
export function canonicalLanguageCardVariant(raw: string): string {
  const t = raw.trim();
  return LEGACY_TO_CANONICAL[t] ?? t;
}
