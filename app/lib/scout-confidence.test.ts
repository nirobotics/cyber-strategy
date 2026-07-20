import { describe, expect, it } from "vitest";
import { buildScoutConfidenceReport } from "./scout-confidence";
import type { CyberScoutRecordRow } from "./cyber-scout";
import { matchTypeFromTbaCompLevel } from "./data-range";

describe("scout confidence scoring", () => {
  it("adds confidence for correct predictions and subtracts it for wrong predictions", () => {
    const report = buildScoutConfidenceReport({
      records: [
        normal("a", "Ada", 1, 8214, "red", 5),
        normal("b", "Ada", 2, 6328, "blue", 3),
        normal("c", "Bea", 1, 157, "blue", 4),
      ],
      matchResults: [
        tba(1, "red"),
        tba(2, "red"),
      ],
    });

    expect(report.people.map((person) => [person.scoutName, person.netScore])).toEqual([
      ["Ada", 2],
      ["Bea", -4],
    ]);
    expect(report.summary).toMatchObject({
      scoredRecords: 3,
      totalNetScore: -2,
    });
  });

  it("keeps unfinished matches pending and invalid confidence incomplete", () => {
    const report = buildScoutConfidenceReport({
      records: [
        normal("pending", "Ada", 3, 8214, "red", 2),
        normal("invalid", "Ada", 1, 6328, "blue", 6),
      ],
      matchResults: [tba(1, "blue")],
    });

    expect(report.people[0]).toMatchObject({
      scoutName: "Ada",
      netScore: 0,
      scoredCount: 0,
      pendingCount: 1,
      incompleteCount: 1,
    });
  });

  it("uses the latest duplicate record for the same scout, match, and team", () => {
    const report = buildScoutConfidenceReport({
      records: [
        normal("old", "Ada", 1, 8214, "blue", 5, "qualification", "2026-07-04T00:00:00.000Z"),
        normal("new", "Ada", 1, 8214, "red", 2, "qualification", "2026-07-04T00:10:00.000Z"),
      ],
      matchResults: [tba(1, "red")],
    });

    expect(report.people[0]).toMatchObject({
      netScore: 2,
      correctPoints: 2,
      wrongPenalty: 0,
    });
  });

  it("scores final matches when they are passed into the report", () => {
    const report = buildScoutConfidenceReport({
      records: [
        normal("final", "Ada", 1, 9635, "blue", 5, "playoff"),
      ],
      matchResults: [
        tba(1, "blue", "f"),
      ],
    });

    expect(report.people[0]).toMatchObject({
      scoutName: "Ada",
      netScore: 5,
      scoredCount: 1,
    });
  });

  it("sorts people by net confidence, scored count, then accuracy", () => {
    const report = buildScoutConfidenceReport({
      records: [
        normal("ada-1", "Ada", 1, 1, "red", 5),
        normal("bea-1", "Bea", 1, 2, "red", 3),
        normal("bea-2", "Bea", 2, 2, "blue", 2),
        normal("cal-1", "Cal", 1, 3, "red", 5),
        normal("cal-2", "Cal", 2, 3, "red", 1),
      ],
      matchResults: [
        tba(1, "red"),
        tba(2, "blue"),
      ],
    });

    expect(report.people.map((person) => person.scoutName)).toEqual(["Bea", "Ada", "Cal"]);
  });

  it("includes Super Scout predictions in the same confidence formula", () => {
    expect(matchTypeFromTbaCompLevel("practice")).toBe("practice");
    const report = buildScoutConfidenceReport({
      records: [
        normal("normal", "Ada", 1, 8214, "red", 2),
        superPrediction("super", "Super", 1, "blue", "blue", 4),
      ],
      matchResults: [tba(1, "red"), tba(1, "blue", "practice")],
    });

    expect(report.people.map((person) => [person.scoutName, person.netScore])).toEqual([
      ["Super", 4],
      ["Ada", 2],
    ]);
    expect(report.matches.map((match) => [match.matchType, match.matchNumber])).toEqual([
      ["practice", 1],
      ["qualification", 1],
    ]);
    expect(report.summary).toMatchObject({ scoredRecords: 2, totalNetScore: 6 });
  });
});

function normal(
  id: string,
  scout: string,
  match: number,
  team: number,
  predictionWinner: string,
  predictionConfidence: number,
  matchType: "practice" | "qualification" | "playoff" = "qualification",
  uploadedAt = `2026-07-04T00:0${match}:00.000Z`,
): CyberScoutRecordRow {
  return {
    id,
    record_type: "normal_match",
    match_type: matchType,
    match_number: match,
    team_number: team,
    payload: {
      scout,
      matchType,
      matchNumber: match,
      teamNumber: team,
      predictionWinner,
      predictionConfidence,
    },
    uploaded_at: uploadedAt,
    client_created_at: null,
    created_at: null,
  };
}

function superPrediction(
  id: string,
  scout: string,
  match: number,
  alliance: "red" | "blue",
  predictionWinner: string,
  predictionConfidence: number,
): CyberScoutRecordRow {
  return {
    id,
    record_type: "super_match",
    match_type: "practice",
    match_number: match,
    alliance,
    team_number: null,
    payload: {
      scout,
      matchType: "practice",
      matchNumber: match,
      alliance,
      teams: [1, 2, 3],
      predictionWinner,
      predictionConfidence,
    },
    uploaded_at: `2026-07-04T00:0${match}:30.000Z`,
    client_created_at: null,
    created_at: null,
  };
}

function tba(match: number, winner: "red" | "blue", compLevel = "qm") {
  return {
    comp_level: compLevel,
    match_number: match,
    winning_alliance: winner,
    alliances: {
      red: { score: winner === "red" ? 100 : 80 },
      blue: { score: winner === "blue" ? 100 : 80 },
    },
  };
}
