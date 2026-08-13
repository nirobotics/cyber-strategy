import { describe, expect, it } from "vitest";
import { normalTimeOverride, patchNormalTimeOverride, patchSuperValues, readSuperValues } from "./editable-scouting";

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
