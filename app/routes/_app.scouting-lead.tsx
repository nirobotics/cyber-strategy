import { Navigate, useSearchParams } from "react-router";
import type { Route } from "./+types/_app.scouting-lead";
import { requireAdmin } from "../lib/auth.server";
import {
  deleteCyberScoutAssignment,
  deleteCyberScoutRecord,
  loadScoutConfidenceForRequest,
  saveCyberScoutAssignment,
} from "../lib/cyber-scout.server";
import { requireMethod } from "../lib/request-security.server";

type ScoutingLeadActionData = { error?: string; ok?: boolean; view?: "confidence" | "records" | "assignments" };

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  return loadScoutConfidenceForRequest(request);
}

export async function action({ request }: Route.ActionArgs): Promise<ScoutingLeadActionData> {
  requireMethod(request, "POST");
  const user = await requireAdmin(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");
  const event = String(formData.get("event") || "");

  try {
    if (intent === "delete-record") {
      await deleteCyberScoutRecord(String(formData.get("recordId") || ""), user.feishuOpenId);
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
        actorOpenId: user.feishuOpenId,
      });
      return { ok: true, view: "assignments" };
    }

    if (intent === "delete-assignment") {
      await deleteCyberScoutAssignment(String(formData.get("assignmentId") || ""), user.feishuOpenId);
      return { ok: true, view: "assignments" };
    }
  } catch (error) {
    if (error instanceof Response) throw error;
    return { error: error instanceof Error ? error.message : "操作失败。" };
  }

  return { error: `未知操作：${intent || "空"}` };
}

export default function ScoutingLeadRoute({ loaderData }: Route.ComponentProps) {
  const [searchParams] = useSearchParams();
  const params = new URLSearchParams(searchParams);
  if (loaderData.selectedEventKey) params.set("event", loaderData.selectedEventKey);
  params.set("tab", "lead");
  return <Navigate to={`/?${params.toString()}`} replace />;
}
