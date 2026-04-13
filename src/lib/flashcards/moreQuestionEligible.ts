import type { CardEntity, MoreQuestion } from "@/features/cards/cardsSlice";

import { cardHasPlayableCrossword } from "@/lib/cards/crosswordFromCard";
import { getEffectiveCardVariant } from "@/lib/flashcards/effectiveCardVariant";

/*
 * Vacant `more_questions` rows (crossword-only) are skipped in the flashcard queue; after each review,
 * Crossword grading uses `markScheduleAcrossNoteVariantsLocal` (full schedule on every variant).
 * Flashcard grading uses `markFlashcardReviewDeferSiblingDuesLocal` (graded variant only + sibling due deferral).
 */

/** Flashcard follow-ups only (not crossword grid rows). */
export function eligibleFlashcardMoreQuestions(card: CardEntity): MoreQuestion[] {
  const mq = card.more_questions;
  if (!mq?.length) return [];
  return mq.filter((row) => {
    if (String(row.type ?? "").trim().toLowerCase() === "crossword") return false;
    const q = row.question?.trim() ?? "";
    const a = row.answer?.trim() ?? "";
    return q.length > 0 && a.length > 0;
  });
}

/**
 * `more_questions` layout with nothing to drill (no non-crossword follow-ups with Q+A).
 * Such a row should not appear in the flashcard queue (it would otherwise fall back to the base layout).
 */
export function isVacantMoreQuestionsFlashcardVariant(card: CardEntity): boolean {
  if (getEffectiveCardVariant(card) !== "more_questions") return false;
  return eligibleFlashcardMoreQuestions(card).length === 0;
}

/** Due in flashcard mode: omit vacant `more_questions` variant cards. */
export function countsInFlashcardStudyQueue(card: CardEntity): boolean {
  return !isVacantMoreQuestionsFlashcardVariant(card);
}

/**
 * Deck list totals: omit cards that only exist as a broken `more_questions` flashcard with no clues
 * and no playable crossword content (same minimum answer length as the crossword study pipeline).
 */
export function countsInDeckTreeAggregates(card: CardEntity): boolean {
  if (!isVacantMoreQuestionsFlashcardVariant(card)) return true;
  return cardHasPlayableCrossword(card);
}
