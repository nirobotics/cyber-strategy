import type { Route } from "./+types/_app._index";
import { AnalyticsDashboard } from "../components/analytics-dashboard";
import { requireUser } from "../lib/auth.server";
import { getStrategyDatasetForRequest } from "../lib/cyber-scout.server";
import { isAdmin } from "../lib/profiles.server";
import { getTierPercentages } from "../lib/settings.server";

export async function loader({ request }: Route.LoaderArgs) {
  const user = requireUser(request, { redirectToLogin: true });
  const [data, admin, tierPercentages] = await Promise.all([
    getStrategyDatasetForRequest(request),
    isAdmin(user.feishuOpenId),
    getTierPercentages(),
  ]);
  return { ...data, isAdmin: admin, tierPercentages };
}

export default function IndexRoute({ loaderData }: Route.ComponentProps) {
  return (
    <AnalyticsDashboard
      dataset={loaderData.dataset}
      events={loaderData.events}
      selectedEventKey={loaderData.selectedEventKey}
      sourceStatus={loaderData.sourceStatus}
      isAdmin={loaderData.isAdmin}
      tierPercentages={loaderData.tierPercentages}
    />
  );
}
