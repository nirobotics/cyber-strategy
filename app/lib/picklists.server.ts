import { appendAudit } from "./audit.server";
import { getClient } from "./supabase.server";
import {
  canCreateMainPicklist,
  canEditSharedPicklist,
  normalizePicklistBoard,
  visiblePicklistsForEvent,
  type PicklistKind,
  type SharedPicklist,
} from "./picklist";

type PicklistSettingRow = { key: string; value: unknown; updated_by: string | null; updated_at: string };
type StoredPicklist = Omit<SharedPicklist, "createdByName" | "updatedAt">;

export async function listPicklists(eventKey: string, actorOpenId: string, admin: boolean): Promise<SharedPicklist[]> {
  const sb = getClient();
  if (!sb) return [];
  const cleanedEventKey = cleanEventKey(eventKey);
  const { data, error } = await sb.from("app_settings")
    .select("key,value,updated_by,updated_at")
    .like("key", `picklist:%:${cleanedEventKey}:%`)
    .order("updated_at", { ascending: false });
  if (error) throw new Response("加载 Picklist 失败", { status: 500 });
  const lists = visiblePicklistsForEvent(
    ((data as PicklistSettingRow[] | null) ?? []).map(rowToPicklist).filter((list): list is SharedPicklist => Boolean(list)),
    cleanedEventKey,
    actorOpenId,
    admin,
  );
  return hydrateCreatorNames(lists);
}

export async function createMainPicklist(opts: { eventKey: string; name: string; actorOpenId: string; isAdmin: boolean }) {
  if (!canCreateMainPicklist(opts.isAdmin)) throw new Response("只有管理员可以创建 Main Picklist", { status: 403 });
  const eventKey = cleanEventKey(opts.eventKey);
  const name = requireName(opts.name);
  const sb = requireClient();
  const now = new Date().toISOString();
  const list: StoredPicklist = {
    id: crypto.randomUUID(),
    clientId: null,
    eventKey,
    name,
    kind: "main",
    board: normalizePicklistBoard(null),
    createdBy: opts.actorOpenId,
    submittedAt: null,
  };
  const { data, error } = await sb.from("app_settings").insert({
    key: settingKey(list),
    value: list,
    updated_by: opts.actorOpenId,
  }).select("key,value,updated_by,updated_at").single();
  if (error || !data) throw new Response("创建 Main Picklist 失败", { status: 500 });
  await appendAudit("picklist.main.create", { actorOpenId: opts.actorOpenId, changedFields: ["event_key", "name", "kind"] });
  return rowToPicklist(data as PicklistSettingRow) ?? { ...list, createdByName: opts.actorOpenId, updatedAt: now };
}

export async function saveMainPicklist(opts: { id: string; board: unknown; actorOpenId: string; isAdmin: boolean }) {
  const stored = await getPicklist(opts.id);
  if (!stored) throw new Response("Main Picklist 不存在", { status: 404 });
  const { row, list } = stored;
  if (list.kind !== "main" || !canEditSharedPicklist(list, opts.actorOpenId, opts.isAdmin)) throw new Response("无权修改 Main Picklist", { status: 403 });
  const sb = requireClient();
  const value: StoredPicklist = { ...toStored(list), board: normalizePicklistBoard(opts.board) };
  const { data, error } = await sb.from("app_settings").update({ value, updated_by: opts.actorOpenId }).eq("key", row.key).select("key,value,updated_by,updated_at").single();
  if (error || !data) throw new Response("保存 Main Picklist 失败", { status: 500 });
  await appendAudit("picklist.main.save", { actorOpenId: opts.actorOpenId, changedFields: ["board"] });
  return rowToPicklist(data as PicklistSettingRow)!;
}

export async function submitPersonalPicklist(opts: {
  eventKey: string;
  clientId: string;
  name: string;
  board: unknown;
  actorOpenId: string;
}) {
  const eventKey = cleanEventKey(opts.eventKey);
  const clientId = cleanClientId(opts.clientId);
  const name = requireName(opts.name);
  const sb = requireClient();
  const { data: rows, error: readError } = await sb.from("app_settings")
    .select("key,value,updated_by,updated_at")
    .like("key", `picklist:personal:${eventKey}:%`);
  if (readError) throw new Response("提交 Personal Picklist 失败", { status: 500 });
  const existing = ((rows as PicklistSettingRow[] | null) ?? [])
    .map((row) => ({ row, list: rowToPicklist(row) }))
    .find(({ list }) => list?.eventKey === eventKey && list.createdBy === opts.actorOpenId && list.clientId === clientId);
  const list: StoredPicklist = {
    id: existing?.list?.id ?? crypto.randomUUID(),
    clientId,
    eventKey,
    name,
    kind: "personal",
    board: normalizePicklistBoard(opts.board),
    createdBy: opts.actorOpenId,
    submittedAt: new Date().toISOString(),
  };
  const values = { key: settingKey(list), value: list, updated_by: opts.actorOpenId };
  const request = existing
    ? sb.from("app_settings").update(values).eq("key", existing.row.key).select("key,value,updated_by,updated_at").single()
    : sb.from("app_settings").insert(values).select("key,value,updated_by,updated_at").single();
  const { data, error } = await request;
  if (error || !data) throw new Response("提交 Personal Picklist 失败", { status: 500 });
  await appendAudit("picklist.personal.submit", { actorOpenId: opts.actorOpenId, changedFields: ["event_key", "client_id", "name", "board", "submitted_at"] });
  return rowToPicklist(data as PicklistSettingRow)!;
}

export async function deletePersonalPicklist(opts: { id: string; actorOpenId: string }) {
  const stored = await getPicklist(opts.id);
  if (!stored) throw new Response("Personal Picklist 不存在", { status: 404 });
  if (stored.list.kind !== "personal" || stored.list.createdBy !== opts.actorOpenId) throw new Response("无权删除 Personal Picklist", { status: 403 });
  const { error } = await requireClient().from("app_settings").delete().eq("key", stored.row.key);
  if (error) throw new Response("删除 Personal Picklist 失败", { status: 500 });
  await appendAudit("picklist.personal.delete", { actorOpenId: opts.actorOpenId, changedFields: ["picklist"] });
  return stored.list.id;
}

async function getPicklist(id: string): Promise<{ row: PicklistSettingRow; list: SharedPicklist } | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const sb = getClient();
  if (!sb) return null;
  const { data, error } = await sb.from("app_settings")
    .select("key,value,updated_by,updated_at")
    .like("key", `picklist:%:%:${id}`)
    .maybeSingle();
  if (error) throw new Response("加载 Picklist 失败", { status: 500 });
  const row = data as PicklistSettingRow | null;
  const list = row ? rowToPicklist(row) : null;
  return row && list ? { row, list } : null;
}

function rowToPicklist(row: PicklistSettingRow): SharedPicklist | null {
  if (!row.value || typeof row.value !== "object") return null;
  const value = row.value as Partial<StoredPicklist>;
  const id = String(value.id ?? "");
  if (value.kind !== "main" && value.kind !== "personal") return null;
  const kind: PicklistKind = value.kind;
  const eventKey = String(value.eventKey ?? "");
  const clientId = kind === "personal" ? String(value.clientId ?? "") : "";
  if (!/^[0-9a-f-]{36}$/i.test(id) || !/^[0-9]{4}[a-z0-9_-]{2,32}$/.test(eventKey)) return null;
  if (kind === "personal" && !/^[a-zA-Z0-9_-]{1,80}$/.test(clientId)) return null;
  if (row.key !== `picklist:${kind}:${eventKey}:${id}`) return null;
  return {
    id,
    clientId: kind === "personal" ? clientId : null,
    eventKey,
    name: cleanName(String(value.name ?? ""), kind === "main" ? "Main Picklist" : "Personal Picklist"),
    kind,
    board: normalizePicklistBoard(value.board),
    createdBy: value.createdBy ? String(value.createdBy) : row.updated_by,
    createdByName: value.createdBy ? String(value.createdBy) : row.updated_by ?? "未知",
    submittedAt: value.submittedAt ? String(value.submittedAt) : null,
    updatedAt: row.updated_at,
  };
}

async function hydrateCreatorNames(lists: SharedPicklist[]) {
  const sb = getClient();
  const ids = [...new Set(lists.map((list) => list.createdBy).filter((id): id is string => Boolean(id)))];
  if (!sb || !ids.length) return lists;
  const { data } = await sb.from("profiles").select("open_id,name").in("open_id", ids);
  const names = new Map(((data as Array<{ open_id: string; name: string }> | null) ?? []).map((row) => [row.open_id, row.name]));
  return lists.map((list) => ({ ...list, createdByName: list.createdBy ? names.get(list.createdBy) || list.createdBy : "未知" }));
}

function settingKey(list: Pick<StoredPicklist, "kind" | "eventKey" | "id">) {
  return `picklist:${list.kind}:${list.eventKey}:${list.id}`;
}

function toStored(list: SharedPicklist): StoredPicklist {
  const { createdByName: _, updatedAt: __, ...stored } = list;
  return stored;
}

function requireClient() {
  const sb = getClient();
  if (!sb) throw new Response("Supabase 未配置", { status: 503 });
  return sb;
}

function cleanEventKey(value: string) {
  const cleaned = value.trim().toLowerCase();
  if (!/^[0-9]{4}[a-z0-9_-]{2,32}$/.test(cleaned)) throw new Response("赛事无效", { status: 400 });
  return cleaned;
}

function cleanClientId(value: string) {
  const cleaned = value.trim();
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(cleaned)) throw new Response("Personal Picklist ID 无效", { status: 400 });
  return cleaned;
}

function cleanName(value: string, fallback: string) {
  return value.trim().slice(0, 80) || fallback;
}

function requireName(value: string) {
  const name = value.trim().slice(0, 80);
  if (!name) throw new Response("Picklist 名称不能为空", { status: 400 });
  return name;
}
