import type { Route } from "./+types/_app._index";
import { AnalyticsDashboard } from "../components/analytics-dashboard";
import { requireUser } from "../lib/auth.server";
import { getStrategyDatasetForRequest, loadScoutConfidenceReport } from "../lib/cyber-scout.server";
import type { CombinedMatch } from "../lib/match-analysis";
import { isAdmin } from "../lib/profiles.server";
import { getDataRange, getTierPercentages } from "../lib/settings.server";
import { toProposalMatches } from "../lib/strategy-proposal-matches";
import { listStrategyProposals } from "../lib/strategy-proposals.server";

export async function loader({ request }: Route.LoaderArgs) {
  const user = requireUser(request, { redirectToLogin: true });
  const [admin, tierPercentages, dataRange] = await Promise.all([
    isAdmin(user.feishuOpenId),
    getTierPercentages(),
    getDataRange(),
  ]);
  const data = await getStrategyDatasetForRequest(request, { includedMatchTypes: dataRange });
  const { matches, ...strategyData } = data;
  const selectedEventKey = data.selectedEventKey ?? data.dataset.eventKey;
  const activeTab = new URL(request.url).searchParams.get("tab");
  let proposalError: string | null = null;
  const [proposals, scoutingLead] = await Promise.all([
    activeTab === "proposal" ? listStrategyProposals(selectedEventKey).catch((error) => {
      proposalError = error instanceof Error ? error.message : "Strategy Proposal 数据表不可用。";
      return [];
    }) : Promise.resolve([]),
    admin && activeTab === "lead" ? loadScoutConfidenceReport(selectedEventKey, { includedMatchTypes: dataRange, tbaMatches: matches }).catch(() => null) : Promise.resolve(null),
  ]);

  return {
    ...strategyData,
    selectedEventKey,
    isAdmin: admin,
    tierPercentages,
    user,
    strategyProposal: {
      proposals,
      proposalError,
      matches: activeTab === "proposal" ? toProposalMatches(matches as CombinedMatch[]) : [],
      loaded: activeTab === "proposal",
    },
    scoutingLead,
  };
}

export default function IndexRoute({ loaderData }: Route.ComponentProps) {
  return (
    <AnalyticsDashboard
      dataset={loaderData.dataset}
      events={loaderData.events}
      selectedEventKey={loaderData.selectedEventKey}
      isAdmin={loaderData.isAdmin}
      tierPercentages={loaderData.tierPercentages}
      user={loaderData.user}
      strategyProposal={loaderData.strategyProposal}
      scoutingLead={loaderData.scoutingLead}
    />
  );
}
