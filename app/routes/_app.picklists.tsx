import { data, Navigate, useSearchParams } from "react-router";
import type { Route } from "./+types/_app.picklists";
import { requireUser } from "../lib/auth.server";
import { isAdmin } from "../lib/profiles.server";
import { cleanTbaEventKey } from "../lib/tba.server";
import { createMainPicklist, deleteMainPicklist, listPicklists, saveMainPicklist } from "../lib/picklists.server";
import { normalizePicklistBoard, type PicklistGroupUser, type PicklistResource, type SharedPicklist } from "../lib/picklist";
import { readGroups, resolveRoster, saveGroupCommand } from "../lib/picklist-groups.server";
import { picklistMemberDirectory } from "../lib/feishu-directory.server";

export type PicklistActionData = {
  error?: string; ok?: boolean; picklist?: SharedPicklist; deletedId?: string;
  submittedVersion?: number; directory?: PicklistGroupUser[]; directoryWarning?: string;
};

const privateHeaders = { "Cache-Control": "private, no-store" };

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireUser(request, { redirectToLogin: true });
  const params = new URL(request.url).searchParams;
  const eventKey = cleanTbaEventKey(params.get("event"));
  const base: PicklistResource = { selectedEventKey: eventKey ?? "", isAdmin: false, userOpenId: user.feishuOpenId, lists: [], error: null };
  if (!eventKey) return data(base, { headers: privateHeaders });
  try {
    const groupId = optionalUuid(params.get("group"));
    const { isLeader, isEventAdmin, ...workspace } = await readGroups(eventKey, user.feishuOpenId, groupId);
    if (groupId) return data({ ...base, ...workspace, isAdmin: isLeader }, { headers: privateHeaders });
    const existing = isEventAdmin ? await listPicklists(eventKey, user.feishuOpenId, true) : [];
    return data({ ...base, ...workspace, isAdmin: isEventAdmin, lists: [...workspace.lists, ...existing.map((list) => list.kind === "personal"
      ? { ...list, clientId: null, historical: true }
      : list)] }, { headers: privateHeaders });
  } catch (error) {
    return data({ ...base, groupId: params.get("group") || undefined, error: error instanceof Response ? await error.text() : "Picklist 数据不可用。" },
      { status: error instanceof Response ? error.status : 500, headers: privateHeaders });
  }
}

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") throw new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } });
  const { feishuOpenId: actorOpenId } = await requireUser(request);
  const form = await request.formData();
  const intent = String(form.get("intent") || "");
  const eventKey = cleanTbaEventKey(String(form.get("eventKey") || ""));
  try {
    const groupId = optionalUuid(form.get("groupId"));
    if (!eventKey) throw new Response("赛事无效", { status: 400 });
    let result: PicklistActionData;
    if (intent === "directory" || intent === "create-group" || intent === "update-group" || intent === "update-students") {
      const { groups, isEventAdmin } = await readGroups(eventKey, actorOpenId, null);
      const leaderOnly = intent === "update-students" || (intent === "directory" && !isEventAdmin);
      if (!isEventAdmin && !leaderOnly) throw new Response("只有管理员可以管理分组", { status: 403 });
      const group = groups.find((item) => item.id === groupId);
      if ((leaderOnly && group?.leaderId !== actorOpenId) || (groupId && !group)) throw new Response("无权管理此 Group", { status: 403 });
      if (intent === "directory") {
        const { users, fromProfiles } = await picklistMemberDirectory();
        return data<PicklistActionData>({ ok: true, directory: users, directoryWarning: fromProfiles ? "飞书通讯录暂不可用，当前显示已登录过的成员。" : undefined }, { headers: privateHeaders });
      }
      const leaderId = intent === "update-students" ? group!.leaderId : cleanId(form.get("leaderId"));
      const ids = [...new Set([leaderId, ...form.getAll("studentId").map(cleanId)])];
      const [leader, ...students] = await resolveRoster(ids, group ? [{ openId: group.leaderId, name: group.leaderName }, ...group.students] : []);
      result = await saveGroupCommand(eventKey, actorOpenId, groupId, intent, {
        name: intent === "update-students" ? undefined : cleanName(form.get("name")),
        leader, students, rosterVersion: groupId ? version(form.get("rosterVersion")) : undefined,
      });
    } else if (groupId) {
      const payload = {
        version: intent === "save-group-main" || intent === "submit-group-main" ? version(form.get("version")) : undefined,
        board: intent === "save-group-main" || intent === "submit-personal" ? normalizePicklistBoard(parseBoard(form.get("board"))) : undefined,
        name: intent === "submit-personal" ? cleanName(form.get("name")) : undefined,
        clientId: intent === "submit-personal" ? cleanId(form.get("clientId")) : undefined,
        id: intent === "delete-personal" ? optionalUuid(form.get("id")) : undefined,
      };
      result = await saveGroupCommand(eventKey, actorOpenId, groupId, intent, payload);
    } else {
      const admin = await isAdmin(actorOpenId);
      if (!admin) throw new Response("等待管理员分配", { status: 403 });
      const id = String(form.get("id") || "");
      if (intent === "create-main") result = { picklist: await createMainPicklist({ eventKey, name: cleanName(form.get("name")), actorOpenId, isAdmin: admin }) };
      else if (intent === "save-main") result = { picklist: await saveMainPicklist({ id, eventKey, board: parseBoard(form.get("board")), actorOpenId, isAdmin: admin }) };
      else if (intent === "delete-main") result = { deletedId: await deleteMainPicklist({ id, eventKey, actorOpenId, isAdmin: admin }) };
      else throw new Response("未知操作", { status: 400 });
    }
    return data<PicklistActionData>({ ok: true, ...result }, { headers: privateHeaders });
  } catch (error) {
    const message = error instanceof Response ? await error.text() : "Picklist 操作失败";
    return data<PicklistActionData>({ error: message }, { status: error instanceof Response ? error.status : 500, headers: privateHeaders });
  }
}

export default function PicklistsRoute() {
  const [searchParams] = useSearchParams();
  const params = new URLSearchParams(searchParams);
  params.set("tab", "picklist");
  return <Navigate to={"/?" + params.toString()} replace />;
}

function optionalUuid(value: FormDataEntryValue | null) {
  if (value === null || value === "") return null;
  if (typeof value === "string" && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value)) return value;
  throw new Response("Picklist ID 无效", { status: 400 });
}

function cleanId(value: FormDataEntryValue | null) {
  if (typeof value === "string" && /^[a-zA-Z0-9_-]{1,80}$/.test(value)) return value;
  throw new Response("成员或名单 ID 无效", { status: 400 });
}

function cleanName(value: FormDataEntryValue | null) {
  const name = typeof value === "string" ? value.trim().slice(0, 80) : "";
  if (!name) throw new Response("请输入名称", { status: 400 });
  return name;
}

function version(value: FormDataEntryValue | null) {
  if (typeof value === "string" && /^\d{1,9}$/.test(value)) return Number(value);
  throw new Response("Picklist 版本无效", { status: 400 });
}

function parseBoard(value: FormDataEntryValue | null) {
  try {
    return JSON.parse(String(value || "{}")) as unknown;
  } catch {
    throw new Response("Picklist 数据无效", { status: 400 });
  }
}
