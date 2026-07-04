import { describe, expect, it } from "vitest";
import {
  buildTeamEventMap,
  resolveMatchScores,
  resolveTeamMetric,
  resolveWinProbability,
  strategyScoreSd,
  strategyWinProbability,
  type CombinedMatch,
} from "./match-analysis";
import type { TeamData, TeamSummary } from "./scouting";

describe("match analysis calculations", () => {
  it("uses Strategy composite ratings for win probability before Statbotics", () => {
    const teamData = teams({
      1: 100,
      2: 90,
      3: 80,
      4: 40,
      5: 30,
      6: 20,
    });
    const match = schedule(["1", "2", "3"], ["4", "5", "6"], {
      pred: { red_win_prob: 0.01, red_score: 1, blue_score: 999 },
    });

    const probability = resolveWinProbability({
      match,
      redTeams: ["1", "2", "3"],
      blueTeams: ["4", "5", "6"],
      teamData,
      matches: [match],
    });

    expect(probability?.source).toBe("strategy");
    expect(probability?.red).toBeGreaterThan(0.5);
    expect(probability?.red).not.toBe(0.01);
  });

  it("returns 50 percent when composite ratings are tied", () => {
    expect(strategyWinProbability(120, 120, 25)).toBe(0.5);
  });

  it("moves win probability with composite rating advantage", () => {
    expect(strategyWinProbability(150, 100, 50)).toBeGreaterThan(0.5);
    expect(strategyWinProbability(100, 150, 50)).toBeLessThan(0.5);
  });

  it("falls back to team-derived SD when schedule alliance samples are insufficient", () => {
    const teamData = teams({
      1: 10,
      2: 20,
      3: 30,
    });

    expect(strategyScoreSd([], teamData)).toBeCloseTo(Math.sqrt(3) * 8.165, 2);
  });

  it("falls back to Statbotics win probability when Strategy composite is missing", () => {
    const match = schedule(["1", "2", "3"], ["4", "5", "6"], {
      pred: { red_win_prob: 0.72 },
    });

    const probability = resolveWinProbability({
      match,
      redTeams: ["1", "2", "3"],
      blueTeams: ["4", "5", "6"],
      teamData: teams({ 1: 10, 2: 20, 3: 30 }),
      matches: [match],
    });

    expect(probability).toMatchObject({ source: "statbotics", red: 0.72, blue: 0.28 });
  });

  it("uses only TBA for actual match score", () => {
    const match = schedule(["1", "2", "3"], ["4", "5", "6"], {
      pred: { red_score: 111, blue_score: 222 },
      tba: {
        alliances: {
          red: { team_keys: ["frc1", "frc2", "frc3"], score: 123 },
          blue: { team_keys: ["frc4", "frc5", "frc6"], score: 456 },
        },
        winning_alliance: "blue",
      },
    });

    const score = resolveMatchScores({
      match,
      redTeams: ["1", "2", "3"],
      blueTeams: ["4", "5", "6"],
      teamData: teams({ 1: 10, 2: 10, 3: 10, 4: 20, 5: 20, 6: 20 }),
    });

    expect(score).toMatchObject({
      actualRed: 123,
      actualBlue: 456,
      displayRed: 123,
      displayBlue: 456,
      source: "tba",
      winner: "blue",
    });
  });

  it("falls back to EPA for a team without Strategy data", () => {
    const metric = resolveTeamMetric({
      team: "6328",
      teamData: {},
      teamEvents: buildTeamEventMap([
        {
          team: 6328,
          epa: {
            total_points: { mean: 42 },
            auto_points: { mean: 12 },
            teleop_points: { mean: 30 },
          },
        },
      ]),
      matchNumber: 1,
    });

    expect(metric).toMatchObject({
      source: "epa",
      rating: 42,
      ratingLabel: "EPA",
      auto: 12,
      tele: 30,
    });
  });
});

function teams(values: Record<string, number>): TeamData {
  return Object.fromEntries(
    Object.entries(values).map(([team, avgTotal]) => [team, summary(team, avgTotal)]),
  );
}

function summary(team: string, avgTotal: number): TeamSummary {
  return {
    team,
    avgTotal,
    avgAuto: avgTotal * 0.25,
    avgTele: avgTotal * 0.75,
    avgAccuracy: 80,
    avgDriver: 4,
    avgFuel: 3,
    malfunctions: 0,
    commsIssues: 0,
    disabledEvents: 0,
    matchCount: 1,
    trend: "stable",
    firstHalfAvg: avgTotal,
    secondHalfAvg: avgTotal,
    stdDev: 0,
    minPts: avgTotal - 5,
    maxPts: avgTotal + 5,
    matches: [{
      match: 1,
      totalPts: avgTotal,
      autoPts: avgTotal * 0.25,
      telePts: avgTotal * 0.75,
      hubSuccess: 8,
      hubFail: 2,
      accuracy: 80,
      climbPts: 0,
      botState: 1,
      botStateText: "No Issue",
      disabled: false,
      driverRating: 4,
      fuelRating: 3,
      defenseRating: 2,
      comment: "",
      startPos: "",
      scoutName: "Scout",
    }],
  };
}

function schedule(red: string[], blue: string[], extra: Partial<CombinedMatch> = {}): CombinedMatch {
  return {
    key: "2026test_qm1",
    comp_level: "qm",
    match_number: 1,
    alliances: {
      red: { team_keys: red.map((team) => `frc${team}`) },
      blue: { team_keys: blue.map((team) => `frc${team}`) },
    },
    ...extra,
  };
}
