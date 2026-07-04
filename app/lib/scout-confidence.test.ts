import { describe, expect, it } from "vitest";
import { buildScoutConfidenceReport } from "./scout-confidence";
import type { CyberScoutRecordRow } from "./cyber-scout";

describe("scout confidence scoring", () => {
  it("adds confidence for correct predictions and subtracts it for wrong predictions", () => {
    const report = buildScoutConfidenceReport({
      records: [
        normal("a", "Ada", 1, 8214, "red", 5),
        normal("b", "Ada", 2, 6328, "blue", 3),
        normal("c", "Bea", 1, 157, "blue", 4),
      ],
      tbaMatches: [
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
      tbaMatches: [tba(1, "blue")],
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
        normal("old", "Ada", 1, 8214, "blue", 5, "2026-07-04T00:00:00.000Z"),
        normal("new", "Ada", 1, 8214, "red", 2, "2026-07-04T00:10:00.000Z"),
      ],
      tbaMatches: [tba(1, "red")],
    });

    expect(report.people[0]).toMatchObject({
      netScore: 2,
      correctPoints: 2,
      wrongPenalty: 0,
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
      tbaMatches: [
        tba(1, "red"),
        tba(2, "blue"),
      ],
    });

    expect(report.people.map((person) => person.scoutName)).toEqual(["Bea", "Ada", "Cal"]);
  });

  it("puts only large match disagreements in the review queue", () => {
    const report = buildScoutConfidenceReport({
      records: [
        normal("small-red-1", "Ada", 1, 1, "red", 5),
        normal("small-red-2", "Bea", 1, 2, "red", 5),
        normal("small-blue-1", "Cal", 1, 3, "blue", 5),
        normal("big-red-1", "Ada", 2, 1, "red", 5),
        normal("big-red-2", "Bea", 2, 2, "red", 5),
        normal("big-blue-1", "Cal", 2, 3, "blue", 5),
        normal("big-blue-2", "Dee", 2, 4, "blue", 5),
      ],
      tbaMatches: [
        tba(1, "blue"),
        tba(2, "red"),
      ],
    });

    expect(report.reviewQueue).toHaveLength(1);
    expect(report.reviewQueue[0]).toMatchObject({
      kind: "disagreement",
      matchNumber: 2,
      message: "预测分歧：Q2 红 2 / 蓝 2",
    });
  });
});

function normal(
  id: string,
  scout: string,
  match: number,
  team: number,
  predictionWinner: string,
  predictionConfidence: number,
  uploadedAt = `2026-07-04T00:0${match}:00.000Z`,
): CyberScoutRecordRow {
  return {
    id,
    record_type: "normal_match",
    match_number: match,
    team_number: team,
    payload: {
      scout,
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

function tba(match: number, winner: "red" | "blue") {
  return {
    comp_level: "qm",
    match_number: match,
    winning_alliance: winner,
    alliances: {
      red: { score: winner === "red" ? 100 : 80 },
      blue: { score: winner === "blue" ? 100 : 80 },
    },
  };
}
