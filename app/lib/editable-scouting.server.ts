import type { SupabaseClient } from "@supabase/supabase-js";
import type { CyberScoutRecordRow } from "./cyber-scout";
import { getCyberScoutClient } from "./cyber-scout.server";
import { matchTypeFromValue, type DataRange } from "./data-range";
import {
  editableFieldsFor,
  patchEditableValues,
  readEditableValues,
  validateEditableValues,
  type EditableScoutingRecord,
  type EditableScoutingValues,
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
  normal: EditableScoutingValues | null;
  superValues: EditableScoutingValues | null;
  updatedBy: string;
}): Promise<EditableScoutingRecord> {
  if (normal) validateEditableValues("normal", normal);
  if (superValues) validateEditableValues("super", superValues);
  const db = requireCyberScoutClient();
  const rows = await findEditableRows(db, query);
  if (normal && !rows.normalRows.length) throw new Error("这支队伍本场没有 Normal Scout 记录");
  if (superValues && !rows.superRow) throw new Error("这支队伍本场没有 Super Scout 记录");

  const updatedAt = new Date().toISOString();
  const updates = rows.normalRows.map((row) => normal
    ? updatePayload(db, row.id, {
        ...patchEditableValues(row.payload, query.team, "normal", normal),
        strategyUpdatedAt: updatedAt,
        strategyUpdatedBy: updatedBy,
      })
    : Promise.resolve());
  if (superValues && rows.superRow) {
    updates.push(updatePayload(db, rows.superRow.id, patchEditableValues(rows.superRow.payload, query.team, "super", superValues)));
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
    if (row.record_type !== "super_match" || !readEditableValues(row.payload, query.team, "super")) return false;
    return !query.alliance || normalizeAlliance(row.alliance ?? objectValue(row.payload).alliance) === query.alliance;
  }) ?? null;
  return { normalRows, superRow };
}

function toEditableRecord(query: MatchQuery, rows: EditableRows): EditableScoutingRecord {
  const normalFields = editableFieldsFor("normal");
  const superFields = editableFieldsFor("super");
  return {
    eventKey: query.eventKey,
    team: query.team,
    matchType: query.matchType,
    matchNumber: query.matchNumber,
    normal: rows.normalRows.length && normalFields.length ? {
      recordCount: rows.normalRows.length,
      values: readEditableValues(rows.normalRows[0].payload, query.team, "normal") ?? {},
    } : null,
    super: rows.superRow && superFields.length ? {
      recordCount: 1,
      values: readEditableValues(rows.superRow.payload, query.team, "super") ?? {},
    } : null,
  };
}

async function updatePayload(db: SupabaseClient, id: string, payload: Record<string, unknown>) {
  const { error } = await db.from("scouting_records").update({ payload }).eq("id", id);
  if (error) throw error;
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

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
