import type { DataRange } from "./data-range";
import { seasonConfig } from "../season/config";
import {
  normalizeRobotStatus,
  seasonCsvMatchNumber,
  seasonCsvScoutingMatch,
  seasonCsvTeam,
} from "../season/scouting";

export type MatchAutoPathPoint = { node: string; atMs: number; x?: number; y?: number };

export type RobotStatus = "normal" | "no_show" | "incap";

export type ScoutingMatch = {
  match: number;
  matchType?: DataRange;
  scoutingPts?: number;
  totalPts: number;
  autoPts: number;
  telePts: number;
  metrics: Record<string, number>;
  status: RobotStatus;
  disabled: boolean;
  downtimeMs?: number;
  driverRating: number;
  defenseRating: number;
  comment: string;
  startPos: string;
  scoutName: string;
  autoScoutName?: string;
  autoPath?: MatchAutoPathPoint[];
  autoStartPosition?: string;
  autoAlliance?: "red" | "blue" | string;
  autoFieldSideFlipped?: boolean;
};

export type TeamSummary = {
  team: string;
  avgTotal: number;
  avgAuto: number;
  avgTele: number;
  metrics: Record<string, number>;
  avgDriver: number;
  avgDefense?: number;
  malfunctions: number;
  commsIssues: number;
  disabledEvents: number;
  matchCount: number;
  trend: "up" | "down" | "stable";
  firstHalfAvg: number;
  secondHalfAvg: number;
  stdDev: number;
  minPts: number;
  maxPts: number;
  matches: ScoutingMatch[];
};

export type TeamData = Record<string, TeamSummary>;
export type TeamPhotos = Record<string, string[]>;
export type AutoRoutePoint = { x: number; y: number };
export type TeamPitInfo = {
  attributes: Array<{ key: string; label: string; value: string }>;
  autoRoutes: Array<{ id: string; points: AutoRoutePoint[] }>;
};
export type TeamPitData = Record<string, TeamPitInfo>;

export type ScoutingDatasetPayload = {
  title: string;
  eventKey: string;
  sourceFilename?: string | null;
  teamData: TeamData;
  teamPhotos: TeamPhotos;
  teamPitData?: TeamPitData;
};

export type ScoutingDataset = ScoutingDatasetPayload & {
  id: string;
  isActive: boolean;
  createdAt: string | null;
  updatedAt: string | null;
};

export type ScoutingEventOption = {
  eventKey: string;
  name: string;
  isActive: boolean;
  updatedAt: string | null;
};

export type DatasetSourceStatus = {
  source: "cyber-scout" | "fallback";
  label: string;
  message: string;
  updatedAt: string | null;
  error?: string;
};

type CsvRow = Record<string, unknown>;

export function processCsvRows(rows: CsvRow[]): TeamData {
  const byTeam = new Map<string, CsvRow[]>();
  for (const row of rows) {
    const team = seasonCsvTeam(row);
    if (!team) continue;
    const teamRows = byTeam.get(team) ?? [];
    teamRows.push(row);
    byTeam.set(team, teamRows);
  }

  const result: TeamData = {};
  for (const [team, matches] of byTeam.entries()) {
    matches.sort((a, b) => seasonCsvMatchNumber(a) - seasonCsvMatchNumber(b));
    const matchList = matches.map(seasonCsvScoutingMatch);
    const summary = summarizeTeamMatches(team, matchList);
    if (summary) result[team] = summary;
  }
  return result;
}

export function summarizeTeamMatches(team: string, matches: ScoutingMatch[]): TeamSummary | null {
  const matchList = matches.map(normalizeScoutingMatch).sort((a, b) => a.match - b.match);
  if (!matchList.length) return null;

  const pts = matchList.map((match) => match.totalPts);
  const avgTotal = avg(pts);
  const half = Math.floor(matchList.length / 2);
  const firstHalfAvg = half > 0 ? avg(pts.slice(0, half)) : avgTotal;
  const secondHalfAvg = avg(pts.slice(half));
  const variance = pts.reduce((sum, value) => sum + (value - avgTotal) ** 2, 0) / matchList.length;

  return {
    team,
    avgTotal,
    avgAuto: avg(matchList.map((match) => match.autoPts)),
    avgTele: avg(matchList.map((match) => match.telePts)),
    metrics: summarizeMetrics(matchList),
    avgDriver: avg(matchList.map((match) => match.driverRating).filter((value) => value > 0)),
    avgDefense: avg(matchList.map((match) => match.defenseRating).filter((value) => value > 0)),
    malfunctions: matchList.filter((match) => match.status === "incap").length,
    commsIssues: 0,
    disabledEvents: matchList.filter((match) => match.disabled).length,
    matchCount: matchList.length,
    trend: secondHalfAvg > firstHalfAvg + 5 ? "up" : secondHalfAvg < firstHalfAvg - 5 ? "down" : "stable",
    firstHalfAvg,
    secondHalfAvg,
    stdDev: round1(Math.sqrt(variance)),
    minPts: Math.min(...pts),
    maxPts: Math.max(...pts),
    matches: matchList,
  };
}

export function matchIgnoreKey(team: string, match: number, matchIndex: number): string {
  return `${team}:${match}:${matchIndex}`;
}

export function applyIgnoredMatchesToTeamData(teamData: TeamData, ignoredMatchKeys: string[]): TeamData {
  const ignored = new Set(ignoredMatchKeys);
  const result: TeamData = {};
  for (const [team, summary] of Object.entries(teamData)) {
    const matches = summary.matches.filter((match, index) => !ignored.has(matchIgnoreKey(team, match.match, index)));
    result[team] = summarizeTeamMatches(team, matches) ?? emptyTeamSummary(team);
  }
  return result;
}

export function sortedTeams(teamData: TeamData): TeamSummary[] {
  return Object.values(teamData).sort((a, b) => b.avgTotal - a.avgTotal || Number(a.team) - Number(b.team));
}

export function reliability(team: TeamSummary): number {
  if (!team.matchCount) return 0;
  return avg(team.matches.map((match) => {
    const downtimeMs = Math.min(Math.max(0, match.downtimeMs ?? 0), seasonConfig.matchDurationMs);
    return (1 - downtimeMs / seasonConfig.matchDurationMs) * 100;
  }));
}

export function scoutingMatchStatus(match: ScoutingMatch): RobotStatus {
  if (match.status === "no_show") return "no_show";
  if (match.disabled) return "incap";
  if (match.status === "normal" || match.status === "incap") return match.status;
  const legacy = match as unknown as { status?: string; botState?: number; botStateText?: string };
  return normalizeRobotStatus({
    code: legacy.botState,
    text: legacy.botStateText || legacy.status,
    disabled: match.disabled,
    downtimeMs: match.downtimeMs,
  });
}

export function normalizeTeamPhotos(raw: unknown): TeamPhotos {
  if (!raw || typeof raw !== "object") return {};
  const photos: TeamPhotos = {};
  for (const [team, values] of Object.entries(raw)) {
    if (!Array.isArray(values)) continue;
    photos[team] = values.filter((value): value is string => typeof value === "string" && value.length > 0);
  }
  return photos;
}

function emptyTeamSummary(team: string): TeamSummary {
  return {
    team,
    avgTotal: 0,
    avgAuto: 0,
    avgTele: 0,
    metrics: {},
    avgDriver: 0,
    malfunctions: 0,
    commsIssues: 0,
    disabledEvents: 0,
    matchCount: 0,
    trend: "stable",
    firstHalfAvg: 0,
    secondHalfAvg: 0,
    stdDev: 0,
    minPts: 0,
    maxPts: 0,
    matches: [],
  };
}

function normalizeScoutingMatch(match: ScoutingMatch): ScoutingMatch {
  return { ...match, metrics: match.metrics ?? {}, status: scoutingMatchStatus(match) };
}

function summarizeMetrics(matches: ScoutingMatch[]) {
  const keys = new Set(matches.flatMap((match) => Object.keys(match.metrics)));
  return Object.fromEntries([...keys].flatMap((key) => {
    const values = matches.map((match) => match.metrics[key]).filter(Number.isFinite);
    return values.length ? [[key, avg(values)]] : [];
  }));
}

function avg(values: number[]): number {
  return values.length ? round1(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
