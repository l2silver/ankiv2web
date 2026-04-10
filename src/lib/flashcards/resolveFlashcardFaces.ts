import type { CardEntity } from "@/features/cards/cardsSlice";

import type { FlashcardFaces } from "./types";
import { textOrPlaceholder } from "@/lib/flashcards/formatting";
import { resolveKnowledgeFlashcardFaces } from "./knowledge/resolveKnowledgeFlashcard";
import { resolveLanguageFlashcardFaces } from "./language/resolveLanguageFlashcard";
import { resolveVocabFlashcardFaces } from "./vocab/resolveVocabFlashcard";

/** Plain front/back from stored fields (legacy / unknown note_type). */
function defaultFaces(card: CardEntity): FlashcardFaces {
  const front = card.front?.trim() ?? "";
  const back = card.back?.trim() ?? "";
  return {
    front: textOrPlaceholder(front, "No question text"),
    back: textOrPlaceholder(back, "No answer text"),
  };
}

export function resolveFlashcardFaces(card: CardEntity): FlashcardFaces {
  const noteType = card.note_type?.trim().toLowerCase() ?? "";
  if (noteType === "vocab") {
    return resolveVocabFlashcardFaces(card);
  }
  if (noteType === "language") {
    return resolveLanguageFlashcardFaces(card);
  }
  if (noteType === "knowledge") {
    return resolveKnowledgeFlashcardFaces(card);
  }
  return defaultFaces(card);
}
