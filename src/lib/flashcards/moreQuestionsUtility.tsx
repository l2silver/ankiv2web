import type { ReactNode } from "react";

import type { CardEntity, MoreQuestion } from "@/features/cards/cardsSlice";

import { textOrPlaceholder } from "@/lib/flashcards/formatting";
import { eligibleFlashcardMoreQuestions } from "@/lib/flashcards/moreQuestionEligible";
import { pickSeededIndex } from "@/lib/flashcards/pickSeededIndex";

/** One stable non-crossword follow-up row for this card (same pick across flips). */
export function pickedFlashcardMoreQuestion(card: CardEntity): MoreQuestion | undefined {
  const eligible = eligibleFlashcardMoreQuestions(card);
  if (eligible.length === 0) return undefined;
  return eligible[pickSeededIndex(card.id, eligible.length)];
}

/**
 * Back when the **front** is only the follow-up question: show answer + optional context,
 * then the note’s main Q/A under “Original card”.
 */
export function answerContextThenOriginalCardBack(card: CardEntity, picked: MoreQuestion): ReactNode {
  const mainQ = card.front?.trim() ?? "";
  const mainA = card.back?.trim() ?? "";
  const mqCtx =
    typeof picked.context === "string" && picked.context.trim().length > 0 ? picked.context.trim() : "";

  return (
    <div className="space-y-6">
      <section>
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Follow-up</p>
        <div className="mt-2 space-y-3 text-lg leading-relaxed text-zinc-100">
          <div className="text-zinc-200">{textOrPlaceholder(picked.answer.trim(), "—")}</div>
          {mqCtx.length > 0 ? (
            <div className="border-t border-zinc-800 pt-3 text-base text-zinc-300 whitespace-pre-wrap">{mqCtx}</div>
          ) : null}
        </div>
      </section>
      <section className="border-t border-zinc-700 pt-6">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Original card</p>
        <div className="mt-3 space-y-3 text-base leading-relaxed text-zinc-200">
          <div>
            <span className="text-zinc-500">Q </span>
            {textOrPlaceholder(mainQ)}
          </div>
          <div>
            <span className="text-zinc-500">A </span>
            {textOrPlaceholder(mainA)}
          </div>
        </div>
      </section>
    </div>
  );
}

/**
 * Back when the **front** is the main card: show the full follow-up (Q, A, optional context),
 * then the note’s main Q/A under “Original card”.
 */
export function followUpQaBlockThenOriginalCardBack(card: CardEntity, picked: MoreQuestion): ReactNode {
  const mainQ = card.front?.trim() ?? "";
  const mainA = card.back?.trim() ?? "";
  const mqCtx =
    typeof picked.context === "string" && picked.context.trim().length > 0 ? picked.context.trim() : "";

  return (
    <div className="space-y-6">
      <section>
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Follow-up</p>
        <div className="mt-2 space-y-3 text-lg leading-relaxed text-zinc-100">
          <div>{textOrPlaceholder(picked.question.trim(), "—")}</div>
          <div className="border-t border-zinc-800 pt-3 text-zinc-200">
            {textOrPlaceholder(picked.answer.trim(), "—")}
          </div>
          {mqCtx.length > 0 ? (
            <div className="border-t border-zinc-800 pt-3 text-base text-zinc-300 whitespace-pre-wrap">{mqCtx}</div>
          ) : null}
        </div>
      </section>
      <section className="border-t border-zinc-700 pt-6">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Original card</p>
        <div className="mt-3 space-y-3 text-base leading-relaxed text-zinc-200">
          <div>
            <span className="text-zinc-500">Q </span>
            {textOrPlaceholder(mainQ)}
          </div>
          <div>
            <span className="text-zinc-500">A </span>
            {textOrPlaceholder(mainA)}
          </div>
        </div>
      </section>
    </div>
  );
}
