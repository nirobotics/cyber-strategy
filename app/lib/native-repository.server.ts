import { randomUUID } from "node:crypto";
import { nativeDB, requireMutation, requireNative, selectOne, selectRows, statement, timestamp } from "./native-context.server";
import type { AppSettingRow, ProfileRow, ScoutingDatasetRow } from "./db-types";
import type { FeishuUser } from "./feishu.server";
import type { StrategyProposalRow } from "./strategy-proposals.server";
import { CANARY_EVENT, CANARY_MARKER, CANARY_MATCH, CANARY_PROPOSAL_ID, canaryConfig, denied } from "./native-canary-policy.server";

export async function assertCanaryProposal(row: StrategyProposalRow | null, actor: string) {
  if (!row || row.id !== CANARY_PROPOSAL_ID || row.event_key !== CANARY_EVENT || row.match_key !== CANARY_MATCH ||
      row.match_label !== "CANARY Q1" || row.created_by !== actor || row.proposal_type !== "auto" ||
      ![CANARY_MARKER, CANARY_MARKER + "_EDIT"].includes((row.payload as { note?: string } | null)?.note ?? "")) denied("canary_foreign_proposal");
  if (await statement("SELECT 1 FROM native_import_rows WHERE table_name='strategy_proposals' AND source_key=?", row.id).first()) denied("canary_imported_proposal_denied");
}
async function requireCanaryActor(actor: string) {
  const { env, canary } = requireNative();
  if (!canary) return;
  const policy = canaryConfig(env), profile = (await nativeProfile(actor)).data;
  if (canary.actorOpenId !== actor || policy.actor !== actor || profile?.open_id !== actor || profile.is_admin !== true) denied("canary_admin_required");
}

export const hasNative = () => Boolean(nativeDB());
async function requireActor(actor: string) { if (!(await nativeProfile(actor)).data) throw new Response("Profile not found", { status: 403 }); }
const result = <T>(data: T) => ({ data, error: null });
export async function nativeProfile(id: string) { return result(await selectOne<ProfileRow>("SELECT row_json FROM profiles WHERE id=?", id)); }
export async function nativeNames(ids: string[]) {
  const rows = await selectRows<ProfileRow>("SELECT row_json FROM profiles ORDER BY id");
  return result(rows.filter((row) => ids.includes(row.open_id)));
}
export async function nativeLogin(user: FeishuUser) {
  requireMutation("auth");
  const now = timestamp();
  await statement("INSERT INTO profiles(id,row_json) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET row_json=json_set(profiles.row_json,'$.name',json_extract(excluded.row_json,'$.name'),'$.avatar_url',json_extract(excluded.row_json,'$.avatar_url'))", user.openId, JSON.stringify({ open_id: user.openId, name: user.name, avatar_url: user.avatarUrl, is_admin: false, created_at: now })).run();
  return { isAdmin: (await nativeProfile(user.openId)).data?.is_admin === true };
}
export async function nativeDataset(eventKey?: string) {
  return result(eventKey ? await selectOne<ScoutingDatasetRow>("SELECT row_json FROM scouting_datasets WHERE json_extract(row_json,'$.event_key')=? ORDER BY json_extract(row_json,'$.updated_at') DESC LIMIT 1", eventKey) : await selectOne<ScoutingDatasetRow>("SELECT row_json FROM scouting_datasets WHERE json_extract(row_json,'$.is_active')=1 ORDER BY json_extract(row_json,'$.updated_at') DESC LIMIT 1"));
}
export async function nativeSetting(key: string) { return result(await selectOne<AppSettingRow>("SELECT row_json FROM app_settings WHERE id=?", key)); }
export async function nativePicklists(eventKey: string, personal = false) {
  return result(await selectRows<AppSettingRow>("SELECT row_json FROM app_settings WHERE json_extract(row_json,'$.value.eventKey')=? AND json_extract(row_json,'$.value.kind') IN ('main','personal') AND (?=0 OR json_extract(row_json,'$.value.kind')='personal') ORDER BY json_extract(row_json,'$.updated_at') DESC", eventKey, personal ? 1 : 0));
}
export async function nativePicklist(id: string) { return result(await selectOne<AppSettingRow>("SELECT row_json FROM app_settings WHERE json_extract(row_json,'$.value.id')=? AND json_extract(row_json,'$.value.kind') IN ('main','personal')", id)); }
function auditStatement(action: string, actor: string | null, fields: string[] = []) {
  const id = randomUUID();
  return statement("INSERT INTO audit_logs(id,row_json) VALUES(?,?)", id, JSON.stringify({ id, actor_open_id: actor, action, changed_fields: fields, created_at: timestamp() }));
}
export async function nativeAudit(action: string, opts: { actorOpenId?: string | null; changedFields?: string[] }) {
  requireMutation(action === "auth.login" ? "auth" : "business");
  await auditStatement(action, opts.actorOpenId ?? null, opts.changedFields).run();
}
export async function nativeSaveSetting(key: string, value: unknown, actor: string, action: string) {
  requireMutation();
  await requireActor(actor);
  const row = { key, value, updated_by: actor, updated_at: timestamp() };
  const changedFields = action === "picklist.main.create" ? ["event_key", "name", "kind"] : action === "picklist.main.save" ? ["board"] : action === "picklist.personal.submit" ? ["event_key", "client_id", "name", "board", "submitted_at"] : [key];
  await requireNative().env.DB.batch([
    statement("INSERT INTO app_settings(id,row_json) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET row_json=json_set(app_settings.row_json,'$.value',json_extract(excluded.row_json,'$.value'),'$.updated_by',json_extract(excluded.row_json,'$.updated_by'),'$.updated_at',json_extract(excluded.row_json,'$.updated_at'))", key, JSON.stringify(row)),
    auditStatement(action, actor, changedFields),
  ]);
  return result(row);
}
export async function nativeDeleteSetting(key: string, actor: string, action: string) {
  requireMutation();
  await requireActor(actor);
  await requireNative().env.DB.batch([statement("DELETE FROM app_settings WHERE id=? AND id LIKE 'picklist:%'", key), auditStatement(action, actor, ["picklist"])]);
  return result(null);
}
export async function nativeProposals(eventKey: string) { return result(await selectRows<StrategyProposalRow>("SELECT row_json FROM strategy_proposals WHERE json_extract(row_json,'$.event_key')=? AND json_extract(row_json,'$.proposal_type')='auto' ORDER BY json_extract(row_json,'$.updated_at') DESC", eventKey)); }
export async function nativeProposal(id: string) { return result(await selectOne<StrategyProposalRow>("SELECT row_json FROM strategy_proposals WHERE id=?", id)); }
export async function nativeSaveProposal(id: string | null, values: Record<string, unknown>, actor: string, action: string) {
  const { canary } = requireMutation("business", "strategy-proposal");
  await requireCanaryActor(actor);
  if (canary && id !== null && id !== CANARY_PROPOSAL_ID) denied("canary_proposal_id_denied");
  if (canary) {
    const expectedAction = { save: "strategy_proposal.save", submit: "strategy_proposal.submit", review: ["strategy_proposal.approve", "strategy_proposal.reject"], restore: "strategy_proposal.restore_approved", delete: "" }[canary.intent];
    if (canary.databaseId !== id || !(Array.isArray(expectedAction) ? expectedAction.includes(action) : expectedAction === action) ||
        (values.event_key !== undefined && values.event_key !== CANARY_EVENT) || (values.created_by !== undefined && values.created_by !== actor)) denied("canary_proposal_mutation_denied");
    if (!id && (values.event_key !== CANARY_EVENT || values.match_key !== CANARY_MATCH || values.match_label !== "CANARY Q1" || values.proposal_type !== "auto" ||
        ![CANARY_MARKER, CANARY_MARKER + "_EDIT"].includes((values.payload as { note?: string } | null)?.note ?? ""))) denied("canary_proposal_shape");
  }
  await requireActor(actor);
  const now = timestamp(), nextId = id ?? (canary ? CANARY_PROPOSAL_ID : randomUUID());
  // Patch individual approved fields, preserving unknown/historical columns and raw numeric JSON.
  const prior = id ? (await nativeProposal(id)).data : null;
  if (id && !prior) throw new Response("Proposal not found", { status: 404 });
  if (canary && id) await assertCanaryProposal(prior, actor);
  if (canary) await assertCanaryProposal({ ...prior, ...values, id: nextId } as StrategyProposalRow, actor);
  const allowed = ["event_key", "match_key", "match_label", "own_team", "proposal_type", "status", "title", "payload", "created_by", "reviewed_by", "review_note", "submitted_at", "reviewed_at", "last_approved_snapshot"];
  for (const key of Object.keys(values)) if (!allowed.includes(key)) throw new Error("Unapproved proposal field");
  const fields = Object.keys(values);
  const update = id
    ? statement(`UPDATE strategy_proposals SET row_json=json_set(row_json,${fields.map((key) => `'$.${key}',json(?)`).join(",")},'$.updated_at',?) WHERE id=?`, ...fields.map((key) => JSON.stringify(values[key])), now, id)
    : statement("INSERT INTO strategy_proposals(id,row_json) VALUES(?,?)", nextId, JSON.stringify({ id: nextId, created_at: now, updated_at: now, ...values }));
  const changedFields = action === "strategy_proposal.approve" || action === "strategy_proposal.reject" ? ["status", "review_note"] : action === "strategy_proposal.restore_approved" ? ["match_key", "match_label", "own_team", "proposal_type", "status", "title", "payload"] : ["event_key", "match_key", "own_team", "proposal_type", "status", "title", "payload"];
  if (canary) requireMutation("business", "strategy-proposal"); // Recheck expiry at the atomic write boundary.
  await requireNative().env.DB.batch([update, auditStatement(action, actor, changedFields)]);
  return nativeProposal(nextId);
}
export async function nativeDeleteProposal(id: string, actor: string) {
  const { canary } = requireMutation("business", "strategy-proposal");
  await requireActor(actor);
  await requireCanaryActor(actor);
  if (canary) {
    if (canary.intent !== "delete" || canary.databaseId !== id || id !== CANARY_PROPOSAL_ID) denied();
    await assertCanaryProposal((await nativeProposal(id)).data, actor);
  }
  if (canary) requireMutation("business", "strategy-proposal");
  await requireNative().env.DB.batch([statement("DELETE FROM strategy_proposals WHERE id=?", id), auditStatement("strategy_proposal.delete", actor, ["id", "status"])]);
  return result(null);
}
