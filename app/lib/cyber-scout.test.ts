import { afterEach, describe, expect, it } from "vitest";
import { buildCyberScoutDataset, isSafeCyberScoutPhotoPath, type CyberScoutRecordRow } from "./cyber-scout";
import { __resetCyberScoutClientForTests, loadCyberScoutDataset, resolveEvent } from "./cyber-scout.server";
import { reliability } from "./scouting";

const event = {
  id: "event-1",
  tba_event_key: "2026test",
  name: "Test Regional",
  is_active: true,
  updated_at: "2026-07-04T01:00:00.000Z",
};

describe("cyber-scout dataset conversion", () => {
  afterEach(() => {
    delete process.env.CYBER_SCOUT_SUPABASE_URL;
    delete process.env.CYBER_SCOUT_SUPABASE_SERVICE_ROLE_KEY;
    __resetCyberScoutClientForTests();
  });

  it("converts raw scout records into Strategy team summaries", () => {
    const dataset = buildCyberScoutDataset({
      event,
      tbaMatches: [{
        comp_level: "qm",
        match_number: 1,
        alliances: {
          red: { team_keys: ["frc8214", "frc6328", "frc157"] },
        },
        score_breakdown: {
          red: {
            hubScore: {
              autoPoints: 20,
              teleopPoints: 69,
            },
          },
        },
      }],
      records: [
        normal(8214, 1, {
          climbPosition: "A",
          climbFailed: false,
          startPosition: "hub-front",
          alliance: "red",
          fieldSideFlipped: false,
          autoPath: [{ node: "tower", atMs: 0 }, { node: "alliance-center", atMs: 1200 }],
          manualShotDirect: [{ startMs: 0, endMs: 10_000 }],
          manualZoneEvents: [{ zone: "联盟", atMs: 0 }],
        }),
        superRecord(1, {
          teams: [8214, 6328, 157],
          auto: [10, 30, 20],
          drive: [1, 2, 1],
          defense: [1, 3, 0],
          bps: [1, 20, 5],
          accuracy: [10, 50, 0],
          comments: ["old", "", ""],
        }, "2026-07-04T00:00:00.000Z"),
        superRecord(1, {
          teams: [8214, 6328, 157],
          auto: [50, 30, 20],
          drive: [5, 2, 1],
          defense: [4, 3, 0],
          bps: [35, 20, 5],
          accuracy: [80, 50, 0],
          comments: ["clean", "fine", ""],
        }, "2026-07-04T00:10:00.000Z"),
        pit(8214, ["event-1/pit-8214/1.jpg"], {
          drivetrain: "Swerve",
          swerveModule: "SDS MK5i",
          canCrossTrench: true,
          autoRoutes: [{ id: "route-a", points: [{ x: 10, y: 20 }, { x: 90, y: 80 }] }],
        }),
      ],
    });

    expect(dataset.id).toBe("cyber-scout-2026test");
    expect(dataset.updatedAt).toBe("2026-07-04T00:10:00.000Z");
    expect(dataset.teamPhotos["8214"]).toEqual(["/api/cyber-scout/photos?path=event-1%2Fpit-8214%2F1.jpg"]);
    expect(dataset.teamPitData?.["8214"]).toMatchObject({
      canCrossTrench: true,
      isSwerve: true,
      drivetrain: "Swerve",
      swerveModule: "SDS MK5i",
      autoRoutes: [{ id: "route-a", points: [{ x: 10, y: 20 }, { x: 90, y: 80 }] }],
    });
    expect(dataset.teamData["8214"]).toMatchObject({
      avgTotal: 84,
      avgAuto: 10,
      avgTele: 74,
      avgAccuracy: 80,
      avgDriver: 5,
      avgDefense: 4,
      avgFuel: 5,
      avgBps: 35,
      malfunctions: 0,
      disabledEvents: 0,
      matchCount: 1,
    });
    expect(dataset.teamData["8214"].matches[0]).toMatchObject({
      totalPts: 84,
      autoPts: 10,
      telePts: 74,
      bps: 35,
      climbPts: 5,
      comment: "clean",
      startPos: "hub-front",
      scoutName: "Super Scout",
      autoScoutName: "Normal Scout",
      autoStartPosition: "hub-front",
      autoAlliance: "red",
      autoFieldSideFlipped: false,
      autoPath: [{ node: "tower", atMs: 0 }, { node: "alliance-center", atMs: 1200 }],
    });
  });

  it("parses compact normal auto path fields", () => {
    const dataset = buildCyberScoutDataset({
      event,
      tbaMatches: [{
        comp_level: "qm",
        match_number: 5,
        alliances: {
          blue: { team_keys: ["frc8214"] },
        },
        score_breakdown: {
          blue: {
            hubScore: {
              autoPoints: 10,
              teleopPoints: 20,
            },
          },
        },
      }],
      records: [
        normal(8214, 5, {
          al: "blue",
          sp: "right-in",
          ff: true,
          ap: [{ n: "neutral-left", a: 0 }, { n: "tower", a: 450 }],
          manualShotDirect: [{ startMs: 0, endMs: 10_000 }],
          manualZoneEvents: [{ zone: "联盟", atMs: 0 }],
        }),
        superRecord(5, {
          teams: [8214],
          auto: [100],
          drive: [0],
          defense: [0],
          bps: [10],
          accuracy: [100],
          comments: [""],
        }),
      ],
    });

    expect(dataset.teamData["8214"].matches[0]).toMatchObject({
      autoPath: [{ node: "neutral-left", atMs: 0 }, { node: "tower", atMs: 450 }],
      autoStartPosition: "right-in",
      autoAlliance: "blue",
      autoFieldSideFlipped: true,
    });
  });

  it("ignores scout matches that cannot be scored from TBA", () => {
    const dataset = buildCyberScoutDataset({
      event,
      records: [
        normal(8214, 1, { manualShotDirect: [{ startMs: 0, endMs: 10_000 }] }),
        superRecord(1, {
          teams: [8214],
          auto: [100],
          drive: [5],
          defense: [5],
          bps: [35],
          accuracy: [100],
          comments: [""],
        }),
      ],
    });

    expect(dataset.teamData["8214"]).toBeUndefined();
    expect(dataset.scoringIgnoredMatches).toBe(1);
  });

  it("uses Super Scout Auto and Teleop scores when TBA scoring is unavailable", () => {
    const dataset = buildCyberScoutDataset({
      event,
      records: [
        normal(8214, 1, {
          climbPosition: "A",
          manualShotDirect: [{ startMs: 0, endMs: 10_000 }],
          manualZoneEvents: [{ zone: "联盟", atMs: 0 }],
        }),
        normal(6328, 1, {
          manualShotDirect: [{ startMs: 0, endMs: 10_000 }],
          manualZoneEvents: [{ zone: "联盟", atMs: 0 }],
        }),
        normal(157, 1, {
          manualShotDirect: [{ startMs: 0, endMs: 10_000 }],
          manualZoneEvents: [{ zone: "联盟", atMs: 0 }],
        }),
        superRecord(1, {
          teams: [8214, 6328, 157],
          auto: [50, 30, 20],
          drive: [0, 0, 0],
          defense: [0, 0, 0],
          bps: [2, 1, 4],
          accuracy: [50, 100, 0],
          comments: ["", "", ""],
          autoScore: 30,
          teleopScore: 80,
        }),
      ],
    });

    expect(dataset.teamData["8214"].matches[0]).toMatchObject({ autoPts: 15, telePts: 45, totalPts: 60, climbPts: 5 });
    expect(dataset.teamData["6328"].matches[0]).toMatchObject({ autoPts: 9, telePts: 40, totalPts: 49 });
    expect(dataset.teamData["157"].matches[0]).toMatchObject({ autoPts: 6, telePts: 0, totalPts: 6 });
    expect(dataset.scoringFallbackMatches).toBe(3);
    expect(dataset.scoringIgnoredMatches).toBe(0);
  });

  it("reads compact Super Scout phase score fields", () => {
    const dataset = buildCyberScoutDataset({
      event,
      records: [
        normal(8214, 1, {
          manualShotDirect: [{ startMs: 0, endMs: 10_000 }],
          manualZoneEvents: [{ zone: "联盟", atMs: 0 }],
        }),
        superRecord(1, {
          teams: [8214],
          auto: [100],
          drive: [0],
          defense: [0],
          bps: [10],
          accuracy: [100],
          comments: [""],
          asc: 20,
          tsc: 30,
        }),
      ],
    });

    expect(dataset.teamData["8214"].matches[0]).toMatchObject({ autoPts: 20, telePts: 30, totalPts: 50 });
  });

  it("does not use Super Scout scores when phase weights cannot allocate them", () => {
    const dataset = buildCyberScoutDataset({
      event,
      records: [
        normal(8214, 1),
        superRecord(1, {
          teams: [8214],
          auto: [0],
          drive: [0],
          defense: [0],
          bps: [0],
          accuracy: [0],
          comments: [""],
          autoScore: 10,
          teleopScore: 20,
        }),
      ],
    });

    expect(dataset.teamData["8214"]).toBeUndefined();
    expect(dataset.scoringIgnoredMatches).toBe(1);
  });

  it("does not score TBA matches from legacy top-level breakdown fields", () => {
    const dataset = buildCyberScoutDataset({
      event,
      tbaMatches: [{
        comp_level: "qm",
        match_number: 1,
        alliances: {
          red: { team_keys: ["frc8214"] },
        },
        score_breakdown: {
          red: {
            autoPoints: 20,
            teleopGamePiecePoints: 69,
          },
        },
      }],
      records: [
        normal(8214, 1, {
          manualShotDirect: [{ startMs: 0, endMs: 10_000 }],
          manualZoneEvents: [{ zone: "联盟", atMs: 0 }],
        }),
        superRecord(1, {
          teams: [8214],
          auto: [100],
          drive: [5],
          defense: [5],
          bps: [10],
          accuracy: [100],
          comments: [""],
        }),
      ],
    });

    expect(dataset.teamData["8214"]).toBeUndefined();
    expect(dataset.scoringIgnoredMatches).toBe(1);
  });

  it("uses TBA hubScore auto and teleop totals with scout contribution ratios", () => {
    const dataset = buildCyberScoutDataset({
      event,
      tbaMatches: [{
        comp_level: "qm",
        match_number: 3,
        alliances: {
          red: { team_keys: ["frc8214", "frc6328", "frc157"] },
          blue: { team_keys: ["frc1", "frc2", "frc3"] },
        },
        score_breakdown: {
          red: {
            hubScore: {
              autoPoints: 30,
              teleopPoints: 80,
            },
          },
        },
      }],
      records: [
        normal(8214, 3, {
          climbPosition: "A",
          manualShotDirect: [{ startMs: 0, endMs: 10_000 }],
          manualZoneEvents: [{ zone: "联盟", atMs: 0 }],
        }),
        normal(6328, 3, {
          manualShotDirect: [{ startMs: 0, endMs: 10_000 }],
          manualZoneEvents: [{ zone: "联盟", atMs: 0 }],
        }),
        normal(157, 3, {
          manualShotDirect: [{ startMs: 0, endMs: 10_000 }],
          manualZoneEvents: [{ zone: "联盟", atMs: 0 }],
        }),
        superRecord(3, {
          teams: [8214, 6328, 157],
          auto: [50, 30, 20],
          drive: [0, 0, 0],
          defense: [0, 0, 0],
          bps: [2, 1, 4],
          accuracy: [50, 100, 0],
          comments: ["", "", ""],
          autoScore: 999,
          teleopScore: 999,
        }),
      ],
    });

    expect(dataset.teamData["8214"].matches[0]).toMatchObject({
      autoPts: 15,
      telePts: 45,
      totalPts: 60,
      climbPts: 5,
    });
    expect(dataset.teamData["6328"].matches[0]).toMatchObject({
      autoPts: 9,
      telePts: 40,
      totalPts: 49,
    });
    expect(dataset.teamData["157"].matches[0]).toMatchObject({
      autoPts: 6,
      telePts: 0,
      totalPts: 6,
    });
    expect(dataset.scoringFallbackMatches).toBe(0);
  });

  it("does not let playoff matches with the same match number override qualification scout records", () => {
    const dataset = buildCyberScoutDataset({
      event,
      tbaMatches: [
        {
          comp_level: "qm",
          match_number: 1,
          alliances: {
            red: { team_keys: ["frc6941", "frc11485", "frc6986"] },
          },
          score_breakdown: {
            red: {
              hubScore: {
                autoPoints: 57,
                teleopPoints: 142,
              },
            },
          },
        },
        {
          comp_level: "sf",
          match_number: 1,
          alliances: {
            red: { team_keys: ["frc10526", "frc6941", "frc8214"] },
          },
          score_breakdown: {
            red: {
              hubScore: {
                autoPoints: 80,
                teleopPoints: 282,
              },
            },
          },
        },
      ],
      records: [
        normal(6941, 1, {
          manualShotDirect: [{ startMs: 0, endMs: 10_000 }],
          manualZoneEvents: [{ zone: "联盟", atMs: 0 }],
        }),
        normal(11485, 1, {
          manualShotDirect: [{ startMs: 0, endMs: 2_000 }],
          manualZoneEvents: [{ zone: "联盟", atMs: 0 }],
        }),
        normal(6986, 1, {
          manualShotDirect: [{ startMs: 0, endMs: 7_000 }],
          manualZoneEvents: [{ zone: "联盟", atMs: 0 }],
        }),
        superRecord(1, {
          teams: [6941, 11485, 6986],
          auto: [50, 0, 50],
          drive: [3, 0, 0],
          defense: [4, 0, 0],
          bps: [10, 5, 20],
          accuracy: [60, 70, 70],
          comments: ["", "", ""],
        }),
      ],
    });

    expect(dataset.teamData["6941"].matches[0]).toMatchObject({
      autoPts: 28.5,
      telePts: 51.6,
      totalPts: 80.1,
    });
  });

  it("filters scout records by the selected data range", () => {
    const dataset = buildCyberScoutDataset({
      event,
      includedMatchTypes: ["qualification"],
      tbaMatches: [
        {
          comp_level: "qm",
          match_number: 1,
          alliances: {
            red: { team_keys: ["frc8214"] },
          },
          score_breakdown: {
            red: {
              hubScore: {
                autoPoints: 10,
                teleopPoints: 20,
              },
            },
          },
        },
        {
          comp_level: "qm",
          match_number: 2,
          alliances: {
            red: { team_keys: ["frc8214"] },
          },
          score_breakdown: {
            red: {
              hubScore: {
                autoPoints: 100,
                teleopPoints: 200,
              },
            },
          },
        },
      ],
      records: [
        normal(8214, 1, {
          manualShotDirect: [{ startMs: 0, endMs: 10_000 }],
          manualZoneEvents: [{ zone: "联盟", atMs: 0 }],
        }),
        superRecord(1, {
          teams: [8214],
          auto: [100],
          drive: [1],
          defense: [1],
          bps: [10],
          accuracy: [100],
          comments: [""],
        }),
        normal(8214, 2, {
          matchType: "P",
          manualShotDirect: [{ startMs: 0, endMs: 10_000 }],
          manualZoneEvents: [{ zone: "联盟", atMs: 0 }],
        }),
        superRecord(2, {
          matchType: "P",
          teams: [8214],
          auto: [100],
          drive: [5],
          defense: [5],
          bps: [10],
          accuracy: [100],
          comments: [""],
        }),
      ],
    });

    expect(dataset.teamData["8214"].matchCount).toBe(1);
    expect(dataset.teamData["8214"].matches[0]).toMatchObject({
      match: 1,
      totalPts: 30,
    });
    expect(dataset.scoringIgnoredMatches).toBe(0);
  });

  it("scores playoff records only when they carry an exact TBA match key and playoffs are selected", () => {
    const dataset = buildCyberScoutDataset({
      event,
      includedMatchTypes: ["playoff"],
      tbaMatches: [{
        key: "2026test_sf7m1",
        comp_level: "sf",
        match_number: 1,
        alliances: {
          red: { team_keys: ["frc6941"] },
        },
        score_breakdown: {
          red: {
            hubScore: {
              autoPoints: 80,
              teleopPoints: 282,
            },
          },
        },
      }],
      records: [
        normal(6941, 1, {
          matchType: "playoff",
          tbaMatchKey: "2026test_sf7m1",
          manualShotDirect: [{ startMs: 0, endMs: 10_000 }],
          manualZoneEvents: [{ zone: "联盟", atMs: 0 }],
        }),
        superRecord(1, {
          matchType: "playoff",
          tbaMatchKey: "2026test_sf7m1",
          teams: [6941],
          auto: [100],
          drive: [3],
          defense: [4],
          bps: [10],
          accuracy: [100],
          comments: [""],
        }),
      ],
    });

    expect(dataset.teamData["6941"].matches[0]).toMatchObject({
      autoPts: 80,
      telePts: 282,
      totalPts: 362,
    });
  });

  it("treats final scout records as playoff records", () => {
    const dataset = buildCyberScoutDataset({
      event,
      includedMatchTypes: ["playoff"],
      tbaMatches: [{
        key: "2026test_f1m1",
        comp_level: "f",
        match_number: 1,
        alliances: {
          blue: { team_keys: ["frc9635"] },
        },
        score_breakdown: {
          blue: {
            hubScore: {
              autoPoints: 40,
              teleopPoints: 120,
            },
          },
        },
      }],
      records: [
        normal(9635, 1, {
          matchType: "final",
          tbaMatchKey: "2026test_f1m1",
          manualShotDirect: [{ startMs: 0, endMs: 10_000 }],
          manualZoneEvents: [{ zone: "联盟", atMs: 0 }],
        }),
        superRecord(1, {
          matchType: "final",
          tbaMatchKey: "2026test_f1m1",
          teams: [9635],
          auto: [100],
          drive: [5],
          defense: [5],
          bps: [10],
          accuracy: [100],
          comments: [""],
        }),
      ],
    });

    expect(dataset.teamData["9635"].matches[0]).toMatchObject({
      autoPts: 40,
      telePts: 120,
      totalPts: 160,
    });
  });

  it("scores only alliance-zone shooting and reports neutral or opponent shooting as transfer", () => {
    const dataset = buildCyberScoutDataset({
      event,
      tbaMatches: [{
        comp_level: "qm",
        match_number: 4,
        alliances: {
          red: { team_keys: ["frc8214", "frc6328", "frc157"] },
        },
        score_breakdown: {
          red: {
            hubScore: {
              autoPoints: 10,
              teleopPoints: 40,
            },
          },
        },
      }],
      records: [
        normal(8214, 4, {
          manualShotDirect: [{ startMs: 0, endMs: 10_000 }],
          manualZoneEvents: [{ zone: "联盟", atMs: 0 }, { zone: "中立", atMs: 5_000 }],
        }),
        normal(6328, 4, {
          manualShotDirect: [{ startMs: 0, endMs: 10_000 }],
          manualZoneEvents: [{ zone: "对方", atMs: 0 }],
        }),
        superRecord(4, {
          teams: [8214, 6328, 157],
          auto: [100, 0, 0],
          drive: [0, 0, 0],
          defense: [0, 0, 0],
          bps: [2, 2, 0],
          accuracy: [50, 50, 0],
          comments: ["", "", ""],
        }),
      ],
    });

    expect(dataset.teamData["8214"].matches[0]).toMatchObject({
      autoPts: 10,
      telePts: 40,
      transferPieces: 10,
      totalPts: 50,
    });
    expect(dataset.teamData["6328"].matches[0]).toMatchObject({
      autoPts: 0,
      telePts: 0,
      transferPieces: 20,
      totalPts: 0,
    });
    expect(dataset.teamData["8214"].avgTransferPieces).toBe(10);
    expect(dataset.teamData["6328"].avgTransferPieces).toBe(20);
  });

  it("applies no-show, incap, and climb failure rules", () => {
    const dataset = buildCyberScoutDataset({
      event,
      tbaMatches: [{
        comp_level: "qm",
        match_number: 2,
        alliances: {
          red: { team_keys: ["frc6328", "frc157", "frc8214"] },
        },
        score_breakdown: {
          red: {
            hubScore: {
              autoPoints: 60,
              teleopPoints: 20,
            },
          },
        },
      }],
      records: [
        normal(6328, 2, { noShow: true, incapPeriods: [{ startMs: 0, endMs: 200_000 }] }),
        normal(157, 2, {
          climbPosition: "A",
          climbFailed: true,
          incapPeriods: [{ startMs: 0, endMs: 150_000 }],
          manualShotDirect: [{ startMs: 0, endMs: 10_000 }],
          manualZoneEvents: [{ zone: "联盟", atMs: 0 }],
        }),
        superRecord(2, {
          teams: [6328, 157, 8214],
          auto: [100, 100, 0],
          drive: [5, 5, 0],
          defense: [5, 5, 0],
          bps: [35, 35, 0],
          accuracy: [100, 100, 0],
          comments: ["", "", ""],
        }),
      ],
    });

    expect(dataset.teamData["6328"].matches[0]).toMatchObject({
      totalPts: 0,
      botState: 4,
      disabled: true,
    });
    expect(reliability(dataset.teamData["6328"])).toBe(0);
    expect(dataset.teamData["157"].matches[0]).toMatchObject({
      totalPts: 80,
      climbPts: 0,
      botState: 3,
      disabled: false,
      downtimeMs: 150_000,
    });
    expect(reliability(dataset.teamData["157"])).toBe(0);
  });

  it("rejects unsafe cyber-scout photo paths", () => {
    expect(isSafeCyberScoutPhotoPath("event/record/1.png")).toBe(true);
    expect(isSafeCyberScoutPhotoPath("/event/record/1.png")).toBe(false);
    expect(isSafeCyberScoutPhotoPath("../secret.png")).toBe(false);
    expect(isSafeCyberScoutPhotoPath("event/record/1.svg")).toBe(false);
  });

  it("reports fallback when cyber-scout env is missing", async () => {
    delete process.env.CYBER_SCOUT_SUPABASE_URL;
    delete process.env.CYBER_SCOUT_SUPABASE_SERVICE_ROLE_KEY;
    __resetCyberScoutClientForTests();
    const result = await loadCyberScoutDataset("2026test");
    expect(result.dataset).toBeNull();
    expect(result.status.source).toBe("fallback");
    expect(result.status.message).toContain("未配置");
  });

  it("uses the newest event when none is active", () => {
    const inactiveEvents = [
      { ...event, id: "new", tba_event_key: "2026new", is_active: false },
      { ...event, id: "old", tba_event_key: "2026old", is_active: false },
    ];

    expect(resolveEvent(inactiveEvents, null)?.tba_event_key).toBe("2026new");
  });
});

function normal(team: number, match: number, payload: Record<string, unknown> = {}): CyberScoutRecordRow {
  return {
    id: `normal-${team}-${match}`,
    record_type: "normal_match",
    match_number: match,
    team_number: team,
    payload: {
      scout: "Normal Scout",
      matchType: "Q",
      matchNumber: match,
      teamNumber: team,
      ...payload,
    },
    uploaded_at: `2026-07-04T00:0${match}:00.000Z`,
    client_created_at: null,
    created_at: null,
  };
}

function superRecord(
  match: number,
  payload: Record<string, unknown>,
  uploadedAt = `2026-07-04T00:0${match}:30.000Z`,
): CyberScoutRecordRow {
  return {
    id: `super-${match}-${uploadedAt}`,
    record_type: "super_match",
    match_number: match,
    team_number: null,
    payload: {
      scout: "Super Scout",
      matchType: "Q",
      matchNumber: match,
      alliance: "red",
      ...payload,
    },
    uploaded_at: uploadedAt,
    client_created_at: null,
    created_at: null,
  };
}

function pit(team: number, photoPaths: string[], payload: Record<string, unknown> = {}): CyberScoutRecordRow {
  return {
    id: `pit-${team}`,
    record_type: "pit",
    match_number: null,
    team_number: team,
    payload: { teamNumber: team, photoPaths, ...payload },
    uploaded_at: "2026-07-04T00:05:00.000Z",
    client_created_at: null,
    created_at: null,
  };
}
