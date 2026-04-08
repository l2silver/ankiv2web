import type { CardEntity, CrosswordQuestion, MoreQuestion } from "@/features/cards/cardsSlice";

/** All crossword clues on a card (each `more_questions` row with `type: "Crossword"`). */
export function crosswordQuestionsFromCard(card: CardEntity): CrosswordQuestion[] {
  const out: CrosswordQuestion[] = [];
  for (const item of card.more_questions ?? []) {
    if (item.type !== "Crossword") continue;
    const ext = item as MoreQuestion & { questions?: CrosswordQuestion[] };
    if (Array.isArray(ext.questions) && ext.questions.length > 0) {
      out.push(...ext.questions);
    } else {
      out.push({ question: item.question, answer: item.answer });
    }
  }
  if (out.length > 0) return out;
  const legacy = (card as CardEntity & { crossword_questions?: CrosswordQuestion[] }).crossword_questions;
  return legacy ?? [];
}
