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

export const MATCH_AUTO_NODE_LABELS: Record<string, string> = {
  depot: "depot",
  tower: "tower",
  outpost: "outpost",
  "alliance-left": "左",
  "alliance-center": "中",
  "alliance-right": "右",
  "left-trench": "左Trench",
  "left-bump": "左Bump",
  "right-bump": "右Bump",
  "right-trench": "右Trench",
  "neutral-left": "中左",
  "neutral-right": "中右",
};

const AUTO_NODE_CENTERS: Record<AllianceSide, Record<string, AutoRoutePoint>> = {
  red: {
    depot: { x: 6, y: 19 },
    tower: { x: 6, y: 50 },
    outpost: { x: 6, y: 81 },
    "alliance-left": { x: 17.5, y: 19 },
    "alliance-center": { x: 17.5, y: 50 },
    "alliance-right": { x: 17.5, y: 81 },
    "left-trench": { x: 28.71, y: 7.945 },
    "left-bump": { x: 28.71, y: 31.195 },
    "right-bump": { x: 28.71, y: 68.815 },
    "right-trench": { x: 28.71, y: 92.055 },
    "neutral-left": { x: 41.68, y: 28 },
    "neutral-right": { x: 41.68, y: 72 },
  },
  blue: {
    depot: { x: 94, y: 81 },
    tower: { x: 94, y: 50 },
    outpost: { x: 94, y: 19 },
    "alliance-left": { x: 82.5, y: 81 },
    "alliance-center": { x: 82.5, y: 50 },
    "alliance-right": { x: 82.5, y: 19 },
    "left-trench": { x: 71.28, y: 92.055 },
    "left-bump": { x: 71.28, y: 68.815 },
    "right-bump": { x: 71.28, y: 31.195 },
    "right-trench": { x: 71.28, y: 7.945 },
    "neutral-left": { x: 58.32, y: 72 },
    "neutral-right": { x: 58.32, y: 28 },
  },
};

const START_TO_AUTO_NODE: Record<string, string> = {
  "right-out": "right-trench",
  "left-out": "left-trench",
  "right-in": "right-trench",
  "right-bump": "right-bump",
  "hub-front": "tower",
  "left-bump": "left-bump",
  "left-in": "left-trench",
};

export function buildMatchAutoRoutes(team: TeamSummary): MatchAutoRoute[] {
  const bySignature = new Map<string, MatchAutoRoute>();

  for (const match of team.matches) {
    const nodes = matchAutoNodes(match);
    if (!nodes.length) continue;

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
      points: nodes.map((node) => autoNodeCenter(node, alliance)),
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
  const nodes = (match.autoPath ?? [])
    .map((point) => point.node)
    .filter((node) => Boolean(AUTO_NODE_CENTERS.red[node]));
  if (!nodes.length) return [];
  const startNode = START_TO_AUTO_NODE[match.autoStartPosition ?? ""];
  if (!startNode) return nodes;
  return nodes[0] === startNode ? nodes : [startNode, ...nodes];
}

export function autoPathSignature(match: ScoutingMatch): string {
  return matchAutoNodes(match).join(">");
}

export function autoNodeCenter(node: string, alliance: string | undefined): AutoRoutePoint {
  return AUTO_NODE_CENTERS[matchAllianceSide(alliance)][node];
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

function routePointKey(point: AutoRoutePoint): string {
  return `${point.x}:${point.y}`;
}

function matchAllianceSide(alliance: string | undefined): AllianceSide {
  return alliance === "blue" ? "blue" : "red";
}
