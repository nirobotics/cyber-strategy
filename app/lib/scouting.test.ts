import { describe, expect, it } from "vitest";
import { parseScoutingCsv, processCsvRows, reliability } from "./scouting";
import { DEFAULT_TIER_PERCENTAGES, getTierForRank, validateTierPercentages } from "./tier-settings";

describe("scouting data processing", () => {
  it("computes Advantalytics team summaries from CSV rows", () => {
    const result = processCsvRows([
      row("8214", 1, 10, 4, 6, 3, 1, 1, false, 3, 2),
      row("8214", 2, 30, 5, 25, 8, 2, 2, true, 4, 3),
      row("8214", 3, 50, 10, 40, 0, 0, 4, true, 0, 4),
    ]);

    expect(result["8214"]).toMatchObject({
      avgTotal: 30,
      avgAuto: 6.3,
      avgTele: 23.7,
      avgAccuracy: 77.5,
      avgDriver: 3.5,
      avgFuel: 3,
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
    expect(reliability(result["8214"])).toBe(67);
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

  it("assigns tiers by ranking percentages", () => {
    expect(getTierForRank(0, 10, DEFAULT_TIER_PERCENTAGES).label).toBe("Elite");
    expect(getTierForRank(1, 10, DEFAULT_TIER_PERCENTAGES).label).toBe("Strong");
    expect(getTierForRank(3, 10, DEFAULT_TIER_PERCENTAGES).label).toBe("Mid");
    expect(getTierForRank(7, 10, DEFAULT_TIER_PERCENTAGES).label).toBe("Low");
    expect(getTierForRank(9, 10, DEFAULT_TIER_PERCENTAGES).label).toBe("Struggling");
  });

  it("validates editable tier percentages", () => {
    expect(validateTierPercentages(DEFAULT_TIER_PERCENTAGES)).toBeNull();
    expect(validateTierPercentages({ ...DEFAULT_TIER_PERCENTAGES, Elite: 11 })).toContain("100%");
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
    DefenseRating: 0,
    Comment: "",
    StartPosition: "1",
    ScoutName: "Scout",
  };
}
