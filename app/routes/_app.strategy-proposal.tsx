import { Navigate, useSearchParams } from "react-router";
import type { Route } from "./+types/_app.strategy-proposal";
import { requireUser } from "../lib/auth.server";
import { loadCyberScoutProposalMatches } from "../lib/cyber-scout.server";
import { isAdmin } from "../lib/profiles.server";
import { getDataRange } from "../lib/settings.server";
import { cleanTbaEventKey } from "../lib/tba.server";
import {
  deleteStrategyProposal,
  listStrategyProposals,
  reviewStrategyProposal,
  restoreApprovedStrategyProposal,
  saveStrategyProposal,
} from "../lib/strategy-proposals.server";

type StrategyProposalActionData = { error?: string; ok?: boolean; proposalId?: string; deleted?: boolean };

export async function loader({ request }: Route.LoaderArgs) {
  requireUser(request, { redirectToLogin: true });
  const selectedEventKey = cleanTbaEventKey(new URL(request.url).searchParams.get("event"));
  if (!selectedEventKey) {
    return {
      selectedEventKey: "",
      proposals: [],
      proposalError: null,
      matches: [],
    };
  }
  const dataRange = await getDataRange();
  let proposalError: string | null = null;
  const [proposals, matches] = await Promise.all([
    listStrategyProposals(selectedEventKey).catch((error) => {
      proposalError = error instanceof Error ? error.message : "Strategy Proposal 数据表不可用。";
      return [];
    }),
    loadCyberScoutProposalMatches(selectedEventKey, dataRange).catch(() => []),
  ]);

  return {
    selectedEventKey,
    proposals,
    proposalError,
    matches,
  };
}

export async function action({ request }: Route.ActionArgs): Promise<StrategyProposalActionData> {
  const user = requireUser(request);
  const admin = await isAdmin(user.feishuOpenId);
  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");
  const eventKey = String(formData.get("eventKey") || "");

  try {
    if (intent === "save" || intent === "submit") {
      const proposal = await saveStrategyProposal({
        id: String(formData.get("id") || "") || null,
        actorOpenId: user.feishuOpenId,
        isAdmin: admin,
        submit: intent === "submit",
        eventKey,
        matchKey: String(formData.get("matchKey") || ""),
        matchLabel: String(formData.get("matchLabel") || ""),
        ownTeam: String(formData.get("ownTeam") || ""),
        proposalType: String(formData.get("proposalType") || ""),
        payload: parsePayload(String(formData.get("payload") || "{}")),
      });
      return { ok: true, proposalId: proposal.id };
    }

    if (intent === "restore") {
      const proposal = await restoreApprovedStrategyProposal({
        id: String(formData.get("id") || ""),
        actorOpenId: user.feishuOpenId,
        isAdmin: admin,
      });
      return { ok: true, proposalId: proposal.id };
    }

    if (intent === "review") {
      await reviewStrategyProposal({
        id: String(formData.get("id") || ""),
        actorOpenId: user.feishuOpenId,
        isAdmin: admin,
        decision: String(formData.get("decision") || ""),
        note: String(formData.get("reviewNote") || ""),
      });
      return { ok: true, proposalId: String(formData.get("id") || "") };
    }

    if (intent === "delete") {
      await deleteStrategyProposal({
        id: String(formData.get("id") || ""),
        actorOpenId: user.feishuOpenId,
        isAdmin: admin,
      });
      return { ok: true, deleted: true };
    }
  } catch (error) {
    if (error instanceof Response) return { error: await error.text() || "操作失败。" };
    return { error: error instanceof Error ? error.message : "操作失败。" };
  }

  return { error: "未知操作。" };
}

export default function StrategyProposalRoute({ loaderData }: Route.ComponentProps) {
  const [searchParams] = useSearchParams();
  const params = new URLSearchParams(searchParams);
  if (loaderData.selectedEventKey) params.set("event", loaderData.selectedEventKey);
  params.set("tab", "proposal");
  return <Navigate to={`/?${params.toString()}`} replace />;
}

function parsePayload(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new Response("Proposal payload 无效", { status: 400 });
  }
}
