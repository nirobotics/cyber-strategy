import type { Route } from "./+types/_app._index";
import { AnalyticsDashboard } from "../components/analytics-dashboard";
import { requireUser } from "../lib/auth.server";
import { getStrategyDatasetForRequest, loadScoutConfidenceReport } from "../lib/cyber-scout.server";
import type { CombinedMatch } from "../lib/match-analysis";
import { isAdmin } from "../lib/profiles.server";
import { getDataRange, getTierPercentages } from "../lib/settings.server";
import { toProposalMatches } from "../lib/strategy-proposal-matches";
import { listStrategyProposals } from "../lib/strategy-proposals.server";
import { fetchTbaMatches } from "../lib/tba.server";

export async function loader({ request }: Route.LoaderArgs) {
  const user = requireUser(request, { redirectToLogin: true });
  const [admin, tierPercentages, dataRange] = await Promise.all([
    isAdmin(user.feishuOpenId),
    getTierPercentages(),
    getDataRange(),
  ]);
  const data = await getStrategyDatasetForRequest(request, { includedMatchTypes: dataRange });
  const selectedEventKey = data.selectedEventKey ?? data.dataset.eventKey;
  let proposalError: string | null = null;
  const [proposals, tbaMatches, scoutingLead] = await Promise.all([
    listStrategyProposals(selectedEventKey).catch((error) => {
      proposalError = error instanceof Error ? error.message : "Strategy Proposal 数据表不可用。";
      return [];
    }),
    fetchTbaMatches(selectedEventKey).catch(() => []),
    admin ? loadScoutConfidenceReport(selectedEventKey, { includedMatchTypes: dataRange }).catch(() => null) : Promise.resolve(null),
  ]);

  return {
    ...data,
    selectedEventKey,
    isAdmin: admin,
    tierPercentages,
    user,
    strategyProposal: {
      proposals,
      proposalError,
      matches: toProposalMatches(tbaMatches as CombinedMatch[]),
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
