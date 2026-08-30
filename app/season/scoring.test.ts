import { describe, expect, it } from "vitest";
import { extractFrcPeriodScores, extractTbaPeriodScores } from "./scoring";

describe("season scoring adapter", () => {
  it("reads only generic FIRST period totals in the template", () => {
    expect(extractFrcPeriodScores({ totalAutoPoints: 18, totalTeleopPoints: 72 })).toEqual({
      autoPoints: 18,
      teleopPoints: 72,
    });
  });

  it("leaves TBA score breakdown to the annual adapter", () => {
    expect(extractTbaPeriodScores({ gameSpecificScore: 42 })).toEqual({
      autoPoints: null,
      teleopPoints: null,
    });
  });
});
