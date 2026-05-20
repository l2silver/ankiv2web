import { describe, expect, it } from "vitest";

import {
  appendQueueHeadToSessionTrailIfAtEnd,
  canGoBackInSessionTrail,
  emptySessionTrailState,
  goBackInSessionTrail,
  initSessionTrailIfEmpty,
  sessionTrailDisplayId,
  truncateSessionTrailOnFinish,
} from "@/lib/study/studySessionTrail";

describe("studySessionTrail", () => {
  it("initializes trail from queue head when empty", () => {
    expect(initSessionTrailIfEmpty(emptySessionTrailState(), "a")).toEqual({
      trail: ["a"],
      trailIndex: 0,
    });
    expect(initSessionTrailIfEmpty({ trail: ["x"], trailIndex: 0 }, "a")).toEqual({
      trail: ["x"],
      trailIndex: 0,
    });
  });

  it("appends queue head only when at trail end and head changed", () => {
    const atA = { trail: ["a"], trailIndex: 0 };
    expect(appendQueueHeadToSessionTrailIfAtEnd(atA, "a")).toEqual(atA);
    expect(appendQueueHeadToSessionTrailIfAtEnd(atA, "b")).toEqual({
      trail: ["a", "b"],
      trailIndex: 1,
    });
    const rewound = { trail: ["a", "b"], trailIndex: 0 };
    expect(appendQueueHeadToSessionTrailIfAtEnd(rewound, "b")).toEqual(rewound);
  });

  it("resolves display id from trail index or queue head", () => {
    expect(sessionTrailDisplayId(emptySessionTrailState(), "q")).toBe("q");
    expect(sessionTrailDisplayId({ trail: ["a", "b"], trailIndex: 1 }, "c")).toBe("b");
    expect(sessionTrailDisplayId({ trail: ["a", "b"], trailIndex: 0 }, "c")).toBe("a");
  });

  it("supports back only after the first card", () => {
    expect(canGoBackInSessionTrail({ trail: ["a"], trailIndex: 0 })).toBe(false);
    expect(canGoBackInSessionTrail({ trail: ["a", "b"], trailIndex: 1 })).toBe(true);
    expect(goBackInSessionTrail({ trail: ["a", "b"], trailIndex: 1 })).toEqual({
      trail: ["a", "b"],
      trailIndex: 0,
    });
    expect(goBackInSessionTrail({ trail: ["a"], trailIndex: 0 })).toEqual({
      trail: ["a"],
      trailIndex: 0,
    });
  });

  it("truncates forward trail on finish", () => {
    expect(truncateSessionTrailOnFinish({ trail: ["a", "b", "c"], trailIndex: 1 })).toEqual({
      trail: ["a", "b"],
      trailIndex: 1,
    });
  });
});
