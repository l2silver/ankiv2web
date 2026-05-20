import { describe, expect, it } from "vitest";

import type { CardEntity } from "@/features/cards/cardsSlice";
import { scheduleAfterReview } from "@/lib/cards/scheduleReview";

/** Stable id so fuzz multiplier is deterministic across runs. */
const BRAND_NEW: CardEntity = {
  id: "e2e-lapse-schedule-brand-new",
  reps: 0,
  lapses: 0,
  ease: 2.5,
  interval_days: 0,
};

const NOW_MS = Date.parse("2026-05-16T12:00:00.000Z");

/** Scheduler applies deterministic ±5% fuzz to day intervals. */
function expectFuzzedDays(actual: number | undefined, target: number) {
  expect(actual).toBeDefined();
  expect(actual!).toBeGreaterThanOrEqual(target * 0.95);
  expect(actual!).toBeLessThanOrEqual(target * 1.05);
}

describe("scheduleReview — custom easy max on brand-new cards", () => {
  it("uses custom easy max for Easy and halves for Good/Hard", () => {
    const withCustom = { ...BRAND_NEW, lapse_again_days: 40 };

    const easy = scheduleAfterReview(withCustom, "easy", NOW_MS);
    const good = scheduleAfterReview(withCustom, "good", NOW_MS);
    const hard = scheduleAfterReview(withCustom, "hard", NOW_MS);

    expectFuzzedDays(easy.interval_days, 40);
    expectFuzzedDays(good.interval_days, 20);
    expectFuzzedDays(hard.interval_days, 10);
  });

  it("still uses default again delay (minutes) when custom easy max is set", () => {
    const withCustom = { ...BRAND_NEW, lapse_again_days: 40 };
    const again = scheduleAfterReview(withCustom, "again", NOW_MS);
    const dueMs = Date.parse(again.due_at ?? "");
    const diffMin = (dueMs - NOW_MS) / 60_000;
    expect(diffMin).toBeGreaterThan(5);
    expect(diffMin).toBeLessThan(20);
    expect(again.reps).toBe(0);
    expect(again.lapses).toBe(1);
  });

  it("falls back to default brand-new intervals without custom easy max", () => {
    const good = scheduleAfterReview(BRAND_NEW, "good", NOW_MS);
    expectFuzzedDays(good.interval_days, 1);
  });
});
