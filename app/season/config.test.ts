import { describe, expect, it } from "vitest";
import { formatSeasonMetric, seasonConfig, validateSeasonConfig } from "./config";

describe("season config", () => {
  it("keeps the template configuration valid", () => {
    expect(validateSeasonConfig(seasonConfig)).toEqual([]);
    expect(seasonConfig.autoRouteField.backgroundImage).toBeNull();
  });

  it("rejects duplicate annual keys", () => {
    expect(validateSeasonConfig({
      ...seasonConfig,
      metrics: [{ key: "score", label: "Score" }, { key: "score", label: "Score 2" }],
    })).toContain("指标 key 重复：score");
  });

  it("formats optional annual metrics", () => {
    expect(formatSeasonMetric(82.5, { key: "accuracy", label: "Accuracy", format: "percent" })).toBe("82.5%");
    expect(formatSeasonMetric(null, { key: "accuracy", label: "Accuracy" })).toBe("-");
  });
});
