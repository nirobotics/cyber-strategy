import { describe, expect, it } from "vitest";
import { normalizeRobotStatus } from "./scouting";

describe("season scouting adapter", () => {
  it("normalizes robot states and applies the configured incap threshold", () => {
    expect(normalizeRobotStatus({ text: "Comms Issue" })).toBe("incap");
    expect(normalizeRobotStatus({ text: "Incap", downtimeMs: 20_000 })).toBe("normal");
    expect(normalizeRobotStatus({ text: "Incap", downtimeMs: 20_001 })).toBe("incap");
    expect(normalizeRobotStatus({ text: "No Show" })).toBe("no_show");
    expect(normalizeRobotStatus({ disabled: true })).toBe("incap");
    expect(normalizeRobotStatus({ text: "unmapped" })).toBe("normal");
  });
});
