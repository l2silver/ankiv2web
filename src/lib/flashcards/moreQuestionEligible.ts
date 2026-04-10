import type { CardEntity, MoreQuestion } from "@/features/cards/cardsSlice";

/** Flashcard follow-ups only (not crossword grid rows). */
export function eligibleFlashcardMoreQuestions(card: CardEntity): MoreQuestion[] {
  const mq = card.more_questions;
  if (!mq?.length) return [];
  return mq.filter((row) => {
    if (row.type === "Crossword") return false;
    const q = row.question?.trim() ?? "";
    const a = row.answer?.trim() ?? "";
    return q.length > 0 && a.length > 0;
  });
}
