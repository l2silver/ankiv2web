import type { ReactNode } from "react";

import type { CardEntity } from "@/features/cards/cardsSlice";

/**
 * Appends note-level `extended` text below the main back content (study + card browser).
 * Only non-empty trimmed text is shown; styled as secondary reference material.
 */
export function withExtendedOnBack(card: CardEntity, back: ReactNode): ReactNode {
  const ext = card.extended?.trim() ?? "";
  if (!ext) return back;
  return (
    <>
      {back}
      <section className="mt-6 border-t border-zinc-700 pt-5">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Notes</p>
        <div className="mt-2 text-base leading-relaxed text-zinc-300 whitespace-pre-wrap">{ext}</div>
      </section>
    </>
  );
}
