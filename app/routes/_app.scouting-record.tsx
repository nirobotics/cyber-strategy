import type { Route } from "./+types/_app.scouting-record";
import { requireAdmin } from "../lib/auth.server";
import { loadEditableScoutingRecord, saveEditableScoutingRecord } from "../lib/editable-scouting.server";
import type { EditableNormalValues, EditableSuperValues } from "../lib/editable-scouting";
import { matchTypeFromValue, type DataRange } from "../lib/data-range";

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  try {
    const query = queryFromUrl(new URL(request.url));
    return Response.json({ ok: true, record: await loadEditableScoutingRecord(query) });
  } catch (error) {
    return Response.json({ ok: false, error: errorMessage(error) }, { status: 400 });
  }
}

export async function action({ request }: Route.ActionArgs) {
  const user = await requireAdmin(request);
  try {
    const body = await request.json() as Record<string, unknown>;
    const query = queryFromBody(body);
    const record = await saveEditableScoutingRecord({
      query,
      normal: body.normal == null ? null : normalValues(body.normal),
      superValues: body.super == null ? null : superValues(body.super),
      updatedBy: user.feishuOpenId,
    });
    return Response.json({ ok: true, saved: true, record });
  } catch (error) {
    return Response.json({ ok: false, error: errorMessage(error) }, { status: 400 });
  }
}

function queryFromUrl(url: URL) {
  return matchQuery({
    eventKey: url.searchParams.get("event"),
    team: url.searchParams.get("team"),
    matchType: url.searchParams.get("matchType"),
    matchNumber: url.searchParams.get("matchNumber"),
    alliance: url.searchParams.get("alliance"),
  });
}

function queryFromBody(body: Record<string, unknown>) {
  return matchQuery(body);
}

function matchQuery(value: Record<string, unknown>) {
  const eventKey = String(value.eventKey ?? "").trim();
  const team = teamNumber(value.team);
  const matchNumber = positiveInteger(value.matchNumber);
  const rawMatchType = String(value.matchType ?? "").trim();
  const matchType = matchTypeFromValue(rawMatchType) as DataRange;
  const alliance: "red" | "blue" | null = value.alliance === "red" ? "red" : value.alliance === "blue" ? "blue" : null;
  if (!/^[a-z0-9_-]+$/i.test(eventKey)) throw new Error("赛事参数无效");
  if (!team) throw new Error("队号参数无效");
  if (!matchNumber) throw new Error("比赛场次参数无效");
  if (!["practice", "qualification", "playoff"].includes(rawMatchType)) throw new Error("比赛类型参数无效");
  return { eventKey, team, matchNumber, matchType, alliance };
}

function normalValues(value: unknown): EditableNormalValues {
  const record = objectValue(value);
  return { shootingSeconds: numberValue(record.shootingSeconds), transferSeconds: numberValue(record.transferSeconds) };
}

function superValues(value: unknown): EditableSuperValues {
  const record = objectValue(value);
  return {
    driveScore: numberValue(record.driveScore),
    defenseScore: numberValue(record.defenseScore),
    accuracy: numberValue(record.accuracy),
    bps: numberValue(record.bps),
  };
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function numberValue(value: unknown) {
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function positiveInteger(value: unknown) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function teamNumber(value: unknown) {
  const match = String(value ?? "").match(/\d+/);
  return match?.[0] ?? "";
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Scouting 记录操作失败";
}
