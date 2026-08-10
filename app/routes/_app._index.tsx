import type { Route } from "./+types/_app._index";
import type { ShouldRevalidateFunctionArgs } from "react-router";
import { AnalyticsDashboard } from "../components/analytics-dashboard";
import { requireUser } from "../lib/auth.server";
import { getStrategyDatasetForRequest } from "../lib/cyber-scout.server";
import { shouldRevalidateDashboard } from "../lib/dashboard-performance";
import { isAdmin } from "../lib/profiles.server";
import { getDataRange, getTierPercentages } from "../lib/settings.server";

export async function loader({ request }: Route.LoaderArgs) {
  const user = requireUser(request, { redirectToLogin: true });
  const [admin, tierPercentages, dataRange] = await Promise.all([
    isAdmin(user.feishuOpenId),
    getTierPercentages(),
    getDataRange(),
  ]);
  const datasetRequest = admin ? request : new Request(new URL(request.url).origin + new URL(request.url).pathname, request);
  const data = await getStrategyDatasetForRequest(datasetRequest, { includedMatchTypes: dataRange });
  const { matches: _matches, ...strategyData } = data;
  const selectedEventKey = data.selectedEventKey ?? data.dataset.eventKey;

  return {
    ...strategyData,
    selectedEventKey,
    isAdmin: admin,
    tierPercentages,
    dataRange,
    user,
    matchSchedule: [],
    strategyProposal: {
      proposals: [],
      proposalError: null,
      matches: [],
      loaded: false,
    },
    scoutingLead: null,
  };
}

export function shouldRevalidate({ formAction, defaultShouldRevalidate }: ShouldRevalidateFunctionArgs) {
  return shouldRevalidateDashboard(formAction, defaultShouldRevalidate);
}

export default function IndexRoute({ loaderData }: Route.ComponentProps) {
  return (
    <AnalyticsDashboard
      dataset={loaderData.dataset}
      events={loaderData.events}
      selectedEventKey={loaderData.selectedEventKey}
      isAdmin={loaderData.isAdmin}
      tierPercentages={loaderData.tierPercentages}
      dataRange={loaderData.dataRange}
      user={loaderData.user}
      matchSchedule={loaderData.matchSchedule}
      strategyProposal={loaderData.strategyProposal}
      scoutingLead={loaderData.scoutingLead}
    />
  );
}
