import type { ReactNode } from "react";

import type { CardEntity } from "@/features/cards/cardsSlice";

import { textOrPlaceholder } from "@/lib/flashcards/formatting";

/** Front: main question. Back (no follow-ups): answer + context. */
export function vocabDefinitionFacesNoMq(card: CardEntity): { front: ReactNode; back: ReactNode } {
  const q = card.front?.trim() ?? "";
  const a = card.back?.trim() ?? "";
  const ctx = card.context?.trim() ?? "";
  const back =
    ctx.length > 0 ? (
      <>
        {textOrPlaceholder(a)}
        <span className="mt-4 block border-t border-zinc-800 pt-4 text-base text-zinc-300">
          {textOrPlaceholder(ctx)}
        </span>
      </>
    ) : (
      textOrPlaceholder(a)
    );
  return {
    front: textOrPlaceholder(q, "No question text"),
    back,
  };
}
