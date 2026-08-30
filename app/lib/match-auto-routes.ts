import type { AutoRoutePoint, ScoutingMatch, TeamSummary } from "./scouting";

type AllianceSide = "red" | "blue";

export type MatchAutoRoute = {
  id: string;
  signature: string;
  nodes: string[];
  points: AutoRoutePoint[];
  alliance: AllianceSide;
  startPosition: string;
  flipped: boolean;
  scoutName: string;
  matches: Array<{
    match: number;
    matchType?: ScoutingMatch["matchType"];
    alliance: string;
    startPosition: string;
    flipped: boolean;
    scoutName: string;
  }>;
};

export type RoutePointVisit = AutoRoutePoint & {
  occurrence: number;
  total: number;
};

export type RepeatedRouteSegment = {
  from: AutoRoutePoint;
  to: AutoRoutePoint;
  count: number;
};

export function buildMatchAutoRoutes(team: TeamSummary): MatchAutoRoute[] {
  const bySignature = new Map<string, MatchAutoRoute>();

  for (const match of team.matches) {
    const nodes = matchAutoNodes(match);
    const points = matchAutoPoints(match);
    if (!nodes.length || points.length !== nodes.length) continue;

    const signature = nodes.join(">");
    const scoutName = match.autoScoutName || match.scoutName;
    const existing = bySignature.get(signature);
    const matchInfo = {
      match: match.match,
      matchType: match.matchType,
      alliance: match.autoAlliance || "",
      startPosition: match.autoStartPosition || "",
      flipped: Boolean(match.autoFieldSideFlipped),
      scoutName,
    };

    if (existing) {
      existing.matches.push(matchInfo);
      continue;
    }

    const alliance = matchAllianceSide(match.autoAlliance);
    bySignature.set(signature, {
      id: signature,
      signature,
      nodes,
      points,
      alliance,
      startPosition: match.autoStartPosition || "",
      flipped: Boolean(match.autoFieldSideFlipped),
      scoutName,
      matches: [matchInfo],
    });
  }

  return [...bySignature.values()];
}

export function matchAutoNodes(match: ScoutingMatch): string[] {
  return (match.autoPath ?? []).filter(hasCoordinates).map((point) => point.node);
}

export function autoPathSignature(match: ScoutingMatch): string {
  return matchAutoNodes(match).join(">");
}

export function analyzeRouteRepetition(points: AutoRoutePoint[]): {
  visits: RoutePointVisit[];
  segments: RepeatedRouteSegment[];
} {
  const pointTotals = new Map<string, number>();
  const pointSeen = new Map<string, number>();
  const segmentTotals = new Map<string, RepeatedRouteSegment>();

  for (const point of points) {
    const key = routePointKey(point);
    pointTotals.set(key, (pointTotals.get(key) ?? 0) + 1);
  }

  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1];
    const to = points[index];
    const key = [routePointKey(from), routePointKey(to)].sort().join(">");
    const existing = segmentTotals.get(key);
    if (existing) existing.count += 1;
    else segmentTotals.set(key, { from, to, count: 1 });
  }

  return {
    visits: points.map((point) => {
      const key = routePointKey(point);
      const occurrence = (pointSeen.get(key) ?? 0) + 1;
      pointSeen.set(key, occurrence);
      return { ...point, occurrence, total: pointTotals.get(key) ?? 1 };
    }),
    segments: [...segmentTotals.values()].filter((segment) => segment.count > 1),
  };
}

function matchAutoPoints(match: ScoutingMatch): AutoRoutePoint[] {
  return (match.autoPath ?? []).filter(hasCoordinates).map(({ x, y }) => ({ x, y }));
}

function hasCoordinates(point: ScoutingMatch["autoPath"] extends Array<infer T> | undefined ? T : never): point is typeof point & Required<Pick<typeof point, "x" | "y">> {
  return Number.isFinite(point.x) && Number.isFinite(point.y);
}

function routePointKey(point: AutoRoutePoint): string {
  return `${point.x}:${point.y}`;
}

function matchAllianceSide(alliance: string | undefined): AllianceSide {
  return alliance === "blue" ? "blue" : "red";
}
