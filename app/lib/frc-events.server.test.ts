import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchFrcMatchResults, normalizeFrcScores } from "./frc-events.server";

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
        red: { score: 123, autoPoints: 35, teleopPoints: 88 },
        blue: { score: 98, autoPoints: 28, teleopPoints: 70 },
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
});
