import type { ReactNode } from "react";

import type { CardEntity } from "@/features/cards/cardsSlice";

import { textOrPlaceholder } from "@/lib/flashcards/formatting";

/**
 * "Words" / usage variant: front = context (hints / scaffold), back = question + answer.
 */
export function vocabUsageClozeFacesNoMq(card: CardEntity): { front: ReactNode; back: ReactNode } {
  const q = card.front?.trim() ?? "";
  const a = card.back?.trim() ?? "";
  const ctx = card.context?.trim() ?? "";
  const back = (
    <>
      {textOrPlaceholder(q)}
      <span className="mt-4 block border-t border-zinc-800 pt-4 text-base text-zinc-200">
        {textOrPlaceholder(a)}
      </span>
    </>
  );
  return {
    front: textOrPlaceholder(ctx, "No context text"),
    back,
  };
}
