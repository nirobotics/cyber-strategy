import { describe, expect, it } from "vitest";
import { buildDemoData, DEMO_OWN_TEAMS } from "./demo";
import type { CombinedMatch } from "./match-analysis";
import type { ScoutingDataset, TeamSummary } from "./scouting";
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
    }];

    const demo = buildDemoData(dataset, matches);

    expect(Object.keys(demo.dataset.teamData)).toHaveLength(45);
    expect(demo.dataset.teamData["1000"].team).toBe("1000");
    expect(demo.dataset.teamData["1044"].team).toBe("1044");
    expect(demo.dataset.teamData["1000"].matches[0]).toMatchObject({ comment: "", scoutName: expect.stringMatching(/^scout \d+$/) });
    expect(demo.dataset.teamPhotos).toEqual({});
    expect(demo.dataset.title).toBe("Event 1");
    expect(demo.matches[0].alliances?.red?.team_keys).toEqual(["frc1000", "frc1001", "frc1002"]);
    expect(toProposalMatches(demo.matches, DEMO_OWN_TEAMS)[0].redTeams).toContain("1000");
  });
});

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
