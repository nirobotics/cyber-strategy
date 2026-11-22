import { tenantAccessToken } from "./feishu.server";
import { nativeDB, selectRows } from "./native-context.server";
import type { PicklistGroupUser } from "./picklist";
import { getClient } from "./supabase.server";

const API_BASE = process.env.FEISHU_API_BASE || "https://open.feishu.cn";
const MAX_DEPARTMENTS = 120;
const MAX_USERS = 600;
const CACHE_MS = 5 * 60_000;

type Directory = { users: PicklistGroupUser[]; fromProfiles: boolean };
type Department = { department_id?: string; open_department_id?: string };
type Contact = { open_id?: string; user_id?: string; name?: string; en_name?: string; status?: { is_resigned?: boolean; is_frozen?: boolean } };
type Profile = { open_id: string; name: string; is_active?: boolean };
type Cursor = { has_more?: boolean; page_token?: string };

class ContactError extends Error {
  constructor(readonly code: number) { super("Feishu contacts returned " + code); }
}

let cached: { expires: number; users: PicklistGroupUser[] } | undefined;
let pending: Promise<PicklistGroupUser[]> | undefined;

export async function picklistMemberDirectory(): Promise<Directory> {
  const [contacts, profiles] = await Promise.all([
    listFeishuContacts().catch((error: unknown) => {
      console.warn("Picklist Feishu directory unavailable", error instanceof ContactError ? error.code : "request_failed");
      return [];
    }),
    listProfiles().catch(() => {
      console.warn("Picklist profile directory unavailable");
      return [];
    }),
  ]);
  const users = new Map(contacts.map((user) => [user.openId, user]));
  for (const profile of profiles) {
    if (profile.is_active === false) users.delete(profile.open_id);
    else if (profile.open_id && cleanName(profile.name)) users.set(profile.open_id, { openId: profile.open_id, name: cleanName(profile.name) });
  }
  return { users: [...users.values()].sort((a, b) => a.name.localeCompare(b.name, "zh-CN")).slice(0, MAX_USERS), fromProfiles: contacts.length === 0 };
}

async function listProfiles(): Promise<Profile[]> {
  if (nativeDB()) return selectRows<Profile>("SELECT row_json FROM profiles ORDER BY id LIMIT ?", MAX_USERS);
  const client = getClient();
  if (!client) return [];
  const { data, error } = await client.from("profiles").select("open_id,name,is_active").order("open_id").limit(MAX_USERS);
  if (error?.code === "42703") {
    const legacy = await client.from("profiles").select("open_id,name").order("open_id").limit(MAX_USERS);
    if (legacy.error) throw legacy.error;
    return legacy.data;
  }
  if (error) throw error;
  return data;
}

function listFeishuContacts() {
  if (cached && cached.expires > Date.now()) return Promise.resolve(cached.users);
  pending ??= loadContacts().then((users) => {
    cached = { expires: Date.now() + (users.length ? CACHE_MS : 30_000), users };
    return users;
  }).finally(() => { pending = undefined; });
  return pending;
}

async function loadContacts() {
  const signal = AbortSignal.timeout(12_000);
  const token = await tenantAccessToken(signal);
  const root = process.env.FEISHU_CONTACT_ROOT_DEPARTMENT_ID?.trim() || "0";
  const configuredType = process.env.FEISHU_CONTACT_DEPARTMENT_ID_TYPE?.trim() === "department_id" ? "department_id" : "open_department_id";
  const types = root === "0" && configuredType === "open_department_id" ? [configuredType, "department_id"] : [configuredType];
  let failure: unknown;
  for (const type of types) {
    try {
      const departments = await departmentTree(root, type);
      const users = await departmentUsers(departments, type);
      if (users.length) return users;
    } catch (error) { failure = error; }
  }
  try {
    const departments = await pages<{ department_ids?: string[] }, string>("/scopes", { department_id_type: configuredType }, 100, MAX_DEPARTMENTS, (data) => data.department_ids ?? []);
    const users = await departmentUsers([...new Set(departments)], configuredType);
    if (users.length) return users;
  } catch (error) { failure = error; }
  if (failure) throw failure;
  return [];

  async function departmentTree(rootId: string, type: string) {
    try {
      return [...new Set([rootId, ...await children(rootId, type, true)])].slice(0, MAX_DEPARTMENTS);
    } catch (error) {
      if (!(error instanceof ContactError) || error.code !== 43010) throw error;
    }
    const seen = new Set([rootId]);
    const queue = [rootId];
    for (let index = 0; index < queue.length && queue.length < MAX_DEPARTMENTS; index += 1) {
      for (const id of await children(queue[index], type, false)) {
        if (seen.has(id)) continue;
        seen.add(id);
        queue.push(id);
        if (queue.length >= MAX_DEPARTMENTS) break;
      }
    }
    return queue;
  }

  function children(id: string, type: string, recursive: boolean) {
    const params: Record<string, string> = recursive ? { department_id_type: type, fetch_child: "true" } : { department_id_type: type };
    return pages<{ items?: Department[] }, string>("/departments/" + encodeURIComponent(id) + "/children", params, 50, MAX_DEPARTMENTS, (data) =>
      (data.items ?? []).flatMap((item) => {
        const value = type === "department_id" ? item.department_id ?? item.open_department_id : item.open_department_id ?? item.department_id;
        return value ? [value] : [];
      }),
    );
  }

  async function departmentUsers(departments: string[], type: string) {
    const users = new Map<string, PicklistGroupUser>();
    let completed = 0;
    let lastFailure: unknown;
    for (let index = 0; index < departments.length && users.size < MAX_USERS; index += 4) {
      const results = await Promise.allSettled(departments.slice(index, index + 4).map((id) => pages<{ items?: Contact[] }, Contact>(
        "/users/find_by_department", { department_id: id, department_id_type: type }, 50, MAX_USERS, (data) => data.items ?? [],
      )));
      for (const result of results) {
        if (result.status === "rejected") { lastFailure = result.reason; continue; }
        completed++;
        for (const user of result.value) {
          const openId = user.open_id || user.user_id;
          const name = cleanName(user.name) || cleanName(user.en_name);
          if (openId && name && !user.status?.is_resigned && !user.status?.is_frozen) users.set(openId, { openId, name });
        }
      }
    }
    if (!completed && lastFailure) throw lastFailure;
    return [...users.values()].slice(0, MAX_USERS);
  }

  async function pages<T extends object, Item>(path: string, params: Record<string, string>, pageSize: number, limit: number, itemsFrom: (data: T) => Item[]) {
    const url = new URL(API_BASE + "/open-apis/contact/v3" + path);
    url.search = new URLSearchParams({ ...params, user_id_type: "open_id", page_size: String(pageSize) }).toString();
    const items: Item[] = [];
    const visited = new Set<string>();
    for (let index = 0; index < MAX_DEPARTMENTS; index += 1) {
      const response = await fetch(url, { headers: { Authorization: "Bearer " + token }, signal });
      const payload = await response.json() as { code?: number; data?: T & Cursor };
      if (!response.ok || payload.code !== 0) throw new ContactError(payload.code ?? response.status);
      if (!payload.data) return items;
      items.push(...itemsFrom(payload.data));
      if (!payload.data.has_more || items.length >= limit) return items.slice(0, limit);
      const next = payload.data.page_token;
      if (!next || visited.has(next)) break;
      visited.add(next);
      url.searchParams.set("page_token", next);
    }
    throw new Error("Feishu contacts pagination did not complete");
  }
}

function cleanName(name: string | undefined) {
  return typeof name === "string" ? name.replace(/^\uFEFF/, "").trim() : "";
}
