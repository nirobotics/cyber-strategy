import type { MatchResult } from "./match-analysis";

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
  description?: string;
  matchNumber?: number;
};

type FrcScheduleResponse = {
  Schedule?: FrcSchedule[];
  schedule?: FrcSchedule[];
};

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

function frcMatchIdentity(score: FrcMatchScore, requestedLevel: string, playoffDescriptions: Map<number, string>) {
  const matchNumber = positiveInteger(score.matchNumber);
  if (!matchNumber) return null;
  const level = (score.matchLevel ?? score.tournamentLevel ?? requestedLevel).toLowerCase();
  if (level === "practice") return { comp_level: "practice", match_number: matchNumber };
  if (level === "qualification") return { comp_level: "qm", match_number: matchNumber };
  if (level !== "playoff") return null;

  const description = score.description?.trim() || playoffDescriptions.get(matchNumber) || "";
  const final = /^final\s+(\d+)/i.exec(description);
  if (final) return { comp_level: "f", set_number: Number(final[1]), match_number: 1 };
  const playoff = /^(?:match|semifinal)\s+(\d+)/i.exec(description);
  const setNumber = positiveInteger(playoff?.[1]) ?? matchNumber;
  return { comp_level: "sf", set_number: setNumber, match_number: 1 };
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
