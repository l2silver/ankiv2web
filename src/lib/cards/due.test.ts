import { describe, expect, it } from "vitest";

import type { CardEntity } from "@/features/cards/cardsSlice";

import { dueCardIdsForDeck } from "./deckTree";
import { isCardDueNow } from "./due";

function card(overrides: Partial<CardEntity> = {}): CardEntity {
  return {
    id: "c1",
    deck_id: "Science::Inner Solar",
    due_at: "2020-01-01T00:00:00.000Z",
    suspended: false,
    ...overrides,
  };
}

describe("isCardDueNow", () => {
  const nowMs = Date.parse("2025-01-01T00:00:00.000Z");

  it("returns false when the card is suspended", () => {
    expect(isCardDueNow(card({ suspended: true }), nowMs)).toBe(false);
  });

  it("returns true for an otherwise due card", () => {
    expect(isCardDueNow(card(), nowMs)).toBe(true);
  });
});

describe("dueCardIdsForDeck", () => {
  const nowMs = Date.parse("2025-01-01T00:00:00.000Z");
  const deckPath = "Science::Inner Solar";

  it("omits suspended cards from the flashcard study queue", () => {
    const due = card({ id: "due", card_variant: "front->back+context" });
    const suspended = card({ id: "suspended", suspended: true, card_variant: "front->back+context" });
    const byId = { due, suspended };
    const allIds = ["due", "suspended"];

    expect(dueCardIdsForDeck(byId, allIds, deckPath, nowMs, "flashcard")).toEqual(["due"]);
  });
});
