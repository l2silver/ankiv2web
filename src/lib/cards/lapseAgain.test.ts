import { describe, expect, it } from "vitest";

import type { CardEntity } from "@/features/cards/cardsSlice";
import {
  clampLapseAgainDays,
  customLapseIntervalDaysForGrade,
  DEFAULT_LAPSE_AGAIN_MINUTES,
  hasCustomLapseAgainDays,
  LAPSE_AGAIN_PRESET_DAYS,
  LAPSE_MAX_EASY_DAYS,
  lapseAgainLabel,
} from "@/lib/cards/lapseAgain";

function card(overrides: Partial<CardEntity> = {}): CardEntity {
  return { id: "test-note", ...overrides };
}

describe("lapseAgain", () => {
  it("clamps easy max days to 0–180", () => {
    expect(clampLapseAgainDays(-3)).toBe(0);
    expect(clampLapseAgainDays(45)).toBe(45);
    expect(clampLapseAgainDays(999)).toBe(LAPSE_MAX_EASY_DAYS);
    expect(clampLapseAgainDays(45.9)).toBe(45);
  });

  it("detects custom easy max only when days > 0", () => {
    expect(hasCustomLapseAgainDays(card())).toBe(false);
    expect(hasCustomLapseAgainDays(card({ lapse_again_days: 0 }))).toBe(false);
    expect(hasCustomLapseAgainDays(card({ lapse_again_days: 14 }))).toBe(true);
  });

  it("halves easy max for good and hard on brand-new cards", () => {
    expect(customLapseIntervalDaysForGrade(45, "easy")).toBe(45);
    expect(customLapseIntervalDaysForGrade(45, "good")).toBe(22.5);
    expect(customLapseIntervalDaysForGrade(45, "hard")).toBe(11.25);
  });

  it("labels default again vs custom easy max", () => {
    expect(lapseAgainLabel(card())).toBe(`${DEFAULT_LAPSE_AGAIN_MINUTES}m`);
    expect(lapseAgainLabel(card({ lapse_again_days: 45 }))).toBe("45d");
  });

  it("exposes browse presets including 45 on the right", () => {
    expect([...LAPSE_AGAIN_PRESET_DAYS]).toEqual([1, 3, 7, 14, 45]);
    expect(LAPSE_AGAIN_PRESET_DAYS.at(-1)).toBe(45);
  });
});
