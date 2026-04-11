import type { CardEntity } from "@/features/cards/cardsSlice";

import type { FlashcardFaces } from "../types";
import { resolveKnowledgeBackToFrontPlusContextFlashcard } from "./back_to_front_plus_context";
import { resolveKnowledgeFrontToBackPlusContextFlashcard } from "./front_to_back_plus_context";
import {
  canonicalKnowledgeCardVariant,
  KNOWLEDGE_VARIANT_BACK_FRONT_CTX,
  KNOWLEDGE_VARIANT_FRONT_BACK_CTX,
  KNOWLEDGE_VARIANT_MORE_QUESTIONS,
} from "./knowledgeVariantNames";
import { resolveKnowledgeMoreQuestionsFlashcard } from "./more_questions";

const KNOWLEDGE_VARIANTS = new Set<string>([
  KNOWLEDGE_VARIANT_FRONT_BACK_CTX,
  KNOWLEDGE_VARIANT_BACK_FRONT_CTX,
  KNOWLEDGE_VARIANT_MORE_QUESTIONS,
  "qa",
  "explain",
]);

export function resolveKnowledgeFlashcardFaces(card: CardEntity): FlashcardFaces {
  const raw = card.card_variant?.trim() ?? KNOWLEDGE_VARIANT_FRONT_BACK_CTX;
  const v = KNOWLEDGE_VARIANTS.has(raw) ? raw : KNOWLEDGE_VARIANT_FRONT_BACK_CTX;
  const kind = canonicalKnowledgeCardVariant(v);

  switch (kind) {
    case KNOWLEDGE_VARIANT_BACK_FRONT_CTX:
      return resolveKnowledgeBackToFrontPlusContextFlashcard(card);
    case KNOWLEDGE_VARIANT_MORE_QUESTIONS:
      return resolveKnowledgeMoreQuestionsFlashcard(card);
    case KNOWLEDGE_VARIANT_FRONT_BACK_CTX:
    default:
      return resolveKnowledgeFrontToBackPlusContextFlashcard(card);
  }
}
