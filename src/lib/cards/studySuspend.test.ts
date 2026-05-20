import { describe, expect, it, vi } from "vitest";

import { suspendStudyCardVariant, STUDY_SUSPEND_CARD_FIELDS } from "./studySuspend";

describe("suspendStudyCardVariant", () => {
  it("marks the card suspended via markCardDirtyLocal (no confirmation step)", async () => {
    const unwrap = vi.fn().mockResolvedValue("card-1");
    const dispatch = vi.fn(() => ({ unwrap }));

    const did = await suspendStudyCardVariant({ id: "card-1" }, false, dispatch);

    expect(did).toBe(true);
    expect(STUDY_SUSPEND_CARD_FIELDS).toEqual({ suspended: true });
    expect(dispatch).toHaveBeenCalledOnce();
    expect(unwrap).toHaveBeenCalledOnce();
  });

  it("does nothing when there is no card", async () => {
    const dispatch = vi.fn();
    expect(await suspendStudyCardVariant(undefined, false, dispatch)).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("does nothing while grading is locked", async () => {
    const dispatch = vi.fn();
    expect(await suspendStudyCardVariant({ id: "card-1" }, true, dispatch)).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();
  });
});
