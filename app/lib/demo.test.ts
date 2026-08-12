import { describe, expect, it } from "vitest";
import { buildDemoData, DEMO_OWN_TEAMS } from "./demo";
import type { ScoutConfidenceResult } from "./cyber-scout.server";
import type { CombinedMatch } from "./match-analysis";
import type { ScoutingDataset, TeamSummary } from "./scouting";
import { emptyScoutConfidenceReport } from "./scout-confidence";
import { toProposalMatches } from "./strategy-proposal-matches";

describe("Apollo demo data", () => {
  it("maps 45 teams, anonymizes scouts, and removes comments and photos", () => {
    const dataset: ScoutingDataset = {
      id: "source",
      title: "Apollo",
      eventKey: "2026txcmp2",
      sourceFilename: "source.csv",
      teamData: Object.fromEntries(Array.from({ length: 45 }, (_, index) => {
        const team = String(2000 + index);
        return [team, summary(team, index % 2 ? "Alice" : "Bob")];
      })),
      teamPhotos: { "2000": ["/private/team-2000.jpg"] },
      isActive: true,
      createdAt: null,
      updatedAt: null,
    };
    const matches: CombinedMatch[] = [{
      key: "2026txcmp2_qm1",
      comp_level: "qm",
      match_number: 1,
      alliances: {
        red: { team_keys: ["frc2000", "frc2001", "frc2002"] },
        blue: { team_keys: ["frc2003", "frc2004", "frc2005"] },
      },
      result: {
        source: "frc-events",
        comp_level: "qm",
        match_number: 1,
        winning_alliance: "red",
        alliances: { red: { score: 120 }, blue: { score: 100 } },
      },
    }];

    const demo = buildDemoData(dataset, matches, scoutingLead());

    expect(Object.keys(demo.dataset.teamData)).toHaveLength(45);
    expect(demo.dataset.teamData["1000"].team).toBe("1000");
    expect(demo.dataset.teamData["1044"].team).toBe("1044");
    expect(demo.dataset.teamData["1000"].matches[0]).toMatchObject({ comment: "", scoutName: expect.stringMatching(/^scout \d+$/) });
    expect(demo.dataset.teamPhotos).toEqual({});
    expect(demo.dataset.title).toBe("Event 1");
    expect(demo.matches[0].alliances?.red?.team_keys).toEqual(["frc1000", "frc1001", "frc1002"]);
    expect(demo.matches[0].result?.alliances.red?.score).toBe(120);
    expect(toProposalMatches(demo.matches, DEMO_OWN_TEAMS)[0].redTeams).toContain("1000");
    expect(demo.scoutingLead.report.people[0].scoutName).toMatch(/^scout \d+$/);
    expect(demo.scoutingLead.report.matches[0].redPredictors).toEqual([demo.scoutingLead.report.people[0].scoutName]);
    expect(demo.scoutingLead.leadData.recordSchedule.matches[0].red[0]).toMatchObject({
      team: "1000",
      normalRecords: [{ id: "demo-record-1", teamNumber: "1000", completedBy: expect.stringMatching(/^scout \d+$/) }],
    });
    expect(demo.scoutingLead.leadData.users[0].id).toBe("demo-user-1");
    expect(demo.scoutingLead.leadData.configEventKey).toBe("Event 1");
  });
});

function scoutingLead(): ScoutConfidenceResult {
  const report = emptyScoutConfidenceReport();
  report.people = [{
    scoutName: "Alice",
    netScore: 3,
    correctPoints: 3,
    wrongPenalty: 0,
    scoredCount: 1,
    pendingCount: 0,
    incompleteCount: 0,
    correctCount: 1,
    wrongCount: 0,
    accuracy: 1,
    averageNet: 3,
  }];
  report.matches = [{
    matchType: "qualification",
    matchNumber: 1,
    predictionCount: 1,
    redPredictions: 1,
    bluePredictions: 0,
    redPredictors: ["Alice"],
    bluePredictors: [],
    incompleteCount: 0,
    averageConfidence: 3,
    actualWinner: "red",
    hasDisagreement: false,
    isLowConfidence: false,
  }];
  const record = {
    id: "real-record-id",
    recordType: "normal_match" as const,
    matchType: "qualification" as const,
    matchNumber: 1,
    alliance: "red" as const,
    position: "R1",
    teamNumber: "2000",
    completedBy: "Alice",
    uploadedAt: "2026-04-01T00:00:00.000Z",
    clientCreatedAt: "2026-04-01T00:00:00.000Z",
    label: "普通 Scout · Team 2000 · R1",
  };
  return {
    report,
    events: [{ eventKey: "2026txcmp2", name: "Apollo", isActive: true, updatedAt: null }],
    selectedEventKey: "2026txcmp2",
    sourceStatus: { source: "cyber-scout", label: "Scout", message: "Apollo", updatedAt: null },
    leadData: {
      recordSchedule: {
        matches: [{
          matchType: "qualification",
          matchNumber: 1,
          red: [{ team: "2000", position: "R1", alliance: "red", normalRecords: [record], superRecords: [] }],
          blue: [],
        }],
        totalRecords: 1,
        normalRecords: 1,
        superRecords: 0,
      },
      assignments: [{ id: "real-assignment-id", matchType: "Q", startMatch: 1, endMatch: 2, position: "R1", userName: "Alice" }],
      users: [{ id: "real-user-id", displayName: "Alice" }],
      configEventKey: "2026txcmp2",
      configSavedAt: null,
    },
  };
}

function summary(team: string, scoutName: string): TeamSummary {
  return {
    team,
    avgTotal: 10,
    avgAuto: 4,
    avgTele: 6,
    avgAccuracy: 50,
    avgDriver: 3,
    avgFuel: 3,
    malfunctions: 0,
    commsIssues: 0,
    disabledEvents: 0,
    matchCount: 1,
    trend: "stable",
    firstHalfAvg: 10,
    secondHalfAvg: 10,
    stdDev: 0,
    minPts: 10,
    maxPts: 10,
    matches: [{
      match: 1,
      totalPts: 10,
      autoPts: 4,
      telePts: 6,
      hubSuccess: 1,
      hubFail: 1,
      accuracy: 50,
      climbPts: 0,
      botState: 1,
      botStateText: "No Issue",
      disabled: false,
      driverRating: 3,
      fuelRating: 3,
      defenseRating: 3,
      comment: "private comment",
      startPos: "left",
      scoutName,
      autoScoutName: scoutName,
    }],
  };
}
