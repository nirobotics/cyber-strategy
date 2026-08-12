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
      appSubtitle="FRC比赛数据查看"
      version="2026.1.47"
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
