import { describe, expect, it } from "vitest";
import {
  buildTeamEventMap,
  enrichScheduledMatches,
  hasLargeScoutingDifference,
  matchHasTeam,
  matchTeams,
  mergeMatchResults,
  needsScoutingReview,
  resolveMatchScores,
  resolveTeamMetric,
  resolveWinProbability,
  sortedMatches,
  strategyScoreSd,
  strategyWinProbability,
  toCyberScoutMatches,
  toTbaMatchResults,
  type CombinedMatch,
} from "./match-analysis";
import type { TeamData, TeamSummary } from "./scouting";

describe("match analysis calculations", () => {
  it("flags Scouting differences only when they exceed 40 percent of the actual score", () => {
    expect(hasLargeScoutingDifference(100, 141)).toBe(true);
    expect(hasLargeScoutingDifference(100, 60)).toBe(false);
    expect(hasLargeScoutingDifference(100, 59)).toBe(true);
    expect(hasLargeScoutingDifference(100, null)).toBe(false);
  });

  it("recommends review only for a large alliance difference and a team difference over 100 percent", () => {
    expect(needsScoutingReview(true, 68.7, 8.7)).toBe(true);
    expect(needsScoutingReview(true, 9.9, 0)).toBe(false);
    expect(needsScoutingReview(true, 10, 0)).toBe(true);
    expect(needsScoutingReview(true, 50, 100)).toBe(false);
    expect(needsScoutingReview(false, 68.7, 8.7)).toBe(false);
    expect(needsScoutingReview(true, 50, null)).toBe(false);
  });

  it("matches a team Scouting record by match type as well as match number", () => {
    const teamData = teams({ 1: 10 });
    teamData["1"].matches = [
      { ...teamData["1"].matches[0], match: 3, matchType: "practice", scoutingPts: 130 },
      { ...teamData["1"].matches[0], match: 3, matchType: "qualification", scoutingPts: 8.7 },
    ];

    expect(resolveTeamMetric({
      team: "1",
      teamData,
      teamEvents: new Map(),
      matchNumber: 3,
      matchType: "qualification",
    }).scoutMatch?.scoutingPts).toBe(8.7);
  });

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

  it("falls back to Statbotics win probability when an alliance lineup is incomplete", () => {
    const match = schedule(["1", "2", "3"], ["4", "5"], {
      pred: { red_win_prob: 0.72 },
    });

    const probability = resolveWinProbability({
      match,
      redTeams: ["1", "2", "3"],
      blueTeams: ["4", "5"],
      teamData: teams({ 1: 10, 2: 20, 3: 30 }),
      matches: [match],
    });

    expect(probability).toMatchObject({ source: "statbotics", red: 0.72, blue: 0.28 });
  });

  it("counts a team without Strategy data as zero in match predictions", () => {
    const match = schedule(["1", "2", "3"], ["4", "5", "6"]);

    expect(resolveMatchScores({
      match,
      redTeams: ["1", "2", "3"],
      blueTeams: ["4", "5", "6"],
      teamData: teams({ 1: 10, 2: 20, 4: 40, 5: 50, 6: 60 }),
    })).toMatchObject({
      predictedRed: 30,
      predictedBlue: 150,
      source: "strategy",
      label: "综合分预测",
    });
  });

  it("uses FRC Events for actual match score", () => {
    const match = schedule(["1", "2", "3"], ["4", "5", "6"], {
      pred: { red_score: 111, blue_score: 222 },
      result: {
        source: "frc-events",
        comp_level: "qm",
        match_number: 1,
        alliances: {
          red: { score: 123 },
          blue: { score: 456 },
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
      source: "frc-events",
      winner: "blue",
    });
  });

  it("keeps Scouting scores independent from ignored match filtering", () => {
    const scoutingTeamData = teams({ 1: 10, 2: 20, 3: 30, 4: 40, 5: 50, 6: 60 });
    scoutingTeamData["1"].matches[0].scoutingPts = 10;
    scoutingTeamData["2"].matches[0].scoutingPts = 20;
    scoutingTeamData["3"].matches[0].scoutingPts = 30;
    scoutingTeamData["4"].matches[0].scoutingPts = 40;
    scoutingTeamData["5"].matches[0].scoutingPts = 50;
    scoutingTeamData["6"].matches[0].scoutingPts = 60;
    const teamData = { ...scoutingTeamData, "4": { ...scoutingTeamData["4"], matches: [] } };

    expect(resolveMatchScores({
      match: schedule(["1", "2", "3"], ["4", "5", "6"], {
        result: result("frc-events", 123, 98),
      }),
      redTeams: ["1", "2", "3"],
      blueTeams: ["4", "5", "6"],
      teamData,
      scoutingTeamData,
    })).toMatchObject({
      actualRed: 123,
      actualBlue: 98,
      predictedRed: 60,
      predictedBlue: 150,
      scoutingRed: 60,
      scoutingBlue: 150,
    });
  });

  it("uses Super Scout result when official result is missing", () => {
    const match = schedule(["1", "2", "3"], ["4", "5", "6"], {
      result: {
        source: "super-scout",
        comp_level: "qm",
        match_number: 1,
        alliances: { red: { score: 300 }, blue: { score: 250 } },
      },
    });

    expect(resolveMatchScores({
      match,
      redTeams: ["1", "2", "3"],
      blueTeams: ["4", "5", "6"],
      teamData: {},
    })).toMatchObject({ actualRed: 300, actualBlue: 250, source: "super-scout", winner: "red" });
  });

  it("shows a partial Super Scout result without fabricating a winner", () => {
    const match = schedule(["1", "2", "3"], ["4", "5", "6"], {
      result: {
        source: "super-scout",
        comp_level: "qm",
        match_number: 1,
        alliances: { red: { score: 500 } },
      },
    });

    expect(resolveMatchScores({ match, redTeams: ["1", "2", "3"], blueTeams: ["4", "5", "6"], teamData: {} })).toMatchObject({
      actualRed: 500,
      actualBlue: null,
      source: "super-scout",
      label: "Super Scout 部分结果",
      winner: null,
    });
  });

  it("prefers FRC Events over Super Scout for the same match", () => {
    const official = result("frc-events", 123, 98);
    const fallback = result("super-scout", 500, 400);

    expect(mergeMatchResults([official], [fallback])).toEqual([official]);
  });

  it("uses completed TBA schedule scores as match results", () => {
    expect(toTbaMatchResults([
      schedule(["1", "2", "3"], ["4", "5", "6"], {
        comp_level: "qm",
        match_number: 1,
        alliances: { red: { score: 123 }, blue: { score: 98 } },
      }),
      schedule(["1", "2", "3"], ["4", "5", "6"], {
        comp_level: "qm",
        match_number: 2,
        alliances: { red: { score: -1 }, blue: { score: -1 } },
      }),
    ])).toEqual([{ ...result("tba", 123, 98), winning_alliance: "red" }]);
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

  it("sorts playoff matches by set number before match number", () => {
    const sorted = sortedMatches([
      { comp_level: "ef", set_number: 10, match_number: 1 },
      { comp_level: "ef", set_number: 13, match_number: 1 },
      { comp_level: "ef", set_number: 1, match_number: 1 },
      { comp_level: "ef", set_number: 9, match_number: 1 },
      { comp_level: "qm", match_number: 2 },
      { comp_level: "qm", match_number: 1 },
    ]);

    expect(sorted.map((match) => `${match.comp_level}:${match.set_number ?? match.match_number}`)).toEqual([
      "qm:1",
      "qm:2",
      "ef:1",
      "ef:9",
      "ef:10",
      "ef:13",
    ]);
  });

  it("converts Cyber Scout configured matches into the analysis schedule", () => {
    const matches = toCyberScoutMatches([
      cyberScoutMatch("2026test_sf2m1", "sf", 2, [7, 8, 9, 10, 11, 12]),
      cyberScoutMatch("2026test_qm1", "qm", 1, [1, 2, 3, 4, 5, 6]),
      { matchType: "qm", matchNumber: 2, teams: { R1: 1 } },
    ], ["qualification"]);

    expect(matches).toEqual([{
      key: "2026test_qm1",
      comp_level: "qm",
      match_number: 1,
      alliances: {
        red: { team_keys: ["1", "2", "3"] },
        blue: { team_keys: ["4", "5", "6"] },
      },
    }]);
  });

  it("enriches only Cyber Scout scheduled matches", () => {
    const scheduled = toCyberScoutMatches([cyberScoutMatch("manual-qm1", "qm", 1, [1, 2, 3, 4, 5, 6])]);
    const matches = enrichScheduledMatches(
      scheduled,
      [
        { key: "2026test_qm1", pred: { red_win_prob: 0.7 } },
        { key: "2026test_qm2", pred: { red_win_prob: 0.9 } },
      ],
      [
        result("frc-events", 100, 90),
        { ...result("frc-events", 80, 70), match_number: 3 },
      ],
    );

    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      key: "manual-qm1",
      pred: { red_win_prob: 0.7 },
      result: { source: "frc-events", alliances: { red: { score: 100 }, blue: { score: 90 } } },
    });
    expect(matchTeams(matches[0], "red")).toEqual(["1", "2", "3"]);
    expect(matchHasTeam(matches[0], "2")).toBe(true);
    expect(matchHasTeam(matches[0], "frc5")).toBe(true);
    expect(matchHasTeam(matches[0], "9")).toBe(false);
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
    metrics: { bps: 20, accuracy: 80 },
    avgDriver: 4,
    avgDefense: 2,
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
      metrics: { bps: 20, accuracy: 80 },
      status: "normal",
      disabled: false,
      driverRating: 4,
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

function cyberScoutMatch(id: string, matchType: string, matchNumber: number, teams: number[]) {
  return {
    id,
    matchType,
    matchNumber,
    teams: { R1: teams[0], R2: teams[1], R3: teams[2], B1: teams[3], B2: teams[4], B3: teams[5] },
  };
}

function result(source: "frc-events" | "tba" | "super-scout", red: number, blue: number) {
  return {
    source,
    comp_level: "qm",
    match_number: 1,
    alliances: { red: { score: red }, blue: { score: blue } },
  } as const;
}
