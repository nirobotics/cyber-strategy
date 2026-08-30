import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { ChartConfiguration } from "chart.js";
import {
  BarChart3,
  Bot,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  FileText,
  LineChart,
  ListChecks,
  Map as MapIcon,
  Search,
  Settings,
  ShieldCheck,
  Table2,
  X,
} from "lucide-react";
import { useFetcher, useNavigate, useSearchParams } from "react-router";
import { Badge, Button, Card, Input, cn } from "./ui";
import { ChartCanvas } from "./chart-canvas";
import type { ScoutingLeadPanelData } from "./scouting-lead-panel";
import type { StrategyProposalPanelData } from "./strategy-proposal-panel";
import type { SessionUser } from "../lib/auth-types";
import {
  applyIgnoredMatchesToTeamData,
  matchIgnoreKey,
  reliability,
  scoutingMatchStatus,
  sortedTeams,
  type ScoutingDataset,
  type ScoutingEventOption,
  type ScoutingMatch,
  type TeamPitInfo,
  type TeamSummary,
} from "../lib/scouting";
import { buildTierAssignments, tierDisplayLabel, type TierInfo, type TierPercentages } from "../lib/tier-settings";
import { analyzeRouteRepetition, buildMatchAutoRoutes } from "../lib/match-auto-routes";
import type { CombinedMatch } from "../lib/match-analysis";
import type { DataRange } from "../lib/data-range";
import { dashboardResourcePath } from "../lib/dashboard-performance";
import type { PicklistResource } from "../lib/picklist";
import { formatSeasonMetric, seasonConfig } from "../season/config";
import { autoRouteField } from "../season/fields";

type Tab = "browser" | "compare" | "match" | "picklist" | "proposal" | "lead" | "settings";

const EVENT_STORAGE_KEY = "cyber-strategy:selected-event";
const loadMatchAnalysis = () => import("./match-analysis").then((module) => ({ default: module.MatchAnalysis }));
const loadScoutingLeadPanel = () => import("./scouting-lead-panel").then((module) => ({ default: module.ScoutingLeadPanel }));
const loadStrategyProposalPanel = () => import("./strategy-proposal-panel").then((module) => ({ default: module.StrategyProposalPanel }));
const loadStrategySettingsPanel = () => import("./strategy-settings-panel").then((module) => ({ default: module.StrategySettingsPanel }));
const loadPicklistWorkspace = () => import("./picklist-workspace").then((module) => ({ default: module.PicklistWorkspace }));
const MatchAnalysis = lazy(loadMatchAnalysis);
const ScoutingLeadPanel = lazy(loadScoutingLeadPanel);
const StrategyProposalPanel = lazy(loadStrategyProposalPanel);
const StrategySettingsPanel = lazy(loadStrategySettingsPanel);
const PicklistWorkspace = lazy(loadPicklistWorkspace);

type MatchScheduleResource = { eventKey: string | null; matches: CombinedMatch[] };
type StrategyProposalResource = Pick<StrategyProposalPanelData, "proposals" | "proposalError" | "matches"> & { selectedEventKey: string };

export function AnalyticsDashboard({
  dataset,
  events,
  selectedEventKey,
  isAdmin,
  tierPercentages,
  dataRange,
  user,
  matchSchedule,
  strategyProposal,
  scoutingLead,
}: {
  dataset: ScoutingDataset;
  events: ScoutingEventOption[];
  selectedEventKey: string | null;
  isAdmin: boolean;
  tierPercentages: TierPercentages;
  dataRange: DataRange[];
  user: SessionUser;
  matchSchedule: CombinedMatch[];
  strategyProposal: Pick<StrategyProposalPanelData, "proposals" | "proposalError" | "matches"> & { loaded?: boolean };
  scoutingLead: ScoutingLeadPanelData | null;
}) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState<Tab>(() => readDashboardTab(searchParams.get("tab")));
  const [visitedTabs, setVisitedTabs] = useState<Set<Tab>>(() => new Set([readDashboardTab(searchParams.get("tab"))]));
  const [selectedTeam, setSelectedTeam] = useState("");
  const [search, setSearch] = useState("");
  const [hiddenTeams, setHiddenTeams] = useStoredList(`cyber-strategy:hidden:${dataset.id}`);
  const [ignoredMatches, setIgnoredMatches] = useStoredList(`cyber-strategy:ignored-matches:${dataset.id}`);
  const [lightbox, setLightbox] = useState<{ team: string; index: number } | null>(null);
  const [detailTeam, setDetailTeam] = useState<string | null>(null);
  const [headerNavTarget, setHeaderNavTarget] = useState<HTMLElement | null>(null);
  const matchScheduleFetcher = useFetcher<MatchScheduleResource>();
  const strategyProposalFetcher = useFetcher<StrategyProposalResource>();
  const scoutingLeadFetcher = useFetcher<ScoutingLeadPanelData>();
  const picklistFetcher = useFetcher<PicklistResource>();

  const analysisTeamData = useMemo(() => applyIgnoredMatchesToTeamData(dataset.teamData, ignoredMatches), [dataset.teamData, ignoredMatches]);
  const analysisDataset = useMemo(() => ({ ...dataset, teamData: analysisTeamData }), [dataset, analysisTeamData]);
  const teams = useMemo(() => sortedTeams(analysisTeamData), [analysisTeamData]);
  const tierByTeam = useMemo(() => buildTierAssignments(teams, tierPercentages), [teams, tierPercentages]);
  const rankByTeam = useMemo(() => new Map(teams.map((team, index) => [team.team, index + 1])), [teams]);
  const ignoredMatchSet = useMemo(() => new Set(ignoredMatches), [ignoredMatches]);
  const hiddenSet = useMemo(() => new Set(hiddenTeams), [hiddenTeams]);
  const visibleTeams = teams.filter((team) => team.team.includes(search.trim()));
  const selected = analysisTeamData[selectedTeam] ?? teams[0];
  const selectedOriginal = selected ? dataset.teamData[selected.team] : null;
  const photos = selected ? dataset.teamPhotos[selected.team] ?? [] : [];
  const detail = detailTeam ? analysisTeamData[detailTeam] : null;
  const detailOriginal = detailTeam ? dataset.teamData[detailTeam] : null;
  const resolvedEventKey = selectedEventKey ?? dataset.eventKey;
  const canViewLead = isAdmin;
  const canViewSettings = isAdmin;
  const activeTab = (tab === "lead" && !canViewLead) || (tab === "settings" && !canViewSettings) ? "browser" : tab;
  const showMatchTypes = dataRange.length > 1;
  const fetchedMatchSchedule = matchScheduleFetcher.data?.eventKey === resolvedEventKey ? matchScheduleFetcher.data.matches : null;
  const fetchedStrategyProposal = strategyProposalFetcher.data?.selectedEventKey === resolvedEventKey ? strategyProposalFetcher.data : null;
  const resolvedStrategyProposal = strategyProposal.loaded ? strategyProposal : fetchedStrategyProposal;
  const resolvedScoutingLead = scoutingLeadFetcher.data?.selectedEventKey === resolvedEventKey ? scoutingLeadFetcher.data : scoutingLead;
  const resolvedPicklists: PicklistResource | null = picklistFetcher.data?.selectedEventKey === resolvedEventKey ? picklistFetcher.data : null;

  const prepareTab = useCallback((next: Tab) => {
    if (next === "match") void loadMatchAnalysis();
    if (next === "proposal") void loadStrategyProposalPanel();
    if (next === "lead") void loadScoutingLeadPanel();
    if (next === "settings") void loadStrategySettingsPanel();
    if (next === "picklist") void loadPicklistWorkspace();
    if (next === "match" && matchScheduleFetcher.state === "idle" && matchScheduleFetcher.data?.eventKey !== resolvedEventKey) {
      matchScheduleFetcher.load(dashboardResourcePath("match", resolvedEventKey));
    }
    if (next === "proposal" && strategyProposalFetcher.state === "idle" && strategyProposalFetcher.data?.selectedEventKey !== resolvedEventKey) {
      strategyProposalFetcher.load(dashboardResourcePath("proposal", resolvedEventKey));
    }
    if (next === "lead" && isAdmin && scoutingLeadFetcher.state === "idle" && scoutingLeadFetcher.data?.selectedEventKey !== resolvedEventKey) {
      scoutingLeadFetcher.load(dashboardResourcePath("lead", resolvedEventKey));
    }
    if (next === "picklist" && picklistFetcher.state === "idle" && picklistFetcher.data?.selectedEventKey !== resolvedEventKey) {
      picklistFetcher.load(dashboardResourcePath("picklist", resolvedEventKey));
    }
  }, [
    isAdmin,
    matchScheduleFetcher,
    picklistFetcher,
    resolvedEventKey,
    scoutingLeadFetcher,
    strategyProposalFetcher,
  ]);

  useEffect(() => {
    queueMicrotask(() => setHeaderNavTarget(document.getElementById("app-header-navigation")));
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    const params = new URLSearchParams(window.location.search);
    const eventFromUrl = params.get("event")?.trim();
    if (eventFromUrl) {
      storeSelectedEvent(eventFromUrl);
      return;
    }

    const storedEvent = readSelectedEvent();
    if (!storedEvent) return;
    const isKnownEvent = events.length ? events.some((event) => event.eventKey === storedEvent) : true;
    if (!isKnownEvent) {
      clearSelectedEvent();
      return;
    }

    params.set("event", storedEvent);
    navigate(`/?${params.toString()}`, { replace: true });
  }, [events, isAdmin, navigate]);

  useEffect(() => {
    prepareTab(activeTab);
  }, [activeTab, prepareTab]);

  function selectEvent(eventKey: string) {
    if (!isAdmin) return;
    const params = new URLSearchParams(window.location.search);
    if (eventKey) {
      storeSelectedEvent(eventKey);
      params.set("event", eventKey);
    } else {
      clearSelectedEvent();
      params.delete("event");
    }
    const search = params.toString();
    navigate(search ? `/?${search}` : "/");
  }

  function selectTab(next: Tab) {
    prepareTab(next);
    setTab(next);
    setVisitedTabs((current) => current.has(next) ? current : new Set(current).add(next));
    const params = new URLSearchParams(window.location.search);
    if (next === "browser") params.delete("tab");
    else params.set("tab", next);
    if (next !== "proposal") params.delete("proposal");
    if (next !== "lead") params.delete("view");
    const search = params.toString();
    const path = search ? `/?${search}` : "/";
    window.history.replaceState(null, "", path);
  }

  function toggleHidden(team: string) {
    setHiddenTeams((current) => toggleValue(current, team));
  }

  function toggleIgnoredMatch(team: string, match: number, matchIndex: number) {
    setIgnoredMatches((current) => toggleValue(current, matchIgnoreKey(team, match, matchIndex)));
  }

  return (
    <div
      className={cn(
        "flex w-full flex-col",
        activeTab === "browser" && "lg:h-full lg:min-h-0",
        activeTab === "picklist" && "sm:h-full sm:min-h-0",
        activeTab === "proposal" && "xl:h-full xl:min-h-0",
        activeTab === "lead" && "h-full min-h-0",
      )}
      data-fixed-browser={activeTab === "browser" ? "" : undefined}
      data-fixed-picklist={activeTab === "picklist" ? "" : undefined}
      data-fixed-desktop={activeTab === "proposal" ? "" : undefined}
    >
      {headerNavTarget ? createPortal(
          <nav aria-label="功能选择" className="flex items-center gap-2">
            <SegmentedTab active={tab} value="browser" onClick={selectTab} icon={<Bot className="size-4" />}>
              队伍浏览
            </SegmentedTab>
            <SegmentedTab active={tab} value="compare" onClick={selectTab} icon={<BarChart3 className="size-4" />}>
              队伍对比
            </SegmentedTab>
            <SegmentedTab active={tab} value="match" onClick={selectTab} onPrefetch={prepareTab} icon={<Table2 className="size-4" />}>
              赛程分析
            </SegmentedTab>
            <SegmentedTab active={tab} value="picklist" onClick={selectTab} onPrefetch={prepareTab} icon={<ListChecks className="size-4" />}>
              Picklist
            </SegmentedTab>
            <SegmentedTab active={tab} value="proposal" onClick={selectTab} onPrefetch={prepareTab} icon={<FileText className="size-4" />}>
              比赛策略
            </SegmentedTab>
            {canViewLead ? (
              <SegmentedTab active={tab} value="lead" onClick={selectTab} onPrefetch={prepareTab} icon={<ShieldCheck className="size-4" />}>
                Scouting
              </SegmentedTab>
            ) : null}
            {canViewSettings ? (
              <SegmentedTab active={tab} value="settings" onClick={selectTab} onPrefetch={prepareTab} icon={<Settings className="size-4" />}>
                {isAdmin ? "管理" : "设置"}
              </SegmentedTab>
            ) : null}
          </nav>
      , headerNavTarget) : null}

      <div className={cn(
        "mx-auto flex w-full max-w-[1500px] flex-col gap-3",
        activeTab === "browser" && "lg:min-h-0 lg:flex-1",
        activeTab === "picklist" && "sm:min-h-0 sm:flex-1",
        activeTab === "proposal" && "xl:min-h-0 xl:flex-1",
        activeTab === "lead" && "min-h-0 flex-1",
      )}>
      <Suspense fallback={<Card className="p-6 text-sm text-ink-dim">正在加载…</Card>}>
      {!teams.length ? (
        <Card className="p-6 text-sm text-ink-dim">
          当前赛事还没有可分析的队伍记录。请确认 cyber-scout 已上传普通/超级侦察记录。
        </Card>
      ) : null}

      {teams.length && activeTab === "browser" && selected ? (
        <div className="grid min-h-0 gap-3 lg:flex-1 lg:grid-cols-[340px_minmax(0,1fr)]">
          <Card className="overflow-hidden p-0 lg:flex lg:min-h-0 lg:flex-col">
            <div className="flex shrink-0 items-center gap-2 border-b border-line p-3">
              <Search className="size-4 text-ink-faint" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="搜索队伍"
                inputMode="numeric"
                className="h-9 font-sans"
              />
            </div>
            <div className="max-h-[460px] overflow-y-auto lg:min-h-0 lg:max-h-none lg:flex-1">
              {visibleTeams.map((team) => (
                <button
                  key={team.team}
                  type="button"
                  onClick={() => setSelectedTeam(team.team)}
                  className={cn(
                    "grid w-full grid-cols-[2rem_minmax(3.5rem,1fr)_auto_auto_auto] items-center gap-1.5 border-l-2 border-transparent px-2.5 py-2 text-left text-sm transition hover:bg-surface-2",
                    selected.team === team.team && "border-brand bg-brand/10 text-brand",
                    hiddenSet.has(team.team) && "opacity-40",
                  )}
                >
                  <span className="text-right text-xs tabular-nums text-ink-faint">
                    {rankByTeam.get(team.team)}
                  </span>
                  <span className="min-w-0 whitespace-nowrap font-semibold tabular-nums">
                    {team.team}
                  </span>
                  <span className="whitespace-nowrap rounded-full bg-surface-2 px-2 py-0.5 text-xs tabular-nums text-ink-dim">
                    {team.avgTotal} 综合均分
                  </span>
                  <TierBadge tier={tierByTeam.get(team.team)} />
                  <span
                    role="button"
                    tabIndex={0}
                    title={hiddenSet.has(team.team) ? "显示队伍" : "隐藏队伍"}
                    className="shrink-0 rounded-md p-1 text-ink-faint hover:bg-surface hover:text-ink"
                    onClick={(event) => {
                      event.stopPropagation();
                      toggleHidden(team.team);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        event.stopPropagation();
                        toggleHidden(team.team);
                      }
                    }}
                  >
                    {hiddenSet.has(team.team) ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                  </span>
                </button>
              ))}
            </div>
          </Card>

          <div className="min-w-0 lg:min-h-0 lg:overflow-y-auto lg:pr-1">
            <TeamDetail
              team={selected}
              tier={tierByTeam.get(selected.team)}
              photos={photos}
              pitInfo={dataset.teamPitData?.[selected.team]}
              displayMatches={selectedOriginal?.matches ?? selected.matches}
              ignoredMatchKeys={ignoredMatchSet}
              onToggleIgnoreMatch={toggleIgnoredMatch}
              onOpenPhoto={(index) => setLightbox({ team: selected.team, index })}
              hideComments={false}
              showMatchTypes={showMatchTypes}
            />
          </div>
        </div>
      ) : null}

      {teams.length && activeTab === "compare" ? <CompareTeams teams={teams} /> : null}
      {visitedTabs.has("match") ? (
        <div hidden={activeTab !== "match"}>
          {fetchedMatchSchedule || matchSchedule.length ? (
            <MatchAnalysis key={resolvedEventKey} eventKey={resolvedEventKey} schedule={fetchedMatchSchedule ?? matchSchedule} teamData={analysisTeamData} scoutingTeamData={dataset.teamData} enrich progressKey={`cyber-strategy:match-progress:${user.id}:${resolvedEventKey}`} onOpenTeam={setDetailTeam} canEditScouting={isAdmin} />
          ) : <TabLoading label="正在加载赛程数据" />}
        </div>
      ) : null}
      {visitedTabs.has("picklist") ? (
        <div className="min-h-0 flex-1 flex-col" hidden={activeTab !== "picklist"} style={activeTab === "picklist" ? { display: "flex" } : undefined}>
          {teams.length && resolvedPicklists ? (
            <PicklistWorkspace
              key={`${dataset.id}:${resolvedEventKey}:${resolvedPicklists.userOpenId}`}
              datasetId={dataset.id}
              eventKey={resolvedEventKey}
              teams={teams}
              tierByTeam={tierByTeam}
              onOpenTeam={setDetailTeam}
              resource={resolvedPicklists}
            />
          ) : <TabLoading label="正在加载 Picklist" />}
        </div>
      ) : null}
      {visitedTabs.has("proposal") ? (
        <div className="xl:min-h-0 xl:flex-1" hidden={activeTab !== "proposal"}>
          {resolvedStrategyProposal ? (
            <StrategyProposalPanel
              data={{
                dataset: analysisDataset,
                selectedEventKey: resolvedEventKey,
                isAdmin,
                user,
                ...resolvedStrategyProposal,
              }}
              initialSelectedId={searchParams.get("proposal")}
            />
          ) : <TabLoading label="正在加载 Strategy Proposal" />}
        </div>
      ) : null}
      {visitedTabs.has("lead") ? (
        <div className="min-h-0 flex-1" hidden={activeTab !== "lead"}>
          {activeTab === "lead" ? (
            resolvedScoutingLead
              ? <ScoutingLeadPanel data={resolvedScoutingLead} readOnly={false} routeBase="/" />
              : <TabLoading label="正在加载 Scouting Lead" />
          ) : null}
        </div>
      ) : null}
      {visitedTabs.has("settings") ? (
        <div hidden={activeTab !== "settings"}>
          <StrategySettingsPanel
            tierPercentages={tierPercentages}
            dataRange={dataRange}
            readOnly={false}
            events={isAdmin ? events : []}
            selectedEventKey={resolvedEventKey}
            onSelectEvent={selectEvent}
          />
        </div>
      ) : null}

      {detail ? (
        <TeamDetailModal
          team={detail}
          tier={tierByTeam.get(detail.team)}
          photos={dataset.teamPhotos[detail.team] ?? []}
          pitInfo={dataset.teamPitData?.[detail.team]}
          displayMatches={detailOriginal?.matches ?? detail.matches}
          ignoredMatchKeys={ignoredMatchSet}
          onToggleIgnoreMatch={toggleIgnoredMatch}
          onOpenPhoto={(index) => setLightbox({ team: detail.team, index })}
          onClose={() => setDetailTeam(null)}
          hideComments={false}
          showMatchTypes={showMatchTypes}
        />
      ) : null}

      {lightbox ? (
        <PhotoLightbox
          photos={dataset.teamPhotos[lightbox.team] ?? []}
          index={lightbox.index}
          onChange={(index) => setLightbox({ ...lightbox, index })}
          onClose={() => setLightbox(null)}
        />
      ) : null}
      </Suspense>
      </div>
    </div>
  );
}

function readDashboardTab(value: string | null): Tab {
  return value === "compare" || value === "match" || value === "picklist" || value === "proposal" || value === "lead" || value === "settings" ? value : "browser";
}

export function matchDisplayLabel(match: Pick<ScoutingMatch, "match" | "matchType">, showMatchType = false) {
  const prefix = !showMatchType ? "M" : match.matchType === "practice" ? "P" : match.matchType === "qualification" ? "Q" : "M";
  return `${prefix}${match.match}`;
}

export function compareTeamDetailMatches(
  a: Pick<ScoutingMatch, "match" | "matchType">,
  b: Pick<ScoutingMatch, "match" | "matchType">,
) {
  const matchTypeOrder = (matchType?: DataRange) => matchType === "practice" ? 0 : matchType === "playoff" ? 2 : 1;
  return matchTypeOrder(a.matchType) - matchTypeOrder(b.matchType) || a.match - b.match;
}

export function TeamDetail({
  team,
  tier,
  photos,
  pitInfo,
  displayMatches,
  ignoredMatchKeys,
  onToggleIgnoreMatch,
  onOpenPhoto,
  hideComments = false,
  showMatchTypes = false,
}: {
  team: TeamSummary;
  tier?: TierInfo;
  photos: string[];
  pitInfo?: TeamPitInfo;
  displayMatches?: ScoutingMatch[];
  ignoredMatchKeys?: Set<string>;
  onToggleIgnoreMatch?: (team: string, match: number, matchIndex: number) => void;
  onOpenPhoto: (index: number) => void;
  hideComments?: boolean;
  showMatchTypes?: boolean;
}) {
  const [routeOpen, setRouteOpen] = useState(false);
  const matchAutoRoutes = useMemo(() => buildMatchAutoRoutes(team), [team]);
  const chartMatches = [...team.matches].sort(compareTeamDetailMatches);
  const tableMatches = (displayMatches ?? team.matches)
    .map((match, originalIndex) => ({ match, originalIndex }))
    .sort((a, b) => compareTeamDetailMatches(a.match, b.match) || a.originalIndex - b.originalIndex);
  const trendText = team.trend === "up" ? "上升" : team.trend === "down" ? "下降" : "稳定";
  const summaryMetrics = seasonConfig.metrics.filter((metric) => metric.summary);
  const tableMetrics = seasonConfig.metrics.filter((metric) => metric.matchTable);
  return (
    <div className="min-w-0 space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-2xl font-semibold text-ink">Team {team.team}</h2>
        <TierBadge tier={tier} large />
        <Badge
          className={cn(
            team.trend === "up" && "border-ok/40 bg-ok/10 text-ok",
            team.trend === "down" && "border-danger/40 bg-danger/10 text-danger",
            team.trend === "stable" && "border-line bg-surface-2 text-ink-dim",
          )}
        >
          {trendText}
        </Badge>
        {pitInfo?.attributes.map((attribute) => (
          <Badge key={attribute.key} className="border-line bg-surface-2 text-ink-dim">
            {attribute.label}：{attribute.value}
          </Badge>
        ))}
        {pitInfo?.autoRoutes.length ? (
          <Button type="button" className="h-8 px-2" onClick={() => setRouteOpen(true)}>
            <MapIcon className="size-4" />
            Pit 自动路线
          </Button>
        ) : null}
        <span className="text-sm text-ink-dim">
          前半程 {team.firstHalfAvg} → 后半程 {team.secondHalfAvg}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="平均综合分" value={team.avgTotal} />
        <Stat label="自动贡献" value={team.avgAuto} />
        <Stat label="手动贡献" value={team.avgTele} />
        {summaryMetrics.map((metric) => (
          <Stat key={metric.key} label={metric.label} value={formatSeasonMetric(team.metrics[metric.key], metric)} />
        ))}
        <Stat label="可靠性" value={`${reliability(team)}%`} />
        <Stat label="标准差" value={`±${team.stdDev}`} />
        <Stat label="综合分范围" value={`${team.minPts}–${team.maxPts}`} />
        <Stat label="Drive score" value={`${team.avgDriver} / 5`} />
        <Stat label="Defence score" value={`${defenceScore(team)} / 5`} />
      </div>

      {photos.length ? (
        <Card className="p-3">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="section-label">照片</h3>
            <span className="text-xs text-ink-dim">{photos.length}</span>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {photos.map((src, index) => (
              <button
                key={src}
                type="button"
                onClick={() => onOpenPhoto(index)}
                className="h-24 w-32 shrink-0 overflow-hidden rounded-md border border-line bg-surface-2 transition hover:border-brand"
              >
                <img src={src} alt={`Team ${team.team}`} loading="lazy" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        </Card>
      ) : null}

      {matchAutoRoutes.length ? (
        <Card className="p-3">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="section-label">比赛自动</h3>
            <span className="text-xs text-ink-dim">{matchAutoRoutes.length} 条路线</span>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {matchAutoRoutes.map((route, index) => (
              <div key={route.id} className="rounded-md border border-line bg-surface p-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-sm font-semibold text-ink">路线 {index + 1}</h4>
                  <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-ink-dim">{route.matches.length} 场</span>
                </div>
                <AutoRoutePreview points={route.points} showRepetition />
                <div className="mt-2 flex flex-wrap gap-1 text-xs text-ink-dim">
                  {route.nodes.map((node, nodeIndex) => (
                    <span key={`${route.id}:${nodeIndex}`} className="rounded-full bg-surface-2 px-2 py-0.5">
                      {nodeIndex + 1}. {node}
                    </span>
                  ))}
                </div>
                <div className="mt-2 flex flex-wrap gap-1 text-xs text-ink-dim">
                  {route.startPosition ? <Badge className="border-line bg-surface-2 text-ink-dim">起点 {route.startPosition}</Badge> : null}
                  {route.flipped ? <Badge className="border-line bg-surface-2 text-ink-dim">镜像</Badge> : null}
                  {route.scoutName ? <Badge className="border-line bg-surface-2 text-ink-dim">记录员 {route.scoutName}</Badge> : null}
                </div>
                <div className="mt-2 flex flex-wrap gap-1 text-xs text-ink-dim">
                  <span className="mr-1">使用场次</span>
                  {route.matches.map((match) => (
                    <span
                      key={`${route.id}:${match.matchType}:${match.match}:${match.scoutName}`}
                      className="rounded-full bg-surface-2 px-2 py-0.5"
                      title={[match.alliance, match.startPosition, match.flipped ? "镜像" : "", match.scoutName].filter(Boolean).join(" · ")}
                    >
                      {matchDisplayLabel(match, showMatchTypes)}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <div className="grid gap-3 xl:grid-cols-2">
        <Card className="p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink-dim">
            <LineChart className="size-4" />
            逐场综合分
          </h3>
          <ChartCanvas
            label={`Team ${team.team} 逐场综合分`}
            configKey={`team-line:${team.team}:${showMatchTypes}:${chartMatches.map((match) => `${match.matchType}:${match.match}:${match.totalPts}`).join(",")}`}
            buildConfig={(palette) => teamLineConfig(chartMatches, palette, showMatchTypes)}
          />
        </Card>
        <Card className="p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink-dim">
            <BarChart3 className="size-4" />
            自动 / 手动贡献
          </h3>
          <ChartCanvas
            label={`Team ${team.team} 自动和手动贡献拆分`}
            configKey={`team-bars:${team.team}:${showMatchTypes}:${chartMatches.map((match) => `${match.matchType}:${match.match}:${match.autoPts}/${match.telePts}`).join(",")}`}
            buildConfig={(palette) => teamBarConfig(chartMatches, palette, showMatchTypes)}
          />
        </Card>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="border-b border-line p-3">
          <h3 className="section-label">逐场数据</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse text-sm">
            <thead className="bg-surface-2 text-xs uppercase text-ink-faint">
              <tr>
                <th className="px-3 py-2 text-left">场次</th>
                <th className="px-3 py-2 text-left">综合分</th>
                <th className="px-3 py-2 text-left">自动贡献</th>
                <th className="px-3 py-2 text-left">手动贡献</th>
                {tableMetrics.map((metric) => <th key={metric.key} className="px-3 py-2 text-left">{metric.label}</th>)}
                <th className="px-3 py-2 text-left">状态</th>
                {!hideComments ? <th className="px-3 py-2 text-left">备注</th> : null}
                {!hideComments ? <th className="px-3 py-2 text-left">记录员</th> : null}
              </tr>
            </thead>
            <tbody>
              {tableMatches.map(({ match, originalIndex }) => {
                const ignored = ignoredMatchKeys?.has(matchIgnoreKey(team.team, match.match, originalIndex)) ?? false;
                return (
                  <tr key={`${match.matchType ?? "qualification"}:${match.match}:${originalIndex}`} className={cn("border-t border-line align-top", ignored && "bg-danger/5 opacity-55")}>
                    <td className="px-3 py-2 font-semibold">
                      <div className="flex items-center gap-2">
                        {onToggleIgnoreMatch ? (
                          <button
                            type="button"
                            title={ignored ? "恢复此场" : "忽略此场"}
                            aria-label={ignored ? `恢复 Team ${team.team} ${matchDisplayLabel(match, showMatchTypes)}` : `忽略 Team ${team.team} ${matchDisplayLabel(match, showMatchTypes)}`}
                            className={cn(
                              "inline-flex size-7 shrink-0 items-center justify-center rounded-md border border-line text-ink-faint transition hover:border-brand hover:text-brand",
                              ignored && "border-danger/40 bg-danger/10 text-danger hover:text-danger",
                            )}
                            onClick={() => onToggleIgnoreMatch(team.team, match.match, originalIndex)}
                          >
                            {ignored ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                          </button>
                        ) : null}
                        <span>{matchDisplayLabel(match, showMatchTypes)}</span>
                        {ignored ? <span className="whitespace-nowrap rounded-full border border-danger/40 bg-danger/10 px-1.5 py-0.5 text-[10px] text-danger">已忽略</span> : null}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <PointsBar value={match.totalPts} max={team.maxPts} />
                    </td>
                    <td className="px-3 py-2">{match.autoPts}</td>
                    <td className="px-3 py-2">{match.telePts}</td>
                    {tableMetrics.map((metric) => (
                      <td key={metric.key} className="px-3 py-2">{formatSeasonMetric(match.metrics[metric.key], metric)}</td>
                    ))}
                    <td className="px-3 py-2">
                      <StatePill match={match} />
                    </td>
                    {!hideComments ? (
                      <td className="max-w-md px-3 py-2 text-ink-dim">
                        <p>{match.comment || "-"}</p>
                      </td>
                    ) : null}
                    {!hideComments ? <td className="px-3 py-2 text-ink-dim">{match.scoutName || "-"}</td> : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
      {routeOpen && pitInfo ? <AutoRouteModal team={team.team} pitInfo={pitInfo} onClose={() => setRouteOpen(false)} /> : null}
    </div>
  );
}

function CompareTeams({ teams }: { teams: TeamSummary[] }) {
  const defaults = [teams[0]?.team ?? "", teams[1]?.team ?? "", teams[2]?.team ?? ""];
  const [selected, setSelected] = useState<string[]>(defaults);
  const [activeTeamSlot, setActiveTeamSlot] = useState<number | null>(null);
  const teamSet = useMemo(() => new Set(teams.map((team) => team.team)), [teams]);
  const selectedTeams = [0, 1, 2].map((index) => {
    const team = selected[index];
    if (team === "") return "";
    return team && teamSet.has(team) ? team : defaults[index] ?? "";
  });
  const compared = selectedTeams.map((team) => teams.find((item) => item.team === team)).filter(Boolean) as TeamSummary[];
  const rankedRadarMetrics = rankRadarMetrics(teams.map(radarMetrics));
  const radarMetricsByTeam = new Map(teams.map((team, index) => [team.team, rankedRadarMetrics[index] ?? [0, 0, 0, 0, 0, 0]]));
  const regionRadarMetrics = averageRadarMetrics(rankedRadarMetrics);
  const comparedRadarMetrics = compared.map((team) => radarMetricsByTeam.get(team.team) ?? [0, 0, 0, 0, 0, 0]);
  const compareMetrics = seasonConfig.metrics.filter((metric) => metric.compare);

  function setTeam(index: number, team: string) {
    setSelected((current) => [0, 1, 2].map((slot) => (slot === index ? team : current[slot] ?? defaults[slot] ?? "")));
  }

  return (
    <div className="space-y-3">
      <Card className="p-3">
        <div className="grid gap-3 md:grid-cols-3 md:items-end">
          {[0, 1, 2].map((index) => (
            <TeamSearchSelect
              key={`${index}:${selectedTeams[index] ?? ""}`}
              index={index}
              teams={teams}
              selectedTeam={selectedTeams[index] ?? ""}
              open={activeTeamSlot === index}
              onOpen={() => setActiveTeamSlot(index)}
              onClose={() => setActiveTeamSlot(null)}
              onChange={(team) => setTeam(index, team)}
            />
          ))}
        </div>
      </Card>

      <div className="grid gap-3 xl:grid-cols-2">
        <Card className="p-4 xl:col-span-2">
          <h3 className="mb-3 text-sm font-semibold text-ink-dim">逐场综合分</h3>
          <ChartCanvas
            label="队伍逐场综合分对比"
            className="h-80"
            configKey={`cmp-line:${selectedTeams.join(",")}`}
            buildConfig={(palette) => compareLineConfig(compared, palette)}
          />
        </Card>
        <Card className="p-4">
          <h3 className="mb-3 text-sm font-semibold text-ink-dim">自动 / 手动贡献</h3>
          <ChartCanvas
            label="自动和手动贡献对比"
            configKey={`cmp-bar:${selectedTeams.join(",")}`}
            buildConfig={(palette) => compareBarConfig(compared, palette)}
          />
        </Card>
        {compareMetrics.map((metric) => (
          <Card key={metric.key} className="p-4">
            <h3 className="mb-3 text-sm font-semibold text-ink-dim">{metric.label}</h3>
            <ChartCanvas
              label={`${metric.label}对比`}
              configKey={`cmp-metric:${metric.key}:${selectedTeams.join(",")}`}
              buildConfig={(palette) => compareMetricConfig(compared, metric.key, metric.label, palette)}
            />
          </Card>
        ))}
        <Card className="p-4">
          <h3 className="mb-3 text-sm font-semibold text-ink-dim">能力雷达</h3>
          <ChartCanvas
            label="队伍能力雷达对比"
            configKey={`cmp-radar:${selectedTeams.join(",")}:${comparedRadarMetrics.flat().join(",")}:${regionRadarMetrics.join(",")}`}
            buildConfig={(palette) => compareRadarConfig(compared, comparedRadarMetrics, regionRadarMetrics, palette)}
          />
        </Card>
        <Card className="p-4">
          <h3 className="mb-3 text-sm font-semibold text-ink-dim">综合分范围</h3>
          <ChartCanvas
            label="队伍综合分范围对比"
            configKey={`cmp-range:${selectedTeams.join(",")}`}
            buildConfig={(palette) => compareRangeConfig(compared, palette)}
          />
        </Card>
      </div>
    </div>
  );
}

function TeamSearchSelect({
  index,
  teams,
  selectedTeam,
  open,
  onOpen,
  onClose,
  onChange,
}: {
  index: number;
  teams: TeamSummary[];
  selectedTeam: string;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  onChange: (team: string) => void;
}) {
  const selected = teams.find((team) => team.team === selectedTeam);
  const selectedLabel = selected ? `Team ${selected.team}（${selected.avgTotal} 综合均分）` : "";
  const [query, setQuery] = useState(selectedLabel);
  const inputRef = useRef<HTMLInputElement>(null);
  const visibleTeams = useMemo(() => filterCompareTeams(teams, query), [query, teams]);

  function choose(team: TeamSummary) {
    onChange(team.team);
    setQuery(`Team ${team.team}（${team.avgTotal} 综合均分）`);
    onClose();
  }

  return (
    <div
      className="relative grid gap-1 text-sm"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setQuery(selectedLabel);
          onClose();
        }
      }}
    >
      <label htmlFor={`compare-team-${index}`} className="font-medium text-ink-dim">Team {index + 1}</label>
      <div className="relative">
        <input
          ref={inputRef}
          id={`compare-team-${index}`}
          className="input h-10 pr-9 font-sans"
          value={query}
          placeholder="输入队号查找 / 选择队伍"
          autoComplete="off"
          onFocus={() => {
            onOpen();
            if (selected) setQuery("");
          }}
          onClick={onOpen}
          onChange={(event) => {
            setQuery(event.target.value);
            onOpen();
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              onClose();
              setQuery(selectedLabel);
            } else if (event.key === "Enter" && visibleTeams[0]) {
              event.preventDefault();
              choose(visibleTeams[0]);
            }
          }}
        />
        {selected ? (
          <button
            type="button"
            className="absolute right-2 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded text-ink-faint transition hover:bg-surface-2 hover:text-ink"
            aria-label={`清空 Team ${index + 1}`}
            onClick={() => {
              onChange("");
              setQuery("");
              onOpen();
              inputRef.current?.focus();
            }}
          >
            <X className="size-4" />
          </button>
        ) : null}
      </div>
      {open ? (
        <div className="absolute inset-x-0 top-full z-30 mt-1 max-h-56 overflow-y-auto rounded-md border border-line bg-surface p-1 shadow-xl">
          {visibleTeams.length ? visibleTeams.map((team) => (
            <button
              key={team.team}
              type="button"
              className="flex h-9 w-full items-center justify-between gap-3 rounded px-2 text-left hover:bg-surface-2"
              onClick={() => choose(team)}
            >
              <span className="font-semibold">Team {team.team}</span>
              <span className="truncate text-xs text-ink-dim">{team.avgTotal} 综合均分</span>
            </button>
          )) : <div className="px-2 py-3 text-center text-xs text-ink-faint">未找到队伍</div>}
        </div>
      ) : null}
    </div>
  );
}

export function filterCompareTeams(teams: TeamSummary[], query: string) {
  const teamNumber = query.trim().replace(/^team\s*/i, "").split(/\s|（/)[0];
  return teamNumber ? teams.filter((team) => team.team.includes(teamNumber)) : teams;
}

export function TeamDetailModal({
  team,
  tier,
  photos,
  pitInfo,
  displayMatches,
  ignoredMatchKeys,
  onToggleIgnoreMatch,
  onOpenPhoto,
  onClose,
  hideComments = false,
  showMatchTypes = false,
}: {
  team: TeamSummary;
  tier?: TierInfo;
  photos: string[];
  pitInfo?: TeamPitInfo;
  displayMatches?: ScoutingMatch[];
  ignoredMatchKeys?: Set<string>;
  onToggleIgnoreMatch?: (team: string, match: number, matchIndex: number) => void;
  onOpenPhoto: (index: number) => void;
  onClose: () => void;
  hideComments?: boolean;
  showMatchTypes?: boolean;
}) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 bg-black/70 p-3 md:p-6" role="dialog" aria-modal="true" onMouseDown={onClose}>
      <div
        className="mx-auto flex max-h-[92dvh] w-full max-w-6xl flex-col overflow-hidden rounded-card border border-line bg-bg shadow-xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-line bg-surface px-4 py-3">
          <div className="min-w-0">
            <p className="section-label">队伍详情</p>
          </div>
          <Button type="button" onClick={onClose} className="h-9 px-2" title="关闭">
            <X className="size-4" />
          </Button>
        </div>
        <div className="overflow-y-auto p-3 md:p-4">
          <TeamDetail
            team={team}
            tier={tier}
            photos={photos}
            pitInfo={pitInfo}
            displayMatches={displayMatches}
            ignoredMatchKeys={ignoredMatchKeys}
            onToggleIgnoreMatch={onToggleIgnoreMatch}
            onOpenPhoto={onOpenPhoto}
            hideComments={hideComments}
            showMatchTypes={showMatchTypes}
          />
        </div>
      </div>
    </div>
  );
}

function AutoRouteModal({ team, pitInfo, onClose }: { team: string; pitInfo: TeamPitInfo; onClose: () => void }) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-black/70 p-3 md:p-6" role="dialog" aria-modal="true" onMouseDown={onClose}>
      <div
        className="mx-auto flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-card border border-line bg-bg shadow-xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-line bg-surface px-4 py-3">
          <div className="min-w-0">
            <p className="section-label">Pit 自动路线</p>
            <h2 className="truncate text-lg font-semibold text-ink">Team {team}</h2>
          </div>
          <Button type="button" onClick={onClose} className="h-9 px-2" title="关闭">
            <X className="size-4" />
          </Button>
        </div>
        <div className="grid gap-3 overflow-y-auto p-3 md:p-4">
          <div className="flex flex-wrap gap-2 text-sm text-ink-dim">
            {pitInfo.attributes.map((attribute) => (
              <Badge key={attribute.key} className="border-line bg-surface-2 text-ink-dim">
                {attribute.label}：{attribute.value}
              </Badge>
            ))}
          </div>
          {pitInfo.autoRoutes.map((route, index) => (
            <div key={route.id} className="rounded-md border border-line bg-surface p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-ink">路线 {index + 1}</h3>
                <span className="text-xs text-ink-faint">{route.points.length} 个点</span>
              </div>
              <AutoRoutePreview points={route.points} />
              <div className="mt-2 flex flex-wrap gap-1 text-xs text-ink-dim">
                {route.points.map((point, pointIndex) => (
                  <span key={`${point.x}-${point.y}-${pointIndex}`} className="rounded-full bg-surface-2 px-2 py-0.5 tabular-nums">
                    P{pointIndex + 1} {round1(point.x)}, {round1(point.y)}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AutoRoutePreview({
  points,
  showRepetition = false,
}: {
  points: TeamPitInfo["autoRoutes"][number]["points"];
  showRepetition?: boolean;
}) {
  const field = autoRouteField();
  const polyline = points.map((point) => `${point.x},${point.y}`).join(" ");
  const repetition = analyzeRouteRepetition(points);
  const visits = showRepetition ? repetition.visits : repetition.visits.map((visit) => ({ ...visit, occurrence: 1, total: 1 }));
  const hasRepeatedVisits = repetition.visits.some((visit) => visit.total > 1);
  return (
    <div
      className="relative overflow-hidden rounded-md border border-line bg-surface-2"
      style={{
        aspectRatio: field.aspectRatio,
        backgroundImage: field.backgroundImage
          ? undefined
          : "linear-gradient(rgb(var(--line)) 1px, transparent 1px), linear-gradient(90deg, rgb(var(--line)) 1px, transparent 1px)",
        backgroundSize: field.backgroundImage ? undefined : "10% 10%",
      }}
      aria-label={showRepetition && hasRepeatedVisits ? "自动路线预览，含重复经过路线" : "自动路线预览"}
    >
      {field.backgroundImage ? <img src={field.backgroundImage} alt="" className="absolute inset-0 h-full w-full object-fill" /> : (
        <span className="absolute inset-0 grid place-items-center text-xs font-medium text-ink-faint">未配置年度场地图</span>
      )}
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden>
        <polyline points={polyline} fill="none" stroke="rgb(var(--brand))" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        {showRepetition ? repetition.segments.map((segment) => (
          <line
            key={`${segment.from.x}:${segment.from.y}-${segment.to.x}:${segment.to.y}`}
            x1={segment.from.x}
            y1={segment.from.y}
            x2={segment.to.x}
            y2={segment.to.y}
            fill="none"
            stroke="rgb(var(--warn))"
            strokeWidth="2"
            strokeDasharray="6 5"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        )) : null}
      </svg>
      {visits.map((point, index) => {
        const angle = point.total > 1 ? ((point.occurrence - 1) / point.total) * Math.PI * 2 : 0;
        const offset = point.total > 1 ? 10 : 0;
        return (
        <span
          key={`${point.x}-${point.y}-${index}`}
          className="absolute flex size-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-brand text-[10px] font-semibold leading-none text-white shadow-sm"
          style={{
            left: `${point.x}%`,
            top: `${point.y}%`,
            marginLeft: Math.cos(angle) * offset,
            marginTop: Math.sin(angle) * offset,
          }}
          title={point.total > 1 ? `第 ${point.occurrence}/${point.total} 次经过此点` : undefined}
        >
          {index + 1}
        </span>
        );
      })}
      {showRepetition ? repetition.segments.map((segment) => (
        <span
          key={`count:${segment.from.x}:${segment.from.y}-${segment.to.x}:${segment.to.y}`}
          className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-warn/50 bg-surface px-1.5 py-0.5 text-[10px] font-semibold leading-none text-warn shadow-sm"
          style={{ left: `${(segment.from.x + segment.to.x) / 2}%`, top: `${(segment.from.y + segment.to.y) / 2}%` }}
        >
          ×{segment.count}
        </span>
      )) : null}
    </div>
  );
}

export function PhotoLightbox({
  photos,
  index,
  onChange,
  onClose,
}: {
  photos: string[];
  index: number;
  onChange: (index: number) => void;
  onClose: () => void;
}) {
  const safeIndex = photos.length ? (index + photos.length) % photos.length : 0;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft") onChange((safeIndex - 1 + photos.length) % photos.length);
      if (event.key === "ArrowRight") onChange((safeIndex + 1) % photos.length);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onChange, onClose, photos.length, safeIndex]);

  if (!photos.length) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/90 p-4" onMouseDown={onClose}>
      <div className="relative flex max-h-full max-w-full items-center gap-2" onMouseDown={(event) => event.stopPropagation()}>
        <Button type="button" onClick={() => onChange((safeIndex - 1 + photos.length) % photos.length)} className="h-10 px-3">
          <ChevronLeft className="size-5" />
        </Button>
        <img src={photos[safeIndex]} alt="Team 机器人" className="max-h-[82dvh] max-w-[78vw] rounded-md object-contain" />
        <Button type="button" onClick={() => onChange((safeIndex + 1) % photos.length)} className="h-10 px-3">
          <ChevronRight className="size-5" />
        </Button>
        <Button type="button" onClick={onClose} className="absolute right-0 top-[-3rem] h-10 px-2" title="关闭">
          <X className="size-5" />
        </Button>
        <div className="absolute bottom-[-2rem] left-1/2 -translate-x-1/2 text-sm text-white/70">
          {safeIndex + 1} / {photos.length}
        </div>
      </div>
    </div>
  );
}

function SegmentedTab({
  active,
  value,
  icon,
  children,
  onClick,
  onPrefetch,
}: {
  active: Tab;
  value: Tab;
  icon: ReactNode;
  children: ReactNode;
  onClick: (value: Tab) => void;
  onPrefetch?: (value: Tab) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onClick(value)}
      onPointerEnter={() => onPrefetch?.(value)}
      onFocus={() => onPrefetch?.(value)}
      className={dashboardNavItemClass(active === value)}
    >
      {icon}
      {children}
    </button>
  );
}

function TabLoading({ label }: { label: string }) {
  return <Card className="p-6 text-sm text-ink-dim">{label}</Card>;
}

function dashboardNavItemClass(active = false) {
  return cn(
    "inline-flex shrink-0 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand/50",
    active ? "bg-brand text-brand-fg" : "text-ink-dim hover:bg-surface-2 hover:text-ink",
  );
}

function TierBadge({ tier, large = false }: { tier?: TierInfo; large?: boolean }) {
  if (!tier) return null;
  return <Badge className={cn("shrink-0 whitespace-nowrap", tier.className, large && "px-3 py-1 text-sm")}>{tierDisplayLabel(tier.label)}</Badge>;
}

function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <Card className="p-3">
      <p className="text-[11px] font-semibold uppercase text-ink-faint">{label}</p>
      <p className="mt-1 break-words text-xl font-semibold text-ink">{value}</p>
      {sub ? <div className="mt-1 text-xs text-ink-dim">{sub}</div> : null}
    </Card>
  );
}

function defenceScore(team: TeamSummary) {
  return team.avgDefense || averagePositive(team.matches.map((match) => match.defenseRating));
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

function averagePositive(values: number[]) {
  const positive = values.filter((value) => value > 0);
  return positive.length ? Math.round((positive.reduce((sum, value) => sum + value, 0) / positive.length) * 10) / 10 : 0;
}

function PointsBar({ value, max }: { value: number; max: number }) {
  const width = Math.min(72, Math.max(4, (value / Math.max(max, 1)) * 72));
  return (
    <div className="flex min-w-32 items-center gap-2">
      <span className="h-1.5 rounded-full bg-brand" style={{ width: `${width}px` }} />
      <span>{value}</span>
    </div>
  );
}

function StatePill({ match }: { match: ScoutingMatch }) {
  const status = scoutingMatchStatus(match);
  const className =
    status === "normal"
      ? "border-ok/40 bg-ok/10 text-ok"
      : "border-danger/40 bg-danger/10 text-danger";
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-semibold", className)}>
      {robotStatusLabel(status)}
    </span>
  );
}

function robotStatusLabel(status: ScoutingMatch["status"]) {
  return {
    normal: "正常",
    no_show: "未到场",
    incap: "宕机",
  }[status];
}

function useStoredList(key: string) {
  const [value, setValue] = useState<string[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      try {
        const raw = window.localStorage.getItem(key);
        setValue(raw ? (JSON.parse(raw) as string[]) : []);
      } catch {
        setValue([]);
      }
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [key]);

  useEffect(() => {
    if (!ready) return;
    window.localStorage.setItem(key, JSON.stringify(value));
  }, [key, ready, value]);

  return [value, setValue] as const;
}

function readSelectedEvent() {
  try {
    return window.localStorage.getItem(EVENT_STORAGE_KEY)?.trim() ?? "";
  } catch {
    return "";
  }
}

function storeSelectedEvent(eventKey: string) {
  try {
    window.localStorage.setItem(EVENT_STORAGE_KEY, eventKey);
  } catch {
    // localStorage can be unavailable in restricted browser contexts.
  }
}

function clearSelectedEvent() {
  try {
    window.localStorage.removeItem(EVENT_STORAGE_KEY);
  } catch {
    // localStorage can be unavailable in restricted browser contexts.
  }
}

function toggleValue(values: string[], value: string) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

function baseScales(palette: { muted: string; grid: string }) {
  return {
    x: { ticks: { color: palette.muted }, grid: { color: palette.grid } },
    y: { ticks: { color: palette.muted }, grid: { color: palette.grid }, beginAtZero: true },
  };
}

function teamLineConfig(matches: ScoutingMatch[], palette: { accent: string; muted: string; grid: string; panel: string }, showMatchTypes: boolean): ChartConfiguration {
  return {
    type: "line",
    data: {
      labels: matches.map((match) => matchDisplayLabel(match, showMatchTypes)),
      datasets: [
        {
          label: "综合分",
          data: matches.map((match) => match.totalPts),
          borderColor: palette.accent,
          backgroundColor: `${palette.accent}18`,
          pointBackgroundColor: matches.map((match) =>
            scoutingMatchStatus(match) === "normal" ? palette.accent : "#dc2626",
          ),
          pointRadius: 5,
          borderWidth: 2,
          tension: 0.3,
          fill: true,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: tooltipOptions(palette) },
      scales: baseScales(palette),
    },
  } as ChartConfiguration;
}

function teamBarConfig(matches: ScoutingMatch[], palette: { accent: string; muted: string; grid: string; panel: string }, showMatchTypes: boolean): ChartConfiguration {
  return {
    type: "bar",
    data: {
      labels: matches.map((match) => matchDisplayLabel(match, showMatchTypes)),
      datasets: [
        { label: "自动贡献", data: matches.map((match) => match.autoPts), backgroundColor: palette.accent, stack: "points" },
        { label: "手动贡献", data: matches.map((match) => match.telePts), backgroundColor: "#16a34a", stack: "points" },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: palette.muted, boxWidth: 10 } }, tooltip: tooltipOptions(palette) },
      scales: {
        x: { stacked: true, ticks: { color: palette.muted }, grid: { color: palette.grid } },
        y: { stacked: true, ticks: { color: palette.muted }, grid: { color: palette.grid }, beginAtZero: true },
      },
    },
  } as ChartConfiguration;
}

function compareLineConfig(teams: TeamSummary[], palette: ChartPaletteLike): ChartConfiguration {
  return {
    type: "line",
    data: {
      datasets: teams.map((team, index) => ({
        label: `Team ${team.team}`,
        data: team.matches.map((match, matchIndex) => ({ x: matchIndex + 1, y: match.totalPts })),
        borderColor: palette.colors[index],
        backgroundColor: `${palette.colors[index]}18`,
        pointBackgroundColor: palette.colors[index],
        pointRadius: 4,
        borderWidth: 2,
        tension: 0.35,
      })),
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: { legend: { labels: { color: palette.muted, boxWidth: 10 } }, tooltip: tooltipOptions(palette) },
      scales: {
        x: {
          type: "linear",
          title: { display: true, text: "比赛场数", color: palette.muted },
          ticks: { color: palette.muted, precision: 0 },
          grid: { color: palette.grid },
        },
        y: { title: { display: true, text: "综合分", color: palette.muted }, ticks: { color: palette.muted }, grid: { color: palette.grid }, beginAtZero: true },
      },
    },
  } as ChartConfiguration;
}

function compareBarConfig(teams: TeamSummary[], palette: ChartPaletteLike): ChartConfiguration {
  return {
    type: "bar",
    data: {
      labels: teams.map((team) => `Team ${team.team}`),
      datasets: [
        { label: "自动贡献", data: teams.map((team) => team.avgAuto), backgroundColor: teams.map((_, index) => palette.colors[index]) },
        { label: "手动贡献", data: teams.map((team) => team.avgTele), backgroundColor: teams.map((_, index) => `${palette.colors[index]}66`) },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: palette.muted, boxWidth: 10 } }, tooltip: tooltipOptions(palette) },
      scales: baseScales(palette),
    },
  } as ChartConfiguration;
}

function compareMetricConfig(teams: TeamSummary[], metricKey: string, label: string, palette: ChartPaletteLike): ChartConfiguration {
  return {
    type: "bar",
    data: {
      labels: teams.map((team) => `Team ${team.team}`),
      datasets: [{ label, data: teams.map((team) => team.metrics[metricKey] ?? 0), backgroundColor: teams.map((_, index) => palette.colors[index]) }],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: tooltipOptions(palette) },
      scales: {
        x: { ticks: { color: palette.muted }, grid: { color: palette.grid }, beginAtZero: true },
        y: { ticks: { color: palette.muted }, grid: { color: palette.grid } },
      },
    },
  } as ChartConfiguration;
}

function radarMetrics(team: TeamSummary) {
  return [team.avgTotal, team.avgAuto, team.avgTele, team.avgDriver, defenceScore(team), reliability(team)];
}

export function nearestRankPercentile(values: number[], percentile: number) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const rank = Math.ceil(sorted.length * Math.min(1, Math.max(0, percentile)));
  return sorted[Math.max(0, rank - 1)] ?? 0;
}

export function relativeScoreVariation(stdDev: number, mean: number, baseline: number) {
  const denominator = Math.max(0, mean, baseline);
  return denominator > 0 ? stdDev / denominator : 0;
}

export function rankRadarMetrics(metrics: number[][]) {
  if (metrics.length <= 1) return metrics.map(() => [5, 5, 5, 5, 5, 5]);
  const count = metrics.length;
  return metrics.map((values) => values.map((value, index) => {
    const safeValue = Number.isFinite(value) ? value : 0;
    const rank = 1 + metrics.filter((row) => (Number.isFinite(row[index]) ? row[index]! : 0) > safeValue).length;
    return round1(5 * (count - rank) / (count - 1));
  }));
}

export function averageRadarMetrics(metrics: number[][]) {
  if (!metrics.length) return [0, 0, 0, 0, 0, 0];
  return [0, 1, 2, 3, 4, 5].map((index) => round1(metrics.reduce((sum, values) => sum + (values[index] ?? 0), 0) / metrics.length));
}

function compareRadarConfig(teams: TeamSummary[], teamMetrics: number[][], regionAverage: number[], palette: ChartPaletteLike): ChartConfiguration {
  return {
    type: "radar",
    data: {
      labels: ["综合分", "Auto", "Tele", "Drive score", "Defence score", "可靠性"],
      datasets: [
        ...teams.map((team, index) => ({
          label: `Team ${team.team}`,
          data: teamMetrics[index] ?? [0, 0, 0, 0, 0, 0],
          borderColor: palette.colors[index],
          backgroundColor: `${palette.colors[index]}22`,
          pointBackgroundColor: palette.colors[index],
        })),
        {
          label: "赛区平均",
          data: regionAverage,
          borderColor: palette.muted,
          backgroundColor: "transparent",
          pointBackgroundColor: palette.muted,
          borderDash: [6, 4],
          borderWidth: 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: palette.muted, boxWidth: 10 } }, tooltip: tooltipOptions(palette) },
      scales: {
        r: {
          min: 0,
          max: 5,
          ticks: { display: false },
          pointLabels: { color: palette.muted },
          grid: { color: palette.grid },
          angleLines: { color: palette.grid },
        },
      },
    },
  } as ChartConfiguration;
}

export function compareRangeConfig(teams: TeamSummary[], palette: ChartPaletteLike): ChartConfiguration {
  const rangeLabelsPlugin = {
    id: "rangeLabels",
    afterDatasetsDraw(chart: {
      ctx: CanvasRenderingContext2D;
      getDatasetMeta: (index: number) => { data: Array<{ x: number; width: number }> };
      scales: { y: { getPixelForValue: (value: number) => number } };
    }) {
      const { ctx } = chart;
      teams.forEach((team, index) => {
        const bar = chart.getDatasetMeta(0).data[index];
        if (!bar) return;
        const average = chart.scales.y.getPixelForValue(team.avgTotal);

        ctx.save();
        ctx.strokeStyle = palette.colors[index];
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 2]);
        ctx.beginPath();
        ctx.moveTo(bar.x - bar.width * 0.38, average);
        ctx.lineTo(bar.x + bar.width * 0.38, average);
        ctx.stroke();

        ctx.restore();
      });
    },
  };

  return {
    type: "bar",
    data: {
      labels: teams.map((team) => `Team ${team.team}`),
      datasets: [
        {
          label: "综合分范围",
          data: teams.map((team) => [team.minPts, team.maxPts]),
          backgroundColor: teams.map((_, index) => `${palette.colors[index]}44`),
          borderColor: teams.map((_, index) => palette.colors[index]),
          borderWidth: 1,
          borderRadius: 4,
          barPercentage: 0.72,
        },
      ],
    },
    plugins: [rangeLabelsPlugin],
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", axis: "x", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          ...tooltipOptions(palette),
          callbacks: {
            label: (context: { dataIndex: number }) => {
              const team = teams[context.dataIndex];
              return [
                `最高 ${formatChartNumber(team.maxPts)}`,
                `平均 ${formatChartNumber(team.avgTotal)}`,
                `最低 ${formatChartNumber(team.minPts)}`,
                `范围 ${formatChartNumber(team.maxPts - team.minPts)}`,
              ];
            },
          },
        },
      },
      scales: {
        x: { ticks: { color: palette.muted }, grid: { color: palette.grid } },
        y: { ticks: { color: palette.muted }, grid: { color: palette.grid }, beginAtZero: true },
      },
    },
  } as unknown as ChartConfiguration;
}

export function formatChartNumber(value: number) {
  return Number(value.toFixed(1));
}

type ChartPaletteLike = {
  muted: string;
  grid: string;
  panel: string;
  colors: string[];
};

function tooltipOptions(palette: { panel: string; muted: string }) {
  return {
    backgroundColor: palette.panel,
    titleColor: palette.muted,
    bodyColor: palette.muted,
    borderColor: palette.muted,
    borderWidth: 1,
  };
}
