import {
  summarizeTeamMatches,
  type ScoutingDataset,
  type ScoutingMatch,
  type TeamPitData,
  type TeamData,
  type TeamPhotos,
} from "./scouting";
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
  scoutName: string;
  startPos: string;
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
  match: number;
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

type TbaTeamScore = {
  autoPts: number;
  teleGamePiecePts: number;
};

type ScoredDataset = ScoutingDataset & {
  scoringIgnoredMatches: number;
};

export function buildCyberScoutDataset({
  event,
  records,
  tbaMatches = [],
}: {
  event: CyberScoutEventRow;
  records: CyberScoutRecordRow[];
  tbaMatches?: TbaMatch[];
}): ScoredDataset {
  const normalByTeamMatch = new Map<string, NormalRecord>();
  const superByTeamMatch = new Map<string, SuperRecord>();
  const pitByTeam = new Map<string, PitRecord>();

  for (const row of records) {
    if (row.record_type === "normal_match") addNormalRecord(normalByTeamMatch, row);
    if (row.record_type === "super_match") addSuperRecord(superByTeamMatch, row);
    if (row.record_type === "pit") addPitRecord(pitByTeam, row);
  }

  const tbaScores = buildTbaTeamScores({ tbaMatches, normalByTeamMatch, superByTeamMatch });
  let scoringIgnoredMatches = 0;
  const matchesByTeam = new Map<string, ScoutingMatch[]>();
  const keys = new Set([...normalByTeamMatch.keys(), ...superByTeamMatch.keys()]);
  for (const key of keys) {
    const normal = normalByTeamMatch.get(key);
    const superRecord = superByTeamMatch.get(key);
    const team = normal?.team ?? superRecord?.team;
    const match = normal?.match ?? superRecord?.match;
    if (!team || !match) continue;
    const tbaScore = tbaScores.get(key);
    if (!tbaScore) {
      scoringIgnoredMatches += 1;
      continue;
    }

    const scoutingMatch = toScoutingMatch({ normal, superRecord, match, tbaScore });
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
    scoringIgnoredMatches,
  };
}

export function isSafeCyberScoutPhotoPath(path: string): boolean {
  if (!path || path.length > 300) return false;
  if (path.startsWith("/") || path.includes("..")) return false;
  if (!/^[a-zA-Z0-9/_:.-]+$/.test(path)) return false;
  return /\.(?:jpe?g|png|webp)$/i.test(path);
}

function addNormalRecord(map: Map<string, NormalRecord>, row: CyberScoutRecordRow) {
  const payload = objectPayload(row.payload);
  const team = positiveId(row.team_number) ?? positiveId(payload.teamNumber);
  const match = positiveNumber(row.match_number) ?? positiveNumber(payload.matchNumber);
  if (!team || !match) return;
  const shotTimes = manualShotTimes(payload);

  const record: NormalRecord = {
    team,
    match,
    scoutName: stringValue(payload.scout),
    startPos: stringValue(payload.startPosition),
    noShow: booleanValue(payload.noShow),
    climbPosition: stringValue(payload.climbPosition),
    climbFailed: booleanValue(payload.climbFailed),
    incapMs: timedPeriodsMs(payload.incapPeriods ?? payload.ip),
    shootingMs: shotTimes.scoringMs,
    transferShootingMs: shotTimes.transferMs,
    sourceAt: rowTimestamp(row),
  };
  upsertLatest(map, teamMatchKey(team, match), record);
}

function addSuperRecord(map: Map<string, SuperRecord>, row: CyberScoutRecordRow) {
  const payload = objectPayload(row.payload);
  const match = positiveNumber(row.match_number) ?? positiveNumber(payload.matchNumber);
  const teams = arrayValue(payload.teams);
  if (!match || !teams.length) return;

  teams.forEach((teamValue, index) => {
    const team = positiveId(teamValue);
    if (!team) return;
    const record: SuperRecord = {
      team,
      match,
      scoutName: stringValue(payload.scout),
      auto: numberAt(payload.auto, index),
      drive: numberAt(payload.drive, index),
      defense: numberAt(payload.defense, index),
      bps: numberAt(payload.bps, index),
      accuracy: nullableNumberAt(payload.accuracy, index),
      comment: stringAt(payload.comments, index),
      sourceAt: rowTimestamp(row),
    };
    upsertLatest(map, teamMatchKey(team, match), record);
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
  tbaScore,
}: {
  normal?: NormalRecord;
  superRecord?: SuperRecord;
  match: number;
  tbaScore: TbaTeamScore;
}): ScoutingMatch {
  const noShow = normal?.noShow ?? false;
  const climbPts = normal?.climbPosition && !normal.climbFailed ? 5 : 0;
  const autoScore = noShow ? 0 : round1(tbaScore.autoPts);
  const teleScore = noShow ? 0 : round1(tbaScore.teleGamePiecePts + climbPts);
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
  };
}

function buildTbaTeamScores({
  tbaMatches,
  normalByTeamMatch,
  superByTeamMatch,
}: {
  tbaMatches: TbaMatch[];
  normalByTeamMatch: Map<string, NormalRecord>;
  superByTeamMatch: Map<string, SuperRecord>;
}): Map<string, TbaTeamScore> {
  const scores = new Map<string, TbaTeamScore>();
  for (const match of tbaMatches) {
    if (match.comp_level && match.comp_level !== "qm") continue;
    const matchNumber = positiveNumber(match.match_number);
    if (!matchNumber) continue;

    for (const alliance of ["red", "blue"] as const) {
      const teams = teamNumbers(match.alliances?.[alliance]?.team_keys);
      const breakdown = objectPayload(match.score_breakdown?.[alliance]);
      const autoTotal = tbaAutoPoints(breakdown);
      const teleGamePieceTotal = tbaTeleGamePiecePoints(breakdown);
      if (!teams.length || (autoTotal == null && teleGamePieceTotal == null)) continue;

      const rows = teams.map((team) => {
        const key = teamMatchKey(team, matchNumber);
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
        if (autoPts != null && teleGamePiecePts != null) scores.set(row.key, { autoPts, teleGamePiecePts });
      });
    }
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
  const sum = weights.reduce((value, weight) => value + Math.max(0, weight), 0);
  if (sum <= 0) return weights.map(() => null);
  return weights.map((weight) => round1((total * Math.max(0, weight)) / sum));
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

function teamMatchKey(team: string, match: number) {
  return `${team}:${match}`;
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
