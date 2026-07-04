import Papa from "papaparse";

export type ScoutingMatch = {
  match: number;
  totalPts: number;
  autoPts: number;
  telePts: number;
  hubSuccess: number;
  hubFail: number;
  accuracy: number | null;
  climbPts: number;
  botState: number;
  botStateText: string;
  disabled: boolean;
  driverRating: number;
  fuelRating: number;
  defenseRating: number;
  comment: string;
  startPos: string;
  scoutName: string;
};

export type TeamSummary = {
  team: string;
  avgTotal: number;
  avgAuto: number;
  avgTele: number;
  avgAccuracy: number;
  avgDriver: number;
  avgFuel: number;
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

export type ScoutingDatasetPayload = {
  title: string;
  eventKey: string;
  sourceFilename?: string | null;
  teamData: TeamData;
  teamPhotos: TeamPhotos;
};

export type ScoutingDataset = ScoutingDatasetPayload & {
  id: string;
  isActive: boolean;
  createdAt: string | null;
  updatedAt: string | null;
};

export type TierLabel = "Elite" | "Strong" | "Mid" | "Low" | "Struggling";

type CsvRow = Record<string, unknown>;

export function getTier(avgTotal: number): { label: TierLabel; className: string } {
  if (avgTotal >= 70) return { label: "Elite", className: "border-yellow-400/40 bg-yellow-400/10 text-yellow-600 dark:text-yellow-300" };
  if (avgTotal >= 40) return { label: "Strong", className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" };
  if (avgTotal >= 20) return { label: "Mid", className: "border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-300" };
  if (avgTotal >= 5) return { label: "Low", className: "border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300" };
  return { label: "Struggling", className: "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300" };
}

export function parseScoutingCsv(text: string): ScoutingDatasetPayload["teamData"] {
  const parsed = Papa.parse<CsvRow>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim(),
  });
  if (parsed.errors.length) {
    throw new Error(parsed.errors[0]?.message || "CSV parse failed");
  }
  return processCsvRows(parsed.data);
}

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
    if (!matchList.length) continue;

    const pts = matchList.map((match) => match.totalPts);
    const avgTotal = avg(pts);
    const half = Math.floor(matchList.length / 2);
    const firstHalfAvg = half > 0 ? avg(pts.slice(0, half)) : avgTotal;
    const secondHalfAvg = avg(pts.slice(half));
    const variance = pts.reduce((sum, value) => sum + (value - avgTotal) ** 2, 0) / matchList.length;

    result[team] = {
      team,
      avgTotal,
      avgAuto: avg(matchList.map((match) => match.autoPts)),
      avgTele: avg(matchList.map((match) => match.telePts)),
      avgAccuracy: avg(matchList.map((match) => match.accuracy).filter((value) => value !== null)),
      avgDriver: avg(matchList.map((match) => match.driverRating).filter((value) => value > 0)),
      avgFuel: avg(matchList.map((match) => match.fuelRating).filter((value) => value > 0)),
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
  return result;
}

export function sortedTeams(teamData: TeamData): TeamSummary[] {
  return Object.values(teamData).sort((a, b) => b.avgTotal - a.avgTotal || Number(a.team) - Number(b.team));
}

export function reliability(team: TeamSummary): number {
  if (!team.matchCount) return 0;
  return Math.round((1 - team.malfunctions / team.matchCount) * 100);
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

function toMatch(row: CsvRow): ScoutingMatch {
  const hubSuccess = number(row.TotalHubFuelSuccess);
  const hubFail = number(row.TotalHubFuelFail);
  return {
    match: integer(row.Match),
    totalPts: number(row.TotalPoints),
    autoPts: number(row.AutoPoints),
    telePts: number(row.TelePoints),
    hubSuccess,
    hubFail,
    accuracy: hubSuccess + hubFail > 0 ? round1((hubSuccess / (hubSuccess + hubFail)) * 100) : null,
    climbPts: number(row.TotalClimbPoints),
    botState: integer(row.BotState, 1),
    botStateText: text(row.BotStateText).trim() || "Unknown",
    disabled: text(row.Disabled) === "1" || text(row.Disabled).toLowerCase() === "true",
    driverRating: number(row.DriverRating),
    fuelRating: number(row.FuelIntakeRating),
    defenseRating: number(row.DefenseRating),
    comment: text(row.Comment).trim(),
    startPos: text(row.StartPosition).trim(),
    scoutName: text(row.ScoutName).trim(),
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

function text(value: unknown): string {
  return value == null ? "" : String(value);
}
