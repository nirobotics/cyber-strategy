import { describe, expect, it } from "vitest";
import { matchDisplayLabel, ratingDotClassName } from "./analytics-dashboard";

describe("analytics dashboard UI helpers", () => {
  it("uses exactly one background class for rating dots", () => {
    expect(ratingDotClassName(true)).toContain("bg-brand");
    expect(ratingDotClassName(true)).not.toContain("bg-line");
    expect(ratingDotClassName(false)).toContain("bg-line");
    expect(ratingDotClassName(false)).not.toContain("bg-brand");
  });

  it("distinguishes match types only when multiple types are selected", () => {
    expect(matchDisplayLabel({ match: 9, matchType: "practice" }, true)).toBe("P9");
    expect(matchDisplayLabel({ match: 6, matchType: "qualification" }, true)).toBe("Q6");
    expect(matchDisplayLabel({ match: 3, matchType: "playoff" }, true)).toBe("M3");
    expect(matchDisplayLabel({ match: 6, matchType: "qualification" }, false)).toBe("M6");
  });
});
