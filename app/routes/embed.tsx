import { useState, useSyncExternalStore } from "react";
import { data } from "react-router";
import type { Route } from "./+types/embed";
import { TeamDetail, TeamDetailModal } from "../components/analytics-dashboard";
import { MatchAnalysis } from "../components/match-analysis";
import { verifyCyberPitEmbedUrl } from "../lib/cyber-pit-embed.server";
import { resolveCyberPitEmbedData, selectCyberPitMatchData } from "../lib/cyber-pit-integration.server";
import { fetchMatchResults } from "../lib/match-results.server";
import { enrichScheduledMatches, strategyScoreSd } from "../lib/match-analysis";
import { getTierPercentages } from "../lib/settings.server";
import { buildTierAssignments } from "../lib/tier-settings";
import { formatServerTiming, recordServerTiming, timeServerTask, type ServerTimingEntry } from "../lib/server-timing.server";

export const meta = () => [{ title: "Cyber Strategy 分析" }];

export function headers({ loaderHeaders }: Route.HeadersArgs) {
  const headers = new Headers({
    "Cache-Control": "private, no-store",
    "Content-Security-Policy": "frame-ancestors https://pit.team8214.com http://localhost:*",
    "Referrer-Policy": "no-referrer",
  });
  const serverTiming = loaderHeaders.get("Server-Timing");
  if (serverTiming) headers.set("Server-Timing", serverTiming);
  return headers;
}

export async function loader({ request }: Route.LoaderArgs) {
  const startedAt = performance.now();
  const timings: ServerTimingEntry[] = [];
  const secret = process.env.CYBER_STRATEGY_EMBED_SECRET?.trim() ?? "";
  const payload = verifyCyberPitEmbedUrl(new URL(request.url), secret);
  if (!payload) throw new Response("Not found", { status: 404 });

  if (payload.kind === "team") {
    const [resolved, tierPercentages] = await Promise.all([
      resolveCyberPitEmbedData(payload, timings),
      getTierPercentages(),
    ]);
    if (!resolved) throw new Response("Not found", { status: 404 });
    const view = await timeServerTask(timings, "embed_view", async () => {
      const teams = Object.values(resolved.dataset.teamData).sort((a, b) => b.avgTotal - a.avgTotal || Number(a.team) - Number(b.team));
      const tiers = buildTierAssignments(teams, tierPercentages);
      return {
        kind: "team" as const,
        team: resolved.dataset.teamData[payload.target],
        tier: tiers.get(payload.target) ?? null,
        pitInfo: resolved.dataset.teamPitData?.[payload.target],
        showMatchTypes: resolved.dataRange.length > 1,
      };
    });
    recordServerTiming(timings, "embed_total", startedAt);
    return data(view, { headers: { "Server-Timing": formatServerTiming(timings) } });
  }

  const [resolved, results] = await Promise.all([
    resolveCyberPitEmbedData(payload, timings),
    timeServerTask(timings, "embed_results", () => fetchMatchResults(payload.eventKey).catch(() => [])),
  ]);
  if (!resolved || !resolved.selectedMatch) throw new Response("Not found", { status: 404 });
  const view = await timeServerTask(timings, "embed_view", async () => {
    const match = enrichScheduledMatches([resolved.selectedMatch], [], results)[0] ?? resolved.selectedMatch;
    const selected = selectCyberPitMatchData(match, resolved.dataset.teamData, resolved.dataset.teamPitData);
    return {
      kind: "match" as const,
      eventKey: resolved.dataset.eventKey,
      schedule: [match],
      selectedMatchKey: resolved.selectedMatchKey,
      strategyScoreSd: strategyScoreSd(resolved.schedule, resolved.dataset.teamData),
      showMatchTypes: resolved.dataRange.length > 1,
      ...selected,
    };
  });
  recordServerTiming(timings, "embed_total", startedAt);
  return data(view, { headers: { "Server-Timing": formatServerTiming(timings) } });
}

export default function CyberPitEmbed({ loaderData }: Route.ComponentProps) {
  const [detailTeam, setDetailTeam] = useState<string | null>(null);
  const detail = loaderData.kind === "match" && detailTeam ? loaderData.teamData[detailTeam] : null;
  return (
    <main className="min-h-dvh bg-bg p-3 text-ink md:p-4">
      {loaderData.kind === "team" ? (
        <EmbedTeamDetail
          teamProps={{
            team: loaderData.team,
            tier: loaderData.tier ?? undefined,
            photos: [],
            pitInfo: loaderData.pitInfo,
            showMatchTypes: loaderData.showMatchTypes,
          }}
        />
      ) : (
        <MatchAnalysis
          eventKey={loaderData.eventKey}
          schedule={loaderData.schedule}
          teamData={loaderData.teamData}
          enrich={false}
          initialMatchKey={loaderData.selectedMatchKey}
          strategyScoreSdOverride={loaderData.strategyScoreSd}
          allowBack={false}
          onOpenTeam={(team) => {
            if (loaderData.teamData[team]) setDetailTeam(team);
          }}
        />
      )}
      {detail ? (
        <TeamDetailModal
          team={detail}
          photos={[]}
          pitInfo={loaderData.kind === "match" ? loaderData.teamPitData[detail.team] : undefined}
          onOpenPhoto={() => {}}
          onClose={() => setDetailTeam(null)}
          showMatchTypes={loaderData.showMatchTypes}
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
