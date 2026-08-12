import { describe, expect, it } from "vitest";
import { averageRadarMetrics, compareRangeConfig, compareTeamDetailMatches, filterCompareTeams, formatChartNumber, matchDisplayLabel, nearestRankPercentile, rankRadarMetrics, relativeScoreVariation } from "./analytics-dashboard";
import type { ScoutingMatch, TeamSummary } from "../lib/scouting";

describe("analytics dashboard UI helpers", () => {
  it("distinguishes match types only when multiple types are selected", () => {
    expect(matchDisplayLabel({ match: 9, matchType: "practice" }, true)).toBe("P9");
    expect(matchDisplayLabel({ match: 6, matchType: "qualification" }, true)).toBe("Q6");
    expect(matchDisplayLabel({ match: 3, matchType: "playoff" }, true)).toBe("M3");
    expect(matchDisplayLabel({ match: 6, matchType: "qualification" }, false)).toBe("M6");
  });

  it("sorts team detail matches by practice, qualification, playoff, then match number", () => {
    const matches: Array<Pick<ScoutingMatch, "match" | "matchType">> = [
      { match: 3, matchType: "playoff" },
      { match: 6, matchType: "qualification" },
      { match: 9, matchType: "practice" },
      { match: 1, matchType: "playoff" },
      { match: 2, matchType: "practice" },
      { match: 1, matchType: "qualification" },
    ];

    expect(matches.sort(compareTeamDetailMatches).map((match) => matchDisplayLabel(match, true))).toEqual([
      "P2",
      "P9",
      "Q1",
      "Q6",
      "M1",
      "M3",
    ]);
  });

  it("averages every radar metric across the region", () => {
    expect(averageRadarMetrics([
      [1, 2, 3, 4, 5, 0],
      [3, 4, 5, 2, 1, 4],
    ])).toEqual([2, 3, 4, 3, 3, 2]);
  });

  it("scores radar metrics by regional rank with ties", () => {
    expect(rankRadarMetrics([
      [30, 10, 5, 80, 100, -2],
      [20, 10, 3, 60, 90, -5],
      [10, 5, 1, 40, 80, -8],
    ])).toEqual([
      [5, 5, 5, 5, 5, 5],
      [2.5, 5, 2.5, 2.5, 2.5, 2.5],
      [0, 0, 0, 0, 0, 0],
    ]);
    expect(rankRadarMetrics([[1, 1, 1, 1, 1, 1]])).toEqual([[5, 5, 5, 5, 5, 5]]);
  });

  it("uses the regional tenth percentile as the relative variation floor", () => {
    expect(nearestRankPercentile([110, 10, 90, 80, 70, 60, 50, 40, 30, 20, 100], 0.1)).toBe(20);
    expect(relativeScoreVariation(10, 100, 20)).toBe(0.1);
    expect(relativeScoreVariation(10, 5, 20)).toBe(0.5);
    expect(relativeScoreVariation(0, 0, 0)).toBe(0);
  });

  it("uses a directly selectable floating bar for each score range", () => {
    const team = { team: "1036", minPts: 40, avgTotal: 75, maxPts: 110 } as TeamSummary;
    const config = compareRangeConfig([team], {
      muted: "#aaa",
      grid: "#333",
      panel: "#111",
      colors: ["#8b5cf6"],
    });

    expect(config.data.datasets[0].data).toEqual([[40, 110]]);
    expect(config.options?.interaction).toMatchObject({ mode: "index", axis: "x", intersect: false });
  });

  it("limits chart tooltip values to one decimal place", () => {
    expect(formatChartNumber(341.59999999999997)).toBe(341.6);
    expect(formatChartNumber(110)).toBe(110);
  });

  it("filters comparison teams by an entered team number", () => {
    const teams = [{ team: "1036" }, { team: "1024" }, { team: "1001" }] as TeamSummary[];
    expect(filterCompareTeams(teams, "10").map((team) => team.team)).toEqual(["1036", "1024", "1001"]);
    expect(filterCompareTeams(teams, "Team 102").map((team) => team.team)).toEqual(["1024"]);
  });
});
