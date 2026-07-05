import type { Route } from "./+types/_app.scouting-lead";
import { ScoutingLeadPanel, type ScoutingLeadActionData } from "../components/scouting-lead-panel";
import { requireAdmin } from "../lib/auth.server";
import {
  deleteCyberScoutAssignment,
  deleteCyberScoutRecord,
  loadScoutConfidenceForRequest,
  saveCyberScoutAssignment,
} from "../lib/cyber-scout.server";

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  return loadScoutConfidenceForRequest(request);
}

export async function action({ request }: Route.ActionArgs): Promise<ScoutingLeadActionData> {
  await requireAdmin(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");
  const event = String(formData.get("event") || "");

  try {
    if (intent === "delete-record") {
      await deleteCyberScoutRecord(String(formData.get("recordId") || ""));
      return { ok: true, view: "records" };
    }

    if (intent === "save-assignment") {
      await saveCyberScoutAssignment({
        id: String(formData.get("assignmentId") || "") || null,
        eventKey: event,
        startMatch: Number(formData.get("startMatch") || 0),
        endMatch: Number(formData.get("endMatch") || 0),
        position: String(formData.get("position") || ""),
        userName: String(formData.get("userName") || ""),
      });
      return { ok: true, view: "assignments" };
    }

    if (intent === "delete-assignment") {
      await deleteCyberScoutAssignment(String(formData.get("assignmentId") || ""));
      return { ok: true, view: "assignments" };
    }
  } catch (error) {
    if (error instanceof Response) throw error;
    return { error: error instanceof Error ? error.message : "操作失败。" };
  }

  return { error: `未知操作：${intent || "空"}` };
}

export default function ScoutingLeadRoute({ loaderData }: Route.ComponentProps) {
  return <ScoutingLeadPanel data={loaderData} />;
}
