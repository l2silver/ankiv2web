import type { ReactNode } from "react";

import { textOrPlaceholder } from "@/lib/flashcards/formatting";

type MainFields = {
  front: string;
  back: string;
  context: string;
};

/** Front = main question; back = answer, optional context under a divider. */
export function mainQuestionFront(fields: MainFields, emptyFrontLabel = "No question text"): ReactNode {
  return textOrPlaceholder(fields.front, emptyFrontLabel);
}

export function mainAnswerWithOptionalContextBack(fields: MainFields): ReactNode {
  const { back: a, context: ctx } = fields;
  if (ctx.length > 0) {
    return (
      <>
        {textOrPlaceholder(a)}
        <span className="mt-4 block border-t border-zinc-800 pt-4 text-base text-zinc-300">
          {textOrPlaceholder(ctx)}
        </span>
      </>
    );
  }
  return textOrPlaceholder(a);
}

/** Front = main answer; back = question, optional context under a divider. */
export function mainAnswerFront(fields: MainFields, emptyFrontLabel = "No answer text"): ReactNode {
  return textOrPlaceholder(fields.back, emptyFrontLabel);
}

export function mainQuestionWithOptionalContextBack(fields: MainFields): ReactNode {
  const { front: q, context: ctx } = fields;
  if (ctx.length > 0) {
    return (
      <>
        {textOrPlaceholder(q)}
        <span className="mt-4 block border-t border-zinc-800 pt-4 text-base text-zinc-300">
          {textOrPlaceholder(ctx)}
        </span>
      </>
    );
  }
  return textOrPlaceholder(q);
}

/** Front = context (scaffold); back = question, then answer under a divider. */
export function contextScaffoldFront(fields: MainFields, emptyFrontLabel = "No context text"): ReactNode {
  return textOrPlaceholder(fields.context, emptyFrontLabel);
}

export function questionThenAnswerBack(fields: MainFields): ReactNode {
  const { front: q, back: a } = fields;
  return (
    <>
      {textOrPlaceholder(q)}
      <span className="mt-4 block border-t border-zinc-800 pt-4 text-base text-zinc-200">
        {textOrPlaceholder(a)}
      </span>
    </>
  );
}
