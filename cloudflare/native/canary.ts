import { CANARY_EVENT, CANARY_MARKER, CANARY_MATCH, CANARY_PROPOSAL_ID, boundedCanaryText, canaryConfig, denied, type CanaryAdmission, type CanaryIntent } from "../../app/lib/native-canary-policy.server";
import { nativeProfile, nativeProposal, assertCanaryProposal } from "../../app/lib/native-repository.server";
import { readSession } from "../../app/lib/session.server";
import type { RuntimeEnv } from "./runtime";
import { saveStrategyProposal, reviewStrategyProposal, restoreApprovedStrategyProposal, deleteStrategyProposal } from "../../app/lib/strategy-proposals.server";

export async function admitCanary(request: Request, env: RuntimeEnv): Promise<CanaryAdmission> {
  const { actor } = canaryConfig(env), url = new URL(request.url);
  if (request.headers.get("Origin") !== url.origin || ![null, "same-origin"].includes(request.headers.get("Sec-Fetch-Site"))) denied("canary_same_origin_required");
  if (request.method !== "POST" || url.pathname !== "/strategy-proposal" || url.search) denied("canary_route_denied");
  let user;
  try { user = readSession(request); } catch { return denied("canary_actor_required"); }
  if (!user || user.feishuOpenId !== actor || user.id !== actor || user.id === "demo") denied("canary_actor_required");
  const profile = (await nativeProfile(actor)).data;
  if (profile?.is_admin !== true || profile.open_id !== actor) denied("canary_admin_required");
  if (!/^application\/x-www-form-urlencoded(?:;\s*charset=utf-8)?$/i.test(request.headers.get("Content-Type") ?? "")) denied("canary_form_required", 415);
  const form = new URLSearchParams(await boundedCanaryText(request));
  const intent = form.get("intent") as CanaryIntent, id = form.get("id") || null;
  if (!["save", "submit", "review", "restore", "delete"].includes(intent) || form.get("eventKey") !== CANARY_EVENT) denied("canary_event_intent_required");
  const fields = ["intent", "eventKey", "id", ...(intent === "save" || intent === "submit" ? ["matchKey", "matchLabel", "ownTeam", "proposalType", "payload"] : intent === "review" ? ["decision", "reviewNote"] : [])];
  for (const key of form.keys()) if (!fields.includes(key) || form.getAll(key).length !== 1) denied("canary_form_fields", 400);
  if (id !== null) {
    if (id !== CANARY_PROPOSAL_ID) denied("canary_proposal_id_denied");
    const row = (await nativeProposal(id)).data;
    await assertCanaryProposal(row, actor);
  } else if (intent !== "save" && intent !== "submit") denied("canary_id_required", 400);
  else if ((await nativeProposal(CANARY_PROPOSAL_ID)).data) denied("canary_create_conflict_use_existing_id", 409);
  if (intent === "save" || intent === "submit") {
    if (form.get("matchKey") !== CANARY_MATCH || form.get("matchLabel") !== "CANARY Q1" || form.get("ownTeam") !== "8214" || form.get("proposalType") !== "auto") denied("canary_proposal_shape");
    let payload: unknown;
    try { payload = JSON.parse(form.get("payload") ?? ""); } catch { return denied("canary_payload", 400); }
    if (!payload || typeof payload !== "object" || Array.isArray(payload) || Object.keys(payload).join() !== "note" ||
        ![CANARY_MARKER, CANARY_MARKER + "_EDIT"].includes((payload as { note: string }).note)) denied("canary_payload", 400);
  }
  if (intent === "review" && (!["approved", "rejected"].includes(form.get("decision") ?? "") || form.get("reviewNote") !== CANARY_MARKER)) denied("canary_review_shape", 400);
  return { operation: "strategy-proposal", actorOpenId: actor, intent, databaseId: id };
}

// Call the existing typed business/state-machine functions directly. No SSR loader,
// service-binding write or HTTP-200 error document on this deliberately narrow API.
export async function executeCanary(request: Request, admission: CanaryAdmission): Promise<Response> {
  const form = new URLSearchParams(await boundedCanaryText(request));
  const profile = (await nativeProfile(admission.actorOpenId)).data;
  if (!profile || profile.is_admin !== true || profile.open_id !== admission.actorOpenId) denied("canary_admin_required");
  const actor = { actorOpenId: admission.actorOpenId, isAdmin: profile.is_admin === true }, id = admission.databaseId;
  if (admission.intent === "save" || admission.intent === "submit") {
    const proposal = await saveStrategyProposal({ ...actor, id, submit: admission.intent === "submit", eventKey: form.get("eventKey")!, matchKey: form.get("matchKey")!, matchLabel: form.get("matchLabel")!, ownTeam: form.get("ownTeam")!, proposalType: form.get("proposalType")!, payload: JSON.parse(form.get("payload")!) });
    return Response.json({ ok: true, proposalId: proposal.id });
  }
  if (admission.intent === "review") await reviewStrategyProposal({ ...actor, id: id!, decision: form.get("decision")!, note: form.get("reviewNote")! });
  if (admission.intent === "restore") await restoreApprovedStrategyProposal({ ...actor, id: id! });
  if (admission.intent === "delete") await deleteStrategyProposal({ ...actor, id: id! });
  return Response.json({ ok: true, ...(admission.intent === "delete" ? { deleted: true } : { proposalId: id }) });
}
