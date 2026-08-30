import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchFrcMatchResults, fetchFrcMatchSchedule, normalizeFrcSchedule, normalizeFrcScores } from "./frc-events.server";

describe("FRC Events match results", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("authenticates and normalizes official scores", async () => {
    vi.stubEnv("FRC_EVENTS_USERNAME", "strategy@example.com");
    vi.stubEnv("FRC_EVENTS_API_KEY", "test-token");
    const requests: Array<{ url: string; authorization: string | null }> = [];
    vi.stubGlobal("fetch", vi.fn((url: string, init?: RequestInit) => {
      requests.push({ url, authorization: new Headers(init?.headers).get("Authorization") });
      if (url.includes("/scores/CNSH/Qualification")) {
        return Promise.resolve(Response.json({
          MatchScores: [{
            matchLevel: "Qualification",
            matchNumber: 3,
            alliances: [
              { alliance: "Red", totalAutoPoints: 40, totalTeleopPoints: 93, hubScore: { autoPoints: 35, teleopPoints: 88 }, totalPoints: 123 },
              { alliance: "Blue", totalAutoPoints: 30, totalTeleopPoints: 72, hubScore: { autoPoints: 28, teleopPoints: 70 }, totalPoints: 98 },
            ],
          }],
        }));
      }
      return Promise.resolve(Response.json({ MatchScores: [], Schedule: [] }));
    }));

    const results = await fetchFrcMatchResults("2026cnsh");

    expect(results).toEqual([{
      source: "frc-events",
      comp_level: "qm",
      match_number: 3,
      winning_alliance: "red",
      alliances: {
        red: { score: 123, autoPoints: 40, teleopPoints: 93 },
        blue: { score: 98, autoPoints: 30, teleopPoints: 72 },
      },
    }]);
    expect(requests).toHaveLength(4);
    expect(requests.every((request) => request.authorization === `Basic ${Buffer.from("strategy@example.com:test-token").toString("base64")}`)).toBe(true);
  });

  it("ignores incomplete official results", () => {
    expect(normalizeFrcScores({
      MatchScores: [{
        matchLevel: "Qualification",
        matchNumber: 1,
        alliances: [{ alliance: "Red", totalPoints: 100 }],
      }],
    }, "Qualification")).toEqual([]);
  });

  it("loads the selected official schedule levels", async () => {
    vi.stubEnv("FRC_EVENTS_USERNAME", "strategy@example.com");
    vi.stubEnv("FRC_EVENTS_API_KEY", "test-token");
    const requests: string[] = [];
    vi.stubGlobal("fetch", vi.fn((url: string) => {
      requests.push(url);
      return Promise.resolve(Response.json({ Schedule: [] }));
    }));

    await expect(fetchFrcMatchSchedule("2026otsan", ["qualification", "playoff"])).resolves.toEqual([]);
    expect(requests).toEqual([
      "https://frc-api.firstinspires.org/v3.0/2026/schedule/OTSAN?tournamentLevel=Qualification",
      "https://frc-api.firstinspires.org/v3.0/2026/schedule/OTSAN?tournamentLevel=Playoff",
    ]);
  });

  it("keeps official red and blue stations for a double-elimination match", () => {
    expect(normalizeFrcSchedule({
      Schedule: [{
        tournamentLevel: "Playoff",
        description: "Match 5",
        matchNumber: 5,
        teams: [
          { teamNumber: 6487, station: "Red2" },
          { teamNumber: 9995, station: "Red1" },
          { teamNumber: 9597, station: "Red3" },
          { teamNumber: 9992, station: "Blue2" },
          { teamNumber: 9635, station: "Blue3" },
          { teamNumber: 6766, station: "Blue1" },
        ],
      }],
    }, "Playoff")).toEqual([{
      comp_level: "sf",
      set_number: 5,
      match_number: 1,
      alliances: {
        red: { team_keys: ["9995", "6487", "9597"] },
        blue: { team_keys: ["6766", "9992", "9635"] },
      },
    }]);
  });

  it("maps final games to one set with increasing match numbers", () => {
    expect(normalizeFrcScores({
      MatchScores: [{
        matchLevel: "Playoff",
        matchNumber: 14,
        alliances: [
          { alliance: "Red", totalPoints: 400 },
          { alliance: "Blue", totalPoints: 350 },
        ],
      }],
    }, "Playoff", new Map([[14, "Final 2"]]))[0]).toMatchObject({
      comp_level: "f",
      set_number: 1,
      match_number: 2,
    });
  });

  it("recognizes the third final from its double-elimination match number", () => {
    expect(normalizeFrcSchedule({
      Schedule: [{
        tournamentLevel: "Playoff",
        description: "Match 16",
        matchNumber: 16,
        teams: [],
      }],
    }, "Playoff")[0]).toMatchObject({
      comp_level: "f",
      set_number: 1,
      match_number: 3,
    });
  });
});
