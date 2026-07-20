import {
  summarizeTeamMatches,
  type MatchAutoPathPoint,
  type ScoutingDataset,
  type ScoutingMatch,
  type TeamPitData,
  type TeamData,
  type TeamPhotos,
} from "./scouting";
import { DEFAULT_DATA_RANGE, matchTypeFromTbaCompLevel, matchTypeFromValue, type DataRange } from "./data-range";
import type { MatchResult } from "./match-analysis";
import type { TbaMatch } from "./tba.server";

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

type NormalRecord = {
  team: string;
  match: number;
  matchType: DataRange;
  tbaMatchKey: string | null;
  scoutName: string;
  startPos: string;
  alliance: string;
  fieldSideFlipped: boolean;
  autoPath: MatchAutoPathPoint[];
  noShow: boolean;
  climbPosition: string;
  climbFailed: boolean;
  incapMs: number;
  shootingMs: number;
  transferShootingMs: number;
  sourceAt: number;
};

type SuperRecord = {
  team: string;
  teams: string[];
  match: number;
  matchType: DataRange;
  tbaMatchKey: string | null;
  autoScore: number | null;
  teleopScore: number | null;
  scoutName: string;
  auto: number;
  drive: number;
  defense: number;
  bps: number;
  accuracy: number | null;
  comment: string;
  sourceAt: number;
};

type PitRecord = {
  team: string;
  photoPaths: string[];
  canCrossTrench: boolean;
  isSwerve: boolean;
  drivetrain: string;
  swerveModule: string;
  autoRoutes: Array<{ id: string; points: Array<{ x: number; y: number }> }>;
  sourceAt: number;
};

type TeamScore = {
  autoPts: number;
  teleGamePiecePts: number;
  source: "tba" | "super-scout";
};

type ScoredDataset = ScoutingDataset & {
  scoringFallbackMatches: number;
  scoringIgnoredMatches: number;
};

export function buildCyberScoutDataset({
  event,
  records,
  tbaMatches = [],
  includedMatchTypes = DEFAULT_DATA_RANGE,
}: {
  event: CyberScoutEventRow;
  records: CyberScoutRecordRow[];
  tbaMatches?: TbaMatch[];
  includedMatchTypes?: DataRange[];
}): ScoredDataset {
  const normalByTeamMatch = new Map<string, NormalRecord>();
  const superByTeamMatch = new Map<string, SuperRecord>();
  const pitByTeam = new Map<string, PitRecord>();
  const includedTypes = new Set(includedMatchTypes);

  for (const row of records) {
    if (row.record_type === "normal_match") addNormalRecord(normalByTeamMatch, row, includedTypes);
    if (row.record_type === "super_match") addSuperRecord(superByTeamMatch, row, includedTypes);
    if (row.record_type === "pit") addPitRecord(pitByTeam, row);
  }

  const teamScores = buildTeamScores({ tbaMatches, normalByTeamMatch, superByTeamMatch, includedMatchTypes: includedTypes });
  let scoringFallbackMatches = 0;
  let scoringIgnoredMatches = 0;
  const matchesByTeam = new Map<string, ScoutingMatch[]>();
  const keys = new Set([...normalByTeamMatch.keys(), ...superByTeamMatch.keys()]);
  for (const key of keys) {
    const normal = normalByTeamMatch.get(key);
    const superRecord = superByTeamMatch.get(key);
    const team = normal?.team ?? superRecord?.team;
    const match = normal?.match ?? superRecord?.match;
    if (!team || !match) continue;
    const teamScore = teamScores.get(key);
    if (!teamScore) {
      scoringIgnoredMatches += 1;
      continue;
    }

    if (teamScore.source === "super-scout") scoringFallbackMatches += 1;
    const scoutingMatch = toScoutingMatch({ normal, superRecord, match, teamScore });
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
    scoringFallbackMatches,
    scoringIgnoredMatches,
  };
}

export function buildSuperScoutMatchResults(records: CyberScoutRecordRow[]): MatchResult[] {
  const latestByAlliance = new Map<string, { result: MatchResult; alliance: "red" | "blue"; score: number; sourceAt: number }>();
  for (const row of records) {
    if (row.record_type !== "super_match") continue;
    const payload = objectPayload(row.payload);
    const autoScore = finiteOrNull(payload.autoScore ?? payload.asc);
    const teleopScore = finiteOrNull(payload.teleopScore ?? payload.tsc);
    const alliance = allianceValue(row.alliance ?? payload.alliance ?? payload.al);
    const identity = resultMatchIdentity(row, payload);
    if (autoScore == null || teleopScore == null || !alliance || !identity) continue;
    const key = `${identity.comp_level}:${identity.set_number ?? 0}:${identity.match_number}:${alliance}`;
    const sourceAt = rowTimestamp(row);
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

function addNormalRecord(map: Map<string, NormalRecord>, row: CyberScoutRecordRow, includedMatchTypes: Set<DataRange>) {
  const payload = objectPayload(row.payload);
  const team = positiveId(row.team_number) ?? positiveId(payload.teamNumber);
  const match = positiveNumber(row.match_number) ?? positiveNumber(payload.matchNumber);
  if (!team || !match) return;
  const matchType = recordMatchType(row, payload);
  if (!includedMatchTypes.has(matchType)) return;
  const shotTimes = manualShotTimes(payload);
  const tbaMatchKey = recordTbaMatchKey(payload);

  const record: NormalRecord = {
    team,
    match,
    matchType,
    tbaMatchKey,
    scoutName: stringValue(payload.scout),
    startPos: stringValue(payload.startPosition ?? payload.sp),
    alliance: stringValue(payload.alliance ?? payload.al ?? row.alliance),
    fieldSideFlipped: booleanValue(payload.fieldSideFlipped ?? payload.ff),
    autoPath: autoPathArray(payload.autoPath ?? payload.ap),
    noShow: booleanValue(payload.noShow),
    climbPosition: stringValue(payload.climbPosition),
    climbFailed: booleanValue(payload.climbFailed),
    incapMs: timedPeriodsMs(payload.incapPeriods ?? payload.ip),
    shootingMs: shotTimes.scoringMs,
    transferShootingMs: shotTimes.transferMs,
    sourceAt: rowTimestamp(row),
  };
  upsertLatest(map, teamMatchKey(team, matchType, match, tbaMatchKey), record);
}

function addSuperRecord(map: Map<string, SuperRecord>, row: CyberScoutRecordRow, includedMatchTypes: Set<DataRange>) {
  const payload = objectPayload(row.payload);
  const match = positiveNumber(row.match_number) ?? positiveNumber(payload.matchNumber);
  const teams = arrayValue(payload.teams);
  if (!match || !teams.length) return;
  const matchType = recordMatchType(row, payload);
  if (!includedMatchTypes.has(matchType)) return;
  const tbaMatchKey = recordTbaMatchKey(payload);
  const teamNumbers = teams.map(positiveId).filter((team): team is string => Boolean(team));
  const autoScore = finiteOrNull(payload.autoScore ?? payload.asc);
  const teleopScore = finiteOrNull(payload.teleopScore ?? payload.tsc);

  teams.forEach((teamValue, index) => {
    const team = positiveId(teamValue);
    if (!team) return;
    const record: SuperRecord = {
      team,
      teams: teamNumbers,
      match,
      matchType,
      tbaMatchKey,
      autoScore,
      teleopScore,
      scoutName: stringValue(payload.scout),
      auto: numberAt(payload.auto, index),
      drive: numberAt(payload.drive, index),
      defense: numberAt(payload.defense, index),
      bps: numberAt(payload.bps, index),
      accuracy: nullableNumberAt(payload.accuracy, index),
      comment: stringAt(payload.comments, index),
      sourceAt: rowTimestamp(row),
    };
    upsertLatest(map, teamMatchKey(team, matchType, match, tbaMatchKey), record);
  });
}

function addPitRecord(map: Map<string, PitRecord>, row: CyberScoutRecordRow) {
  const payload = objectPayload(row.payload);
  const team = positiveId(row.team_number) ?? positiveId(payload.teamNumber);
  if (!team) return;

  const photoPaths = arrayValue(payload.photoPaths).filter((value): value is string =>
    typeof value === "string" && isSafeCyberScoutPhotoPath(value),
  );
  const drivetrain = drivetrainValue(payload.drivetrain ?? payload.dt);
  const autoRoutes = autoRouteArray(payload.autoRoutes ?? payload.ar);
  const record = {
    team,
    photoPaths,
    canCrossTrench: booleanValue(payload.canCrossTrench ?? payload.ct),
    isSwerve: drivetrain === "Swerve",
    drivetrain,
    swerveModule: stringValue(payload.swerveModule ?? payload.sm),
    autoRoutes,
    sourceAt: rowTimestamp(row),
  };
  if (!photoPaths.length && !record.drivetrain && !record.canCrossTrench && !record.autoRoutes.length) return;

  upsertLatest(map, team, record);
}

function toScoutingMatch({
  normal,
  superRecord,
  match,
  teamScore,
}: {
  normal?: NormalRecord;
  superRecord?: SuperRecord;
  match: number;
  teamScore: TeamScore;
}): ScoutingMatch {
  const noShow = normal?.noShow ?? false;
  const climbPts = normal?.climbPosition && !normal.climbFailed ? 5 : 0;
  const autoScore = noShow ? 0 : round1(teamScore.autoPts);
  const teleScore = noShow ? 0 : round1(teamScore.teleGamePiecePts + climbPts);
  const transferPieces = noShow ? 0 : predictedTransferPieces(normal, superRecord);
  const totalScore = noShow ? 0 : round1(autoScore + teleScore);
  const safeAuto = Math.min(autoScore, totalScore);
  const accuracy = noShow ? null : normalizeAccuracy(superRecord?.accuracy);
  const disabled = noShow;
  const botState = noShow ? 4 : (normal?.incapMs ?? 0) > 0 ? 3 : 1;

  return {
    match,
    totalPts: totalScore,
    autoPts: round1(safeAuto),
    telePts: round1(Math.max(0, totalScore - safeAuto)),
    transferPieces,
    bps: clamp(superRecord?.bps ?? 0, 0, 35),
    hubSuccess: accuracy ?? 0,
    hubFail: accuracy == null ? 0 : round1(100 - accuracy),
    accuracy,
    climbPts,
    botState,
    botStateText: noShow ? "No Show" : botState === 3 ? "Incap" : "No Issue",
    disabled,
    downtimeMs: normal?.incapMs ?? 0,
    driverRating: clamp(superRecord?.drive ?? 0, 0, 5),
    fuelRating: round1((clamp(superRecord?.bps ?? 0, 0, 35) / 35) * 5),
    defenseRating: clamp(superRecord?.defense ?? 0, 0, 5),
    comment: buildComment(normal, superRecord),
    startPos: normal?.startPos ?? "",
    scoutName: superRecord?.scoutName || normal?.scoutName || "",
    autoScoutName: normal?.scoutName || undefined,
    autoPath: normal?.autoPath.length ? normal.autoPath : undefined,
    autoStartPosition: normal?.startPos || undefined,
    autoAlliance: normal?.alliance || undefined,
    autoFieldSideFlipped: normal ? normal.fieldSideFlipped : undefined,
  };
}

function buildTeamScores({
  tbaMatches,
  normalByTeamMatch,
  superByTeamMatch,
  includedMatchTypes,
}: {
  tbaMatches: TbaMatch[];
  normalByTeamMatch: Map<string, NormalRecord>;
  superByTeamMatch: Map<string, SuperRecord>;
  includedMatchTypes: Set<DataRange>;
}): Map<string, TeamScore> {
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
      const autoTotal = tbaAutoPoints(breakdown);
      const teleGamePieceTotal = tbaTeleGamePiecePoints(breakdown);
      if (!teams.length || (autoTotal == null && teleGamePieceTotal == null)) continue;

      const rows = teams.map((team) => {
        const key = teamMatchKey(team, matchType, matchNumber, matchType === "playoff" ? tbaKey : null);
        const normal = normalByTeamMatch.get(key);
        const superRecord = superByTeamMatch.get(key);
        const noShow = normal?.noShow ?? false;
        return {
          key,
          autoWeight: noShow ? 0 : clamp(superRecord?.auto ?? 0, 0, 100),
          teleWeight: noShow ? 0 : predictedGamePieces(normal, superRecord),
        };
      });
      const autoAllocations = allocateByWeight(autoTotal, rows.map((row) => row.autoWeight));
      const teleAllocations = allocateByWeight(teleGamePieceTotal, rows.map((row) => row.teleWeight));

      rows.forEach((row, index) => {
        const autoPts = autoAllocations[index];
        const teleGamePiecePts = teleAllocations[index];
        if (autoPts != null && teleGamePiecePts != null) {
          scores.set(row.key, { autoPts, teleGamePiecePts, source: "tba" });
        }
      });
    }
  }
  return scores;
}

function buildSuperScoutTeamScores(
  normalByTeamMatch: Map<string, NormalRecord>,
  superByTeamMatch: Map<string, SuperRecord>,
): Map<string, TeamScore> {
  const scores = new Map<string, TeamScore>();
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
      const noShow = normal?.noShow ?? false;
      return {
        key,
        noShow,
        autoWeight: noShow ? 0 : clamp(teamSuperRecord?.auto ?? 0, 0, 100),
        teleWeight: noShow ? 0 : predictedGamePieces(normal, teamSuperRecord),
      };
    });
    const activeWeights = rows.map((row) => row.noShow ? 0 : 1);
    const autoWeights = rows.map((row) => row.autoWeight);
    const teleWeights = rows.map((row) => row.teleWeight);
    const autoAllocations = allocateByWeight(superRecord.autoScore, autoWeights.some((weight) => weight > 0) ? autoWeights : activeWeights);
    const teleAllocations = allocateByWeight(superRecord.teleopScore, teleWeights.some((weight) => weight > 0) ? teleWeights : activeWeights);

    rows.forEach((row, index) => {
      const autoPts = autoAllocations[index];
      const teleGamePiecePts = teleAllocations[index];
      if (autoPts != null && teleGamePiecePts != null) {
        scores.set(row.key, { autoPts, teleGamePiecePts, source: "super-scout" });
      }
    });
  }
  return scores;
}

function predictedGamePieces(normal?: NormalRecord, superRecord?: SuperRecord) {
  const shootingSeconds = Math.max(0, normal?.shootingMs ?? 0) / 1000;
  const accuracy = clamp(superRecord?.accuracy ?? 0, 0, 100) / 100;
  return clamp(superRecord?.bps ?? 0, 0, 35) * shootingSeconds * accuracy;
}

function predictedTransferPieces(normal?: NormalRecord, superRecord?: SuperRecord) {
  const shootingSeconds = Math.max(0, normal?.transferShootingMs ?? 0) / 1000;
  return round1(clamp(superRecord?.bps ?? 0, 0, 35) * shootingSeconds);
}

function manualShotTimes(payload: Record<string, unknown>) {
  const shots = [...timedPeriods(payload.manualShotWhileIntaking ?? payload.wi), ...timedPeriods(payload.manualShotDirect ?? payload.sd)];
  const zones = manualZoneIntervals(payload);
  let scoringMs = 0;
  let transferMs = 0;

  for (const shot of shots) {
    for (const zone of zones) {
      const overlap = Math.max(0, Math.min(shot.endMs, zone.endMs) - Math.max(shot.startMs, zone.startMs));
      if (!overlap) continue;
      if (zone.kind === "alliance") scoringMs += overlap;
      if (zone.kind === "transfer") transferMs += overlap;
    }
  }

  return { scoringMs, transferMs };
}

function manualZoneIntervals(payload: Record<string, unknown>) {
  const events = arrayValue(payload.manualZoneEvents ?? payload.me)
    .map((event) => {
      const item = objectPayload(event);
      const atMs = numberValue(item.atMs ?? item.a, Number.NaN);
      const kind = zoneKind(item.zone);
      return Number.isFinite(atMs) && kind ? { atMs, kind } : null;
    })
    .filter((event): event is { atMs: number; kind: "alliance" | "transfer" } => Boolean(event))
    .sort((a, b) => a.atMs - b.atMs);

  if (!events.length) {
    const kind = zoneKind(payload.manualZone ?? payload.mz ?? payload.finalZone ?? payload.fz);
    return kind ? [{ startMs: 0, endMs: Number.POSITIVE_INFINITY, kind }] : [];
  }

  return events.map((event, index) => ({
    startMs: event.atMs,
    endMs: events[index + 1]?.atMs ?? Number.POSITIVE_INFINITY,
    kind: event.kind,
  }));
}

function zoneKind(value: unknown): "alliance" | "transfer" | null {
  const zone = stringValue(value).toLowerCase();
  if (zone === "联盟" || zone === "alliance" || zone === "a") return "alliance";
  if (zone === "中立" || zone === "对方" || zone === "neutral" || zone === "opponent" || zone === "n" || zone === "o") return "transfer";
  return null;
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

function tbaAutoPoints(breakdown: Record<string, unknown>) {
  return finiteOrNull(objectPayload(breakdown.hubScore).autoPoints);
}

function tbaTeleGamePiecePoints(breakdown: Record<string, unknown>) {
  return finiteOrNull(objectPayload(breakdown.hubScore).teleopPoints);
}

function finiteOrNull(value: unknown) {
  const parsed = numberValue(value, Number.NaN);
  return Number.isFinite(parsed) ? parsed : null;
}

function teamNumbers(values: Array<string | number> | undefined) {
  return (values ?? []).map((team) => String(team).replace(/^frc/, ""));
}

function buildComment(normal?: NormalRecord, superRecord?: SuperRecord) {
  const values = [
    superRecord?.comment,
    normal?.noShow ? "No show" : "",
    normal && normal.incapMs > 0 ? `Incap ${(normal.incapMs / 1000).toFixed(1)}s` : "",
    normal?.climbFailed ? "Climb failed" : "",
  ].filter(Boolean);
  return values.join(" · ");
}

function buildTeamPhotos(pitByTeam: Map<string, PitRecord>): TeamPhotos {
  const photos: TeamPhotos = {};
  for (const [team, record] of pitByTeam.entries()) {
    photos[team] = record.photoPaths.map((path) => `/api/cyber-scout/photos?path=${encodeURIComponent(path)}`);
  }
  return photos;
}

function buildTeamPitData(pitByTeam: Map<string, PitRecord>): TeamPitData {
  const pitData: TeamPitData = {};
  for (const [team, record] of pitByTeam.entries()) {
    pitData[team] = {
      canCrossTrench: record.canCrossTrench,
      isSwerve: record.isSwerve,
      drivetrain: record.drivetrain,
      swerveModule: record.swerveModule,
      autoRoutes: record.autoRoutes,
    };
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

function recordMatchType(row: CyberScoutRecordRow, payload: Record<string, unknown>): DataRange {
  return matchTypeFromValue(row.match_type ?? payload.matchType ?? payload.mt ?? payload.compLevel ?? payload.comp_level);
}

function recordTbaMatchKey(payload: Record<string, unknown>): string | null {
  return stringValue(payload.tbaMatchKey ?? payload.tba_match_key ?? payload.matchKey ?? payload.key) || null;
}

function resultMatchIdentity(row: CyberScoutRecordRow, payload: Record<string, unknown>) {
  const match = positiveNumber(row.match_number) ?? positiveNumber(payload.matchNumber ?? payload.mn);
  if (!match) return null;
  const type = stringValue(row.match_type ?? payload.matchType ?? payload.mt).toLowerCase();
  if (["p", "pr", "practice", "practice_match"].includes(type)) return { comp_level: "practice", match_number: match };
  if (type === "sf") return { comp_level: "sf", set_number: match, match_number: 1 };
  if (["f", "final", "finals"].includes(type)) return { comp_level: "f", set_number: match, match_number: 1 };
  return { comp_level: "qm", match_number: match };
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

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function numberAt(value: unknown, index: number): number {
  const item = arrayValue(value)[index];
  return numberValue(item);
}

function nullableNumberAt(value: unknown, index: number): number | null {
  const parsed = numberValue(arrayValue(value)[index], Number.NaN);
  return Number.isFinite(parsed) ? parsed : null;
}

function stringAt(value: unknown, index: number): string {
  const item = arrayValue(value)[index];
  return typeof item === "string" ? item.trim() : "";
}

function timedPeriodsMs(value: unknown): number {
  return timedPeriods(value).reduce<number>((sum, period) => sum + Math.max(0, period.endMs - period.startMs), 0);
}

function timedPeriods(value: unknown): Array<{ startMs: number; endMs: number }> {
  return arrayValue(value).map((period) => {
    const item = objectPayload(period);
    const start = numberValue(item.startMs ?? item.s);
    const end = numberValue(item.endMs ?? item.e);
    return { startMs: start, endMs: end };
  });
}

function autoRouteArray(value: unknown): Array<{ id: string; points: Array<{ x: number; y: number }> }> {
  return arrayValue(value)
    .map((route, index) => {
      const item = objectPayload(route);
      const points = arrayValue(item.points ?? item.pts)
        .map((point) => {
          const value = objectPayload(point);
          const x = numberValue(value.x, Number.NaN);
          const y = numberValue(value.y, Number.NaN);
          return Number.isFinite(x) && Number.isFinite(y) ? { x: clamp(x, 0, 100), y: clamp(y, 0, 100) } : null;
        })
        .filter((point): point is { x: number; y: number } => Boolean(point));
      return points.length ? { id: stringValue(item.id) || `route-${index + 1}`, points } : null;
    })
    .filter((route): route is { id: string; points: Array<{ x: number; y: number }> } => Boolean(route));
}

function autoPathArray(value: unknown): MatchAutoPathPoint[] {
  return arrayValue(value)
    .map((point) => {
      const item = objectPayload(point);
      const node = stringValue(item.node ?? item.n);
      if (!node) return null;
      return { node, atMs: Math.max(0, numberValue(item.atMs ?? item.a)) };
    })
    .filter((point): point is MatchAutoPathPoint => Boolean(point));
}

function drivetrainValue(value: unknown): string {
  if (value === "sw") return "Swerve";
  if (value === "tk") return "坦克";
  if (value === "mc") return "麦克纳母轮";
  if (value === "ot") return "其他";
  return stringValue(value);
}

function normalizeAccuracy(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return null;
  return round1(clamp(value, 0, 100));
}

function positiveId(value: unknown): string | null {
  const parsed = positiveNumber(value);
  return parsed ? String(parsed) : null;
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

function booleanValue(value: unknown): boolean {
  return value === true || value === "true" || value === 1 || value === "1";
}

function rowTimestamp(row: CyberScoutRecordRow): number {
  const value = row.uploaded_at ?? row.client_created_at ?? row.created_at ?? "";
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
