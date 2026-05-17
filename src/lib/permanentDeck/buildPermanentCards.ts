import type { CardEntity } from "@/features/cards/cardsSlice";

import { PERMANENT_CARD_IDS, PERMANENT_DECK_ID } from "@/lib/permanentDeck/constants";

/** Default scheduling for a newly created permanent card (due now). */
export function newPermanentCardFields(nowMs: number): Pick<
  CardEntity,
  "due_at" | "interval_days" | "ease" | "reps" | "lapses" | "last_reviewed_at"
> {
  return {
    due_at: new Date(nowMs).toISOString(),
    interval_days: 0,
    ease: 2.5,
    reps: 0,
    lapses: 0,
    last_reviewed_at: undefined,
  };
}

/** Build the five built-in permanent deck cards (image on front, no answer). */
export function buildPermanentCardTemplates(nowMs: number): CardEntity[] {
  return PERMANENT_CARD_IDS.map((id, i) => ({
    id,
    deck_id: PERMANENT_DECK_ID,
    front: "",
    back: "",
    context: "",
    note_type: "basic",
    card_variant: "front->back+context",
    ...newPermanentCardFields(nowMs),
    dirty: false,
  }));
}
