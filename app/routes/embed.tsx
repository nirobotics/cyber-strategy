import { useState, useSyncExternalStore } from "react";
import type { Route } from "./+types/embed";
import { TeamDetail, TeamDetailModal } from "../components/analytics-dashboard";
import { MatchAnalysis } from "../components/match-analysis";
import { verifyCyberPitEmbedUrl } from "../lib/cyber-pit-embed.server";
import { resolveCyberPitEmbedData } from "../lib/cyber-pit-integration.server";
import { fetchMatchResults } from "../lib/match-results.server";
import { enrichScheduledMatches } from "../lib/match-analysis";
import { getTierPercentages } from "../lib/settings.server";
import { buildTierAssignments } from "../lib/tier-settings";

export const meta = () => [{ title: "Cyber Strategy 分析" }];

export function headers() {
  return {
    "Cache-Control": "private, no-store",
    "Content-Security-Policy": [
      "default-src 'self'",
      "base-uri 'self'",
      "connect-src 'self' https://api.statbotics.io",
      "font-src 'self' data:",
      "form-action 'none'",
      "frame-ancestors https://pit.team8214.com http://localhost:*",
      "frame-src 'none'",
      "img-src 'self' data: https:",
      "object-src 'none'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
    ].join("; "),
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  };
}

export async function loader({ request }: Route.LoaderArgs) {
  const secret = process.env.CYBER_STRATEGY_EMBED_SECRET?.trim() ?? "";
  const payload = verifyCyberPitEmbedUrl(new URL(request.url), secret);
  if (!payload) throw new Response("Not found", { status: 404 });

  if (payload.kind === "team") {
    const [resolved, tierPercentages] = await Promise.all([
      resolveCyberPitEmbedData(payload),
      getTierPercentages(),
    ]);
    if (!resolved) throw new Response("Not found", { status: 404 });
    const teams = Object.values(resolved.dataset.teamData).sort((a, b) => b.avgTotal - a.avgTotal || Number(a.team) - Number(b.team));
    const tiers = buildTierAssignments(teams, tierPercentages);
    return { payload, ...resolved, tier: tiers.get(payload.target) ?? null };
  }

  const [resolved, results] = await Promise.all([
    resolveCyberPitEmbedData(payload),
    fetchMatchResults(payload.eventKey).catch(() => []),
  ]);
  if (!resolved) throw new Response("Not found", { status: 404 });
  return { payload, ...resolved, schedule: enrichScheduledMatches(resolved.schedule, [], results), tier: null };
}

export default function CyberPitEmbed({ loaderData }: Route.ComponentProps) {
  const { payload, dataset, dataRange, schedule, tier } = loaderData;
  const [detailTeam, setDetailTeam] = useState<string | null>(null);
  const detail = detailTeam ? dataset.teamData[detailTeam] : null;
  return (
    <main className="min-h-dvh bg-bg p-3 text-ink md:p-4">
      {payload.kind === "team" ? (
        <EmbedTeamDetail
          teamProps={{
            team: dataset.teamData[payload.target],
            tier: tier ?? undefined,
            photos: [],
            pitInfo: dataset.teamPitData?.[payload.target],
            showMatchTypes: dataRange.length > 1,
          }}
        />
      ) : (
        <MatchAnalysis
          eventKey={dataset.eventKey}
          schedule={schedule}
          teamData={dataset.teamData}
          enrich={false}
          initialMatchKey={loaderData.selectedMatchKey}
          allowBack={false}
          onOpenTeam={(team) => {
            if (dataset.teamData[team]) setDetailTeam(team);
          }}
        />
      )}
      {detail ? (
        <TeamDetailModal
          team={detail}
          photos={[]}
          pitInfo={dataset.teamPitData?.[detail.team]}
          onOpenPhoto={() => {}}
          onClose={() => setDetailTeam(null)}
          showMatchTypes={dataRange.length > 1}
        />
      ) : null}
    </main>
  );
}

function EmbedTeamDetail({ teamProps }: {
  teamProps: Omit<Parameters<typeof TeamDetail>[0], "onOpenPhoto">;
}) {
  const mounted = useSyncExternalStore(emptySubscribe, () => true, () => false);
  return mounted ? <TeamDetail {...teamProps} onOpenPhoto={() => {}} /> : null;
}

function emptySubscribe() {
  return () => {};
}
