import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { ChartConfiguration } from "chart.js";
import { ArrowLeft, BarChart3, Gauge, RefreshCw, Target, Trophy } from "lucide-react";
import { ChartCanvas } from "./chart-canvas";
import { Button, Card, cn } from "./ui";
import {
  buildTeamEventMap,
  fmt,
  levelLabel,
  matchIdentity,
  matchLabel,
  matchTeams,
  mergeMatches,
  resolveMatchScores,
  resolveTeamMetric,
  resolveWinProbability,
  sortedMatches,
  type CombinedMatch,
  type StatboticsMatch,
  type TbaMatch,
  type TeamEvent,
  type TeamMetric,
  type WinProbability,
} from "../lib/match-analysis";
import type { TeamData } from "../lib/scouting";

type LoadState =
  | { status: "idle" | "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; matches: CombinedMatch[]; teamEvents: TeamEvent[] };

export function MatchAnalysis({ eventKey, teamData }: { eventKey: string; teamData: TeamData }) {
  const [selectedMatchKey, setSelectedMatchKey] = useState<string | null>(null);
  const [state, setState] = useState<LoadState>({ status: "idle" });

  useEffect(() => {
    let alive = true;
    queueMicrotask(() => {
      if (!alive) return;
      setSelectedMatchKey(null);
      setState({ status: "loading" });
    });
    Promise.allSettled([
      fetch(`/api/tba/matches?event=${encodeURIComponent(eventKey)}`),
      fetch(`https://api.statbotics.io/v3/matches?event=${encodeURIComponent(eventKey)}&limit=500`),
      fetch(`https://api.statbotics.io/v3/team_events?event=${encodeURIComponent(eventKey)}&limit=200`),
    ])
      .then(async ([tbaResult, matchesResult, teamEventsResult]) => {
        if (!alive) return;
        const tbaMatches = tbaResult.status === "fulfilled" && tbaResult.value.ok
          ? (((await tbaResult.value.json()) as { matches?: TbaMatch[] }).matches ?? [])
          : [];
        const matches = matchesResult.status === "fulfilled" && matchesResult.value.ok
          ? ((await matchesResult.value.json()) as StatboticsMatch[])
          : [];
        const teamEvents = teamEventsResult.status === "fulfilled" && teamEventsResult.value.ok
          ? ((await teamEventsResult.value.json()) as TeamEvent[])
          : [];
        const combinedMatches = mergeMatches(matches, tbaMatches);
        if (!combinedMatches.length && !teamEvents.length) {
          setState({ status: "error", message: "暂无可用赛程数据。" });
          return;
        }
        setState({ status: "ready", matches: combinedMatches, teamEvents });
      })
      .catch((error: Error) => {
        if (alive) setState({ status: "error", message: error.message });
      });
    return () => {
      alive = false;
    };
  }, [eventKey]);

  const selectedMatch = state.status === "ready" && selectedMatchKey
    ? state.matches.find((match) => matchIdentity(match) === selectedMatchKey) ?? null
    : null;

  return (
    <div className="space-y-3">
      <Card className="flex flex-wrap items-center justify-between gap-2 p-3">
        <div>
          <p className="section-label">TBA / Strategy / Statbotics</p>
          <h2 className="text-lg font-semibold text-ink">{eventKey}</h2>
        </div>
      </Card>

      {state.status === "loading" || state.status === "idle" ? (
        <Card className="grid place-items-center p-10 text-ink-dim">
          <RefreshCw className="mb-3 size-6 animate-spin" />
          正在加载赛程数据
        </Card>
      ) : null}

      {state.status === "error" ? (
        <Card className="p-6 text-danger">
          <p className="font-semibold">无法加载比赛数据</p>
          <p className="mt-1 text-sm text-ink-dim">{state.message}</p>
        </Card>
      ) : null}

      {state.status === "ready" && selectedMatch ? (
        <MatchDetail
          match={selectedMatch}
          matches={state.matches}
          teamData={teamData}
          teamEvents={state.teamEvents}
          onBack={() => setSelectedMatchKey(null)}
        />
      ) : null}
      {state.status === "ready" && !selectedMatch ? (
        <MatchSchedule
          matches={state.matches}
          teamData={teamData}
          onSelectMatch={(match) => setSelectedMatchKey(matchIdentity(match))}
        />
      ) : null}
    </div>
  );
}

function MatchSchedule({
  matches,
  teamData,
  onSelectMatch,
}: {
  matches: CombinedMatch[];
  teamData: TeamData;
  onSelectMatch: (match: CombinedMatch) => void;
}) {
  if (!matches.length) {
    return <Card className="p-8 text-center text-ink-dim">暂无赛程数据。</Card>;
  }

  const sorted = sortedMatches(matches);
  const rows = sorted.map((match, index) => {
    const group = levelLabel(match.comp_level ?? "qm");
    const previous = index > 0 ? levelLabel(sorted[index - 1].comp_level ?? "qm") : "";
    return { match, group, showGroup: group !== previous };
  });

  return (
    <div className="space-y-3">
      {rows.map(({ match, group, showGroup }) => (
        <div key={matchIdentity(match)}>
          {showGroup ? <h3 className="mb-2 section-label">{group}</h3> : null}
          <MatchCard match={match} matches={matches} teamData={teamData} onSelect={() => onSelectMatch(match)} />
        </div>
      ))}
    </div>
  );
}

function MatchCard({
  match,
  matches,
  teamData,
  onSelect,
}: {
  match: CombinedMatch;
  matches: CombinedMatch[];
  teamData: TeamData;
  onSelect: () => void;
}) {
  const redTeams = matchTeams(match, "red");
  const blueTeams = matchTeams(match, "blue");
  const score = resolveMatchScores({ match, redTeams, blueTeams, teamData });
  const probability = resolveWinProbability({ match, redTeams, blueTeams, teamData, matches });

  return (
    <button
      type="button"
      data-testid={`match-card-${matchIdentity(match)}`}
      onClick={onSelect}
      className="card w-full p-3 text-left transition hover:border-brand hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="text-xs font-semibold uppercase text-ink-faint">{matchLabel(match)}</span>
        <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", scoreBadgeClass(score.source))}>
          {score.label}
        </span>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(72px,auto)_minmax(0,1fr)] items-center gap-2">
        <AllianceBlock
          color="red"
          winner={score.winner === "red"}
          actualScore={score.actualRed}
          predictedScore={score.predictedRed}
          teams={redTeams}
        />
        <div className="grid justify-items-center gap-1 text-xs text-ink-faint">
          <span className="font-semibold uppercase">对阵</span>
          {probability ? (
            <>
              <div className="h-1.5 w-20 overflow-hidden rounded-full bg-info/30">
                <div className="h-full rounded-full bg-danger" style={{ width: `${Math.round(probability.red * 100)}%` }} />
              </div>
              <span>红方 {Math.round(probability.red * 100)}%</span>
            </>
          ) : null}
          {score.source !== "tba" && score.displayRed != null && score.displayBlue != null ? (
            <span>{Math.round(score.displayRed)} - {Math.round(score.displayBlue)}</span>
          ) : null}
        </div>
        <AllianceBlock
          color="blue"
          winner={score.winner === "blue"}
          actualScore={score.actualBlue}
          predictedScore={score.predictedBlue}
          teams={blueTeams}
        />
      </div>
    </button>
  );
}

function AllianceBlock({
  color,
  winner,
  actualScore,
  predictedScore,
  teams,
}: {
  color: "red" | "blue";
  winner: boolean;
  actualScore: number | null;
  predictedScore: number | null;
  teams: string[];
}) {
  const hasActual = actualScore != null;
  const primaryScore = hasActual ? actualScore : predictedScore;
  return (
    <div
      className={cn(
        "rounded-md border p-3 text-center",
        color === "red" ? "border-danger/30 bg-danger/10" : "border-info/30 bg-info/10",
        winner && (color === "red" ? "ring-2 ring-danger" : "ring-2 ring-info"),
      )}
    >
      <div className={cn("text-2xl font-semibold", color === "red" ? "text-danger" : "text-info")}>
        {primaryScore == null ? "-" : hasActual ? Math.round(primaryScore) : `~${Math.round(primaryScore)}`}
      </div>
      {hasActual && predictedScore != null ? (
        <div className="mt-0.5 text-[11px] font-medium text-ink-faint">预测 {Math.round(predictedScore)}</div>
      ) : null}
      <div className="mt-1 text-xs leading-5 text-ink-dim">{teams.length ? teams.join(" · ") : "待定"}</div>
    </div>
  );
}

function MatchDetail({
  match,
  matches,
  teamData,
  teamEvents,
  onBack,
}: {
  match: CombinedMatch;
  matches: CombinedMatch[];
  teamData: TeamData;
  teamEvents: TeamEvent[];
  onBack: () => void;
}) {
  const redTeams = matchTeams(match, "red");
  const blueTeams = matchTeams(match, "blue");
  const score = resolveMatchScores({ match, redTeams, blueTeams, teamData });
  const probability = resolveWinProbability({ match, redTeams, blueTeams, teamData, matches });
  const teamEventMap = useMemo(() => buildTeamEventMap(teamEvents), [teamEvents]);
  const matchNumber = match.match_number ?? null;
  const redMetrics = redTeams.map((team) => resolveTeamMetric({ team, teamData, teamEvents: teamEventMap, matchNumber }));
  const blueMetrics = blueTeams.map((team) => resolveTeamMetric({ team, teamData, teamEvents: teamEventMap, matchNumber }));
  const allMetrics = [...redMetrics, ...blueMetrics];

  return (
    <div className="space-y-3" data-testid="match-detail">
      <Card className="flex flex-wrap items-center justify-between gap-3 p-3">
        <div className="flex min-w-0 items-center gap-3">
          <Button type="button" onClick={onBack} className="h-9 px-2" title="返回赛程" data-testid="match-detail-back">
            <ArrowLeft className="size-4" />
          </Button>
          <div className="min-w-0">
            <p className="section-label">Match Analysis</p>
            <h3 className="truncate text-xl font-semibold text-ink">Match {matchLabel(match)}</h3>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <StatusPill label={actualLabel(score.actualRed, score.actualBlue)} tone={score.source === "tba" ? "ok" : "muted"} />
          <StatusPill label={predictedLabel(score.predictedRed, score.predictedBlue)} tone="warn" />
          <StatusPill label={probabilityLabel(probability)} tone={probability?.source === "strategy" ? "brand" : "info"} />
        </div>
      </Card>

      <WinProbabilityPanel probability={probability} score={score} />

      <div className="space-y-3">
        <AllianceDetail
          color="red"
          label="红方"
          teams={redTeams}
          metrics={redMetrics}
          actualScore={score.actualRed}
          predictedScore={score.predictedRed}
          winner={score.winner === "red"}
        />
        <AllianceDetail
          color="blue"
          label="蓝方"
          teams={blueTeams}
          metrics={blueMetrics}
          actualScore={score.actualBlue}
          predictedScore={score.predictedBlue}
          winner={score.winner === "blue"}
        />
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        <ChartCard title="联盟 Auto / Tele 对比" icon={<BarChart3 className="size-4" />}>
          <ChartCanvas
            label="联盟 Auto 和 Tele 对比"
            configKey={`match-alliance:${matchIdentity(match)}:${metricKey(allMetrics)}`}
            buildConfig={(palette) => allianceContributionConfig(redMetrics, blueMetrics, palette)}
          />
        </ChartCard>
        <ChartCard title="六队综合分范围" icon={<Gauge className="size-4" />}>
          <ChartCanvas
            label="六队综合分范围"
            configKey={`match-range:${matchIdentity(match)}:${metricKey(allMetrics)}`}
            buildConfig={(palette) => rangeConfig(allMetrics, palette)}
          />
        </ChartCard>
        <ChartCard title="命中率 / 可靠性" icon={<Target className="size-4" />}>
          <ChartCanvas
            label="六队命中率和可靠性"
            configKey={`match-health:${matchIdentity(match)}:${metricKey(allMetrics)}`}
            buildConfig={(palette) => healthConfig(allMetrics, palette)}
          />
        </ChartCard>
        <ChartCard title="Auto vs Tele" icon={<Trophy className="size-4" />}>
          <ChartCanvas
            label="六队 Auto 和 Tele"
            configKey={`match-auto-tele:${matchIdentity(match)}:${metricKey(allMetrics)}`}
            buildConfig={(palette) => autoTeleConfig(allMetrics, palette)}
          />
        </ChartCard>
      </div>
    </div>
  );
}

function WinProbabilityPanel({ probability, score }: { probability: WinProbability | null; score: ReturnType<typeof resolveMatchScores> }) {
  if (!probability) {
    return (
      <Card className="p-4">
        <p className="section-label">预测胜率</p>
        <p className="mt-2 text-sm text-ink-dim">当前比赛缺少足够队伍评分，暂不能计算胜率。</p>
      </Card>
    );
  }

  const redPct = Math.round(probability.red * 100);
  const bluePct = 100 - redPct;
  return (
    <Card className="p-4">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="section-label">预测胜率</p>
          <p className="mt-1 text-sm text-ink-dim">{probability.source === "strategy" ? "综合评分套用 Statbotics logistic 公式" : "Statbotics fallback"}</p>
        </div>
        {score.predictedRed != null && score.predictedBlue != null ? (
          <div className="text-sm font-semibold text-ink-dim">
            预测比分 {Math.round(score.predictedRed)} - {Math.round(score.predictedBlue)}
          </div>
        ) : null}
      </div>
      <div className="grid gap-2 md:grid-cols-[auto_1fr_auto] md:items-center">
        <div className="text-danger">
          <span className="text-sm font-semibold">红方</span>
          <span className="ml-2 text-2xl font-semibold">{redPct}%</span>
        </div>
        <div className="h-3 overflow-hidden rounded-full bg-info/30">
          <div className="h-full rounded-full bg-danger" style={{ width: `${redPct}%` }} />
        </div>
        <div className="text-info md:text-right">
          <span className="text-sm font-semibold">蓝方</span>
          <span className="ml-2 text-2xl font-semibold">{bluePct}%</span>
        </div>
      </div>
    </Card>
  );
}

function AllianceDetail({
  color,
  label,
  teams,
  metrics,
  actualScore,
  predictedScore,
  winner,
}: {
  color: "red" | "blue";
  label: string;
  teams: string[];
  metrics: TeamMetric[];
  actualScore: number | null;
  predictedScore: number | null;
  winner: boolean;
}) {
  return (
    <Card className={cn("overflow-hidden p-0", color === "red" ? "border-danger/30" : "border-info/30")}>
      <div className={cn("grid gap-3 p-3 lg:grid-cols-[140px_minmax(0,1fr)]", color === "red" ? "bg-danger/10" : "bg-info/10")}>
        <div className="flex items-center justify-between gap-3 lg:grid lg:content-center lg:justify-start">
          <div>
            <p className={cn("text-xs font-semibold uppercase", color === "red" ? "text-danger" : "text-info")}>{label}</p>
            <p className={cn("text-3xl font-semibold", color === "red" ? "text-danger" : "text-info")}>
              {actualScore == null ? predictedScore == null ? "-" : `~${Math.round(predictedScore)}` : Math.round(actualScore)}
            </p>
            {predictedScore != null ? <p className="text-xs text-ink-dim">预测 {Math.round(predictedScore)}</p> : null}
          </div>
          {winner ? <span className="rounded-full bg-ok/10 px-2 py-1 text-xs font-semibold text-ok">胜方</span> : null}
        </div>
        <div className="grid gap-2 md:grid-cols-3">
          {metrics.map((metric) => (
            <TeamMetricCard key={metric.team} metric={metric} />
          ))}
          {!teams.length ? <div className="rounded-md border border-line bg-surface p-3 text-sm text-ink-dim">待定</div> : null}
        </div>
      </div>
    </Card>
  );
}

function TeamMetricCard({ metric }: { metric: TeamMetric }) {
  return (
    <div className="rounded-md border border-line bg-surface p-3">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-brand">Team {metric.team}</p>
          <p className="text-[11px] font-semibold uppercase text-ink-faint">{metric.ratingLabel}</p>
        </div>
        <span className="text-xl font-semibold text-ink">{fmt(metric.rating)}</span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs text-ink-dim">
        <span>Auto {fmt(metric.auto)}</span>
        <span>Tele {fmt(metric.tele)}</span>
        <span>命中率 {metric.accuracy == null ? "-" : `${Math.round(metric.accuracy)}%`}</span>
        <span>可靠性 {metric.reliability == null ? "-" : `${metric.reliability}%`}</span>
        <span>趋势 {trendLabel(metric.trend)}</span>
        <span>范围 {metric.min == null || metric.max == null ? "-" : `${Math.round(metric.min)}-${Math.round(metric.max)}`}</span>
      </div>
      {metric.scoutMatch ? (
        <div className="mt-2 rounded-md bg-surface-2 px-2 py-1 text-xs text-ink-dim">
          本场 Scout：{fmt(metric.scoutMatch.totalPts)} / A {fmt(metric.scoutMatch.autoPts)} / T {fmt(metric.scoutMatch.telePts)}
        </div>
      ) : null}
    </div>
  );
}

function ChartCard({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <Card className="p-4">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink-dim">
        {icon}
        {title}
      </h3>
      {children}
    </Card>
  );
}

function StatusPill({ label, tone }: { label: string; tone: "brand" | "info" | "muted" | "ok" | "warn" }) {
  return (
    <span className={cn("rounded-full px-2 py-1 text-xs font-semibold", toneClass(tone))}>
      {label}
    </span>
  );
}

function actualLabel(red: number | null, blue: number | null) {
  return red == null || blue == null ? "实际 暂无" : `实际 ${Math.round(red)}-${Math.round(blue)}`;
}

function predictedLabel(red: number | null, blue: number | null) {
  return red == null || blue == null ? "预测 暂无" : `预测 ${Math.round(red)}-${Math.round(blue)}`;
}

function probabilityLabel(probability: WinProbability | null) {
  if (!probability) return "胜率暂无";
  return probability.source === "strategy" ? "综合评分胜率" : "Statbotics 胜率";
}

function scoreBadgeClass(source: string) {
  if (source === "tba") return "bg-ok/10 text-ok";
  if (source === "strategy") return "bg-warn/10 text-warn";
  if (source === "statbotics") return "bg-info/10 text-info";
  return "bg-surface-2 text-ink-dim";
}

function toneClass(tone: "brand" | "info" | "muted" | "ok" | "warn") {
  return {
    brand: "bg-brand/10 text-brand",
    info: "bg-info/10 text-info",
    muted: "bg-surface-2 text-ink-dim",
    ok: "bg-ok/10 text-ok",
    warn: "bg-warn/10 text-warn",
  }[tone];
}

function trendLabel(trend: TeamMetric["trend"]) {
  if (trend === "up") return "上升";
  if (trend === "down") return "下降";
  if (trend === "stable") return "稳定";
  return "-";
}

function metricKey(metrics: TeamMetric[]) {
  return metrics.map((metric) => `${metric.team}:${metric.rating}:${metric.auto}:${metric.tele}:${metric.accuracy}:${metric.reliability}`).join("|");
}

function sumMetric(metrics: TeamMetric[], key: "auto" | "tele" | "rating") {
  return metrics.reduce((sum, metric) => sum + (metric[key] ?? 0), 0);
}

function allianceContributionConfig(red: TeamMetric[], blue: TeamMetric[], palette: ChartPaletteLike): ChartConfiguration {
  return {
    type: "bar",
    data: {
      labels: ["红方", "蓝方"],
      datasets: [
        { label: "Auto", data: [sumMetric(red, "auto"), sumMetric(blue, "auto")], backgroundColor: palette.colors[0] },
        { label: "Tele", data: [sumMetric(red, "tele"), sumMetric(blue, "tele")], backgroundColor: palette.colors[2] },
      ],
    },
    options: chartOptions(palette),
  } as ChartConfiguration;
}

function rangeConfig(metrics: TeamMetric[], palette: ChartPaletteLike): ChartConfiguration {
  return {
    type: "bar",
    data: {
      labels: metrics.map((metric) => metric.team),
      datasets: [
        { label: "最低", data: metrics.map((metric) => metric.min ?? metric.rating ?? 0), backgroundColor: `${palette.colors[1]}55` },
        { label: "平均", data: metrics.map((metric) => metric.rating ?? 0), backgroundColor: palette.colors[0] },
        { label: "最高", data: metrics.map((metric) => metric.max ?? metric.rating ?? 0), backgroundColor: `${palette.colors[2]}77` },
      ],
    },
    options: chartOptions(palette),
  } as ChartConfiguration;
}

function healthConfig(metrics: TeamMetric[], palette: ChartPaletteLike): ChartConfiguration {
  return {
    type: "bar",
    data: {
      labels: metrics.map((metric) => metric.team),
      datasets: [
        { label: "命中率", data: metrics.map((metric) => metric.accuracy ?? 0), backgroundColor: palette.colors[0] },
        { label: "可靠性", data: metrics.map((metric) => metric.reliability ?? 0), backgroundColor: palette.colors[2] },
      ],
    },
    options: {
      ...chartOptions(palette),
      scales: {
        x: { ticks: { color: palette.muted }, grid: { color: palette.grid } },
        y: { ticks: { color: palette.muted, callback: (value) => `${value}%` }, grid: { color: palette.grid }, beginAtZero: true, max: 100 },
      },
    },
  } as ChartConfiguration;
}

function autoTeleConfig(metrics: TeamMetric[], palette: ChartPaletteLike): ChartConfiguration {
  return {
    type: "bar",
    data: {
      labels: metrics.map((metric) => metric.team),
      datasets: [
        { label: "Auto", data: metrics.map((metric) => metric.auto ?? 0), backgroundColor: palette.colors[0] },
        { label: "Tele", data: metrics.map((metric) => metric.tele ?? 0), backgroundColor: palette.colors[2] },
      ],
    },
    options: chartOptions(palette),
  } as ChartConfiguration;
}

function chartOptions(palette: ChartPaletteLike): ChartConfiguration["options"] {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: palette.muted, boxWidth: 10 } },
      tooltip: {
        backgroundColor: palette.panel,
        titleColor: palette.muted,
        bodyColor: palette.muted,
        borderColor: palette.muted,
        borderWidth: 1,
      },
    },
    scales: {
      x: { ticks: { color: palette.muted }, grid: { color: palette.grid } },
      y: { ticks: { color: palette.muted }, grid: { color: palette.grid }, beginAtZero: true },
    },
  };
}

type ChartPaletteLike = {
  muted: string;
  grid: string;
  panel: string;
  colors: string[];
};
