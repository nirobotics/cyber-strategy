import type { DataRange } from "./data-range";

export type MatchAutoPathPoint = { node: string; atMs: number };

export type ScoutingMatch = {
  match: number;
  matchType?: DataRange;
  scoutingPts?: number;
  totalPts: number;
  autoPts: number;
  telePts: number;
  transferPieces?: number;
  bps?: number;
  hubSuccess: number;
  hubFail: number;
  accuracy: number | null;
  climbPts: number;
  botState: number;
  botStateText: string;
  disabled: boolean;
  downtimeMs?: number;
  driverRating: number;
  fuelRating: number;
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
  avgTransferPieces?: number;
  avgAccuracy: number;
  avgDriver: number;
  avgDefense?: number;
  avgFuel: number;
  avgBps?: number;
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
  canCrossTrench: boolean;
  isSwerve: boolean;
  drivetrain: string;
  swerveModule: string;
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

export const MATCH_TOTAL_DURATION_MS = 150_000;

export function processCsvRows(rows: CsvRow[]): TeamData {
  const byTeam = new Map<string, CsvRow[]>();
  for (const row of rows) {
    const team = text(row.Team).trim();
    if (!team) continue;
    const teamRows = byTeam.get(team) ?? [];
    teamRows.push(row);
    byTeam.set(team, teamRows);
  }

  const result: TeamData = {};
  for (const [team, matches] of byTeam.entries()) {
    matches.sort((a, b) => integer(a.Match) - integer(b.Match));
    const matchList = matches.map(toMatch);
    const summary = summarizeTeamMatches(team, matchList);
    if (summary) result[team] = summary;
  }
  return result;
}

export function summarizeTeamMatches(team: string, matches: ScoutingMatch[]): TeamSummary | null {
  const matchList = [...matches].sort((a, b) => a.match - b.match);
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
    avgTransferPieces: avg(matchList.map((match) => match.transferPieces ?? 0).filter((value) => value > 0)),
    avgAccuracy: avg(matchList.map((match) => match.accuracy).filter((value) => value !== null)),
    avgDriver: avg(matchList.map((match) => match.driverRating).filter((value) => value > 0)),
    avgDefense: avg(matchList.map((match) => match.defenseRating).filter((value) => value > 0)),
    avgFuel: avg(matchList.map((match) => match.fuelRating).filter((value) => value > 0)),
    avgBps: avg(matchList.map((match) => match.bps ?? 0).filter((value) => value > 0)),
    malfunctions: matchList.filter((match) => match.botState === 3 || match.botState === 4).length,
    commsIssues: matchList.filter((match) => match.botState === 2).length,
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
    const downtimeMs = Math.min(Math.max(0, match.downtimeMs ?? 0), MATCH_TOTAL_DURATION_MS);
    return (1 - downtimeMs / MATCH_TOTAL_DURATION_MS) * 100;
  }));
}

function toMatch(row: CsvRow): ScoutingMatch {
  const hubSuccess = number(row.TotalHubFuelSuccess);
  const hubFail = number(row.TotalHubFuelFail);
  return {
    match: integer(row.Match),
    totalPts: number(row.TotalPoints),
    autoPts: number(row.AutoPoints),
    telePts: number(row.TelePoints),
    transferPieces: number(row.TransferPieces),
    bps: number(row.BPS),
    hubSuccess,
    hubFail,
    accuracy: hubSuccess + hubFail > 0 ? round1((hubSuccess / (hubSuccess + hubFail)) * 100) : null,
    climbPts: number(row.TotalClimbPoints),
    botState: integer(row.BotState, 1),
    botStateText: text(row.BotStateText).trim() || "未知",
    disabled: text(row.Disabled) === "1" || text(row.Disabled).toLowerCase() === "true",
    downtimeMs: csvDowntimeMs(row),
    driverRating: number(row.DriverRating),
    fuelRating: number(row.FuelIntakeRating),
    defenseRating: number(row.DefenseRating),
    comment: text(row.Comment).trim(),
    startPos: text(row.StartPosition).trim(),
    scoutName: text(row.ScoutName).trim(),
  };
}

function emptyTeamSummary(team: string): TeamSummary {
  return {
    team,
    avgTotal: 0,
    avgAuto: 0,
    avgTele: 0,
    avgAccuracy: 0,
    avgDriver: 0,
    avgFuel: 0,
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

function avg(values: number[]): number {
  return values.length ? round1(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function number(value: unknown, fallback = 0): number {
  const parsed = typeof value === "number" ? value : Number.parseFloat(text(value));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function integer(value: unknown, fallback = 0): number {
  const parsed = typeof value === "number" ? value : Number.parseInt(text(value), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function csvDowntimeMs(row: CsvRow): number {
  const ms = optionalNumber(row.DowntimeMs ?? row.IncapMs ?? row.DisabledMs);
  if (ms !== null) return ms;

  const seconds = optionalNumber(row.DowntimeSeconds ?? row.IncapSeconds ?? row.DisabledSeconds);
  return seconds === null ? 0 : seconds * 1000;
}

function optionalNumber(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number.parseFloat(text(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function text(value: unknown): string {
  return value == null ? "" : String(value);
}
