import { describe, expect, it } from "vitest";
import { buildScoutRecordSchedule, type ScoutLeadRecordRow } from "./cyber-scout.server";

describe("Scout Lead record schedule", () => {
  it("keeps Practice 1 and Qualification 1 records separate", () => {
    const schedule = buildScoutRecordSchedule([
      {
        comp_level: "practice",
        match_number: 1,
        alliances: { red: { team_keys: ["frc8214"] } },
      },
      {
        comp_level: "qm",
        match_number: 1,
        alliances: { red: { team_keys: ["frc8214"] } },
      },
    ], [
      leadRecord("p-normal", "normal_match", "practice", "8214", "R1"),
      leadRecord("p-super", "super_match", "practice"),
      leadRecord("q-normal", "normal_match", "qualification", "8214", "R1"),
      leadRecord("q-super", "super_match", "qualification"),
    ]);

    expect(schedule.matches.map((match) => ({
      matchType: match.matchType,
      matchNumber: match.matchNumber,
      normal: match.red[0].normalRecords.map((record) => record.id),
      super: match.red[0].superRecords.map((record) => record.id),
    }))).toEqual([
      { matchType: "practice", matchNumber: 1, normal: ["p-normal"], super: ["p-super"] },
      { matchType: "qualification", matchNumber: 1, normal: ["q-normal"], super: ["q-super"] },
    ]);
  });

  it("uses playoff set numbers and final game numbers in schedule labels", () => {
    const schedule = buildScoutRecordSchedule([
      {
        comp_level: "sf",
        set_number: 1,
        match_number: 1,
        alliances: { red: { team_keys: ["frc8214"] } },
      },
      {
        comp_level: "sf",
        set_number: 2,
        match_number: 1,
        alliances: { red: { team_keys: ["frc8214"] } },
      },
      {
        comp_level: "f",
        set_number: 1,
        match_number: 1,
        alliances: { red: { team_keys: ["frc8214"] } },
      },
      {
        comp_level: "f",
        set_number: 1,
        match_number: 2,
        alliances: { red: { team_keys: ["frc8214"] } },
      },
    ], []);

    expect(schedule.matches.map((match) => ({ label: match.label, matchNumber: match.matchNumber }))).toEqual([
      { label: "SF1-1", matchNumber: 1 },
      { label: "SF2-1", matchNumber: 2 },
      { label: "F1", matchNumber: 1 },
      { label: "F2", matchNumber: 2 },
    ]);
  });
});

function leadRecord(
  id: string,
  recordType: "normal_match" | "super_match",
  matchType: "practice" | "qualification",
  teamNumber: string | null = null,
  position: string | null = null,
): ScoutLeadRecordRow {
  return {
    id,
    record_type: recordType,
    match_type: matchType,
    match_number: 1,
    alliance: "red",
    position,
    team_number: teamNumber ? Number(teamNumber) : null,
    payload: { scout: id, matchType, matchNumber: 1, teamNumber, position, alliance: "red" },
    uploaded_by: null,
    device_id: null,
    uploaded_at: "2026-07-21T00:00:00.000Z",
    client_created_at: null,
    created_at: null,
  };
}
