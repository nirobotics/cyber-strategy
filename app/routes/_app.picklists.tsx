import { Navigate, useSearchParams } from "react-router";
import type { Route } from "./+types/_app.picklists";
import { requireUser } from "../lib/auth.server";
import { isAdmin } from "../lib/profiles.server";
import { cleanTbaEventKey } from "../lib/tba.server";
import { createMainPicklist, listPicklists, saveMainPicklist, submitPersonalPicklist } from "../lib/picklists.server";
import type { SharedPicklist } from "../lib/picklist";

export type PicklistActionData = { error?: string; ok?: boolean; picklist?: SharedPicklist };

export async function loader({ request }: Route.LoaderArgs) {
  const user = requireUser(request, { redirectToLogin: true });
  const eventKey = cleanTbaEventKey(new URL(request.url).searchParams.get("event"));
  const admin = await isAdmin(user.feishuOpenId);
  if (!eventKey) return { selectedEventKey: "", isAdmin: admin, userOpenId: user.feishuOpenId, lists: [], error: null };
  try {
    return {
      selectedEventKey: eventKey,
      isAdmin: admin,
      userOpenId: user.feishuOpenId,
      lists: await listPicklists(eventKey, user.feishuOpenId, admin),
      error: null,
    };
  } catch (error) {
    return {
      selectedEventKey: eventKey,
      isAdmin: admin,
      userOpenId: user.feishuOpenId,
      lists: [],
      error: error instanceof Response ? await error.text() : "Picklist 数据不可用。",
    };
  }
}

export async function action({ request }: Route.ActionArgs): Promise<PicklistActionData> {
  const user = requireUser(request);
  const admin = await isAdmin(user.feishuOpenId);
  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");
  try {
    if (intent === "create-main") {
      return { ok: true, picklist: await createMainPicklist({
        eventKey: String(formData.get("eventKey") || ""),
        name: String(formData.get("name") || ""),
        actorOpenId: user.feishuOpenId,
        isAdmin: admin,
      }) };
    }
    if (intent === "save-main") {
      return { ok: true, picklist: await saveMainPicklist({
        id: String(formData.get("id") || ""),
        board: parseBoard(formData.get("board")),
        actorOpenId: user.feishuOpenId,
        isAdmin: admin,
      }) };
    }
    if (intent === "submit-personal") {
      return { ok: true, picklist: await submitPersonalPicklist({
        eventKey: String(formData.get("eventKey") || ""),
        clientId: String(formData.get("clientId") || ""),
        name: String(formData.get("name") || ""),
        board: parseBoard(formData.get("board")),
        actorOpenId: user.feishuOpenId,
      }) };
    }
    return { error: "未知操作" };
  } catch (error) {
    if (error instanceof Response) return { error: await error.text() || "操作失败" };
    return { error: error instanceof Error ? error.message : "操作失败" };
  }
}

export default function PicklistsRoute() {
  const [searchParams] = useSearchParams();
  const params = new URLSearchParams(searchParams);
  params.set("tab", "picklist");
  return <Navigate to={`/?${params.toString()}`} replace />;
}

function parseBoard(value: FormDataEntryValue | null) {
  try {
    return JSON.parse(String(value || "{}")) as unknown;
  } catch {
    throw new Response("Picklist 数据无效", { status: 400 });
  }
}
