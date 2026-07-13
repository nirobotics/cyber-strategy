import { Outlet, useLocation, useNavigation } from "react-router";
import { Route as StrategyIcon } from "lucide-react";
import type { Route } from "./+types/_app";
import { AppShell } from "../components/app-shell";
import { useAuth } from "../hooks/useAuth";
import { requireUser } from "../lib/auth.server";
import { startFeishuLogin } from "../lib/feishu";

const AUTH_MODE: "guest-compatible" | "login-required" = "login-required";

export async function loader({ request }: Route.LoaderArgs) {
  return { user: requireUser(request, { redirectToLogin: true }) };
}

export default function AppLayout({ loaderData }: Route.ComponentProps) {
  const location = useLocation();
  const navigation = useNavigation();
  const busy = navigation.state !== "idle";
  const auth = useAuth();
  const user = auth.user ?? loaderData.user;

  return (
    <AppShell
      appName="Cyber Strategy"
      appSubtitle="选队与比赛策略"
      version="1.0.5"
      user={user}
      authLoading={auth.loading}
      allowGuest={AUTH_MODE === "guest-compatible"}
      busy={busy}
      onLogin={() => startFeishuLogin(location.pathname)}
      Icon={StrategyIcon}
    >
      <Outlet context={{ user }} />
    </AppShell>
  );
}
