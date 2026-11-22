import { listFeishuDirectory } from "./feishu-directory.server";
import { normalizePicklistBoard, type PicklistGroup, type PicklistGroupUser, type SharedPicklist } from "./picklist";
import { getClient } from "./supabase.server";
import { nativeDB } from "./native-context.server";
import { readNativePicklistGroups, writeNativePicklistGroup } from "./native-picklist-groups.server";

export type GroupRow = {
  id: string; name: string; leader_id: string; leader_name: string;
  main_board: unknown; main_version: number; main_updated_at: string;
};
export type PersonalRow = {
  id: string; owner_id: string; owner_name: string; client_id: string;
  name: string; board: unknown; updated_at: string;
};
export type Snapshot = Pick<SharedPicklist, "id" | "name" | "createdBy" | "createdByName"> & {
  board: unknown; submittedAt: string;
};
export type GroupRead = {
  isEventAdmin: boolean;
  groups: PicklistGroup[];
  content: { group: GroupRow; personals: PersonalRow[]; submittedVersion: number | null } | null;
  submissions: Snapshot[];
};
export type GroupWrite = { group?: GroupRow; personal?: PersonalRow; deletedId?: string; submittedVersion?: number };

export async function readGroups(eventKey: string, actor: string, groupId: string | null) {
  const raw = nativeDB() ? await readNativePicklistGroups(eventKey, actor, groupId) : await groupRpc<GroupRead>("read_picklist_groups", { p_event: eventKey, p_actor: actor, p_group: groupId });
  const group = raw.content?.group;
  return {
    isEventAdmin: raw.isEventAdmin,
    groups: raw.groups,
    groupId: group?.id,
    submittedVersion: raw.content?.submittedVersion,
    isLeader: group?.leader_id === actor,
    lists: raw.content
      ? [mainPicklist(raw.content.group, eventKey), ...raw.content.personals.map((row) => personalPicklist(row, eventKey))]
      : raw.submissions.map((snapshot): SharedPicklist => ({
        ...snapshot, eventKey, kind: "personal", clientId: null, board: normalizePicklistBoard(snapshot.board), updatedAt: snapshot.submittedAt,
      })),
  };
}

export async function saveGroupCommand(eventKey: string, actor: string, groupId: string | null, intent: string, payload: Record<string, unknown>) {
  const result = nativeDB() ? await writeNativePicklistGroup(eventKey, actor, groupId, intent, payload) : await groupRpc<GroupWrite>("write_picklist_group", {
    p_event: eventKey, p_actor: actor, p_group: groupId, p_intent: intent, p_data: payload,
  });
  return {
    picklist: result.group ? mainPicklist(result.group, eventKey) : result.personal ? personalPicklist(result.personal, eventKey) : undefined,
    submittedVersion: result.submittedVersion,
    deletedId: result.deletedId,
  };
}

export async function resolveRoster(ids: string[], existing: PicklistGroupUser[]) {
  const users = new Map(existing.map((user) => [user.openId, user]));
  if (ids.some((id) => !users.has(id))) {
    for (const user of await listFeishuDirectory()) users.set(user.openId, user);
  }
  return ids.map((id) => {
    const user = users.get(id);
    if (!user) throw new Response("请从飞书通讯录选择有效成员", { status: 400 });
    return user;
  });
}

function mainPicklist(row: GroupRow, eventKey: string): SharedPicklist {
  return {
    id: row.id, eventKey, clientId: null, kind: "main", name: row.name, board: normalizePicklistBoard(row.main_board), version: row.main_version,
    createdBy: row.leader_id, createdByName: row.leader_name, updatedAt: row.main_updated_at, submittedAt: null,
  };
}

function personalPicklist(row: PersonalRow, eventKey: string): SharedPicklist {
  return {
    id: row.id, eventKey, clientId: row.client_id, kind: "personal", name: row.name, board: normalizePicklistBoard(row.board),
    createdBy: row.owner_id, createdByName: row.owner_name, updatedAt: row.updated_at, submittedAt: row.updated_at,
  };
}

async function groupRpc<T>(fn: string, args: Record<string, unknown>) {
  const client = getClient();
  if (!client) throw new Response("Picklist 数据库未配置", { status: 503 });
  const { data, error } = await client.rpc(fn, args);
  if (error) {
    const status = error.code === "42501" ? 403 : error.code === "40001" ? 409 : error.code === "22023" ? 400 : 500;
    throw new Response(status === 500 ? "Group 数据不可用" : error.message, { status });
  }
  return data as T;
}
