import type { SupabaseClient } from "@supabase/supabase-js";
import type { CyberScoutRecordRow } from "./cyber-scout";
import { getCyberScoutClient } from "./cyber-scout.server";
import { matchTypeFromValue, type DataRange } from "./data-range";
import {
  patchNormalTimeOverride,
  patchSuperValues,
  readSuperValues,
  type EditableNormalValues,
  type EditableScoutingRecord,
  type EditableSuperValues,
} from "./editable-scouting";

type MatchQuery = {
  eventKey: string;
  team: string;
  matchType: DataRange;
  matchNumber: number;
  alliance?: "red" | "blue" | null;
};

type EditableRows = {
  normalRows: CyberScoutRecordRow[];
  superRow: CyberScoutRecordRow | null;
};

export async function loadEditableScoutingRecord(query: MatchQuery): Promise<EditableScoutingRecord> {
  const db = requireCyberScoutClient();
  const rows = await findEditableRows(db, query);
  return toEditableRecord(query, rows);
}

export async function saveEditableScoutingRecord({
  query,
  normal,
  superValues,
  updatedBy,
}: {
  query: MatchQuery;
  normal: EditableNormalValues | null;
  superValues: EditableSuperValues | null;
  updatedBy: string;
}): Promise<EditableScoutingRecord> {
  validateNormal(normal);
  validateSuper(superValues);
  const db = requireCyberScoutClient();
  const rows = await findEditableRows(db, query);
  if (normal && !rows.normalRows.length) throw new Error("这支队伍本场没有 Normal Scout 记录");
  if (superValues && !rows.superRow) throw new Error("这支队伍本场没有 Super Scout 记录");

  const updatedAt = new Date().toISOString();
  const updates = rows.normalRows.map((row) => normal
    ? updatePayload(db, row.id, patchNormalTimeOverride(row.payload, normal, { updatedAt, updatedBy }))
    : Promise.resolve());
  if (superValues && rows.superRow) {
    updates.push(updatePayload(db, rows.superRow.id, patchSuperValues(rows.superRow.payload, query.team, superValues)));
  }
  await Promise.all(updates);
  return loadEditableScoutingRecord(query);
}

async function findEditableRows(db: SupabaseClient, query: MatchQuery): Promise<EditableRows> {
  const { data: event, error: eventError } = await db
    .from("scouting_events")
    .select("id")
    .eq("tba_event_key", query.eventKey)
    .maybeSingle();
  if (eventError) throw eventError;
  if (!event) throw new Error(`CyberScout 中没有赛事 ${query.eventKey}`);

  const { data, error } = await db
    .from("scouting_records")
    .select("id,record_type,match_type,match_number,alliance,team_number,payload,uploaded_at,client_created_at,created_at")
    .eq("event_id", event.id)
    .eq("match_number", query.matchNumber)
    .in("record_type", ["normal_match", "super_match"])
    .order("uploaded_at", { ascending: false });
  if (error) throw error;

  const records = (data ?? []) as CyberScoutRecordRow[];
  const matchingType = records.filter((row) => recordMatchType(row) === query.matchType);
  const normalRows = matchingType.filter((row) => row.record_type === "normal_match" && recordTeam(row) === query.team);
  const superRow = matchingType.find((row) => {
    if (row.record_type !== "super_match" || !readSuperValues(row.payload, query.team)) return false;
    return !query.alliance || normalizeAlliance(row.alliance ?? objectValue(row.payload).alliance) === query.alliance;
  }) ?? null;
  return { normalRows, superRow };
}

function toEditableRecord(query: MatchQuery, rows: EditableRows): EditableScoutingRecord {
  const normalTimes = rows.normalRows.map((row) => readNormalTimes(row.payload));
  const shootingMs = normalTimes.reduce((sum, value) => sum + value.shootingMs, 0);
  const transferMs = normalTimes.reduce((sum, value) => sum + value.transferShootingMs, 0);
  return {
    eventKey: query.eventKey,
    team: query.team,
    matchType: query.matchType,
    matchNumber: query.matchNumber,
    normal: rows.normalRows.length ? {
      recordCount: rows.normalRows.length,
      shootingSeconds: round1(shootingMs / rows.normalRows.length / 1000),
      transferSeconds: round1(transferMs / rows.normalRows.length / 1000),
    } : null,
    super: rows.superRow ? readSuperValues(rows.superRow.payload, query.team) : null,
  };
}

function readNormalTimes(payload: unknown) {
  const value = objectValue(payload);
  const override = objectValue(value.strategyOverride);
  const shootingMs = finiteNumber(override.shootingMs);
  const transferShootingMs = finiteNumber(override.transferShootingMs);
  if (shootingMs != null && transferShootingMs != null) return { shootingMs, transferShootingMs };

  const shots = [...timedPeriods(value.manualShotWhileIntaking ?? value.wi), ...timedPeriods(value.manualShotDirect ?? value.sd)];
  const zones = zoneIntervals(value);
  let scoringMs = 0;
  let transferMs = 0;
  for (const shot of shots) {
    for (const zone of zones) {
      const overlap = Math.max(0, Math.min(shot.endMs, zone.endMs) - Math.max(shot.startMs, zone.startMs));
      if (zone.kind === "alliance") scoringMs += overlap;
      if (zone.kind === "transfer") transferMs += overlap;
    }
  }
  return { shootingMs: scoringMs, transferShootingMs: transferMs };
}

function zoneIntervals(payload: Record<string, unknown>) {
  const events = arrayValue(payload.manualZoneEvents ?? payload.me).map((value) => {
    const event = objectValue(value);
    const atMs = finiteNumber(event.atMs ?? event.a);
    const kind = zoneKind(event.zone);
    return atMs == null || !kind ? null : { atMs, kind };
  }).filter((value): value is { atMs: number; kind: "alliance" | "transfer" } => Boolean(value)).sort((a, b) => a.atMs - b.atMs);
  if (!events.length) {
    const kind = zoneKind(payload.manualZone ?? payload.mz ?? payload.finalZone ?? payload.fz);
    return kind ? [{ startMs: 0, endMs: Number.POSITIVE_INFINITY, kind }] : [];
  }
  return events.map((event, index) => ({ startMs: event.atMs, endMs: events[index + 1]?.atMs ?? Number.POSITIVE_INFINITY, kind: event.kind }));
}

function timedPeriods(value: unknown) {
  return arrayValue(value).map((period) => {
    const item = objectValue(period);
    return { startMs: finiteNumber(item.startMs ?? item.s) ?? 0, endMs: finiteNumber(item.endMs ?? item.e) ?? 0 };
  });
}

function zoneKind(value: unknown): "alliance" | "transfer" | null {
  const zone = String(value ?? "").trim().toLowerCase();
  if (["联盟", "alliance", "a"].includes(zone)) return "alliance";
  if (["中立", "对方", "neutral", "opponent", "n", "o"].includes(zone)) return "transfer";
  return null;
}

async function updatePayload(db: SupabaseClient, id: string, payload: Record<string, unknown>) {
  const { error } = await db.from("scouting_records").update({ payload }).eq("id", id);
  if (error) throw error;
}

function validateNormal(value: EditableNormalValues | null) {
  if (!value) return;
  assertRange("射击时间", value.shootingSeconds, 0, 150);
  assertRange("Transfer 时间", value.transferSeconds, 0, 150);
}

function validateSuper(value: EditableSuperValues | null) {
  if (!value) return;
  assertRange("Drive Score", value.driveScore, 0, 5);
  assertRange("Defense Score", value.defenseScore, 0, 5);
  assertRange("准确度", value.accuracy, 0, 100);
  assertRange("BPS", value.bps, 0, 35);
}

function assertRange(label: string, value: number, min: number, max: number) {
  if (!Number.isFinite(value) || value < min || value > max) throw new Error(`${label} 必须在 ${min}–${max} 之间`);
}

function recordMatchType(row: CyberScoutRecordRow) {
  const payload = objectValue(row.payload);
  return matchTypeFromValue(row.match_type ?? payload.matchType ?? payload.mt ?? payload.compLevel ?? payload.comp_level);
}

function recordTeam(row: CyberScoutRecordRow) {
  const payload = objectValue(row.payload);
  return teamNumber(row.team_number ?? payload.teamNumber);
}

function normalizeAlliance(value: unknown) {
  const alliance = String(value ?? "").toLowerCase();
  return alliance === "red" || alliance === "r" ? "red" : alliance === "blue" || alliance === "b" ? "blue" : null;
}

function requireCyberScoutClient() {
  const db = getCyberScoutClient();
  if (!db) throw new Error("未配置 CyberScout Supabase");
  return db;
}

function teamNumber(value: unknown) {
  const match = String(value ?? "").match(/\d+/);
  return match?.[0] ?? "";
}

function finiteNumber(value: unknown) {
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}
