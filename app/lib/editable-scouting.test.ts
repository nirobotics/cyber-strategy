import { describe, expect, it } from "vitest";
import { normalTimeOverride, patchNormalTimeOverride, patchSuperValues, readSuperValues } from "./editable-scouting";
import { mergeUpdatedTeamMatch } from "../components/match-analysis";
import { summarizeTeamMatches } from "./scouting";

describe("editable scouting payload updates", () => {
  it("stores normal time overrides without replacing the original timeline", () => {
    const payload = { manualShotDirect: [{ startMs: 100, endMs: 500 }], note: "keep" };
    const patched = patchNormalTimeOverride(
      payload,
      { shootingSeconds: 12.3, transferSeconds: 4.5 },
      { updatedAt: "2026-08-13T00:00:00.000Z", updatedBy: "admin" },
    );

    expect(patched.manualShotDirect).toEqual(payload.manualShotDirect);
    expect(patched.note).toBe("keep");
    expect(normalTimeOverride(patched)).toEqual({ shootingMs: 12_300, transferShootingMs: 4_500 });
  });

  it("updates only the selected team in a super scout alliance record", () => {
    const payload = {
      teams: [5516, 5823, 9635],
      drive: [1, 2, 3],
      defense: [4, 3, 2],
      accuracy: [50, 75, 80],
      bps: [5, 10, 12],
      comments: ["a", "b", "c"],
    };
    const patched = patchSuperValues(payload, "5823", { driveScore: 5, defenseScore: 1, accuracy: 91, bps: 22 });

    expect(patched).toMatchObject({
      drive: [1, 5, 3],
      defense: [4, 1, 2],
      accuracy: [50, 91, 80],
      bps: [5, 22, 12],
      comments: ["a", "b", "c"],
    });
    expect(readSuperValues(patched, "5823")).toEqual({ driveScore: 5, defenseScore: 1, accuracy: 91, bps: 22 });
  });
});

describe("local scouting refresh", () => {
  it("updates the current match without restoring an ignored match", () => {
    const visibleMatch = { match: 2, matchType: "qualification" as const, scoutingPts: 10, totalPts: 10, autoPts: 2, telePts: 8, transferPieces: 0, bps: 5, hubSuccess: 50, hubFail: 50, accuracy: 50, climbPts: 0, botState: 1, botStateText: "No Issue", disabled: false, downtimeMs: 0, driverRating: 3, fuelRating: 1, defenseRating: 2, comment: "", startPos: "", scoutName: "" };
    const ignoredMatch = { ...visibleMatch, match: 1, totalPts: 99 };
    const updatedMatch = { ...visibleMatch, scoutingPts: 20, totalPts: 20, bps: 10 };
    const current = summarizeTeamMatches("1", [visibleMatch]);
    const updated = summarizeTeamMatches("1", [ignoredMatch, updatedMatch]);
    expect(current && updated && mergeUpdatedTeamMatch({ "1": current }, {}, updated, "qualification", 2)["1"]?.matches).toEqual([updatedMatch]);
  });
});
