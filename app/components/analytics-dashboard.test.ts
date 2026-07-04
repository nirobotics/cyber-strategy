import { describe, expect, it } from "vitest";
import { ratingDotClassName } from "./analytics-dashboard";

describe("analytics dashboard UI helpers", () => {
  it("uses exactly one background class for rating dots", () => {
    expect(ratingDotClassName(true)).toContain("bg-brand");
    expect(ratingDotClassName(true)).not.toContain("bg-line");
    expect(ratingDotClassName(false)).toContain("bg-line");
    expect(ratingDotClassName(false)).not.toContain("bg-brand");
  });
});
