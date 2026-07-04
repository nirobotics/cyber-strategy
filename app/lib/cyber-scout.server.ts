import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  buildCyberScoutDataset,
  isSafeCyberScoutPhotoPath,
  type CyberScoutEventRow,
  type CyberScoutRecordRow,
} from "./cyber-scout";
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
};

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

export async function getStrategyDatasetForRequest(request: Request): Promise<StrategyDatasetResult> {
  const url = new URL(request.url);
  const requestedEventKey = cleanEventKey(url.searchParams.get("event"));
  const scout = await loadCyberScoutDataset(requestedEventKey);
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

export async function loadCyberScoutDataset(eventKey: string | null): Promise<CyberScoutLoadResult> {
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
    const dataset = buildCyberScoutDataset({ event, records });
    return {
      dataset,
      events,
      selectedEventKey: event.tba_event_key,
      status: {
        source: "cyber-scout",
        label: "Scout 实时数据",
        message: `${event.name || event.tba_event_key} · ${records.length} 条原始记录`,
        updatedAt: dataset.updatedAt,
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
      };
    }

    const records = await fetchNormalRecords(db, event.id);
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
    };
  }
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

function emptyConfidenceResult(eventKey: string | null, sourceStatus: DatasetSourceStatus): ScoutConfidenceResult {
  return {
    report: emptyScoutConfidenceReport(),
    events: [],
    selectedEventKey: eventKey,
    sourceStatus,
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
