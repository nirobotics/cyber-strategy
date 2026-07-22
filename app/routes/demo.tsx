import { Route as StrategyIcon } from "lucide-react";
import { useNavigation } from "react-router";
import type { Route } from "./+types/demo";
import { AnalyticsDashboard } from "../components/analytics-dashboard";
import { AppShell } from "../components/app-shell";
import { Card } from "../components/ui";
import { loadCyberScoutDataset, loadCyberScoutMatches, loadScoutConfidenceReport } from "../lib/cyber-scout.server";
import { buildDemoData, DEMO_EVENT_KEY, DEMO_EVENT_NAME, DEMO_OWN_TEAMS } from "../lib/demo";
import { startFeishuLogin } from "../lib/feishu";
import { toProposalMatches } from "../lib/strategy-proposal-matches";
import { DEFAULT_TIER_PERCENTAGES } from "../lib/tier-settings";

const DEMO_USER = {
  id: "demo",
  feishuOpenId: "demo",
  displayName: "scout 1",
  avatarUrl: null,
};

export async function loader() {
  const [source, matches, scoutingLead] = await Promise.all([
    loadCyberScoutDataset(DEMO_EVENT_KEY),
    loadCyberScoutMatches(DEMO_EVENT_KEY),
    loadScoutConfidenceReport(DEMO_EVENT_KEY),
  ]);

  if (!source.dataset) return { demo: null, error: "Demo 数据源暂不可用。" };

  try {
    return {
      demo: buildDemoData(source.dataset, matches, scoutingLead),
      error: null,
    };
  } catch (error) {
    return { demo: null, error: error instanceof Error ? error.message : "Demo 数据处理失败。" };
  }
}

export default function DemoRoute({ loaderData }: Route.ComponentProps) {
  const navigation = useNavigation();

  return (
    <AppShell
      appName="Cyber Strategy"
      appSubtitle="Demo"
      version="1.0.35"
      user={null}
      authLoading={false}
      allowGuest
      busy={navigation.state !== "idle"}
      onLogin={() => startFeishuLogin("/")}
      Icon={StrategyIcon}
      demoHref="/demo"
    >
      {loaderData.demo ? (
        <AnalyticsDashboard
          dataset={loaderData.demo.dataset}
          events={[{ eventKey: DEMO_EVENT_KEY, name: DEMO_EVENT_NAME, isActive: true, updatedAt: loaderData.demo.dataset.updatedAt }]}
          selectedEventKey={DEMO_EVENT_KEY}
          isAdmin={false}
          tierPercentages={DEFAULT_TIER_PERCENTAGES}
          user={DEMO_USER}
          matchSchedule={loaderData.demo.matches}
          strategyProposal={{ proposals: [], proposalError: null, matches: toProposalMatches(loaderData.demo.matches, DEMO_OWN_TEAMS), loaded: true }}
          scoutingLead={loaderData.demo.scoutingLead}
          demo={{ matches: loaderData.demo.matches, ownTeams: DEMO_OWN_TEAMS, routeBase: "/demo", dataRange: ["qualification"] }}
        />
      ) : (
        <Card className="mx-auto max-w-2xl p-6 text-sm text-ink-dim">{loaderData.error}</Card>
      )}
    </AppShell>
  );
}
