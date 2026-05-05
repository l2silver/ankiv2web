import type { ReactNode } from "react";

import type { CardEntity } from "@/features/cards/cardsSlice";
import type { ConceptEntity } from "@/features/concepts/conceptsSlice";
import { textOrPlaceholder } from "@/lib/flashcards/formatting";

/**
 * Appends concept theory under the main back when `card.concept_id` resolves locally.
 * Renders `body` the same way as card fields (`textOrPlaceholder` + pre-wrapped whitespace), not Markdown.
 */
export function withConceptTheoryOnBack(
  card: CardEntity,
  conceptsById: Record<string, ConceptEntity> | undefined,
  back: ReactNode,
): ReactNode {
  const cid = card.concept_id?.trim() ?? "";
  if (!cid || !conceptsById) return back;
  const concept = conceptsById[cid];
  const body = concept?.body?.trim() ?? "";
  if (!body) return back;
  const heading = concept.title?.trim() || "Concept";
  return (
    <>
      {back}
      <section className="mt-6 border-t border-zinc-700 pt-5">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{heading}</p>
        <div className="mt-2 text-base leading-relaxed text-zinc-100">{textOrPlaceholder(body)}</div>
      </section>
    </>
  );
}
