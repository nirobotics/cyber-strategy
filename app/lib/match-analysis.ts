import { reliability, type TeamData, type TeamSummary } from "./scouting";
import { matchTypeFromTbaCompLevel, type DataRange } from "./data-range";

export type StatboticsMatch = {
  key?: string;
  comp_level?: string;
  match_number?: number;
  set_number?: number;
  winning_alliance?: string;
  alliances?: {
    red?: { team_keys?: Array<string | number>; score?: number };
    blue?: { team_keys?: Array<string | number>; score?: number };
  };
  red_alliance?: Array<string | number>;
  blue_alliance?: Array<string | number>;
  red_score?: number;
  blue_score?: number;
  pred?: {
    red_score?: number;
    blue_score?: number;
    red_win_prob?: number;
    win_prob?: number;
  };
  epa?: {
    red?: { total?: number };
    blue?: { total?: number };
  };
};

export type TbaMatch = {
  key?: string;
  comp_level?: string;
  set_number?: number;
  match_number?: number;
  winning_alliance?: string;
  alliances?: {
    red?: { team_keys?: Array<string | number>; score?: number };
    blue?: { team_keys?: Array<string | number>; score?: number };
  };
};

export type MatchResult = {
  source: "frc-events" | "tba" | "super-scout";
  comp_level: string;
  match_number: number;
  set_number?: number;
  winning_alliance?: "red" | "blue" | "tie";
  alliances: {
    red?: { score?: number; autoPoints?: number; teleopPoints?: number };
    blue?: { score?: number; autoPoints?: number; teleopPoints?: number };
  };
};

export type CombinedMatch = StatboticsMatch & {
  result?: MatchResult;
  tba?: TbaMatch;
  videos?: Array<{ title: string; url: string }>;
};

export type TeamEvent = {
  team?: string | number;
  team_number?: string | number;
  team_key?: string;
  epa?: number | {
    total?: number;
    auto?: number;
    teleop?: number;
    endgame?: number;
    total_points?: { mean?: number };
    auto_points?: { mean?: number };
    teleop_points?: { mean?: number };
    endgame_points?: { mean?: number };
  };
  record?: { wins?: number; losses?: number; ties?: number };
  wins?: number;
  losses?: number;
  ties?: number;
};

export type MatchScoreSource = MatchResult["source"] | "strategy" | "statbotics" | "none";

export function hasLargeScoutingDifference(actual: number | null, scouting: number | null) {
  return actual != null && scouting != null && Math.abs(actual - scouting) > actual * 0.4;
}

export function needsScoutingReview(allianceDifferenceIsLarge: boolean, rating: number | null, scouting: number | null) {
  return allianceDifferenceIsLarge && rating != null && scouting != null
    && Math.max(rating, scouting) > Math.min(rating, scouting) * 2;
}

export type MatchScores = {
  actualRed: number | null;
  actualBlue: number | null;
  predictedRed: number | null;
  predictedBlue: number | null;
  scoutingRed: number | null;
  scoutingBlue: number | null;
  displayRed: number | null;
  displayBlue: number | null;
  source: MatchScoreSource;
  label: string;
  winner: "red" | "blue" | "tie" | null;
};

export type WinProbability = {
  red: number;
  blue: number;
  source: "strategy" | "statbotics";
  scoreSd: number | null;
};

export type TeamMetric = {
  team: string;
  source: "strategy" | "epa" | "none";
  rating: number | null;
  ratingLabel: "综合评分" | "EPA" | "暂无";
  auto: number | null;
  tele: number | null;
  accuracy: number | null;
  reliability: number | null;
  trend: TeamSummary["trend"] | null;
  min: number | null;
  max: number | null;
  scoutMatch: TeamSummary["matches"][number] | null;
};

export function toCyberScoutMatches(matches: unknown[], includedMatchTypes?: DataRange[]): CombinedMatch[] {
  const includedTypes = includedMatchTypes ? new Set(includedMatchTypes) : null;
  return sortedMatches(matches.flatMap((value) => {
    const normalized = normalizeCyberScoutMatch(value);
    return normalized && (!includedTypes || includedTypes.has(normalized.dataRange)) ? [normalized.match] : [];
  }));
}

export function enrichScheduledMatches(
  schedule: CombinedMatch[],
  statboticsMatches: StatboticsMatch[],
  results: MatchResult[] = [],
): CombinedMatch[] {
  const statboticsByKey = indexMatches(statboticsMatches);
  const resultsByKey = indexMatches(results);
  return schedule.map((match) => ({
    ...findIndexedMatch(statboticsByKey, match),
    ...match,
    result: findIndexedMatch(resultsByKey, match) ?? match.result,
  }));
}

export function mergeMatchResults(primary: MatchResult[], fallback: MatchResult[]) {
  const results = new Map(fallback.map((result) => [matchScheduleIdentity(result), result]));
  for (const result of primary) results.set(matchScheduleIdentity(result), result);
  return [...results.values()];
}

export function toTbaMatchResults(matches: CombinedMatch[]): MatchResult[] {
  return matches.flatMap((match) => {
    const red = nonNegativeOrNull(match.alliances?.red?.score);
    const blue = nonNegativeOrNull(match.alliances?.blue?.score);
    if (red == null || blue == null || !match.comp_level || !match.match_number) return [];
    return [{
      source: "tba" as const,
      comp_level: match.comp_level,
      match_number: match.match_number,
      ...(match.set_number == null ? {} : { set_number: match.set_number }),
      winning_alliance: red > blue ? "red" as const : blue > red ? "blue" as const : "tie" as const,
      alliances: { red: { score: red }, blue: { score: blue } },
    }];
  });
}

export function sortedMatches(matches: CombinedMatch[]): CombinedMatch[] {
  const levelOrder: Record<string, number> = { practice: -1, qm: 0, ef: 1, qf: 2, sf: 3, f: 4 };
  return [...matches].sort((a, b) => {
    const levelDiff = (levelOrder[a.comp_level ?? "qm"] ?? 0) - (levelOrder[b.comp_level ?? "qm"] ?? 0);
    if (levelDiff) return levelDiff;
    const [aPrimary, aSecondary] = matchSortNumbers(a);
    const [bPrimary, bSecondary] = matchSortNumbers(b);
    return aPrimary - bPrimary || aSecondary - bSecondary;
  });
}

function matchSortNumbers(match: Pick<CombinedMatch, "comp_level" | "match_number" | "set_number">): [number, number] {
  if ((match.comp_level ?? "qm") === "qm") return [match.match_number ?? 0, match.set_number ?? 0];
  return [match.set_number ?? match.match_number ?? 0, match.match_number ?? 0];
}

export function matchTeams(match: CombinedMatch, color: "red" | "blue"): string[] {
  const values = color === "red"
    ? match.alliances?.red?.team_keys ?? match.tba?.alliances?.red?.team_keys ?? match.red_alliance
    : match.alliances?.blue?.team_keys ?? match.tba?.alliances?.blue?.team_keys ?? match.blue_alliance;
  return teamNumbers(values);
}

export function matchHasTeam(match: CombinedMatch, team: string) {
  const target = team.trim().replace(/^frc/i, "");
  return Boolean(target) && [...matchTeams(match, "red"), ...matchTeams(match, "blue")].includes(target);
}

export function teamNumbers(values: Array<string | number> | undefined) {
  return (values ?? []).map((team) => String(team).replace(/^frc/, ""));
}

export function matchIdentity(match: Pick<StatboticsMatch, "key" | "comp_level" | "set_number" | "match_number">) {
  return match.key ?? `${match.comp_level ?? "qm"}-${match.set_number ?? 0}-${match.match_number ?? 0}`;
}

export function matchLabel(match: Pick<StatboticsMatch, "key" | "comp_level" | "set_number" | "match_number">) {
  const level = match.comp_level ?? "qm";
  const number = match.match_number ?? match.set_number ?? match.key?.split("_").pop() ?? "?";
  if (level === "practice") return `P${number}`;
  if (level === "qm") return `Q${number}`;
  if (level === "qf") return `QF${match.set_number ?? ""}-${number}`;
  if (level === "sf") return `SF${match.set_number ?? ""}-${number}`;
  if (level === "f") return `F${number}`;
  return `${level.toUpperCase()}-${number}`;
}

export function levelLabel(level: string) {
  return { practice: "练习赛", qm: "资格赛", ef: "淘汰赛", qf: "四分之一决赛", sf: "半决赛", f: "决赛" }[level] ?? level.toUpperCase();
}

export function resolveMatchScores({
  match,
  redTeams,
  blueTeams,
  teamData,
  scoutingTeamData = teamData,
}: {
  match: CombinedMatch;
  redTeams: string[];
  blueTeams: string[];
  teamData: TeamData;
  scoutingTeamData?: TeamData;
}): MatchScores {
  const actual = matchActualScore(match);
  const strategy = strategyPrediction(redTeams, blueTeams, teamData);
  const statbotics = statboticsPrediction(match);
  const predicted = strategy ?? statbotics;
  const scoutingRed = scoutingAllianceScore(match, redTeams, scoutingTeamData);
  const scoutingBlue = scoutingAllianceScore(match, blueTeams, scoutingTeamData);

  if (actual) {
    return {
      actualRed: actual.red,
      actualBlue: actual.blue,
      predictedRed: predicted?.red ?? null,
      predictedBlue: predicted?.blue ?? null,
      scoutingRed,
      scoutingBlue,
      displayRed: actual.red ?? predicted?.red ?? null,
      displayBlue: actual.blue ?? predicted?.blue ?? null,
      source: actual.source,
      label: actual.source === "frc-events"
        ? "FRC Events 结果"
        : actual.source === "tba"
          ? "TBA 结果"
          : actual.red != null && actual.blue != null ? "Super Scout 结果" : "Super Scout 部分结果",
      winner: actual.winner,
    };
  }

  if (strategy) {
    return {
      actualRed: null,
      actualBlue: null,
      predictedRed: strategy.red,
      predictedBlue: strategy.blue,
      scoutingRed,
      scoutingBlue,
      displayRed: strategy.red,
      displayBlue: strategy.blue,
      source: "strategy",
      label: "综合分预测",
      winner: null,
    };
  }

  if (statbotics) {
    return {
      actualRed: null,
      actualBlue: null,
      predictedRed: statbotics.red,
      predictedBlue: statbotics.blue,
      scoutingRed,
      scoutingBlue,
      displayRed: statbotics.red,
      displayBlue: statbotics.blue,
      source: "statbotics",
      label: "Statbotics 预测",
      winner: null,
    };
  }

  return {
    actualRed: null,
    actualBlue: null,
    predictedRed: null,
    predictedBlue: null,
    scoutingRed,
    scoutingBlue,
    displayRed: null,
    displayBlue: null,
    source: "none",
    label: "未开始",
    winner: null,
  };
}

export function scoutingAllianceScore(match: CombinedMatch, teams: string[], teamData: TeamData): number | null {
  const matchNumber = match.match_number;
  const matchType = matchTypeFromTbaCompLevel(match.comp_level);
  if (!matchNumber || !matchType || teams.length !== 3) return null;
  const scores = teams.map((team) => teamData[team]?.matches.find((entry) =>
      entry.match === matchNumber && (entry.matchType ?? "qualification") === matchType
    )?.scoutingPts);
  return scores.every((score): score is number => score != null && Number.isFinite(score))
    ? round1(scores.reduce((sum, score) => sum + score, 0))
    : null;
}

export function resolveWinProbability({
  match,
  redTeams,
  blueTeams,
  teamData,
  matches,
}: {
  match: CombinedMatch;
  redTeams: string[];
  blueTeams: string[];
  teamData: TeamData;
  matches: CombinedMatch[];
}): WinProbability | null {
  const redComposite = allianceCompositeScore(redTeams, teamData);
  const blueComposite = allianceCompositeScore(blueTeams, teamData);
  if (redComposite != null && blueComposite != null) {
    const scoreSd = strategyScoreSd(matches, teamData);
    const red = strategyWinProbability(redComposite, blueComposite, scoreSd);
    return { red, blue: 1 - red, source: "strategy", scoreSd };
  }

  const statbotics = statboticsWinProbability(match);
  return statbotics == null
    ? null
    : { red: statbotics, blue: 1 - statbotics, source: "statbotics", scoreSd: null };
}

export function strategyWinProbability(redComposite: number, blueComposite: number, scoreSd: number): number {
  const safeSd = Math.max(1, scoreSd);
  const normDiff = (redComposite - blueComposite) / safeSd;
  return clamp(1 / (1 + 10 ** ((-5 / 8) * normDiff)), 0, 1);
}

export function strategyScoreSd(matches: CombinedMatch[], teamData: TeamData): number {
  const allianceScores: number[] = [];
  for (const match of matches) {
    const red = allianceCompositeScore(matchTeams(match, "red"), teamData);
    const blue = allianceCompositeScore(matchTeams(match, "blue"), teamData);
    if (red != null) allianceScores.push(red);
    if (blue != null) allianceScores.push(blue);
  }

  const eventSd = standardDeviation(allianceScores);
  if (eventSd != null && eventSd > 0) return Math.max(1, eventSd);

  const teamScores = Object.values(teamData)
    .map((team) => team.avgTotal)
    .filter((value) => Number.isFinite(value));
  const teamSd = standardDeviation(teamScores);
  return Math.max(1, (teamSd ?? 1) * Math.sqrt(3));
}

export function allianceCompositeScore(teamNumbers: string[], teamData: TeamData): number | null {
  if (teamNumbers.length !== 3) return null;
  const values = teamNumbers.map((team) => teamData[team]?.avgTotal ?? 0);
  if (values.some((value) => !Number.isFinite(value))) return null;
  return round1(values.reduce((sum, value) => sum + value, 0));
}

export function buildTeamEventMap(teamEvents: TeamEvent[]): Map<string, TeamEvent> {
  const entries: Array<[string, TeamEvent]> = [];
  for (const team of teamEvents) {
    const number = teamNumber(team);
    if (number) entries.push([number, team]);
  }
  return new Map(entries);
}

export function resolveTeamMetric({
  team,
  teamData,
  teamEvents,
  matchNumber,
  matchType,
}: {
  team: string;
  teamData: TeamData;
  teamEvents: Map<string, TeamEvent>;
  matchNumber: number | null;
  matchType?: DataRange | null;
}): TeamMetric {
  const summary = teamData[team];
  const scoutMatch = matchNumber == null ? null : summary?.matches.find((match) =>
    match.match === matchNumber && (!matchType || (match.matchType ?? "qualification") === matchType)
  ) ?? null;
  if (summary) {
    return {
      team,
      source: "strategy",
      rating: summary.avgTotal,
      ratingLabel: "综合评分",
      auto: summary.avgAuto,
      tele: summary.avgTele,
      accuracy: summary.avgAccuracy > 0 ? summary.avgAccuracy : null,
      reliability: reliability(summary),
      trend: summary.trend,
      min: summary.minPts,
      max: summary.maxPts,
      scoutMatch,
    };
  }

  const event = teamEvents.get(team);
  const total = event ? epaTotal(event) : null;
  return {
    team,
    source: total == null ? "none" : "epa",
    rating: total,
    ratingLabel: total == null ? "暂无" : "EPA",
    auto: event ? epaAuto(event) : null,
    tele: event ? epaTele(event) : null,
    accuracy: null,
    reliability: null,
    trend: null,
    min: null,
    max: null,
    scoutMatch: null,
  };
}

export function epaTotal(team: TeamEvent): number | null {
  const value = typeof team.epa === "number" ? team.epa : team.epa?.total_points?.mean ?? team.epa?.total ?? null;
  return finiteOrNull(value);
}

export function epaAuto(team: TeamEvent): number | null {
  const value = typeof team.epa === "number" ? null : team.epa?.auto_points?.mean ?? team.epa?.auto ?? null;
  return finiteOrNull(value);
}

export function epaTele(team: TeamEvent): number | null {
  const value = typeof team.epa === "number" ? null : team.epa?.teleop_points?.mean ?? team.epa?.teleop ?? null;
  return finiteOrNull(value);
}

export function epaEndgame(team: TeamEvent): number | null {
  const value = typeof team.epa === "number" ? null : team.epa?.endgame_points?.mean ?? team.epa?.endgame ?? null;
  return finiteOrNull(value);
}

export function teamNumber(team: TeamEvent) {
  return String(team.team ?? team.team_number ?? team.team_key ?? "").replace(/^frc/, "");
}

export function record(team: TeamEvent) {
  const wins = team.record?.wins ?? team.wins ?? 0;
  const losses = team.record?.losses ?? team.losses ?? 0;
  const ties = team.record?.ties ?? team.ties ?? 0;
  return `${wins}-${losses}${ties ? `-${ties}` : ""}`;
}

export function fmt(value: number | null | undefined) {
  return value == null ? "-" : value.toFixed(1);
}

function normalizeCyberScoutMatch(value: unknown): { match: CombinedMatch; dataRange: DataRange } | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const matchType = String(record.matchType ?? "");
  const matchNumber = Number(record.matchNumber);
  const teams = record.teams && typeof record.teams === "object" ? record.teams as Record<string, unknown> : {};
  const redTeams = [teams.R1, teams.R2, teams.R3].map(cyberScoutTeamNumber);
  const blueTeams = [teams.B1, teams.B2, teams.B3].map(cyberScoutTeamNumber);
  if (!["practice", "qm", "sf", "f"].includes(matchType) || !Number.isInteger(matchNumber) || matchNumber <= 0) return null;
  if ([...redTeams, ...blueTeams].some((team) => !team)) return null;

  return {
    match: {
      key: typeof record.id === "string" && record.id ? record.id : `${matchType}-${matchNumber}`,
      comp_level: matchType,
      set_number: matchType === "sf" || matchType === "f" ? matchNumber : undefined,
      match_number: matchType === "sf" || matchType === "f" ? 1 : matchNumber,
      alliances: {
        red: { team_keys: redTeams },
        blue: { team_keys: blueTeams },
      },
    },
    dataRange: matchType === "practice" ? "practice" : matchType === "qm" ? "qualification" : "playoff",
  };
}

function cyberScoutTeamNumber(value: unknown) {
  const number = String(value ?? "").replace(/^frc/, "");
  return /^\d+$/.test(number) && Number(number) > 0 ? number : "";
}

function indexMatches<T extends StatboticsMatch>(matches: T[]) {
  const index = new Map<string, T>();
  for (const match of matches) {
    index.set(matchIdentity(match), match);
    index.set(matchScheduleIdentity(match), match);
  }
  return index;
}

function findIndexedMatch<T extends StatboticsMatch>(index: Map<string, T>, match: StatboticsMatch) {
  return index.get(matchIdentity(match)) ?? index.get(matchScheduleIdentity(match));
}

export function matchScheduleIdentity(match: Pick<StatboticsMatch, "key" | "comp_level" | "set_number" | "match_number">) {
  const suffix = match.key?.split("_").at(-1) ?? "";
  const qualification = /^qm(\d+)$/.exec(suffix);
  const playoff = /^(ef|qf|sf|f)(\d+)m(\d+)$/.exec(suffix);
  const level = match.comp_level ?? qualification?.[0].replace(/\d+$/, "") ?? playoff?.[1] ?? "qm";
  const setNumber = match.set_number ?? Number(playoff?.[2] ?? 0);
  const matchNumber = match.match_number ?? Number(qualification?.[1] ?? playoff?.[3] ?? 0);
  return `${level}-${setNumber}-${matchNumber}`;
}

function matchActualScore(match: CombinedMatch): {
  red: number | null;
  blue: number | null;
  winner: "red" | "blue" | "tie" | null;
  source: MatchResult["source"];
} | null {
  const source = match.result?.source;
  if (!source) return null;
  const red = nonNegativeOrNull(match.result?.alliances.red?.score);
  const blue = nonNegativeOrNull(match.result?.alliances.blue?.score);
  if (red == null && blue == null) return null;
  const winner = red == null || blue == null
    ? null
    : match.result?.winning_alliance ?? (red > blue ? "red" : blue > red ? "blue" : "tie");
  return { red, blue, winner, source };
}

function strategyPrediction(redTeams: string[], blueTeams: string[], teamData: TeamData) {
  const red = allianceCompositeScore(redTeams, teamData);
  const blue = allianceCompositeScore(blueTeams, teamData);
  return red == null || blue == null ? null : { red, blue };
}

function statboticsPrediction(match: CombinedMatch) {
  const red = finiteOrNull(match.pred?.red_score ?? match.epa?.red?.total ?? match.red_score);
  const blue = finiteOrNull(match.pred?.blue_score ?? match.epa?.blue?.total ?? match.blue_score);
  return red == null || blue == null ? null : { red, blue };
}

function statboticsWinProbability(match: CombinedMatch): number | null {
  const value = finiteOrNull(match.pred?.red_win_prob ?? match.pred?.win_prob);
  return value == null ? null : clamp(value, 0, 1);
}

function standardDeviation(values: number[]): number | null {
  const finite = values.filter((value) => Number.isFinite(value));
  if (finite.length < 2) return null;
  const mean = finite.reduce((sum, value) => sum + value, 0) / finite.length;
  const variance = finite.reduce((sum, value) => sum + (value - mean) ** 2, 0) / finite.length;
  return Math.sqrt(variance);
}

function finiteOrNull(value: number | null | undefined): number | null {
  return value != null && Number.isFinite(value) ? value : null;
}

function nonNegativeOrNull(value: number | null | undefined): number | null {
  const parsed = finiteOrNull(value);
  return parsed != null && parsed >= 0 ? parsed : null;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}
