/**
 * Shared `card_variant` literals where vocab and language use the same face layout
 * (disambiguated in the app by `note_type`).
 */
export const CARD_VARIANT_FRONT_BACK_PLUS_CONTEXT = "front->back+context";
export const CARD_VARIANT_BACK_FRONT_PLUS_CONTEXT = "back->front+context";
/** Vocab-only: context scaffold on front, then question + answer on back. */
export const CARD_VARIANT_CONTEXT_FRONT_PLUS_BACK = "context->front+back";
export const CARD_VARIANT_MORE_QUESTIONS = "more_questions";
