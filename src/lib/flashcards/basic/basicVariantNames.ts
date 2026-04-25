import {
  CARD_VARIANT_FRONT_BACK_PLUS_CONTEXT,
  CARD_VARIANT_MORE_QUESTIONS,
} from "@/lib/flashcards/sharedArrowCardVariants";

export const BASIC_VARIANT_FRONT_BACK_CTX = CARD_VARIANT_FRONT_BACK_PLUS_CONTEXT;
export const BASIC_VARIANT_MORE_QUESTIONS = CARD_VARIANT_MORE_QUESTIONS;

const LEGACY_TO_CANONICAL: Record<string, string> = {
  qa: BASIC_VARIANT_FRONT_BACK_CTX,
  grammar: BASIC_VARIANT_MORE_QUESTIONS,
};

/** Normalize legacy basic `card_variant` labels to current wire names. */
export function canonicalBasicCardVariant(raw: string): string {
  const t = raw.trim();
  return LEGACY_TO_CANONICAL[t] ?? t;
}
