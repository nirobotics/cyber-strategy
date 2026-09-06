import type { DataRange } from "../lib/data-range";
import type {
  MatchAutoPathPoint,
  RobotStatus,
  ScoutingMatch,
  TeamPitInfo,
} from "../lib/scouting";
import { seasonConfig } from "./config";

export type CyberScoutPayloadRow = {
  match_type?: string | null;
  match_number: number | null;
  alliance?: string | null;
  team_number: number | null;
  payload: unknown;
  uploaded_at: string | null;
  client_created_at: string | null;
  created_at: string | null;
};

type BaseSeasonRecord = {
  team: string;
  match: number;
  matchType: DataRange;
  tbaMatchKey: string | null;
  sourceAt: number;
};

export type SeasonNormalRecord = BaseSeasonRecord & {
  scoutName: string;
  startPos: string;
  alliance: string;
  fieldSideFlipped: boolean;
  autoPath: MatchAutoPathPoint[];
  noShow: boolean;
  disabled: boolean;
  climbPosition: string;
  climbFailed: boolean;
  incapMs: number;
  shootingMs: number;
  transferShootingMs: number;
  normalRecordCount: number;
  shootingMsTotal: number;
  transferShootingMsTotal: number;
};

export type SeasonSuperRecord = BaseSeasonRecord & {
  teams: string[];
  alliance: "red" | "blue" | null;
  autoScore: number | null;
  teleopScore: number | null;
  scoutName: string;
  auto: number;
  drive: number;
  defense: number;
  bps: number;
  accuracy: number | null;
  comment: string;
};

export type SeasonPitRecord = {
  team: string;
  attributes: TeamPitInfo["attributes"];
  autoRoutes: TeamPitInfo["autoRoutes"];
  photoPaths: string[];
  sourceAt: number;
};

export type SeasonTeamScore = {
  autoPts: number;
  telePts: number;
  source: "frc-events" | "tba" | "super-scout" | "zero";
};

export type SeasonEditableField = {
  key: string;
  label: string;
  recordType: "normal" | "super";
  payloadKey: string;
  min: number;
  max: number;
  step?: number;
  arrayByTeam?: boolean;
};

export const editableScoutingFields: readonly SeasonEditableField[] = [
  { key: "driveScore", label: "Drive Score", recordType: "super", payloadKey: "drive", min: 0, max: 5, arrayByTeam: true },
  { key: "defenseScore", label: "Defense Score", recordType: "super", payloadKey: "defense", min: 0, max: 5, arrayByTeam: true },
];

export function parseSeasonNormalRecord(row: CyberScoutPayloadRow): SeasonNormalRecord | null {
  const payload = objectValue(row.payload);
  const team = positiveId(row.team_number) ?? positiveId(payload.teamNumber);
  const match = positiveNumber(row.match_number) ?? positiveNumber(payload.matchNumber);
  if (!team || !match) return null;
  const shotTimes = manualShotTimes(payload);
  return {
    team,
    match,
    matchType: recordMatchType(row, payload),
    tbaMatchKey: recordTbaMatchKey(payload),
    scoutName: stringValue(payload.scout),
    startPos: stringValue(payload.startPosition ?? payload.sp),
    alliance: stringValue(payload.alliance ?? payload.al ?? row.alliance),
    fieldSideFlipped: booleanValue(payload.fieldSideFlipped ?? payload.ff),
    autoPath: autoPathArray(payload.autoPath ?? payload.ap),
    noShow: booleanValue(payload.noShow),
    disabled: booleanValue(payload.disabled),
    climbPosition: stringValue(payload.climbPosition),
    climbFailed: booleanValue(payload.climbFailed),
    incapMs: timedPeriodsMs(payload.incapPeriods ?? payload.ip),
    shootingMs: shotTimes.scoringMs,
    transferShootingMs: shotTimes.transferMs,
    normalRecordCount: 1,
    shootingMsTotal: shotTimes.scoringMs,
    transferShootingMsTotal: shotTimes.transferMs,
    sourceAt: rowTimestamp(row),
  };
}

export function parseSeasonSuperRecords(row: CyberScoutPayloadRow): SeasonSuperRecord[] {
  const payload = objectValue(row.payload);
  const match = positiveNumber(row.match_number) ?? positiveNumber(payload.matchNumber);
  const teams = arrayValue(payload.teams);
  if (!match || !teams.length) return [];
  const teamNumbers = teams.map(positiveId).filter((team): team is string => Boolean(team));
  const matchType = recordMatchType(row, payload);
  const tbaMatchKey = recordTbaMatchKey(payload);
  const alliance = allianceValue(row.alliance ?? payload.alliance ?? payload.al);
  const autoScore = finiteOrNull(payload.autoScore ?? payload.asc);
  const teleopScore = finiteOrNull(payload.teleopScore ?? payload.tsc);
  const sourceAt = rowTimestamp(row);
  return teams.flatMap((teamValue, index) => {
    const team = positiveId(teamValue);
    if (!team) return [];
    return [{
      team,
      teams: teamNumbers,
      alliance,
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
      sourceAt,
    }];
  });
}

export function parseSeasonPitRecord(row: CyberScoutPayloadRow): SeasonPitRecord | null {
  const payload = objectValue(row.payload);
  const team = positiveId(row.team_number) ?? positiveId(payload.teamNumber);
  if (!team) return null;
  const photoPaths = arrayValue(payload.photoPaths).filter((value): value is string => typeof value === "string");
  const drivetrain = drivetrainValue(payload.drivetrain ?? payload.dt);
  const swerveModule = stringValue(payload.swerveModule ?? payload.sm);
  const attributes = [
    drivetrain ? { key: "drivetrain", label: "底盘", value: drivetrain } : null,
    swerveModule ? { key: "swerveModule", label: "Swerve 模块", value: swerveModule } : null,
  ].filter((value): value is TeamPitInfo["attributes"][number] => Boolean(value));
  const autoRoutes = autoRouteArray(payload.autoRoutes ?? payload.ar);
  if (!photoPaths.length && !attributes.length && !autoRoutes.length) return null;
  return { team, photoPaths, attributes, autoRoutes, sourceAt: rowTimestamp(row) };
}

export function mergeSeasonNormalRecords(current: SeasonNormalRecord, next: SeasonNormalRecord): SeasonNormalRecord {
  const count = current.normalRecordCount + 1;
  const shootingMsTotal = current.shootingMsTotal + next.shootingMs;
  const transferShootingMsTotal = current.transferShootingMsTotal + next.transferShootingMs;
  const latest = next.sourceAt >= current.sourceAt ? next : current;
  return {
    ...latest,
    normalRecordCount: count,
    shootingMsTotal,
    transferShootingMsTotal,
    shootingMs: round1(shootingMsTotal / count),
    transferShootingMs: round1(transferShootingMsTotal / count),
  };
}

export function seasonScoreWeights(normal?: SeasonNormalRecord, superRecord?: SeasonSuperRecord) {
  if (normal?.noShow) return { auto: 0, tele: 0 };
  return {
    auto: clamp(superRecord?.auto ?? 0, 0, 100),
    tele: predictedGamePieces(normal, superRecord),
  };
}

export function toSeasonScoutingMatch({
  normal,
  superRecord,
  match,
  teamScore,
}: {
  normal?: SeasonNormalRecord;
  superRecord?: SeasonSuperRecord;
  match: number;
  teamScore: SeasonTeamScore;
}): ScoutingMatch {
  const noShow = normal?.noShow ?? false;
  const climbPoints = normal?.climbPosition && !normal.climbFailed ? 5 : 0;
  const autoPts = noShow ? 0 : round1(teamScore.autoPts);
  const telePts = noShow ? 0 : round1(teamScore.telePts + climbPoints);
  const totalPts = round1(autoPts + telePts);
  const accuracy = noShow ? null : normalizeAccuracy(superRecord?.accuracy);
  const metrics: Record<string, number> = {
    transferPieces: noShow ? 0 : predictedTransferPieces(normal, superRecord),
    bps: clamp(superRecord?.bps ?? 0, 0, 35),
    climbPoints,
    fuelRating: round1((clamp(superRecord?.bps ?? 0, 0, 35) / 35) * 5),
  };
  if (accuracy != null) metrics.accuracy = accuracy;
  return {
    match,
    matchType: normal?.matchType ?? superRecord?.matchType,
    scoutingPts: noShow ? 0 : round1(teamScore.autoPts + predictedGamePieces(normal, superRecord) + climbPoints),
    totalPts,
    autoPts,
    telePts,
    metrics,
    status: normalizeRobotStatus({
      text: noShow ? "no show" : (normal?.incapMs ?? 0) > 0 ? "incap" : "no issue",
      downtimeMs: normal?.incapMs ?? 0,
      noShow,
    }),
    disabled: noShow || (normal?.disabled ?? false),
    downtimeMs: normal?.incapMs ?? 0,
    driverRating: clamp(superRecord?.drive ?? 0, 0, 5),
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

export function seasonPitInfo(record: SeasonPitRecord): TeamPitInfo {
  return { attributes: record.attributes, autoRoutes: record.autoRoutes };
}

export function seasonCsvTeam(row: Record<string, unknown>) {
  return stringValue(row.Team);
}

export function seasonCsvMatchNumber(row: Record<string, unknown>) {
  return positiveNumber(row.Match) ?? 0;
}

export function seasonCsvScoutingMatch(row: Record<string, unknown>): ScoutingMatch {
  const downtimeMs = csvDowntimeMs(row);
  const disabled = booleanValue(row.Disabled);
  const hubSuccess = numberValue(row.TotalHubFuelSuccess);
  const hubFail = numberValue(row.TotalHubFuelFail);
  const metrics: Record<string, number> = {
    transferPieces: numberValue(row.TransferPieces),
    bps: numberValue(row.BPS),
    climbPoints: numberValue(row.TotalClimbPoints),
    fuelRating: numberValue(row.FuelIntakeRating),
  };
  if (hubSuccess + hubFail > 0) metrics.accuracy = round1((hubSuccess / (hubSuccess + hubFail)) * 100);
  return {
    match: seasonCsvMatchNumber(row),
    totalPts: numberValue(row.TotalPoints),
    autoPts: numberValue(row.AutoPoints),
    telePts: numberValue(row.TelePoints),
    metrics,
    status: normalizeRobotStatus({ code: numberValue(row.BotState, 1), text: stringValue(row.BotStateText), disabled, downtimeMs }),
    disabled,
    downtimeMs,
    driverRating: numberValue(row.DriverRating),
    defenseRating: numberValue(row.DefenseRating),
    comment: stringValue(row.Comment),
    startPos: stringValue(row.StartPosition),
    scoutName: stringValue(row.ScoutName),
  };
}

export function normalizeRobotStatus({
  code,
  text,
  disabled = false,
  downtimeMs = 0,
  noShow = false,
}: {
  code?: number;
  text?: string;
  disabled?: boolean;
  downtimeMs?: number;
  noShow?: boolean;
}): RobotStatus {
  if (noShow) return "no_show";
  const normalized = stringValue(text).toLowerCase();
  if (["no show", "no_show", "未到场"].includes(normalized)) return "no_show";
  if (disabled) return "incap";
  if (["incap", "down", "宕机"].includes(normalized)) {
    return downtimeMs <= seasonConfig.incapNormalThresholdMs ? "normal" : "incap";
  }
  if (["no issue", "normal", "正常"].includes(normalized)) return "normal";
  if (["comms issue", "communication issue", "通信问题", "minor malfunction", "minor fault", "轻微故障", "major malfunction", "major fault", "严重故障"].includes(normalized)) return "incap";
  return code != null && code > 1 ? "incap" : "normal";
}

export function readSeasonEditableValues(payload: unknown, team: string, recordType: "normal" | "super") {
  const current = objectValue(payload);
  const index = recordType === "super" ? arrayValue(current.teams).findIndex((value) => teamNumber(value) === team) : -1;
  if (recordType === "super" && index < 0) return null;
  return Object.fromEntries(editableScoutingFields.filter((field) => field.recordType === recordType).map((field) => [
    field.key,
    field.arrayByTeam ? numberAt(current[field.payloadKey], index) : numberValue(current[field.payloadKey]),
  ]));
}

export function patchSeasonEditableValues(
  payload: unknown,
  team: string,
  recordType: "normal" | "super",
  values: Record<string, number>,
) {
  validateSeasonEditableValues(recordType, values);
  const current = objectValue(payload);
  const index = recordType === "super" ? arrayValue(current.teams).findIndex((value) => teamNumber(value) === team) : -1;
  if (recordType === "super" && index < 0) throw new Error(`Super Scout 记录中没有 Team ${team}`);
  const next = { ...current };
  for (const field of editableScoutingFields.filter((item) => item.recordType === recordType)) {
    if (!(field.key in values)) continue;
    next[field.payloadKey] = field.arrayByTeam
      ? replaceAt(current[field.payloadKey], index, values[field.key])
      : values[field.key];
  }
  return next;
}

export function validateSeasonEditableValues(recordType: "normal" | "super", values: Record<string, number>) {
  for (const field of editableScoutingFields.filter((item) => item.recordType === recordType)) {
    const value = values[field.key];
    if (!Number.isFinite(value) || value < field.min || value > field.max) {
      throw new Error(`${field.label} 必须在 ${field.min}–${field.max} 之间`);
    }
  }
}

function predictedGamePieces(normal?: SeasonNormalRecord, superRecord?: SeasonSuperRecord) {
  const shootingSeconds = Math.max(0, normal?.shootingMs ?? 0) / 1000;
  const accuracy = clamp(superRecord?.accuracy ?? 0, 0, 100) / 100;
  return clamp(superRecord?.bps ?? 0, 0, 35) * shootingSeconds * accuracy;
}

function predictedTransferPieces(normal?: SeasonNormalRecord, superRecord?: SeasonSuperRecord) {
  const shootingSeconds = Math.max(0, normal?.transferShootingMs ?? 0) / 1000;
  return round1(clamp(superRecord?.bps ?? 0, 0, 35) * shootingSeconds);
}

function manualShotTimes(payload: Record<string, unknown>) {
  const override = objectValue(payload.strategyOverride);
  const overrideShootingMs = finiteOrNull(override.shootingMs);
  const overrideTransferMs = finiteOrNull(override.transferShootingMs);
  if (overrideShootingMs != null && overrideTransferMs != null) {
    return { scoringMs: Math.max(0, overrideShootingMs), transferMs: Math.max(0, overrideTransferMs) };
  }
  const shots = [...timedPeriods(payload.manualShotWhileIntaking ?? payload.wi), ...timedPeriods(payload.manualShotDirect ?? payload.sd)];
  const zones = manualZoneIntervals(payload);
  let scoringMs = 0;
  let transferMs = 0;
  for (const shot of shots) {
    for (const zone of zones) {
      const overlap = Math.max(0, Math.min(shot.endMs, zone.endMs) - Math.max(shot.startMs, zone.startMs));
      if (zone.kind === "alliance") scoringMs += overlap;
      if (zone.kind === "transfer") transferMs += overlap;
    }
  }
  return { scoringMs, transferMs };
}

function manualZoneIntervals(payload: Record<string, unknown>) {
  const events = arrayValue(payload.manualZoneEvents ?? payload.me)
    .map((event) => {
      const item = objectValue(event);
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
  if (["联盟", "alliance", "a"].includes(zone)) return "alliance";
  if (["中立", "对方", "neutral", "opponent", "n", "o"].includes(zone)) return "transfer";
  return null;
}

function buildComment(normal?: SeasonNormalRecord, superRecord?: SeasonSuperRecord) {
  return [
    superRecord?.comment,
    normal?.noShow ? "No show" : "",
    normal && normal.incapMs > 0 ? `Incap ${(normal.incapMs / 1000).toFixed(1)}s` : "",
    normal?.climbFailed ? "Climb failed" : "",
  ].filter(Boolean).join(" · ");
}

function recordMatchType(row: CyberScoutPayloadRow, payload: Record<string, unknown>): DataRange {
  const value = stringValue(row.match_type ?? payload.matchType ?? payload.mt ?? payload.compLevel ?? payload.comp_level).toLowerCase();
  if (["p", "pr", "practice", "practice_match"].includes(value)) return "practice";
  if (["sf", "f", "final", "finals", "playoff"].includes(value)) return "playoff";
  return "qualification";
}

function recordTbaMatchKey(payload: Record<string, unknown>) {
  return stringValue(payload.tbaMatchKey ?? payload.tba_match_key ?? payload.matchKey ?? payload.key) || null;
}

function csvDowntimeMs(row: Record<string, unknown>) {
  const milliseconds = finiteOrNull(row.DowntimeMs ?? row.IncapMs ?? row.DisabledMs);
  if (milliseconds != null) return milliseconds;
  const seconds = finiteOrNull(row.DowntimeSeconds ?? row.IncapSeconds ?? row.DisabledSeconds);
  return seconds == null ? 0 : seconds * 1000;
}

function timedPeriodsMs(value: unknown) {
  return timedPeriods(value).reduce((sum, period) => sum + Math.max(0, period.endMs - period.startMs), 0);
}

function timedPeriods(value: unknown) {
  return arrayValue(value).map((period) => {
    const item = objectValue(period);
    return { startMs: numberValue(item.startMs ?? item.s), endMs: numberValue(item.endMs ?? item.e) };
  });
}

function autoRouteArray(value: unknown): TeamPitInfo["autoRoutes"] {
  return arrayValue(value).flatMap((route, index) => {
    const item = objectValue(route);
    const points = arrayValue(item.points ?? item.pts).flatMap((point) => {
      const item = objectValue(point);
      const x = numberValue(item.x, Number.NaN);
      const y = numberValue(item.y, Number.NaN);
      return Number.isFinite(x) && Number.isFinite(y) ? [{ x: clamp(x, 0, 100), y: clamp(y, 0, 100) }] : [];
    });
    return points.length ? [{ id: stringValue(item.id) || `route-${index + 1}`, points }] : [];
  });
}

function autoPathArray(value: unknown): MatchAutoPathPoint[] {
  return arrayValue(value).flatMap((point) => {
    const item = objectValue(point);
    const node = stringValue(item.node ?? item.n);
    if (!node) return [];
    const x = numberValue(item.x, Number.NaN);
    const y = numberValue(item.y, Number.NaN);
    return [{
      node,
      atMs: Math.max(0, numberValue(item.atMs ?? item.a)),
      ...(Number.isFinite(x) && Number.isFinite(y) ? { x: clamp(x, 0, 100), y: clamp(y, 0, 100) } : {}),
    }];
  });
}

function drivetrainValue(value: unknown) {
  if (value === "sw") return "Swerve";
  if (value === "tk") return "坦克";
  if (value === "mc") return "麦克纳母轮";
  if (value === "ot") return "其他";
  return stringValue(value);
}

function normalizeAccuracy(value: number | null | undefined) {
  return value == null || !Number.isFinite(value) ? null : round1(clamp(value, 0, 100));
}

function allianceValue(value: unknown): "red" | "blue" | null {
  const alliance = stringValue(value).toLowerCase();
  if (["red", "r"].includes(alliance)) return "red";
  if (["blue", "b"].includes(alliance)) return "blue";
  return null;
}

function replaceAt(value: unknown, index: number, next: number) {
  const values = arrayValue(value);
  while (values.length <= index) values.push(0);
  values[index] = next;
  return values;
}

function teamNumber(value: unknown) {
  return stringValue(value).match(/\d+/)?.[0] ?? "";
}

function positiveId(value: unknown) {
  const parsed = positiveNumber(value);
  return parsed ? String(parsed) : null;
}

function positiveNumber(value: unknown) {
  const parsed = Math.trunc(numberValue(value, Number.NaN));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function numberAt(value: unknown, index: number) {
  return numberValue(arrayValue(value)[index]);
}

function nullableNumberAt(value: unknown, index: number) {
  return finiteOrNull(arrayValue(value)[index]);
}

function stringAt(value: unknown, index: number) {
  return stringValue(arrayValue(value)[index]);
}

function finiteOrNull(value: unknown) {
  const parsed = numberValue(value, Number.NaN);
  return Number.isFinite(parsed) ? parsed : null;
}

function numberValue(value: unknown, fallback = 0) {
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function stringValue(value: unknown) {
  return value == null ? "" : String(value).trim();
}

function booleanValue(value: unknown) {
  const normalized = stringValue(value).toLowerCase();
  return value === true || value === 1 || normalized === "true" || normalized === "1";
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? [...value] : [];
}

function rowTimestamp(row: CyberScoutPayloadRow) {
  const parsed = Date.parse(row.uploaded_at ?? row.client_created_at ?? row.created_at ?? "");
  return Number.isFinite(parsed) ? parsed : 0;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}
