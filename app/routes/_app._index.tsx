import type { Route } from "./+types/_app._index";
import { AnalyticsDashboard } from "../components/analytics-dashboard";
import { requireUser } from "../lib/auth.server";
import { getActiveDataset } from "../lib/datasets.server";
import { isAdmin } from "../lib/profiles.server";

export async function loader({ request }: Route.LoaderArgs) {
  const user = requireUser(request, { redirectToLogin: true });
  const [dataset, admin] = await Promise.all([getActiveDataset(), isAdmin(user.feishuOpenId)]);
  return { dataset, isAdmin: admin };
}

export default function IndexRoute({ loaderData }: Route.ComponentProps) {
  return <AnalyticsDashboard dataset={loaderData.dataset} isAdmin={loaderData.isAdmin} />;
}
