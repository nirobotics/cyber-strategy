import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import {
  buildCyberScoutDataset,
  isSafeCyberScoutPhotoPath,
  type CyberScoutEventRow,
  type CyberScoutRecordRow,
} from "./cyber-scout";
import { DEFAULT_DATA_RANGE, type DataRange } from "./data-range";
import { getActiveDataset } from "./datasets.server";
import { buildScoutConfidenceReport, emptyScoutConfidenceReport, type ScoutConfidenceReport } from "./scout-confidence";
import type { DatasetSourceStatus, ScoutingDataset, ScoutingEventOption } from "./scouting";
import { fetchTbaMatches, type TbaMatch } from "./tba.server";

type CyberScoutLoadResult = {
  dataset: ScoutingDataset | null;
  events: ScoutingEventOption[];
  selectedEventKey: string | null;
  status: DatasetSourceStatus;
};

export type StrategyDatasetResult = {
  dataset: ScoutingDataset;
  events: ScoutingEventOption[];
  selectedEventKey: string | null;
  sourceStatus: DatasetSourceStatus;
};

export type ScoutConfidenceResult = {
  report: ScoutConfidenceReport;
  events: ScoutingEventOption[];
  selectedEventKey: string | null;
  sourceStatus: DatasetSourceStatus;
  leadData: ScoutLeadData;
};

type ScoutRecordType = "normal_match" | "super_match";
type ScoutAlliance = "red" | "blue";
type ScoutPosition = "R1" | "R2" | "R3" | "B1" | "B2" | "B3";
type ScoutMatchType = "Q";

export type ScoutLeadRecord = {
  id: string;
  recordType: ScoutRecordType;
  matchNumber: number | null;
  alliance: ScoutAlliance | null;
  position: string | null;
  teamNumber: string | null;
  completedBy: string;
  uploadedAt: string | null;
  clientCreatedAt: string | null;
  label: string;
};

export type ScoutScheduleCell = {
  team: string;
  position: ScoutPosition;
  alliance: ScoutAlliance;
  normalRecords: ScoutLeadRecord[];
  superRecords: ScoutLeadRecord[];
};

export type ScoutScheduleMatch = {
  matchNumber: number;
  red: ScoutScheduleCell[];
  blue: ScoutScheduleCell[];
};

export type ScoutLeadAssignment = {
  id: string;
  matchType: ScoutMatchType;
  startMatch: number;
  endMatch: number;
  position: ScoutPosition;
  userName: string;
};

export type ScoutUserOption = {
  id: string;
  displayName: string;
};

export type ScoutLeadData = {
  recordSchedule: {
    matches: ScoutScheduleMatch[];
    totalRecords: number;
    normalRecords: number;
    superRecords: number;
  };
  assignments: ScoutLeadAssignment[];
  users: ScoutUserOption[];
  configEventKey: string | null;
  configSavedAt: string | null;
};

type ScoutLeadRecordRow = CyberScoutRecordRow & {
  record_type: ScoutRecordType;
  match_type: string | null;
  alliance: string | null;
  position: string | null;
  uploaded_by: string | null;
  device_id: string | null;
  uploadedByName?: string;
};

type ScoutEventConfig = {
  tbaEventKey: string;
  eventName: string;
  teams: number[];
  matches: unknown[];
  assignments: ScoutLeadAssignment[];
  savedAt: string | null;
};

const appSettingsKey = "event_config";
const scoutPositions = ["R1", "R2", "R3", "B1", "B2", "B3"] as const;

let cachedScoutClient: SupabaseClient | null | undefined;

export function getCyberScoutClient(): SupabaseClient | null {
  if (cachedScoutClient !== undefined) return cachedScoutClient;

  const url = process.env.CYBER_SCOUT_SUPABASE_URL;
  const key = process.env.CYBER_SCOUT_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    cachedScoutClient = null;
    return cachedScoutClient;
  }

  cachedScoutClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cachedScoutClient;
}

export async function getStrategyDatasetForRequest(
  request: Request,
  opts: { includedMatchTypes?: DataRange[] } = {},
): Promise<StrategyDatasetResult> {
  const url = new URL(request.url);
  const requestedEventKey = cleanEventKey(url.searchParams.get("event"));
  const scout = await loadCyberScoutDataset(requestedEventKey, opts.includedMatchTypes);
  if (scout.dataset) {
    return {
      dataset: scout.dataset,
      events: scout.events,
      selectedEventKey: scout.dataset.eventKey,
      sourceStatus: scout.status,
    };
  }

  const fallback = await getActiveDataset();
  return {
    dataset: fallback,
    events: scout.events,
    selectedEventKey: requestedEventKey ?? fallback.eventKey,
    sourceStatus: {
      source: "fallback",
      label: "备用数据",
      message: scout.status.message,
      updatedAt: fallback.updatedAt,
      error: scout.status.error,
    },
  };
}

export async function loadCyberScoutDataset(
  eventKey: string | null,
  includedMatchTypes: DataRange[] = DEFAULT_DATA_RANGE,
): Promise<CyberScoutLoadResult> {
  const db = getCyberScoutClient();
  if (!db) {
    return unavailable(eventKey, "未配置 cyber-scout 数据源。");
  }

  let events: ScoutingEventOption[] = [];
  try {
    const eventRows = await fetchEvents(db);
    events = eventRows.map(toEventOption);
    const event = resolveEvent(eventRows, eventKey);
    if (!event) {
      return {
        dataset: null,
        events,
        selectedEventKey: eventKey,
        status: {
          source: "fallback",
          label: "备用数据",
          message: eventKey ? `cyber-scout 未找到赛事 ${eventKey}。` : "cyber-scout 没有当前赛事。",
          updatedAt: null,
        },
      };
    }

    const records = await fetchRecords(db, event.id);
    let tbaMatches: TbaMatch[] = [];
    let tbaError: string | null = null;
    try {
      tbaMatches = await fetchTbaMatches(event.tba_event_key);
    } catch (error) {
      tbaError = error instanceof Error ? error.message : "读取 TBA 失败";
    }
    const dataset = buildCyberScoutDataset({ event, records, tbaMatches, includedMatchTypes });
    const scoringError = tbaError
      ? `${tbaError}；已忽略需要 TBA 分项的比赛记录。`
      : dataset.scoringIgnoredMatches > 0
        ? `已忽略 ${dataset.scoringIgnoredMatches} 条缺少 TBA 分项或无法按比例分配的比赛记录。`
        : undefined;
    return {
      dataset,
      events,
      selectedEventKey: event.tba_event_key,
      status: {
        source: "cyber-scout",
        label: "Scout 实时数据",
        message: `${event.name || event.tba_event_key} · ${records.length} 条原始记录${scoringError ? " · 部分比赛已忽略" : ""}`,
        updatedAt: dataset.updatedAt,
        error: scoringError,
      },
    };
  } catch (error) {
    return {
      dataset: null,
      events,
      selectedEventKey: eventKey,
      status: {
        source: "fallback",
        label: "备用数据",
        message: "读取 cyber-scout 失败，已回落到已保存数据集。",
        updatedAt: null,
        error: error instanceof Error ? error.message : "unknown error",
      },
    };
  }
}

export async function loadScoutConfidenceForRequest(request: Request): Promise<ScoutConfidenceResult> {
  const url = new URL(request.url);
  return loadScoutConfidenceReport(cleanEventKey(url.searchParams.get("event")));
}

export async function loadScoutConfidenceReport(eventKey: string | null): Promise<ScoutConfidenceResult> {
  const db = getCyberScoutClient();
  if (!db) {
    return emptyConfidenceResult(eventKey, {
      source: "fallback",
      label: "Scout 未配置",
      message: "未配置 cyber-scout 数据源。",
      updatedAt: null,
    });
  }

  let events: ScoutingEventOption[] = [];
  try {
    const eventRows = await fetchEvents(db);
    events = eventRows.map(toEventOption);
    const event = resolveEvent(eventRows, eventKey);
    if (!event) {
      return {
        report: emptyScoutConfidenceReport(),
        events,
        selectedEventKey: eventKey,
        sourceStatus: {
          source: "fallback",
          label: "无赛事",
          message: eventKey ? `cyber-scout 未找到赛事 ${eventKey}。` : "cyber-scout 没有当前赛事。",
          updatedAt: null,
        },
        leadData: emptyLeadData(),
      };
    }

    const records = await fetchNormalRecords(db, event.id);
    const [leadRecords, users, eventConfig] = await Promise.all([
      fetchLeadRecords(db, event.id),
      fetchScoutUsers(db),
      fetchScoutEventConfig(db),
    ]);
    let tbaMatches: TbaMatch[] = [];
    let tbaError: string | null = null;
    try {
      tbaMatches = await fetchTbaMatches(event.tba_event_key);
    } catch (error) {
      tbaError = error instanceof Error ? error.message : "读取 TBA 失败";
    }

    return {
      report: buildScoutConfidenceReport({ records, tbaMatches }),
      events,
      selectedEventKey: event.tba_event_key,
      sourceStatus: {
        source: "cyber-scout",
        label: "Scout 信心分",
        message: `${event.name || event.tba_event_key} · ${records.length} 条普通侦察记录${tbaError ? " · TBA 暂不可用" : ""}`,
        updatedAt: latestRowTimestamp(records) ?? event.updated_at,
        error: tbaError ?? undefined,
      },
      leadData: {
        recordSchedule: buildScoutRecordSchedule(tbaMatches, leadRecords),
        assignments: eventConfig.assignments,
        users,
        configEventKey: eventConfig.tbaEventKey || null,
        configSavedAt: eventConfig.savedAt,
      },
    };
  } catch (error) {
    return {
      report: emptyScoutConfidenceReport(),
      events,
      selectedEventKey: eventKey,
      sourceStatus: {
        source: "fallback",
        label: "读取失败",
        message: "读取 cyber-scout 信心分失败。",
        updatedAt: null,
        error: error instanceof Error ? error.message : "unknown error",
      },
      leadData: emptyLeadData(),
    };
  }
}

export async function deleteCyberScoutRecord(recordId: string) {
  const id = cleanUuid(recordId);
  if (!id) throw new Error("记录 ID 无效。");
  const db = getCyberScoutClient();
  if (!db) throw new Error("cyber-scout 数据源未配置。");

  const existing = await db.from("scouting_records").select("id,payload").eq("id", id).maybeSingle();
  if (existing.error) throw existing.error;
  if (!existing.data) return false;

  const photoPaths = readPhotoPaths(existing.data.payload);
  if (photoPaths.length) {
    const removed = await db.storage.from("pit-photos").remove(photoPaths);
    if (removed.error) throw removed.error;
  }

  const deleted = await db.from("scouting_records").delete().eq("id", id);
  if (deleted.error) throw deleted.error;
  return true;
}

export async function saveCyberScoutAssignment(input: {
  id?: string | null;
  eventKey?: string | null;
  startMatch: number;
  endMatch: number;
  position: string;
  userName: string;
}) {
  const db = getCyberScoutClient();
  if (!db) throw new Error("cyber-scout 数据源未配置。");
  const config = await fetchScoutEventConfig(db);
  const assignment = normalizeAssignment({
    id: input.id || randomUUID(),
    matchType: "Q",
    startMatch: input.startMatch,
    endMatch: input.endMatch,
    position: input.position,
    userName: input.userName,
  });
  if (!assignment) throw new Error("分配内容无效。");

  const next: ScoutEventConfig = {
    ...config,
    tbaEventKey: input.eventKey || config.tbaEventKey,
    assignments: [...config.assignments.filter((item) => item.id !== assignment.id), assignment].sort(compareAssignments),
  };
  await saveScoutEventConfig(db, next);
}

export async function deleteCyberScoutAssignment(id: string) {
  const db = getCyberScoutClient();
  if (!db) throw new Error("cyber-scout 数据源未配置。");
  const config = await fetchScoutEventConfig(db);
  await saveScoutEventConfig(db, {
    ...config,
    assignments: config.assignments.filter((assignment) => assignment.id !== id),
  });
}

export async function downloadCyberScoutPhoto(path: string): Promise<Response> {
  if (!isSafeCyberScoutPhotoPath(path)) {
    throw new Response("无效照片路径", { status: 400 });
  }

  const db = getCyberScoutClient();
  if (!db) throw new Response("cyber-scout 数据源未配置", { status: 503 });

  const { data, error } = await db.storage.from("pit-photos").download(path);
  if (error || !data) throw new Response("照片不存在", { status: 404 });

  return new Response(data, {
    headers: {
      "Content-Type": data.type || inferImageType(path),
      "Cache-Control": "private, max-age=300",
    },
  });
}

export function __resetCyberScoutClientForTests() {
  cachedScoutClient = undefined;
}

function unavailable(eventKey: string | null, message: string): CyberScoutLoadResult {
  return {
    dataset: null,
    events: [],
    selectedEventKey: eventKey,
    status: {
      source: "fallback",
      label: "备用数据",
      message,
      updatedAt: null,
    },
  };
}

async function fetchEvents(db: SupabaseClient): Promise<CyberScoutEventRow[]> {
  const { data, error } = await db
    .from("scouting_events")
    .select("id,tba_event_key,name,is_active,updated_at")
    .order("is_active", { ascending: false })
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as CyberScoutEventRow[];
}

async function fetchRecords(db: SupabaseClient, eventId: string): Promise<CyberScoutRecordRow[]> {
  const { data, error } = await db
    .from("scouting_records")
    .select("id,record_type,match_number,team_number,payload,uploaded_at,client_created_at,created_at")
    .eq("event_id", eventId)
    .in("record_type", ["normal_match", "super_match", "pit"])
    .order("uploaded_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as CyberScoutRecordRow[];
}

async function fetchNormalRecords(db: SupabaseClient, eventId: string): Promise<CyberScoutRecordRow[]> {
  const { data, error } = await db
    .from("scouting_records")
    .select("id,record_type,match_number,team_number,payload,uploaded_at,client_created_at,created_at")
    .eq("event_id", eventId)
    .eq("record_type", "normal_match")
    .order("uploaded_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as CyberScoutRecordRow[];
}

async function fetchLeadRecords(db: SupabaseClient, eventId: string): Promise<ScoutLeadRecordRow[]> {
  const { data, error } = await db
    .from("scouting_records")
    .select("id,record_type,match_type,match_number,alliance,position,team_number,payload,device_id,client_created_at,uploaded_at,uploaded_by,created_at")
    .eq("event_id", eventId)
    .in("record_type", ["normal_match", "super_match"])
    .order("match_number", { ascending: true })
    .order("uploaded_at", { ascending: false });
  if (error) throw error;

  const records = (data ?? []) as ScoutLeadRecordRow[];
  const userIds = [...new Set(records.map((record) => record.uploaded_by).filter((value): value is string => Boolean(value)))];
  if (!userIds.length) return records;

  const users = await fetchScoutUsersById(db, userIds);
  return records.map((record) => ({
    ...record,
    uploadedByName: record.uploaded_by ? users.get(record.uploaded_by) ?? "" : "",
  }));
}

async function fetchScoutUsers(db: SupabaseClient): Promise<ScoutUserOption[]> {
  const { data, error } = await db
    .from("user_profiles")
    .select("id,display_name")
    .order("display_name", { ascending: true });
  if (error) throw error;
  return (data ?? [])
    .map((row) => ({
      id: String(row.id),
      displayName: String(row.display_name ?? "").trim(),
    }))
    .filter((user) => user.displayName);
}

async function fetchScoutUsersById(db: SupabaseClient, ids: string[]): Promise<Map<string, string>> {
  const { data, error } = await db.from("user_profiles").select("id,display_name").in("id", ids);
  if (error) throw error;
  return new Map((data ?? []).map((row) => [String(row.id), String(row.display_name ?? "").trim()]));
}

async function fetchScoutEventConfig(db: SupabaseClient): Promise<ScoutEventConfig> {
  const { data, error } = await db.from("app_settings").select("config,updated_at").eq("key", appSettingsKey).maybeSingle();
  if (error) throw error;
  if (!data) return emptyScoutEventConfig();
  return normalizeScoutEventConfig({ ...objectValue(data.config), savedAt: data.updated_at });
}

async function saveScoutEventConfig(db: SupabaseClient, config: ScoutEventConfig) {
  const savedAt = new Date().toISOString();
  const next = normalizeScoutEventConfig({ ...config, savedAt });
  const { error } = await db.from("app_settings").upsert(
    {
      key: appSettingsKey,
      config: {
        schemaVersion: 1,
        tbaEventKey: next.tbaEventKey,
        eventName: next.eventName,
        teams: next.teams,
        matches: next.matches,
        assignments: next.assignments,
        savedAt,
      },
      updated_at: savedAt,
    },
    { onConflict: "key" },
  );
  if (error) throw error;
}

function buildScoutRecordSchedule(tbaMatches: TbaMatch[], rows: ScoutLeadRecordRow[]): ScoutLeadData["recordSchedule"] {
  const records = rows.map(toLeadRecord);
  const normalByMatchTeam = groupRecords(records.filter((record) => record.recordType === "normal_match" && record.teamNumber), (record) =>
    `${record.matchNumber}:${record.teamNumber}`,
  );
  const superByMatchAlliance = groupRecords(records.filter((record) => record.recordType === "super_match" && record.alliance), (record) =>
    `${record.matchNumber}:${record.alliance}`,
  );
  const matches = buildTbaSchedule(tbaMatches, normalByMatchTeam, superByMatchAlliance);
  return {
    matches: matches.length ? matches : buildRecordOnlySchedule(records, normalByMatchTeam, superByMatchAlliance),
    totalRecords: records.length,
    normalRecords: records.filter((record) => record.recordType === "normal_match").length,
    superRecords: records.filter((record) => record.recordType === "super_match").length,
  };
}

function buildTbaSchedule(
  tbaMatches: TbaMatch[],
  normalByMatchTeam: Map<string, ScoutLeadRecord[]>,
  superByMatchAlliance: Map<string, ScoutLeadRecord[]>,
): ScoutScheduleMatch[] {
  return [...tbaMatches]
    .filter((match) => match.comp_level === "qm" && positiveInteger(match.match_number))
    .sort((left, right) => (left.match_number ?? 0) - (right.match_number ?? 0))
    .map((match) => {
      const matchNumber = match.match_number ?? 0;
      return {
        matchNumber,
        red: buildAllianceCells(matchNumber, "red", match.alliances?.red?.team_keys ?? [], normalByMatchTeam, superByMatchAlliance),
        blue: buildAllianceCells(matchNumber, "blue", match.alliances?.blue?.team_keys ?? [], normalByMatchTeam, superByMatchAlliance),
      };
    })
    .filter((match) => match.red.length || match.blue.length);
}

function buildAllianceCells(
  matchNumber: number,
  alliance: ScoutAlliance,
  teamKeys: Array<string | number>,
  normalByMatchTeam: Map<string, ScoutLeadRecord[]>,
  superByMatchAlliance: Map<string, ScoutLeadRecord[]>,
): ScoutScheduleCell[] {
  return teamKeys.map((teamKey, index) => {
    const team = teamKeyToNumber(teamKey);
    const position = `${alliance === "red" ? "R" : "B"}${index + 1}` as ScoutPosition;
    return {
      team,
      position,
      alliance,
      normalRecords: normalByMatchTeam.get(`${matchNumber}:${team}`) ?? [],
      superRecords: superByMatchAlliance.get(`${matchNumber}:${alliance}`) ?? [],
    };
  }).filter((cell) => cell.team);
}

function buildRecordOnlySchedule(
  records: ScoutLeadRecord[],
  normalByMatchTeam: Map<string, ScoutLeadRecord[]>,
  superByMatchAlliance: Map<string, ScoutLeadRecord[]>,
): ScoutScheduleMatch[] {
  const byMatch = new Map<number, ScoutScheduleMatch>();
  for (const record of records) {
    if (!record.matchNumber || !record.teamNumber || !isScoutPosition(record.position)) continue;
    const alliance = record.position.startsWith("R") ? "red" : "blue";
    const match = byMatch.get(record.matchNumber) ?? { matchNumber: record.matchNumber, red: [], blue: [] };
    const cell: ScoutScheduleCell = {
      team: record.teamNumber,
      position: record.position,
      alliance,
      normalRecords: normalByMatchTeam.get(`${record.matchNumber}:${record.teamNumber}`) ?? [],
      superRecords: superByMatchAlliance.get(`${record.matchNumber}:${alliance}`) ?? [],
    };
    const list = alliance === "red" ? match.red : match.blue;
    if (!list.some((item) => item.team === cell.team && item.position === cell.position)) list.push(cell);
    byMatch.set(record.matchNumber, match);
  }
  return [...byMatch.values()]
    .map((match) => ({
      ...match,
      red: match.red.sort(compareCells),
      blue: match.blue.sort(compareCells),
    }))
    .sort((left, right) => left.matchNumber - right.matchNumber);
}

function toLeadRecord(row: ScoutLeadRecordRow): ScoutLeadRecord {
  const payload = objectValue(row.payload);
  const recordType = row.record_type;
  const matchNumber = positiveInteger(row.match_number) ?? positiveInteger(payload.matchNumber);
  const teamNumber = teamKeyToNumber(row.team_number ?? payload.teamNumber);
  const alliance = scoutAlliance(row.alliance ?? payload.alliance);
  const position = stringValue(row.position ?? payload.position);
  const completedBy = stringValue(payload.scout) || row.uploadedByName || "未知";
  const uploadedAt = row.uploaded_at ?? row.client_created_at ?? row.created_at;
  return {
    id: row.id,
    recordType,
    matchNumber,
    alliance,
    position: position || null,
    teamNumber: teamNumber || null,
    completedBy,
    uploadedAt,
    clientCreatedAt: row.client_created_at,
    label: recordType === "normal_match"
      ? `普通 Scout · Team ${teamNumber || "-"} · ${position || "-"}`
      : `超级 Scout · ${alliance === "red" ? "红方" : alliance === "blue" ? "蓝方" : "联盟"}`,
  };
}

function emptyLeadData(): ScoutLeadData {
  return {
    recordSchedule: { matches: [], totalRecords: 0, normalRecords: 0, superRecords: 0 },
    assignments: [],
    users: [],
    configEventKey: null,
    configSavedAt: null,
  };
}

function emptyScoutEventConfig(): ScoutEventConfig {
  return {
    tbaEventKey: "",
    eventName: "",
    teams: [],
    matches: [],
    assignments: [],
    savedAt: null,
  };
}

function normalizeScoutEventConfig(value: unknown): ScoutEventConfig {
  const record = objectValue(value);
  const assignments = Array.isArray(record.assignments)
    ? record.assignments.map(normalizeAssignment).filter((assignment): assignment is ScoutLeadAssignment => Boolean(assignment))
    : [];
  return {
    tbaEventKey: stringValue(record.tbaEventKey),
    eventName: stringValue(record.eventName),
    teams: Array.isArray(record.teams) ? record.teams.filter((team): team is number => positiveInteger(team) !== null).map(Number) : [],
    matches: Array.isArray(record.matches) ? record.matches : [],
    assignments: assignments.sort(compareAssignments),
    savedAt: typeof record.savedAt === "string" ? record.savedAt : null,
  };
}

function normalizeAssignment(value: unknown): ScoutLeadAssignment | null {
  const record = objectValue(value);
  const startMatch = positiveInteger(record.startMatch);
  const endMatch = positiveInteger(record.endMatch);
  if (!startMatch || !endMatch || !isScoutPosition(record.position)) return null;
  const userName = stringValue(record.userName);
  if (!userName) return null;
  return {
    id: stringValue(record.id) || randomUUID(),
    matchType: "Q",
    startMatch: Math.min(startMatch, endMatch),
    endMatch: Math.max(startMatch, endMatch),
    position: record.position,
    userName,
  };
}

function resolveEvent(events: CyberScoutEventRow[], eventKey: string | null): CyberScoutEventRow | null {
  if (eventKey) return events.find((event) => event.tba_event_key === eventKey) ?? null;
  return events.find((event) => event.is_active) ?? null;
}

function toEventOption(event: CyberScoutEventRow): ScoutingEventOption {
  return {
    eventKey: event.tba_event_key,
    name: event.name,
    isActive: event.is_active,
    updatedAt: event.updated_at,
  };
}

function cleanEventKey(value: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed && /^[a-z0-9_-]+$/i.test(trimmed) ? trimmed : null;
}

function cleanUuid(value: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(trimmed)
    ? trimmed
    : null;
}

function groupRecords(records: ScoutLeadRecord[], keyFor: (record: ScoutLeadRecord) => string) {
  const groups = new Map<string, ScoutLeadRecord[]>();
  for (const record of records) {
    const key = keyFor(record);
    groups.set(key, [...(groups.get(key) ?? []), record]);
  }
  return groups;
}

function compareCells(left: ScoutScheduleCell, right: ScoutScheduleCell) {
  return scoutPositions.indexOf(left.position) - scoutPositions.indexOf(right.position);
}

function compareAssignments(left: ScoutLeadAssignment, right: ScoutLeadAssignment) {
  return left.startMatch - right.startMatch || left.endMatch - right.endMatch || scoutPositions.indexOf(left.position) - scoutPositions.indexOf(right.position);
}

function teamKeyToNumber(value: unknown) {
  if (typeof value === "number") return value > 0 ? String(value) : "";
  const match = String(value ?? "").match(/\d+/);
  return match ? match[0] : "";
}

function scoutAlliance(value: unknown): ScoutAlliance | null {
  return value === "red" || value === "blue" ? value : null;
}

function isScoutPosition(value: unknown): value is ScoutPosition {
  return typeof value === "string" && scoutPositions.includes(value as ScoutPosition);
}

function positiveInteger(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readPhotoPaths(payload: unknown) {
  const photoPaths = objectValue(payload).photoPaths;
  return Array.isArray(photoPaths) ? photoPaths.filter((path): path is string => typeof path === "string" && isSafeCyberScoutPhotoPath(path)) : [];
}

function emptyConfidenceResult(eventKey: string | null, sourceStatus: DatasetSourceStatus): ScoutConfidenceResult {
  return {
    report: emptyScoutConfidenceReport(),
    events: [],
    selectedEventKey: eventKey,
    sourceStatus,
    leadData: emptyLeadData(),
  };
}

function latestRowTimestamp(rows: CyberScoutRecordRow[]) {
  return rows
    .map((row) => row.uploaded_at ?? row.client_created_at ?? row.created_at)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1) ?? null;
}

function inferImageType(path: string) {
  if (/\.png$/i.test(path)) return "image/png";
  if (/\.webp$/i.test(path)) return "image/webp";
  return "image/jpeg";
}
