import type { CardEntity } from "@/features/cards/cardsSlice";
import type { ConceptEntity } from "@/features/concepts/conceptsSlice";

import type { FlashcardFaces } from "./types";
import { withConceptTheoryOnBack } from "@/lib/flashcards/conceptOnBack";
import { withExtendedOnBack } from "@/lib/flashcards/extendedOnBack";
import { textOrPlaceholder } from "@/lib/flashcards/formatting";
import { resolveKnowledgeFlashcardFaces } from "./knowledge/resolveKnowledgeFlashcard";
import { resolveLanguageFlashcardFaces } from "./language/resolveLanguageFlashcard";
import { resolveVocabFlashcardFaces } from "./vocab/resolveVocabFlashcard";

export type FlashcardResolveContext = {
  conceptsById?: Record<string, ConceptEntity>;
};

/** Plain front/back from stored fields (legacy / unknown note_type). */
function defaultFaces(card: CardEntity): FlashcardFaces {
  const front = card.front?.trim() ?? "";
  const back = card.back?.trim() ?? "";
  return {
    front: textOrPlaceholder(front, "No question text"),
    back: textOrPlaceholder(back, "No answer text"),
  };
}

/** Routes by `note_type` / `card_variant`. Language / vocab / knowledge / basic use arrow-style `card_variant` strings; see each folder’s `*VariantNames.ts` and `front_to_back_plus_context.tsx` (etc.). */
export function resolveFlashcardFaces(card: CardEntity, ctx?: FlashcardResolveContext): FlashcardFaces {
  const noteType = card.note_type?.trim().toLowerCase() ?? "";
  let faces: FlashcardFaces;
  if (noteType === "vocab") {
    faces = resolveVocabFlashcardFaces(card);
  } else if (noteType === "language") {
    faces = resolveLanguageFlashcardFaces(card);
  } else if (noteType === "knowledge") {
    faces = resolveKnowledgeFlashcardFaces(card);
  } else if (noteType === "basic") {
    faces = resolveKnowledgeFlashcardFaces(card);
  } else {
    faces = defaultFaces(card);
  }
  let back = withExtendedOnBack(card, faces.back);
  back = withConceptTheoryOnBack(card, ctx?.conceptsById, back);
  return { front: faces.front, back };
}
