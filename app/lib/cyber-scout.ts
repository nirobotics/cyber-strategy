import {
  summarizeTeamMatches,
  type ScoutingDataset,
  type ScoutingMatch,
  type TeamPitData,
  type TeamData,
  type TeamPhotos,
} from "./scouting";

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
  match_number: number | null;
  team_number: number | null;
  payload: unknown;
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

const matchDurationMs = 135_000;

export function buildCyberScoutDataset({
  event,
  records,
}: {
  event: CyberScoutEventRow;
  records: CyberScoutRecordRow[];
}): ScoutingDataset {
  const normalByTeamMatch = new Map<string, NormalRecord>();
  const superByTeamMatch = new Map<string, SuperRecord>();
  const pitByTeam = new Map<string, PitRecord>();

  for (const row of records) {
    if (row.record_type === "normal_match") addNormalRecord(normalByTeamMatch, row);
    if (row.record_type === "super_match") addSuperRecord(superByTeamMatch, row);
    if (row.record_type === "pit") addPitRecord(pitByTeam, row);
  }

  const matchesByTeam = new Map<string, ScoutingMatch[]>();
  const keys = new Set([...normalByTeamMatch.keys(), ...superByTeamMatch.keys()]);
  for (const key of keys) {
    const normal = normalByTeamMatch.get(key);
    const superRecord = superByTeamMatch.get(key);
    const team = normal?.team ?? superRecord?.team;
    const match = normal?.match ?? superRecord?.match;
    if (!team || !match) continue;

    const scoutingMatch = toScoutingMatch({ normal, superRecord, match });
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

  const record: NormalRecord = {
    team,
    match,
    scoutName: stringValue(payload.scout),
    startPos: stringValue(payload.startPosition),
    noShow: booleanValue(payload.noShow),
    climbPosition: stringValue(payload.climbPosition),
    climbFailed: booleanValue(payload.climbFailed),
    incapMs: timedPeriodsMs(payload.incapPeriods),
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
}: {
  normal?: NormalRecord;
  superRecord?: SuperRecord;
  match: number;
}): ScoutingMatch {
  const noShow = normal?.noShow ?? false;
  const climbPts = normal?.climbPosition && !normal.climbFailed ? 5 : 0;
  const autoScore = noShow ? 0 : round1((clamp(superRecord?.auto ?? 0, 0, 100) / 100) * 20);
  const totalScore = noShow ? 0 : scoreScoutMatch({ superRecord, climbPts, incapMs: normal?.incapMs ?? 0 });
  const safeAuto = Math.min(autoScore, totalScore);
  const accuracy = noShow ? null : normalizeAccuracy(superRecord?.accuracy);
  const disabled = noShow;
  const botState = noShow ? 4 : (normal?.incapMs ?? 0) > 0 ? 3 : 1;

  return {
    match,
    totalPts: totalScore,
    autoPts: round1(safeAuto),
    telePts: round1(Math.max(0, totalScore - safeAuto)),
    hubSuccess: accuracy ?? 0,
    hubFail: accuracy == null ? 0 : round1(100 - accuracy),
    accuracy,
    climbPts,
    botState,
    botStateText: noShow ? "No Show" : botState === 3 ? "Incap" : "No Issue",
    disabled,
    driverRating: clamp(superRecord?.drive ?? 0, 0, 5),
    fuelRating: round1((clamp(superRecord?.bps ?? 0, 0, 35) / 35) * 5),
    defenseRating: clamp(superRecord?.defense ?? 0, 0, 5),
    comment: buildComment(normal, superRecord),
    startPos: normal?.startPos ?? "",
    scoutName: superRecord?.scoutName || normal?.scoutName || "",
  };
}

function scoreScoutMatch({
  superRecord,
  climbPts,
  incapMs,
}: {
  superRecord?: SuperRecord;
  climbPts: number;
  incapMs: number;
}) {
  const auto = (clamp(superRecord?.auto ?? 0, 0, 100) / 100) * 20;
  const bps = clamp(superRecord?.bps ?? 0, 0, 35);
  const accuracy = (clamp(superRecord?.accuracy ?? 0, 0, 100) / 100) * 20;
  const drive = (clamp(superRecord?.drive ?? 0, 0, 5) / 5) * 10;
  const defense = (clamp(superRecord?.defense ?? 0, 0, 5) / 5) * 10;
  const incapPenalty = Math.min(20, (Math.max(0, incapMs) / matchDurationMs) * 20);
  return round1(Math.max(0, auto + bps + accuracy + drive + defense + climbPts - incapPenalty));
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
  return arrayValue(value).reduce<number>((sum, period) => {
    const item = objectPayload(period);
    const start = numberValue(item.startMs);
    const end = numberValue(item.endMs);
    return sum + Math.max(0, end - start);
  }, 0);
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
