import { tenantAccessToken } from "./feishu.server";
import type { PicklistGroupUser } from "./picklist";

const API_BASE = process.env.FEISHU_API_BASE || "https://open.feishu.cn";
let cached: { expires: number; users: PicklistGroupUser[] } | undefined;
let pending: Promise<PicklistGroupUser[]> | undefined;

export function listFeishuDirectory() {
  if (cached && cached.expires > Date.now()) return Promise.resolve(cached.users);
  pending ??= loadDirectory().then((users) => {
    cached = { expires: Date.now() + 60_000, users };
    return users;
  }).finally(() => { pending = undefined; });
  return pending;
}

async function loadDirectory() {
  const token = await tenantAccessToken().catch(() => {
    throw new Response("无法连接飞书通讯录，请检查飞书应用凭据。", { status: 502 });
  });
  const departments = await listPages<{ open_department_id: string }>("/department/0/children", { fetch_child: "true", department_id_type: "open_department_id" }, token);
  const users = new Map<string, PicklistGroupUser>();
  const ids = [...new Set(["0", ...departments.map((department) => department.open_department_id).filter(Boolean)])];
  for (let index = 0; index < ids.length; index += 4) {
    const pages = await Promise.all(ids.slice(index, index + 4).map((id) => listPages<{ open_id: string; name: string; status?: { is_resigned?: boolean; is_frozen?: boolean } }>(
      "/user/find_by_department", { department_id: id, department_id_type: "open_department_id", user_id_type: "open_id" }, token,
    )));
    for (const user of pages.flat()) {
      if (user.open_id && user.name && !user.status?.is_resigned && !user.status?.is_frozen) users.set(user.open_id, { openId: user.open_id, name: user.name });
    }
  }
  return [...users.values()].sort((a, b) => a.name.localeCompare(b.name, "zh"));
}

async function listPages<T>(path: string, params: Record<string, string>, token: string) {
  const url = new URL(`${API_BASE}/open-apis/contact/v3${path}`);
  url.search = new URLSearchParams({ ...params, page_size: "50" }).toString();
  const items: T[] = [];
  const visited = new Set<string>();
  for (;;) {
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) });
    const body = await response.json() as { code: number; data?: { items?: T[]; has_more?: boolean; page_token?: string } };
    if (!response.ok || body.code !== 0 || !body.data) throw new Response("无法读取飞书通讯录，请检查应用通讯录权限和可见范围。", { status: 502 });
    items.push(...(body.data.items ?? []));
    if (!body.data.has_more) return items;
    const next = body.data.page_token;
    if (!next || visited.has(next)) throw new Response("飞书通讯录分页失败。", { status: 502 });
    visited.add(next);
    url.searchParams.set("page_token", next);
  }
}
