import {
  summarizeTeamMatches,
  type ScoutingDataset,
  type ScoutingMatch,
  type TeamPitData,
  type TeamData,
  type TeamPhotos,
} from "./scouting";
import { DEFAULT_DATA_RANGE, matchTypeFromTbaCompLevel, type DataRange } from "./data-range";
import type { MatchResult } from "./match-analysis";
import type { TbaMatch } from "./tba.server";
import { extractTbaPeriodScores } from "../season/scoring";
import {
  mergeSeasonNormalRecords,
  parseSeasonNormalRecord,
  parseSeasonPitRecord,
  parseSeasonSuperRecords,
  seasonPitInfo,
  seasonScoreWeights,
  toSeasonScoutingMatch,
  type SeasonNormalRecord,
  type SeasonPitRecord,
  type SeasonSuperRecord,
  type SeasonTeamScore,
} from "../season/scouting";

export type CyberScoutEventRow = {
  id: string;
  tba_event_key: string;
  name: string;
  is_active: boolean;
  updated_at: string | null;
};

export type CyberScoutRecordRow = {
  id: string;
  record_type: "normal_match" | "super_match" | "pit";
  match_type?: string | null;
  match_number: number | null;
  alliance?: string | null;
  position?: string | null;
  team_number: number | null;
  payload: unknown;
  uploaded_by?: string | null;
  device_id?: string | null;
  uploaded_at: string | null;
  client_created_at: string | null;
  created_at: string | null;
};

type ScoredDataset = ScoutingDataset & {
  scoringOfficialMatches: number;
  scoringFallbackMatches: number;
  scoringZeroMatches: number;
};

export function buildCyberScoutDataset({
  event,
  records,
  officialResults = [],
  tbaMatches = [],
  includedMatchTypes = DEFAULT_DATA_RANGE,
}: {
  event: CyberScoutEventRow;
  records: CyberScoutRecordRow[];
  officialResults?: MatchResult[];
  tbaMatches?: TbaMatch[];
  includedMatchTypes?: DataRange[];
}): ScoredDataset {
  const normalByTeamMatch = new Map<string, SeasonNormalRecord>();
  const superByTeamMatch = new Map<string, SeasonSuperRecord>();
  const pitByTeam = new Map<string, SeasonPitRecord>();
  const includedTypes = new Set(includedMatchTypes);

  for (const row of records) {
    if (row.record_type === "normal_match") addNormalRecord(normalByTeamMatch, row, includedTypes);
    if (row.record_type === "super_match") addSuperRecord(superByTeamMatch, row, includedTypes);
    if (row.record_type === "pit") addPitRecord(pitByTeam, row);
  }

  const teamScores = buildTeamScores({ officialResults, tbaMatches, normalByTeamMatch, superByTeamMatch, includedMatchTypes: includedTypes });
  let scoringOfficialMatches = 0;
  let scoringFallbackMatches = 0;
  let scoringZeroMatches = 0;
  const matchesByTeam = new Map<string, ScoutingMatch[]>();
  const keys = new Set([...normalByTeamMatch.keys(), ...superByTeamMatch.keys()]);
  for (const key of keys) {
    const normal = normalByTeamMatch.get(key);
    const superRecord = superByTeamMatch.get(key);
    const team = normal?.team ?? superRecord?.team;
    const match = normal?.match ?? superRecord?.match;
    if (!team || !match) continue;
    const teamScore = teamScores.get(key);
    if (!teamScore) scoringZeroMatches += 1;

    if (teamScore?.source === "frc-events") scoringOfficialMatches += 1;
    if (teamScore?.source === "super-scout") scoringFallbackMatches += 1;
    const scoutingMatch = toSeasonScoutingMatch({
      normal,
      superRecord,
      match,
      teamScore: teamScore ?? { autoPts: 0, telePts: 0, source: "zero" },
    });
    matchesByTeam.set(team, [...(matchesByTeam.get(team) ?? []), scoutingMatch]);
  }

  const teamData: TeamData = {};
  for (const [team, matches] of matchesByTeam.entries()) {
    const summary = summarizeTeamMatches(team, matches);
    if (summary) teamData[team] = summary;
  }

  return {
    id: `cyber-scout-${event.tba_event_key}`,
    title: event.name || event.tba_event_key,
    eventKey: event.tba_event_key,
    sourceFilename: "cyber-scout realtime",
    teamData,
    teamPhotos: buildTeamPhotos(pitByTeam),
    teamPitData: buildTeamPitData(pitByTeam),
    isActive: event.is_active,
    createdAt: null,
    updatedAt: latestTimestamp(records) ?? event.updated_at,
    scoringOfficialMatches,
    scoringFallbackMatches,
    scoringZeroMatches,
  };
}

export function buildSuperScoutMatchResults(records: CyberScoutRecordRow[]): MatchResult[] {
  const latestByAlliance = new Map<string, { result: MatchResult; alliance: "red" | "blue"; score: number; sourceAt: number }>();
  for (const row of records) {
    if (row.record_type !== "super_match") continue;
    const record = parseSeasonSuperRecords(row)[0];
    if (!record) continue;
    const { autoScore, teleopScore, alliance } = record;
    const identity = seasonResultMatchIdentity(record);
    if (autoScore == null || teleopScore == null || !alliance || !identity) continue;
    const key = `${identity.comp_level}:${identity.set_number ?? 0}:${identity.match_number}:${alliance}`;
    const sourceAt = record.sourceAt;
    if ((latestByAlliance.get(key)?.sourceAt ?? -1) > sourceAt) continue;
    latestByAlliance.set(key, {
      result: { source: "super-scout", ...identity, alliances: {} },
      alliance,
      score: autoScore + teleopScore,
      sourceAt,
    });
  }

  const results = new Map<string, MatchResult>();
  for (const { result, alliance, score } of latestByAlliance.values()) {
    const key = `${result.comp_level}:${result.set_number ?? 0}:${result.match_number}`;
    const current = results.get(key) ?? result;
    current.alliances[alliance] = { score };
    const red = current.alliances.red?.score;
    const blue = current.alliances.blue?.score;
    current.winning_alliance = red == null || blue == null ? undefined : red > blue ? "red" : blue > red ? "blue" : "tie";
    results.set(key, current);
  }
  return [...results.values()];
}

export function isSafeCyberScoutPhotoPath(path: string): boolean {
  if (!path || path.length > 300) return false;
  if (path.startsWith("/") || path.includes("..")) return false;
  if (!/^[a-zA-Z0-9/_:.-]+$/.test(path)) return false;
  return /\.(?:jpe?g|png|webp)$/i.test(path);
}

function addNormalRecord(map: Map<string, SeasonNormalRecord>, row: CyberScoutRecordRow, includedMatchTypes: Set<DataRange>) {
  const record = parseSeasonNormalRecord(row);
  if (!record || !includedMatchTypes.has(record.matchType)) return;
  const key = teamMatchKey(record.team, record.matchType, record.match, record.tbaMatchKey);
  const current = map.get(key);
  map.set(key, current ? mergeSeasonNormalRecords(current, record) : record);
}

function addSuperRecord(map: Map<string, SeasonSuperRecord>, row: CyberScoutRecordRow, includedMatchTypes: Set<DataRange>) {
  for (const record of parseSeasonSuperRecords(row)) {
    if (!includedMatchTypes.has(record.matchType)) continue;
    upsertLatest(map, teamMatchKey(record.team, record.matchType, record.match, record.tbaMatchKey), record);
  }
}

function addPitRecord(map: Map<string, SeasonPitRecord>, row: CyberScoutRecordRow) {
  const parsed = parseSeasonPitRecord(row);
  if (!parsed) return;
  const record = { ...parsed, photoPaths: parsed.photoPaths.filter(isSafeCyberScoutPhotoPath) };
  if (!record.photoPaths.length && !record.attributes.length && !record.autoRoutes.length) return;
  upsertLatest(map, record.team, record);
}

function buildTeamScores({
  officialResults,
  tbaMatches,
  normalByTeamMatch,
  superByTeamMatch,
  includedMatchTypes,
}: {
  officialResults: MatchResult[];
  tbaMatches: TbaMatch[];
  normalByTeamMatch: Map<string, SeasonNormalRecord>;
  superByTeamMatch: Map<string, SeasonSuperRecord>;
  includedMatchTypes: Set<DataRange>;
}): Map<string, SeasonTeamScore> {
  const scores = buildSuperScoutTeamScores(normalByTeamMatch, superByTeamMatch);
  for (const match of tbaMatches) {
    const matchType = matchTypeFromTbaCompLevel(match.comp_level);
    if (!matchType || !includedMatchTypes.has(matchType)) continue;
    const matchNumber = positiveNumber(match.match_number);
    if (!matchNumber) continue;
    const tbaKey = stringValue(match.key);
    if (matchType === "playoff" && !tbaKey) continue;

    for (const alliance of ["red", "blue"] as const) {
      const teams = teamNumbers(match.alliances?.[alliance]?.team_keys);
      const breakdown = objectPayload(match.score_breakdown?.[alliance]);
      const { autoPoints: autoTotal, teleopPoints: teleTotal } = extractTbaPeriodScores(breakdown);
      if (!teams.length || autoTotal == null || teleTotal == null) continue;

      const rows = teams.map((team) => {
        const key = teamMatchKey(team, matchType, matchNumber, matchType === "playoff" ? tbaKey : null);
        const normal = normalByTeamMatch.get(key);
        const superRecord = superByTeamMatch.get(key);
        const weights = seasonScoreWeights(normal, superRecord);
        return {
          key,
          autoWeight: weights.auto,
          teleWeight: weights.tele,
        };
      });
      const autoAllocations = allocateByWeight(autoTotal, rows.map((row) => row.autoWeight));
      const teleAllocations = allocateByWeight(teleTotal, rows.map((row) => row.teleWeight));

      rows.forEach((row, index) => {
        const autoPts = autoAllocations[index];
        const telePts = teleAllocations[index];
        if (autoPts != null && telePts != null) {
          scores.set(row.key, { autoPts, telePts, source: "tba" });
        }
      });
    }
  }

  const recordKeys = new Set([...normalByTeamMatch.keys(), ...superByTeamMatch.keys()]);
  for (const result of officialResults) {
    const matchType = matchTypeFromTbaCompLevel(result.comp_level);
    if (!matchType || !includedMatchTypes.has(matchType)) continue;
    const matchNumber = positiveNumber(matchType === "playoff" ? result.set_number ?? result.match_number : result.match_number);
    if (!matchNumber) continue;

    for (const alliance of ["red", "blue"] as const) {
      const autoTotal = finiteOrNull(result.alliances[alliance]?.autoPoints);
      const teleTotal = finiteOrNull(result.alliances[alliance]?.teleopPoints);
      if (autoTotal == null || teleTotal == null) continue;
      const rows = [...recordKeys].flatMap((key) => {
        const normal = normalByTeamMatch.get(key);
        const superRecord = superByTeamMatch.get(key);
        const record = normal ?? superRecord;
        const recordAlliance = allianceValue(superRecord?.alliance ?? normal?.alliance);
        if (!record || record.matchType !== matchType || record.match !== matchNumber || recordAlliance !== alliance) return [];
        const weights = seasonScoreWeights(normal, superRecord);
        return [{
          key,
          active: !normal?.noShow,
          autoWeight: weights.auto,
          teleWeight: weights.tele,
        }];
      });
      const activeWeights = rows.map((row) => row.active ? 1 : 0);
      const autoWeights = rows.map((row) => row.autoWeight);
      const teleWeights = rows.map((row) => row.teleWeight);
      const autoAllocations = allocateByWeight(autoTotal, autoWeights.some((weight) => weight > 0) ? autoWeights : activeWeights);
      const teleAllocations = allocateByWeight(teleTotal, teleWeights.some((weight) => weight > 0) ? teleWeights : activeWeights);
      rows.forEach((row, index) => {
        const autoPts = autoAllocations[index];
        const telePts = teleAllocations[index];
        if (autoPts != null && telePts != null) scores.set(row.key, { autoPts, telePts, source: "frc-events" });
      });
    }
  }
  return scores;
}

function buildSuperScoutTeamScores(
  normalByTeamMatch: Map<string, SeasonNormalRecord>,
  superByTeamMatch: Map<string, SeasonSuperRecord>,
): Map<string, SeasonTeamScore> {
  const scores = new Map<string, SeasonTeamScore>();
  const processed = new Set<string>();
  for (const superRecord of superByTeamMatch.values()) {
    if (superRecord.autoScore == null || superRecord.teleopScore == null || !superRecord.teams.length) continue;
    const groupKey = `${superRecord.matchType}:${superRecord.tbaMatchKey || superRecord.match}:${superRecord.teams.join(",")}:${superRecord.sourceAt}`;
    if (processed.has(groupKey)) continue;
    processed.add(groupKey);

    const rows = superRecord.teams.map((team) => {
      const key = teamMatchKey(team, superRecord.matchType, superRecord.match, superRecord.tbaMatchKey);
      const normal = normalByTeamMatch.get(key);
      const teamSuperRecord = superByTeamMatch.get(key);
      const weights = seasonScoreWeights(normal, teamSuperRecord);
      return {
        key,
        active: !normal?.noShow,
        autoWeight: weights.auto,
        teleWeight: weights.tele,
      };
    });
    const activeWeights = rows.map((row) => row.active ? 1 : 0);
    const autoWeights = rows.map((row) => row.autoWeight);
    const teleWeights = rows.map((row) => row.teleWeight);
    const autoAllocations = allocateByWeight(superRecord.autoScore, autoWeights.some((weight) => weight > 0) ? autoWeights : activeWeights);
    const teleAllocations = allocateByWeight(superRecord.teleopScore, teleWeights.some((weight) => weight > 0) ? teleWeights : activeWeights);

    rows.forEach((row, index) => {
      const autoPts = autoAllocations[index];
      const telePts = teleAllocations[index];
      if (autoPts != null && telePts != null) {
        scores.set(row.key, { autoPts, telePts, source: "super-scout" });
      }
    });
  }
  return scores;
}

function allocateByWeight(total: number | null, weights: number[]) {
  if (total == null) return weights.map(() => null);
  if (total === 0) return weights.map(() => 0);
  const normalized = weights.map((weight) => Math.max(0, weight));
  const sum = normalized.reduce((value, weight) => value + weight, 0);
  if (sum <= 0) return weights.map(() => null);
  const lastWeightedIndex = normalized.reduce((last, weight, index) => weight > 0 ? index : last, -1);
  let remaining = round1(total);
  return normalized.map((weight, index) => {
    if (weight <= 0) return 0;
    if (index === lastWeightedIndex) return remaining;
    const allocated = round1((total * weight) / sum);
    remaining = round1(remaining - allocated);
    return allocated;
  });
}

function finiteOrNull(value: unknown) {
  const parsed = numberValue(value, Number.NaN);
  return Number.isFinite(parsed) ? parsed : null;
}

function teamNumbers(values: Array<string | number> | undefined) {
  return (values ?? []).map((team) => String(team).replace(/^frc/, ""));
}

function buildTeamPhotos(pitByTeam: Map<string, SeasonPitRecord>): TeamPhotos {
  const photos: TeamPhotos = {};
  for (const [team, record] of pitByTeam.entries()) {
    photos[team] = record.photoPaths.map((path) => `/api/cyber-scout/photos?path=${encodeURIComponent(path)}`);
  }
  return photos;
}

function buildTeamPitData(pitByTeam: Map<string, SeasonPitRecord>): TeamPitData {
  const pitData: TeamPitData = {};
  for (const [team, record] of pitByTeam.entries()) {
    pitData[team] = seasonPitInfo(record);
  }
  return pitData;
}

function latestTimestamp(rows: CyberScoutRecordRow[]) {
  return rows
    .map((row) => row.uploaded_at ?? row.client_created_at ?? row.created_at)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1) ?? null;
}

function upsertLatest<T extends { sourceAt: number }>(map: Map<string, T>, key: string, record: T) {
  const current = map.get(key);
  if (!current || record.sourceAt >= current.sourceAt) map.set(key, record);
}

function teamMatchKey(team: string, matchType: DataRange, match: number, tbaMatchKey: string | null) {
  return `${team}:${matchType}:${tbaMatchKey || match}`;
}

function seasonResultMatchIdentity(record: SeasonSuperRecord) {
  if (record.matchType === "practice") return { comp_level: "practice", match_number: record.match };
  if (record.matchType === "qualification") return { comp_level: "qm", match_number: record.match };
  return { comp_level: "sf", set_number: record.match, match_number: 1 };
}

function allianceValue(value: unknown): "red" | "blue" | null {
  const alliance = stringValue(value).toLowerCase();
  if (alliance === "red" || alliance === "r") return "red";
  if (alliance === "blue" || alliance === "b") return "blue";
  return null;
}

function objectPayload(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function positiveNumber(value: unknown): number | null {
  const parsed = Math.trunc(numberValue(value, Number.NaN));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function numberValue(value: unknown, fallback = 0): number {
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
