import { Outlet, useLocation, useNavigation } from "react-router";
import { Route as StrategyIcon } from "lucide-react";
import type { Route } from "./+types/_app";
import { AppShell } from "../components/app-shell";
import { requireUser } from "../lib/auth.server";
import { startFeishuLogin } from "../lib/feishu";

export async function loader({ request }: Route.LoaderArgs) {
  return { user: requireUser(request, { redirectToLogin: true }) };
}

export default function AppLayout({ loaderData }: Route.ComponentProps) {
  const location = useLocation();
  const navigation = useNavigation();
  const busy = navigation.state !== "idle";

  return (
    <AppShell
      appName="Cyber Strategy"
      appSubtitle="选队与比赛策略"
      version="1.0.49"
      user={loaderData.user}
      authLoading={false}
      allowGuest={false}
      busy={busy}
      onLogin={() => startFeishuLogin(location.pathname)}
      Icon={StrategyIcon}
    >
      <Outlet context={{ user: loaderData.user }} />
    </AppShell>
  );
}
