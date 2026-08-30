import { describe, expect, it } from "vitest";
import { editableFieldsFor, patchEditableValues, readEditableValues, validateEditableValues } from "./editable-scouting";
import { mergeUpdatedTeamMatch } from "../components/match-analysis";
import { summarizeTeamMatches } from "./scouting";

describe("editable scouting payload updates", () => {
  it("exposes only the configured editable fields", () => {
    expect(editableFieldsFor("normal")).toEqual([]);
    expect(editableFieldsFor("super").map((field) => field.key)).toEqual(["driveScore", "defenseScore"]);
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
    const patched = patchEditableValues(payload, "5823", "super", { driveScore: 5, defenseScore: 1 });

    expect(patched).toMatchObject({
      drive: [1, 5, 3],
      defense: [4, 1, 2],
      accuracy: [50, 75, 80],
      bps: [5, 10, 12],
      comments: ["a", "b", "c"],
    });
    expect(readEditableValues(patched, "5823", "super")).toEqual({ driveScore: 5, defenseScore: 1 });
    expect(() => validateEditableValues("super", { driveScore: 6, defenseScore: 1 })).toThrow("Drive Score");
  });
});

describe("local scouting refresh", () => {
  it("updates the current match without restoring an ignored match", () => {
    const visibleMatch = { match: 2, matchType: "qualification" as const, scoutingPts: 10, totalPts: 10, autoPts: 2, telePts: 8, metrics: { bps: 5 }, status: "normal" as const, disabled: false, downtimeMs: 0, driverRating: 3, defenseRating: 2, comment: "", startPos: "", scoutName: "" };
    const ignoredMatch = { ...visibleMatch, match: 1, totalPts: 99 };
    const updatedMatch = { ...visibleMatch, scoutingPts: 20, totalPts: 20, metrics: { bps: 10 } };
    const current = summarizeTeamMatches("1", [visibleMatch]);
    const updated = summarizeTeamMatches("1", [ignoredMatch, updatedMatch]);
    expect(current && updated && mergeUpdatedTeamMatch({ "1": current }, {}, updated, "qualification", 2)["1"]?.matches).toEqual([updatedMatch]);
  });
});
