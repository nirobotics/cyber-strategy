import { describe, expect, it } from "vitest";
import { applyIgnoredMatchesToTeamData, matchIgnoreKey, parseScoutingCsv, processCsvRows, reliability } from "./scouting";
import { buildTierAssignments, DEFAULT_TIER_PERCENTAGES, getTierForRank, normalizeTierPercentages, validateTierPercentages } from "./tier-settings";

describe("scouting data processing", () => {
  it("computes Advantalytics team summaries from CSV rows", () => {
    const result = processCsvRows([
      row("8214", 1, 10, 4, 6, 3, 1, 1, false, 3, 2),
      row("8214", 2, 30, 5, 25, 8, 2, 2, true, 4, 3, 75_000),
      row("8214", 3, 50, 10, 40, 0, 0, 4, true, 0, 4, 150_000),
    ]);

    expect(result["8214"]).toMatchObject({
      avgTotal: 30,
      avgAuto: 6.3,
      avgTele: 23.7,
      avgAccuracy: 77.5,
      avgDriver: 3.5,
      avgDefense: 2,
      avgFuel: 3,
      avgBps: 0,
      malfunctions: 1,
      commsIssues: 1,
      disabledEvents: 2,
      matchCount: 3,
      trend: "up",
      firstHalfAvg: 10,
      secondHalfAvg: 40,
      stdDev: 16.3,
      minPts: 10,
      maxPts: 50,
    });
    expect(reliability(result["8214"])).toBe(50);
  });

  it("parses CSV text and treats empty hub attempts as null accuracy", () => {
    const data = parseScoutingCsv(
      [
        "Team,Match,TotalPoints,AutoPoints,TelePoints,TotalHubFuelSuccess,TotalHubFuelFail,BotState,BotStateText,Disabled,DriverRating,FuelIntakeRating,DefenseRating,Comment,StartPosition,ScoutName",
        "1,2,0,0,0,0,0,1,No Issue,false,0,0,0,,,",
      ].join("\n"),
    );

    expect(data["1"].avgAccuracy).toBe(0);
    expect(data["1"].matches[0].accuracy).toBeNull();
  });

  it("recomputes team summaries after locally ignored matches", () => {
    const data = processCsvRows([
      row("8214", 1, 10, 4, 6, 3, 1, 1, false, 3, 2),
      row("8214", 2, 30, 5, 25, 8, 2, 2, true, 4, 3),
      row("8214", 3, 50, 10, 40, 0, 0, 4, true, 0, 4),
    ]);

    const filtered = applyIgnoredMatchesToTeamData(data, [matchIgnoreKey("8214", 3, 2)]);

    expect(filtered["8214"]).toMatchObject({
      avgTotal: 20,
      avgAuto: 4.5,
      avgTele: 15.5,
      matchCount: 2,
      maxPts: 30,
    });
    expect(filtered["8214"].matches.map((match) => match.match)).toEqual([1, 2]);
  });

  it("keeps a team visible when all of its matches are ignored", () => {
    const data = processCsvRows([row("8214", 1, 10, 4, 6, 3, 1, 1, false, 3, 2)]);

    const filtered = applyIgnoredMatchesToTeamData(data, [matchIgnoreKey("8214", 1, 0)]);

    expect(filtered["8214"]).toMatchObject({
      avgTotal: 0,
      matchCount: 0,
      matches: [],
    });
  });

  it("assigns tiers by ranking percentages", () => {
    expect(getTierForRank(0, 10, DEFAULT_TIER_PERCENTAGES).label).toBe("Elite");
    expect(getTierForRank(1, 10, DEFAULT_TIER_PERCENTAGES).label).toBe("Strong");
    expect(getTierForRank(3, 10, DEFAULT_TIER_PERCENTAGES).label).toBe("Mid");
    expect(getTierForRank(7, 10, DEFAULT_TIER_PERCENTAGES).label).toBe("Low");
    expect(getTierForRank(9, 10, DEFAULT_TIER_PERCENTAGES).label).toBe("Low");
  });

  it("keeps zero-score teams in the watch tier outside percentages", () => {
    const tiers = buildTierAssignments([
      { team: "1", avgTotal: 100 },
      { team: "2", avgTotal: 80 },
      { team: "3", avgTotal: 0 },
    ]);

    expect(tiers.get("1")?.label).toBe("Elite");
    expect(tiers.get("2")?.label).not.toBe("Struggling");
    expect(tiers.get("3")?.label).toBe("Struggling");
  });

  it("validates editable tier percentages", () => {
    expect(validateTierPercentages(DEFAULT_TIER_PERCENTAGES)).toBeNull();
    expect(validateTierPercentages({ ...DEFAULT_TIER_PERCENTAGES, Elite: 11 })).toContain("100%");
  });

  it("converts old watch-tier percentages into the low tier", () => {
    expect(normalizeTierPercentages({ Elite: 10, Strong: 20, Mid: 40, Low: 20, Struggling: 10 })).toEqual({
      Elite: 10,
      Strong: 20,
      Mid: 40,
      Low: 30,
    });
  });
});

function row(
  Team: string,
  Match: number,
  TotalPoints: number,
  AutoPoints: number,
  TelePoints: number,
  TotalHubFuelSuccess: number,
  TotalHubFuelFail: number,
  BotState: number,
  Disabled: boolean,
  DriverRating: number,
  FuelIntakeRating: number,
  DowntimeMs = 0,
) {
  return {
    Team,
    Match,
    TotalPoints,
    AutoPoints,
    TelePoints,
    TotalHubFuelSuccess,
    TotalHubFuelFail,
    TotalClimbPoints: 0,
    BotState,
    BotStateText: BotState === 2 ? "Comms Issue" : BotState === 4 ? "Major Malfunction" : "No Issue",
    Disabled: String(Disabled),
    DriverRating,
    FuelIntakeRating,
    DowntimeMs,
    DefenseRating: 2,
    Comment: "",
    StartPosition: "1",
    ScoutName: "Scout",
  };
}
