import type { PicklistGroupUser } from "./picklist";
import type { GroupRead, GroupRow, GroupWrite, PersonalRow, Snapshot } from "./picklist-groups.server";
import { requireMutation, requireNative, selectRows, statement, timestamp } from "./native-context.server";
import { nativeProfile } from "./native-repository.server";

type NativeGroup = GroupRow & { students: PicklistGroupUser[]; rosterVersion: number; submission?: Snapshot & { version: number } };
type Setting<T> = { value: T };
type Payload = {
  name?: string;
  leader?: PicklistGroupUser;
  students?: PicklistGroupUser[];
  rosterVersion?: number;
  version?: number;
  board?: unknown;
  id?: string;
  clientId?: string;
};

function groupKey(event: string, group: string) {
  return ['picklist-group', event, group].join(':');
}

function personalPrefix(group: string) {
  return 'picklist-group-personal:' + group + ':';
}

async function role(actor: string) {
  const { data } = await nativeProfile(actor);
  if (!data || (data as { is_active?: boolean }).is_active === false) forbidden("无权访问 Picklist");
  return Boolean(data.is_admin);
}

function forbidden(message: string): never {
  throw new Response(message, { status: 403 });
}

function conflict(message: string): never {
  throw new Response(message, { status: 409 });
}

export async function readNativePicklistGroups(event: string, actor: string, groupId: string | null): Promise<GroupRead> {
  const isEventAdmin = await role(actor);
  // A D1 batch produces one view of the roster and its uploads during a concurrent removal.
  const [groupRows, personalRows] = await requireNative().env.DB.batch<{ row_json: string }>([
    statement("SELECT row_json FROM app_settings WHERE id GLOB ? ORDER BY json_extract(row_json,'$.value.name'), id", groupKey(event, '*')),
    statement("SELECT row_json FROM app_settings WHERE id GLOB ? ORDER BY json_extract(row_json,'$.updated_at') DESC", personalPrefix(groupId ?? '-') + '*'),
  ]);
  const all = groupRows.results.map(({ row_json }) => (JSON.parse(row_json) as Setting<NativeGroup>).value);
  const joined = (group: NativeGroup) => group.leader_id === actor || group.students.some((user) => user.openId === actor);
  const groups = all.filter((group) => isEventAdmin || joined(group)).map((group) => ({
    id: group.id, name: group.name, leaderId: group.leader_id, leaderName: group.leader_name,
    joined: joined(group), rosterVersion: group.rosterVersion,
    students: isEventAdmin || group.leader_id === actor ? group.students : [],
  }));
  const group = all.find((item) => item.id === groupId);
  if (groupId && (!group || !joined(group))) forbidden("无权访问此 Group");
  const submissions = isEventAdmin && !groupId
    ? all.flatMap((item) => item.submission ? [item.submission] : []).sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)) : [];
  const content = group ? {
    group,
    submittedVersion: group.submission?.version ?? null,
    personals: personalRows.results.flatMap(({ row_json }) => {
      const row = (JSON.parse(row_json) as Setting<PersonalRow>).value;
      const student = group.students.find((user) => user.openId === row.owner_id);
      return row.owner_id === actor || (group.leader_id === actor && student)
        ? [{ ...row, owner_name: student?.name ?? group.leader_name }] : [];
    }),
  } : null;
  return { isEventAdmin, groups, content, submissions };
}

export async function writeNativePicklistGroup(event: string, actor: string, groupId: string | null, intent: string, data: Payload): Promise<GroupWrite> {
  // The Worker's Durable Object serializes the permission check and audited write.
  requireMutation();
  const admin = await role(actor);
  if (intent === 'create-group') {
    if (!admin) forbidden("只有管理员可以创建 Group");
    const id = crypto.randomUUID();
    const group: NativeGroup = {
      id, name: data.name!, leader_id: data.leader!.openId, leader_name: data.leader!.name,
      students: data.students!, rosterVersion: 1, main_board: {}, main_version: 0, main_updated_at: timestamp(),
    };
    await store(groupKey(event, id), group, actor, intent, id);
    return {};
  }
  if (!groupId) forbidden("无权访问此 Group");
  const key = groupKey(event, groupId);
  const [setting] = await selectRows<Setting<NativeGroup>>("SELECT row_json FROM app_settings WHERE id=?", key);
  if (!setting) forbidden("无权访问此 Group");
  const group = setting.value;
  const leader = group.leader_id === actor;

  switch (intent) {
    case 'update-group':
    case 'update-students': {
      if (intent === 'update-group' ? !admin : !leader) forbidden("无权管理此 Group");
      if (data.rosterVersion !== group.rosterVersion) conflict("成员名单已有更新，请重新打开分组设置");
      if (intent === 'update-group') {
        group.name = data.name!;
        group.leader_id = data.leader!.openId;
        group.leader_name = data.leader!.name;
      }
      group.students = data.students!.filter((student) => student.openId !== group.leader_id);
      group.rosterVersion++;
      await store(key, group, actor, intent, groupId);
      return {};
    }
    case 'save-group-main':
    case 'submit-group-main': {
      if (!leader) forbidden("只有此 Group 的 Leader 可以操作 Main");
      if (data.version !== group.main_version) conflict("Group Main 已有更新，请重新打开看板后再操作");
      if (intent === 'save-group-main') {
        group.main_board = data.board;
        group.main_version++;
        group.main_updated_at = timestamp();
        await store(key, group, actor, intent, groupId);
        return { group };
      }
      if (!group.main_version) throw new Response("请先保存 Group Main", { status: 400 });
      if (group.submission?.version !== group.main_version || group.submission.createdBy !== actor || group.submission.name !== group.name) {
        group.submission = {
          id: group.id, version: group.main_version, name: group.name, board: group.main_board,
          createdBy: actor, createdByName: group.leader_name, submittedAt: timestamp(),
        };
        await store(key, group, actor, intent, groupId);
      }
      return { submittedVersion: group.main_version };
    }
    case 'submit-personal':
    case 'delete-personal': {
      const student = group.students.find((user) => user.openId === actor);
      if (!leader && !student) forbidden("无权修改此 Group 的 Personal");
      const prefix = personalPrefix(groupId) + actor + ':';
      if (intent === 'submit-personal') {
        const personalKey = prefix + data.clientId;
        const [previous] = await selectRows<Setting<PersonalRow>>("SELECT row_json FROM app_settings WHERE id=?", personalKey);
        const personal = {
          id: previous?.value.id ?? crypto.randomUUID(), owner_id: actor, owner_name: student?.name ?? group.leader_name,
          client_id: data.clientId!, name: data.name!, board: data.board, updated_at: timestamp(),
        };
        await store(personalKey, personal, actor, intent, groupId);
        return { personal };
      }
      const [previous] = await selectRows<Setting<PersonalRow>>(
        "SELECT row_json FROM app_settings WHERE id GLOB ? AND json_extract(row_json,'$.value.id')=?", prefix + '*', data.id ?? null,
      );
      if (!previous) forbidden("无权删除此 Personal Picklist");
      await auditedWrite(statement("DELETE FROM app_settings WHERE id=?", prefix + previous.value.client_id), actor, intent, groupId);
      return { deletedId: previous.value.id };
    }
    default: throw new Response("未知 Group 操作", { status: 400 });
  }
}

function store(key: string, value: NativeGroup | PersonalRow, actor: string, intent: string, groupId: string) {
  const row = JSON.stringify({ key, value, updated_by: actor, updated_at: timestamp() });
  return auditedWrite(statement("INSERT INTO app_settings(id,row_json) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET row_json=excluded.row_json", key, row), actor, intent, groupId);
}

async function auditedWrite(write: ReturnType<typeof statement>, actor: string, intent: string, groupId: string) {
  const id = crypto.randomUUID();
  const audit = {
    id, actor_open_id: actor, action: 'picklist.' + intent, changed_fields: [],
    target_type: 'picklist_group', target_id: groupId, created_at: timestamp(),
  };
  await requireNative().env.DB.batch([write, statement("INSERT INTO audit_logs(id,row_json) VALUES(?,?)", id, JSON.stringify(audit))]);
}
