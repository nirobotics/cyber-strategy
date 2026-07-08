import { describe, expect, it } from "vitest";
import { autoNodeCenter, autoPathSignature, buildMatchAutoRoutes } from "./match-auto-routes";
import type { ScoutingMatch, TeamSummary } from "./scouting";

describe("match auto routes", () => {
  it("uses cyber-scout button centers for route points", () => {
    expect(autoNodeCenter("tower", "red")).toEqual({ x: 6, y: 50 });
    expect(autoNodeCenter("tower", "blue")).toEqual({ x: 94, y: 50 });
    expect(autoNodeCenter("neutral-left", "red")).toEqual({ x: 41.68, y: 28 });
  });

  it("builds a signature from node order only", () => {
    expect(autoPathSignature(match(1, [{ node: "tower", atMs: 0 }, { node: "alliance-center", atMs: 1200 }], { autoStartPosition: "hub-front" }))).toBe(
      "tower>alliance-center",
    );
    expect(autoPathSignature(match(1, [{ node: "tower", atMs: 900 }, { node: "alliance-center", atMs: 1800 }], { autoStartPosition: "hub-front" }))).toBe(
      "tower>alliance-center",
    );
  });

  it("starts routes from the selected start-position button", () => {
    const routes = buildMatchAutoRoutes(team([
      match(1, [{ node: "alliance-center", atMs: 1200 }], { autoAlliance: "red", autoStartPosition: "hub-front" }),
    ]));

    expect(routes[0].nodes).toEqual(["tower", "alliance-center"]);
    expect(routes[0].points).toEqual([{ x: 6, y: 50 }, { x: 17.5, y: 50 }]);
  });

  it("keeps different start positions as different routes", () => {
    const routes = buildMatchAutoRoutes(team([
      match(1, [{ node: "alliance-center", atMs: 1200 }], { autoStartPosition: "hub-front" }),
      match(2, [{ node: "alliance-center", atMs: 1300 }], { autoStartPosition: "right-in" }),
    ]));

    expect(routes.map((route) => route.signature)).toEqual(["tower>alliance-center", "right-trench>alliance-center"]);
  });

  it("merges identical node sequences and keeps different sequences separate", () => {
    const routes = buildMatchAutoRoutes(team([
      match(1, [{ node: "tower", atMs: 0 }, { node: "alliance-center", atMs: 1200 }], { autoAlliance: "red", autoStartPosition: "hub-front" }),
      match(2, [{ node: "tower", atMs: 300 }, { node: "alliance-center", atMs: 1500 }], { autoAlliance: "blue", autoStartPosition: "hub-front" }),
      match(3, [{ node: "tower", atMs: 0 }, { node: "alliance-left", atMs: 1200 }], { autoAlliance: "red", autoStartPosition: "hub-front" }),
    ]));

    expect(routes).toHaveLength(2);
    expect(routes[0].matches.map((item) => item.match)).toEqual([1, 2]);
    expect(routes[0].points).toEqual([{ x: 6, y: 50 }, { x: 17.5, y: 50 }]);
    expect(routes[1].signature).toBe("tower>alliance-left");
  });

  it("ignores empty or unknown auto paths", () => {
    expect(buildMatchAutoRoutes(team([
      match(1, [], { autoStartPosition: "hub-front" }),
      match(2, [{ node: "unknown", atMs: 0 }], { autoStartPosition: "hub-front" }),
    ]))).toEqual([]);
  });
});

function team(matches: ScoutingMatch[]): TeamSummary {
  return {
    team: "8214",
    avgTotal: 0,
    avgAuto: 0,
    avgTele: 0,
    avgAccuracy: 0,
    avgDriver: 0,
    avgFuel: 0,
    malfunctions: 0,
    commsIssues: 0,
    disabledEvents: 0,
    matchCount: matches.length,
    trend: "stable",
    firstHalfAvg: 0,
    secondHalfAvg: 0,
    stdDev: 0,
    minPts: 0,
    maxPts: 0,
    matches,
  };
}

function match(matchNumber: number, autoPath: ScoutingMatch["autoPath"], extra: Partial<ScoutingMatch> = {}): ScoutingMatch {
  return {
    match: matchNumber,
    totalPts: 0,
    autoPts: 0,
    telePts: 0,
    hubSuccess: 0,
    hubFail: 0,
    accuracy: null,
    climbPts: 0,
    botState: 1,
    botStateText: "No Issue",
    disabled: false,
    driverRating: 0,
    fuelRating: 0,
    defenseRating: 0,
    comment: "",
    startPos: "",
    scoutName: "",
    autoPath,
    ...extra,
  };
}
