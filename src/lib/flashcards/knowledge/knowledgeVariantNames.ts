import {
  CARD_VARIANT_BACK_FRONT_PLUS_CONTEXT,
  CARD_VARIANT_FRONT_BACK_PLUS_CONTEXT,
  CARD_VARIANT_MORE_QUESTIONS,
} from "@/lib/flashcards/sharedArrowCardVariants";

export const KNOWLEDGE_VARIANT_FRONT_BACK_CTX = CARD_VARIANT_FRONT_BACK_PLUS_CONTEXT;
export const KNOWLEDGE_VARIANT_BACK_FRONT_CTX = CARD_VARIANT_BACK_FRONT_PLUS_CONTEXT;
export const KNOWLEDGE_VARIANT_MORE_QUESTIONS = CARD_VARIANT_MORE_QUESTIONS;

const LEGACY_TO_CANONICAL: Record<string, string> = {
  qa: KNOWLEDGE_VARIANT_FRONT_BACK_CTX,
  explain: KNOWLEDGE_VARIANT_BACK_FRONT_CTX,
};

/** Normalize legacy knowledge `card_variant` labels to current wire names. */
export function canonicalKnowledgeCardVariant(raw: string): string {
  const t = raw.trim();
  return LEGACY_TO_CANONICAL[t] ?? t;
}
