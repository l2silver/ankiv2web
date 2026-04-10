import type { ReactNode } from "react";

import type { CardEntity } from "@/features/cards/cardsSlice";

import { textOrPlaceholder } from "@/lib/flashcards/formatting";

/** Front: main answer. Back (no follow-ups): question + context. */
export function vocabReverseFacesNoMq(card: CardEntity): { front: ReactNode; back: ReactNode } {
  const q = card.front?.trim() ?? "";
  const a = card.back?.trim() ?? "";
  const ctx = card.context?.trim() ?? "";
  const back =
    ctx.length > 0 ? (
      <>
        {textOrPlaceholder(q)}
        <span className="mt-4 block border-t border-zinc-800 pt-4 text-base text-zinc-300">
          {textOrPlaceholder(ctx)}
        </span>
      </>
    ) : (
      textOrPlaceholder(q)
    );
  return {
    front: textOrPlaceholder(a, "No answer text"),
    back,
  };
}
