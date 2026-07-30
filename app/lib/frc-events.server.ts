import type { DataRange } from "./data-range";
import type { CombinedMatch, MatchResult } from "./match-analysis";

const frcEventsBaseUrl = "https://frc-api.firstinspires.org/v3.0";

type FrcAllianceScore = {
  alliance?: string;
  autoPoints?: number;
  teleopPoints?: number;
  totalAutoPoints?: number;
  totalTeleopPoints?: number;
  totalPoints?: number;
  hubScore?: {
    autoPoints?: number;
    teleopPoints?: number;
  };
};

type FrcMatchScore = {
  matchLevel?: string;
  tournamentLevel?: string;
  description?: string;
  matchNumber?: number;
  alliances?: FrcAllianceScore[];
};

type FrcScoresResponse = {
  MatchScores?: FrcMatchScore[];
  matchScores?: FrcMatchScore[];
};

type FrcSchedule = {
  tournamentLevel?: string;
  description?: string;
  matchNumber?: number;
  teams?: Array<{
    teamNumber?: number;
    station?: string;
  }>;
};

type FrcScheduleResponse = {
  Schedule?: FrcSchedule[];
  schedule?: FrcSchedule[];
};

const scheduleLevels: Array<{ range: DataRange; level: "Practice" | "Qualification" | "Playoff" }> = [
  { range: "practice", level: "Practice" },
  { range: "qualification", level: "Qualification" },
  { range: "playoff", level: "Playoff" },
];

export async function fetchFrcMatchSchedule(
  eventKey: string,
  includedMatchTypes: DataRange[] = scheduleLevels.map(({ range }) => range),
): Promise<CombinedMatch[]> {
  const credentials = frcEventsCredentials();
  if (!credentials) return [];
  const { season, eventCode } = parseFrcEventKey(eventKey);
  const included = new Set(includedMatchTypes);
  const levels = scheduleLevels.filter(({ range }) => included.has(range));
  const schedules = await Promise.all(levels.map(({ level }) => fetchOptionalFrc<FrcScheduleResponse>(
    `/${season}/schedule/${encodeURIComponent(eventCode)}?tournamentLevel=${level}`,
    credentials,
  )));
  return levels.flatMap(({ level }, index) => normalizeFrcSchedule(schedules[index], level));
}

export async function fetchFrcMatchResults(eventKey: string): Promise<MatchResult[]> {
  const credentials = frcEventsCredentials();
  if (!credentials) return [];
  const { season, eventCode } = parseFrcEventKey(eventKey);
  const levels = ["Practice", "Qualification", "Playoff"] as const;
  const [scores, playoffSchedule] = await Promise.all([
    Promise.all(levels.map((level) => fetchOptionalFrc<FrcScoresResponse>(
      `/${season}/scores/${encodeURIComponent(eventCode)}/${level}`,
      credentials,
    ))),
    fetchOptionalFrc<FrcScheduleResponse>(
      `/${season}/schedule/${encodeURIComponent(eventCode)}?tournamentLevel=Playoff`,
      credentials,
    ),
  ]);
  const playoffDescriptions = new Map(
    (playoffSchedule?.Schedule ?? playoffSchedule?.schedule ?? [])
      .filter((match) => positiveInteger(match.matchNumber))
      .map((match) => [match.matchNumber!, match.description ?? ""]),
  );

  return levels.flatMap((level, index) => normalizeFrcScores(scores[index], level, playoffDescriptions));
}

export function normalizeFrcScores(
  response: FrcScoresResponse | null,
  requestedLevel: string,
  playoffDescriptions = new Map<number, string>(),
): MatchResult[] {
  return (response?.MatchScores ?? response?.matchScores ?? []).flatMap((score) => {
    const identity = frcMatchIdentity(score, requestedLevel, playoffDescriptions);
    if (!identity) return [];
    const red = allianceScore(score.alliances, "red");
    const blue = allianceScore(score.alliances, "blue");
    if (!red || !blue) return [];
    return [{
      source: "frc-events" as const,
      ...identity,
      winning_alliance: red.score > blue.score ? "red" as const : blue.score > red.score ? "blue" as const : "tie" as const,
      alliances: { red, blue },
    }];
  });
}

export function normalizeFrcSchedule(
  response: FrcScheduleResponse | null,
  requestedLevel: string,
): CombinedMatch[] {
  return (response?.Schedule ?? response?.schedule ?? []).flatMap((match) => {
    const identity = frcMatchIdentity(match, requestedLevel, new Map());
    if (!identity) return [];
    return [{
      ...identity,
      alliances: {
        red: { team_keys: allianceTeams(match.teams, "red") },
        blue: { team_keys: allianceTeams(match.teams, "blue") },
      },
    }];
  });
}

function frcEventsCredentials() {
  const username = process.env.FRC_EVENTS_USERNAME?.trim();
  const apiKey = process.env.FRC_EVENTS_API_KEY?.trim();
  return username && apiKey ? Buffer.from(`${username}:${apiKey}`).toString("base64") : null;
}

async function fetchOptionalFrc<T>(path: string, credentials: string): Promise<T | null> {
  try {
    const response = await fetch(`${frcEventsBaseUrl}${path}`, {
      headers: { Authorization: `Basic ${credentials}`, Accept: "application/json" },
    });
    return response.ok ? await response.json() as T : null;
  } catch {
    return null;
  }
}

function parseFrcEventKey(eventKey: string) {
  const match = /^(\d{4})([a-z0-9]{3,})$/i.exec(eventKey.trim());
  if (!match) throw new Error("FRC Events 赛事代码格式无效。");
  return { season: Number(match[1]), eventCode: match[2].toUpperCase() };
}

function frcMatchIdentity(
  score: Pick<FrcMatchScore, "matchLevel" | "tournamentLevel" | "description" | "matchNumber">,
  requestedLevel: string,
  playoffDescriptions: Map<number, string>,
) {
  const matchNumber = positiveInteger(score.matchNumber);
  if (!matchNumber) return null;
  const level = (score.matchLevel ?? score.tournamentLevel ?? requestedLevel).toLowerCase();
  if (level === "practice") return { comp_level: "practice", match_number: matchNumber };
  if (level === "qualification") return { comp_level: "qm", match_number: matchNumber };
  if (level !== "playoff") return null;

  const description = score.description?.trim() || playoffDescriptions.get(matchNumber) || "";
  const final = /^final\s+(\d+)/i.exec(description);
  if (final) return { comp_level: "f", set_number: 1, match_number: Number(final[1]) };
  const quarterfinal = /^quarterfinal\s+(\d+)/i.exec(description);
  if (quarterfinal) return legacyPlayoffIdentity("qf", Number(quarterfinal[1]), 4);
  const semifinal = /^semifinal\s+(\d+)/i.exec(description);
  if (semifinal) {
    const sequence = Number(semifinal[1]);
    return sequence > 4
      ? { comp_level: "sf", set_number: sequence, match_number: 1 }
      : legacyPlayoffIdentity("sf", sequence, 2);
  }
  if (matchNumber >= 14) return { comp_level: "f", set_number: 1, match_number: matchNumber - 13 };
  const playoff = /^match\s+(\d+)/i.exec(description);
  return { comp_level: "sf", set_number: positiveInteger(playoff?.[1]) ?? matchNumber, match_number: 1 };
}

function legacyPlayoffIdentity(compLevel: "qf" | "sf", sequence: number, setCount: number) {
  return {
    comp_level: compLevel,
    set_number: ((sequence - 1) % setCount) + 1,
    match_number: Math.floor((sequence - 1) / setCount) + 1,
  };
}

function allianceTeams(teams: FrcSchedule["teams"], alliance: "red" | "blue") {
  return (teams ?? [])
    .filter((team) => team.station?.toLowerCase().startsWith(alliance) && positiveInteger(team.teamNumber))
    .sort((a, b) => stationNumber(a.station) - stationNumber(b.station))
    .map((team) => String(team.teamNumber));
}

function stationNumber(station: string | undefined) {
  return positiveInteger(station?.match(/(\d+)$/)?.[1]) ?? 0;
}

function allianceScore(alliances: FrcAllianceScore[] | undefined, alliance: "red" | "blue") {
  const value = alliances?.find((item) => item.alliance?.toLowerCase() === alliance);
  if (!value || !validScore(value.totalPoints)) return null;
  const autoPoints = firstValidScore(value.hubScore?.autoPoints, value.autoPoints, value.totalAutoPoints);
  const teleopPoints = firstValidScore(value.hubScore?.teleopPoints, value.teleopPoints, value.totalTeleopPoints);
  return {
    score: value.totalPoints,
    ...(autoPoints == null ? {} : { autoPoints }),
    ...(teleopPoints == null ? {} : { teleopPoints }),
  };
}

function firstValidScore(...values: unknown[]) {
  return values.find(validScore) as number | undefined;
}

function validScore(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function positiveInteger(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}
