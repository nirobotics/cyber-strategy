import { appendAudit } from "./audit.server";
import { getClient } from "./supabase.server";
import {
  canEditProposal,
  canReviewProposal,
  isProposalStatus,
  isProposalType,
  normalizeOwnTeam,
  normalizeProposalPayload,
  type StrategyProposal,
  type StrategyProposalStatus,
  type StrategyProposalType,
} from "./strategy-proposals";

type StrategyProposalRow = {
  id: string;
  event_key: string;
  match_key: string;
  match_label: string;
  own_team: string;
  proposal_type: string;
  status: string;
  title: string;
  payload: unknown;
  created_by: string | null;
  reviewed_by: string | null;
  review_note: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
};

export async function listStrategyProposals(eventKey: string): Promise<StrategyProposal[]> {
  const sb = getClient();
  if (!sb) return [];

  const { data, error } = await sb
    .from("strategy_proposals")
    .select("*")
    .eq("event_key", eventKey)
    .order("updated_at", { ascending: false });
  if (error) throw new Response("加载 Strategy Proposal 失败，请确认数据库迁移已执行。", { status: 500 });

  const rows = ((data as StrategyProposalRow[] | null) ?? []).map(rowToProposal);
  return hydrateCreatorNames(rows);
}

export async function saveStrategyProposal(opts: {
  id?: string | null;
  actorOpenId: string;
  submit: boolean;
  eventKey: string;
  matchKey: string;
  matchLabel: string;
  ownTeam: string;
  proposalType: string;
  title: string;
  payload: unknown;
}): Promise<StrategyProposal> {
  const sb = getClient();
  if (!sb) throw new Response("Supabase 未配置", { status: 503 });
  if (!isProposalType(opts.proposalType)) throw new Response("Proposal 类型无效", { status: 400 });
  if (!cleanText(opts.eventKey) || !cleanText(opts.matchKey)) throw new Response("请选择赛事和比赛", { status: 400 });

  const existing = opts.id ? await getStrategyProposal(opts.id) : null;
  if (!canEditProposal(existing, opts.actorOpenId)) throw new Response("当前状态不允许编辑或提交", { status: 403 });

  const now = new Date().toISOString();
  const nextStatus: StrategyProposalStatus = opts.submit ? "submitted" : existing?.status === "rejected" ? "draft" : existing?.status ?? "draft";
  const values = {
    event_key: cleanText(opts.eventKey),
    match_key: cleanText(opts.matchKey),
    match_label: cleanText(opts.matchLabel) || cleanText(opts.matchKey),
    own_team: normalizeOwnTeam(opts.ownTeam),
    proposal_type: opts.proposalType,
    status: nextStatus,
    title: cleanText(opts.title) || defaultTitle(opts.proposalType, opts.matchLabel),
    payload: normalizeProposalPayload(opts.proposalType, opts.payload),
    created_by: existing?.createdBy ?? opts.actorOpenId,
    reviewed_by: nextStatus === "submitted" ? null : existing?.reviewedBy ?? null,
    review_note: nextStatus === "submitted" ? null : existing?.reviewNote ?? null,
    submitted_at: opts.submit ? now : existing?.submittedAt ?? null,
    reviewed_at: nextStatus === "submitted" ? null : existing?.reviewedAt ?? null,
  };

  const request = existing
    ? sb.from("strategy_proposals").update(values).eq("id", existing.id).select("*").single()
    : sb.from("strategy_proposals").insert(values).select("*").single();
  const { data, error } = await request;
  if (error || !data) throw new Response("保存 Strategy Proposal 失败", { status: 500 });

  await appendAudit(opts.submit ? "strategy_proposal.submit" : "strategy_proposal.save", {
    actorOpenId: opts.actorOpenId,
    changedFields: ["event_key", "match_key", "own_team", "proposal_type", "status", "title", "payload"],
  });
  return rowToProposal(data as StrategyProposalRow);
}

export async function reviewStrategyProposal(opts: {
  id: string;
  actorOpenId: string;
  isAdmin: boolean;
  decision: string;
  note: string;
}): Promise<void> {
  const proposal = await getStrategyProposal(opts.id);
  if (!proposal) throw new Response("Proposal 不存在", { status: 404 });
  if (!canReviewProposal(proposal, opts.isAdmin)) throw new Response("无审核权限或当前状态不可审核", { status: 403 });
  const status: StrategyProposalStatus = opts.decision === "approved" ? "approved" : "rejected";
  const sb = getClient();
  if (!sb) throw new Response("Supabase 未配置", { status: 503 });

  const { error } = await sb
    .from("strategy_proposals")
    .update({
      status,
      reviewed_by: opts.actorOpenId,
      review_note: cleanText(opts.note) || null,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", proposal.id);
  if (error) throw new Response("审核 Strategy Proposal 失败", { status: 500 });

  await appendAudit(status === "approved" ? "strategy_proposal.approve" : "strategy_proposal.reject", {
    actorOpenId: opts.actorOpenId,
    changedFields: ["status", "review_note"],
  });
}

async function getStrategyProposal(id: string): Promise<StrategyProposal | null> {
  if (!cleanUuid(id)) return null;
  const sb = getClient();
  if (!sb) return null;
  const { data, error } = await sb.from("strategy_proposals").select("*").eq("id", id).maybeSingle();
  if (error) throw new Response("加载 Strategy Proposal 失败", { status: 500 });
  return data ? rowToProposal(data as StrategyProposalRow) : null;
}

function rowToProposal(row: StrategyProposalRow): StrategyProposal {
  const proposalType: StrategyProposalType = isProposalType(row.proposal_type) ? row.proposal_type : "auto";
  return {
    id: row.id,
    eventKey: row.event_key,
    matchKey: row.match_key,
    matchLabel: row.match_label,
    ownTeam: normalizeOwnTeam(row.own_team),
    proposalType,
    status: isProposalStatus(row.status) ? row.status : "draft",
    title: row.title,
    payload: normalizeProposalPayload(proposalType, row.payload),
    createdBy: row.created_by,
    createdByName: row.created_by ?? "未知",
    reviewedBy: row.reviewed_by,
    reviewNote: row.review_note,
    submittedAt: row.submitted_at,
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function hydrateCreatorNames(proposals: StrategyProposal[]) {
  const sb = getClient();
  const ids = [...new Set(proposals.map((proposal) => proposal.createdBy).filter((id): id is string => Boolean(id)))];
  if (!sb || !ids.length) return proposals;

  const { data } = await sb.from("profiles").select("open_id,name").in("open_id", ids);
  const names = new Map(((data as Array<{ open_id: string; name: string }> | null) ?? []).map((row) => [row.open_id, row.name]));
  return proposals.map((proposal) => ({
    ...proposal,
    createdByName: proposal.createdBy ? names.get(proposal.createdBy) || proposal.createdBy : "未知",
  }));
}

function defaultTitle(type: StrategyProposalType, matchLabel: string) {
  const label = type === "auto" ? "Auto Proposal" : type === "self_strategy" ? "我们自己的策略" : "队友策略";
  return `${matchLabel || "Match"} · ${label}`;
}

function cleanText(value: unknown) {
  return String(value ?? "").trim().slice(0, 5000);
}

function cleanUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
