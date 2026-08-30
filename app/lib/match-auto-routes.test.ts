import { describe, expect, it } from "vitest";
import { analyzeRouteRepetition, autoPathSignature, buildMatchAutoRoutes } from "./match-auto-routes";
import type { ScoutingMatch, TeamSummary } from "./scouting";

describe("match auto routes", () => {
  it("uses normalized season coordinates for route points", () => {
    const routes = buildMatchAutoRoutes(team([
      match(1, [{ node: "start", atMs: 0, x: 10, y: 20 }, { node: "score", atMs: 1000, x: 30, y: 40 }]),
    ]));
    expect(routes[0].points).toEqual([{ x: 10, y: 20 }, { x: 30, y: 40 }]);
  });

  it("builds a signature from node order only", () => {
    expect(autoPathSignature(match(1, [{ node: "tower", atMs: 0, x: 10, y: 20 }, { node: "alliance-center", atMs: 1200, x: 30, y: 40 }]))).toBe(
      "tower>alliance-center",
    );
    expect(autoPathSignature(match(1, [{ node: "tower", atMs: 900, x: 10, y: 20 }, { node: "alliance-center", atMs: 1800, x: 30, y: 40 }]))).toBe(
      "tower>alliance-center",
    );
  });

  it("keeps the selected start position as route metadata", () => {
    const routes = buildMatchAutoRoutes(team([
      match(1, [{ node: "alliance-center", atMs: 1200, x: 30, y: 40 }], { autoAlliance: "red", autoStartPosition: "center" }),
    ]));

    expect(routes[0].nodes).toEqual(["alliance-center"]);
    expect(routes[0].startPosition).toBe("center");
  });

  it("keeps different start positions as different routes", () => {
    const routes = buildMatchAutoRoutes(team([
      match(1, [{ node: "alliance-center", atMs: 1200, x: 30, y: 40 }], { autoStartPosition: "center" }),
      match(2, [{ node: "alliance-left", atMs: 1300, x: 20, y: 40 }], { autoStartPosition: "left" }),
    ]));

    expect(routes.map((route) => route.signature)).toEqual(["alliance-center", "alliance-left"]);
  });

  it("merges identical node sequences and keeps different sequences separate", () => {
    const routes = buildMatchAutoRoutes(team([
      match(1, [{ node: "tower", atMs: 0, x: 10, y: 20 }, { node: "alliance-center", atMs: 1200, x: 30, y: 40 }], { autoAlliance: "red" }),
      match(2, [{ node: "tower", atMs: 300, x: 10, y: 20 }, { node: "alliance-center", atMs: 1500, x: 30, y: 40 }], { autoAlliance: "blue" }),
      match(3, [{ node: "tower", atMs: 0, x: 10, y: 20 }, { node: "alliance-left", atMs: 1200, x: 20, y: 40 }], { autoAlliance: "red" }),
    ]));

    expect(routes).toHaveLength(2);
    expect(routes[0].matches.map((item) => item.match)).toEqual([1, 2]);
    expect(routes[0].points).toEqual([{ x: 10, y: 20 }, { x: 30, y: 40 }]);
    expect(routes[1].signature).toBe("tower>alliance-left");
  });

  it("uses the normal match scout name for match-auto routes", () => {
    const routes = buildMatchAutoRoutes(team([
      match(1, [{ node: "tower", atMs: 0, x: 10, y: 20 }], {
        autoScoutName: "Normal Scout",
        scoutName: "Super Scout",
      }),
    ]));

    expect(routes[0].scoutName).toBe("Normal Scout");
    expect(routes[0].matches[0].scoutName).toBe("Normal Scout");
  });

  it("marks repeated node visits and repeated reverse segments", () => {
    const tower = { x: 6, y: 50 };
    const center = { x: 17.5, y: 50 };
    const repetition = analyzeRouteRepetition([tower, center, tower]);

    expect(repetition.visits).toEqual([
      { ...tower, occurrence: 1, total: 2 },
      { ...center, occurrence: 1, total: 1 },
      { ...tower, occurrence: 2, total: 2 },
    ]);
    expect(repetition.segments).toEqual([{ from: tower, to: center, count: 2 }]);
  });

  it("ignores empty or unknown auto paths", () => {
    expect(buildMatchAutoRoutes(team([
      match(1, [], { autoStartPosition: "center" }),
      match(2, [{ node: "unknown", atMs: 0 }], { autoStartPosition: "center" }),
    ]))).toEqual([]);
  });
});

function team(matches: ScoutingMatch[]): TeamSummary {
  return {
    team: "8214",
    avgTotal: 0,
    avgAuto: 0,
    avgTele: 0,
    metrics: {},
    avgDriver: 0,
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
    metrics: {},
    status: "normal",
    disabled: false,
    driverRating: 0,
    defenseRating: 0,
    comment: "",
    startPos: "",
    scoutName: "",
    autoPath,
    ...extra,
  };
}
