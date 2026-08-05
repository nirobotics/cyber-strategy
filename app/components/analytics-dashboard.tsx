import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";
import type { ChartConfiguration } from "chart.js";
import {
  BarChart3,
  Bot,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  EyeOff,
  FileText,
  GripVertical,
  LineChart,
  ListChecks,
  Map as MapIcon,
  Plus,
  RotateCcw,
  Search,
  Settings,
  ShieldCheck,
  Table2,
  Trash2,
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
  sortedTeams,
  type ScoutingDataset,
  type ScoutingEventOption,
  type ScoutingMatch,
  type TeamPitInfo,
  type TeamSummary,
} from "../lib/scouting";
import {
  addPickListTeam,
  insertPickListTeam,
  orderPickPool,
  pickListAutoScrollDelta,
  removePickListTeam,
  sanitizePickList,
  type PickListId,
} from "../lib/picklist";
import { buildTierAssignments, tierDisplayLabel, type TierInfo, type TierPercentages } from "../lib/tier-settings";
import { analyzeRouteRepetition, buildMatchAutoRoutes, MATCH_AUTO_NODE_LABELS } from "../lib/match-auto-routes";
import type { CombinedMatch } from "../lib/match-analysis";
import type { DataRange } from "../lib/data-range";
import { dashboardResourcePath } from "../lib/dashboard-performance";

type Tab = "browser" | "compare" | "match" | "picklist" | "proposal" | "lead" | "settings";

const EVENT_STORAGE_KEY = "cyber-strategy:selected-event";
const PICK_DRAG_TEAM_TYPE = "application/x-cyber-strategy-team";
const PICK_DRAG_SOURCE_TYPE = "application/x-cyber-strategy-source";
const loadMatchAnalysis = () => import("./match-analysis").then((module) => ({ default: module.MatchAnalysis }));
const loadScoutingLeadPanel = () => import("./scouting-lead-panel").then((module) => ({ default: module.ScoutingLeadPanel }));
const loadStrategyProposalPanel = () => import("./strategy-proposal-panel").then((module) => ({ default: module.StrategyProposalPanel }));
const loadStrategySettingsPanel = () => import("./strategy-settings-panel").then((module) => ({ default: module.StrategySettingsPanel }));
const MatchAnalysis = lazy(loadMatchAnalysis);
const ScoutingLeadPanel = lazy(loadScoutingLeadPanel);
const StrategyProposalPanel = lazy(loadStrategyProposalPanel);
const StrategySettingsPanel = lazy(loadStrategySettingsPanel);

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
  demo,
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
  demo?: { matches: CombinedMatch[]; ownTeams: readonly string[]; routeBase: string; dataRange: DataRange[] };
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
  const matchScheduleFetcher = useFetcher<MatchScheduleResource>();
  const strategyProposalFetcher = useFetcher<StrategyProposalResource>();
  const scoutingLeadFetcher = useFetcher<ScoutingLeadPanelData>();

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
  const demoMode = Boolean(demo);
  const routeBase = demo?.routeBase ?? "/";
  const canViewLead = isAdmin || demoMode;
  const canViewSettings = isAdmin || demoMode;
  const activeTab = (tab === "lead" && !canViewLead) || (tab === "settings" && !canViewSettings) ? "browser" : tab;
  const showMatchTypes = dataRange.length > 1;
  const fetchedMatchSchedule = matchScheduleFetcher.data?.eventKey === resolvedEventKey ? matchScheduleFetcher.data.matches : null;
  const fetchedStrategyProposal = strategyProposalFetcher.data?.selectedEventKey === resolvedEventKey ? strategyProposalFetcher.data : null;
  const resolvedStrategyProposal = demoMode || strategyProposal.loaded ? strategyProposal : fetchedStrategyProposal;
  const resolvedScoutingLead = demoMode
    ? scoutingLead
    : scoutingLeadFetcher.data?.selectedEventKey === resolvedEventKey ? scoutingLeadFetcher.data : null;

  const prepareTab = useCallback((next: Tab) => {
    if (next === "match") void loadMatchAnalysis();
    if (next === "proposal") void loadStrategyProposalPanel();
    if (next === "lead") void loadScoutingLeadPanel();
    if (next === "settings") void loadStrategySettingsPanel();
    if (demoMode) return;

    if (next === "match" && matchScheduleFetcher.state === "idle" && matchScheduleFetcher.data?.eventKey !== resolvedEventKey) {
      matchScheduleFetcher.load(dashboardResourcePath("match", resolvedEventKey));
    }
    if (next === "proposal" && strategyProposalFetcher.state === "idle" && strategyProposalFetcher.data?.selectedEventKey !== resolvedEventKey) {
      strategyProposalFetcher.load(dashboardResourcePath("proposal", resolvedEventKey));
    }
    if (next === "lead" && isAdmin && scoutingLeadFetcher.state === "idle" && scoutingLeadFetcher.data?.selectedEventKey !== resolvedEventKey) {
      scoutingLeadFetcher.load(dashboardResourcePath("lead", resolvedEventKey));
    }
  }, [
    demoMode,
    isAdmin,
    matchScheduleFetcher,
    resolvedEventKey,
    scoutingLeadFetcher,
    strategyProposalFetcher,
  ]);

  useEffect(() => {
    if (demoMode) return;
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
    navigate(`${routeBase}?${params.toString()}`, { replace: true });
  }, [demoMode, events, navigate, routeBase]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void Promise.allSettled([loadMatchAnalysis(), loadStrategyProposalPanel(), loadScoutingLeadPanel(), loadStrategySettingsPanel()]);
    }, 500);
    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    prepareTab(activeTab);
  }, [activeTab, prepareTab]);

  function selectEvent(eventKey: string) {
    if (demoMode) return;
    const params = new URLSearchParams(window.location.search);
    if (eventKey) {
      storeSelectedEvent(eventKey);
      params.set("event", eventKey);
    } else {
      clearSelectedEvent();
      params.delete("event");
    }
    const search = params.toString();
    navigate(search ? `${routeBase}?${search}` : routeBase);
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
    const path = search ? `${routeBase}?${search}` : routeBase;
    window.history.replaceState(null, "", path);
  }

  function toggleHidden(team: string) {
    setHiddenTeams((current) => toggleValue(current, team));
  }

  function toggleIgnoredMatch(team: string, match: number, matchIndex: number) {
    setIgnoredMatches((current) => toggleValue(current, matchIgnoreKey(team, match, matchIndex)));
  }

  return (
    <div className="flex w-full flex-col">
      <div className="-mx-2.5 -mt-2.5 border-b border-line bg-surface">
        <div className="mx-auto grid w-full max-w-[1500px] grid-cols-[minmax(0,1fr)] gap-2 px-3 py-3 sm:px-4">
          <nav aria-label="功能选择" className="flex items-center gap-2 overflow-x-auto">
            <SegmentedTab active={tab} value="browser" onClick={selectTab} icon={<Bot className="size-4" />}>
              队伍浏览
            </SegmentedTab>
            <SegmentedTab active={tab} value="compare" onClick={selectTab} icon={<BarChart3 className="size-4" />}>
              队伍对比
            </SegmentedTab>
            <SegmentedTab active={tab} value="match" onClick={selectTab} onPrefetch={prepareTab} icon={<Table2 className="size-4" />}>
              赛程分析
            </SegmentedTab>
            <SegmentedTab active={tab} value="picklist" onClick={selectTab} icon={<ListChecks className="size-4" />}>
              Picklist
            </SegmentedTab>
            <SegmentedTab active={tab} value="proposal" onClick={selectTab} onPrefetch={prepareTab} icon={<FileText className="size-4" />}>
              Strategy Proposal
            </SegmentedTab>
            {canViewLead ? (
              <SegmentedTab active={tab} value="lead" onClick={selectTab} onPrefetch={prepareTab} icon={<ShieldCheck className="size-4" />}>
                Scouting Lead
              </SegmentedTab>
            ) : null}
            {canViewSettings ? (
              <SegmentedTab active={tab} value="settings" onClick={selectTab} onPrefetch={prepareTab} icon={<Settings className="size-4" />}>
                {isAdmin ? "管理" : "设置"}
              </SegmentedTab>
            ) : null}
          </nav>
          <label className="grid w-full max-w-full gap-1 text-sm sm:w-fit">
            <span className="sr-only">赛事</span>
            <select
              value={selectedEventKey ?? dataset.eventKey}
              onChange={(event) => selectEvent(event.target.value)}
              className="input h-9 max-w-full font-sans sm:w-fit sm:[field-sizing:content]"
              disabled={demoMode || !events.length}
              title="选择 cyber-scout 赛事"
            >
              {!events.some((event) => event.eventKey === (selectedEventKey ?? dataset.eventKey)) ? (
                <option value={selectedEventKey ?? dataset.eventKey}>{selectedEventKey ?? dataset.eventKey}</option>
              ) : null}
              {events.map((event) => (
                <option key={event.eventKey} value={event.eventKey}>
                  {event.name || event.eventKey}{event.isActive ? " · 当前" : ""}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-3 pt-3">
      <Suspense fallback={<Card className="p-6 text-sm text-ink-dim">正在加载…</Card>}>
      {!teams.length ? (
        <Card className="p-6 text-sm text-ink-dim">
          当前赛事还没有可分析的队伍记录。请确认 cyber-scout 已上传普通/超级侦察记录。
        </Card>
      ) : null}

      {teams.length && activeTab === "browser" && selected ? (
        <div className="grid min-h-0 gap-3 lg:grid-cols-[340px_minmax(0,1fr)]">
          <Card className="overflow-hidden p-0 lg:sticky lg:top-3 lg:max-h-[calc(100dvh-13rem)]">
            <div className="flex items-center gap-2 border-b border-line p-3">
              <Search className="size-4 text-ink-faint" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="搜索队伍"
                inputMode="numeric"
                className="h-9"
              />
            </div>
            <div className="max-h-[460px] overflow-y-auto lg:max-h-[calc(100dvh-18rem)]">
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

          <TeamDetail
            team={selected}
            tier={tierByTeam.get(selected.team)}
            photos={photos}
            pitInfo={dataset.teamPitData?.[selected.team]}
            displayMatches={selectedOriginal?.matches ?? selected.matches}
            ignoredMatchKeys={ignoredMatchSet}
            onToggleIgnoreMatch={toggleIgnoredMatch}
            onOpenPhoto={(index) => setLightbox({ team: selected.team, index })}
            hideComments={demoMode}
            showMatchTypes={showMatchTypes}
          />
        </div>
      ) : null}

      {teams.length && activeTab === "compare" ? <CompareTeams teams={teams} /> : null}
      {visitedTabs.has("match") ? (
        <div hidden={activeTab !== "match"}>
          {demoMode || fetchedMatchSchedule ? (
            <MatchAnalysis eventKey={dataset.eventKey} schedule={demo?.matches ?? fetchedMatchSchedule ?? matchSchedule} teamData={analysisTeamData} enrich={!demoMode} />
          ) : <TabLoading label="正在加载赛程数据" />}
        </div>
      ) : null}
      {teams.length && activeTab === "picklist" ? (
        <PicklistBoard
          datasetId={dataset.id}
          eventKey={dataset.eventKey}
          teams={teams}
          tierByTeam={tierByTeam}
          rankByTeam={rankByTeam}
          onOpenTeam={setDetailTeam}
        />
      ) : null}
      {visitedTabs.has("proposal") ? (
        <div hidden={activeTab !== "proposal"}>
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
              demoMode={demoMode}
              ownTeams={demo?.ownTeams}
              routeBase={routeBase}
            />
          ) : <TabLoading label="正在加载 Strategy Proposal" />}
        </div>
      ) : null}
      {visitedTabs.has("lead") ? (
        <div hidden={activeTab !== "lead"}>
          {resolvedScoutingLead ? <ScoutingLeadPanel data={resolvedScoutingLead} readOnly={demoMode} routeBase={routeBase} /> : <TabLoading label="正在加载 Scouting Lead" />}
        </div>
      ) : null}
      {visitedTabs.has("settings") ? (
        <div hidden={activeTab !== "settings"}>
          <StrategySettingsPanel tierPercentages={tierPercentages} dataRange={demo?.dataRange ?? dataRange} readOnly={demoMode} />
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
          hideComments={demoMode}
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
        {pitInfo?.canCrossTrench ? <Badge className="border-info/40 bg-info/10 text-info">trench</Badge> : null}
        {pitInfo?.isSwerve ? <Badge className="border-brand/40 bg-brand/10 text-brand">swerve</Badge> : null}
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
        <Stat label="平均综合分" value={team.avgTotal} sub="每场" />
        <Stat label="自动贡献" value={team.avgAuto} sub="分" />
        <Stat label="手动贡献" value={team.avgTele} sub="分" />
        <Stat label="Transfer 球量" value={(team.avgTransferPieces ?? 0) > 0 ? team.avgTransferPieces : "-"} sub="平均" />
        <Stat label="平均 BPS" value={(team.avgBps ?? 0) > 0 ? team.avgBps : "-"} sub="Scout" />
        <Stat label="命中率" value={team.avgAccuracy > 0 ? `${team.avgAccuracy}%` : "-"} sub="Scout" />
        <Stat label="可靠性" value={`${reliability(team)}%`} sub="平均可用率" />
        <Stat label="标准差" value={`±${team.stdDev}`} sub="稳定性" />
        <Stat label="综合分范围" value={`${team.minPts}–${team.maxPts}`} sub="最低 / 最高" />
        <Stat label="Drive score" value={team.avgDriver} sub={<RatingDots value={team.avgDriver} />} />
        <Stat label="Defence score" value={defenceScore(team)} sub={<RatingDots value={defenceScore(team)} />} />
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
                      {nodeIndex + 1}. {MATCH_AUTO_NODE_LABELS[node] ?? node}
                    </span>
                  ))}
                </div>
                <div className="mt-2 flex flex-wrap gap-1 text-xs text-ink-dim">
                  <Badge className="border-line bg-surface-2 text-ink-dim">{route.alliance === "blue" ? "蓝方" : "红方"}</Badge>
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
                <th className="px-3 py-2 text-left">Transfer</th>
                <th className="px-3 py-2 text-left">命中率</th>
                <th className="px-3 py-2 text-left">状态</th>
                {!hideComments ? <th className="px-3 py-2 text-left">备注</th> : null}
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
                        {ignored ? <span className="rounded-full border border-danger/40 bg-danger/10 px-1.5 py-0.5 text-[10px] text-danger">已忽略</span> : null}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <PointsBar value={match.totalPts} max={team.maxPts} />
                    </td>
                    <td className="px-3 py-2">{match.autoPts}</td>
                    <td className="px-3 py-2">{match.telePts}</td>
                    <td className="px-3 py-2">{(match.transferPieces ?? 0) > 0 ? match.transferPieces : "-"}</td>
                    <td className="px-3 py-2">{match.accuracy == null ? "-" : `${match.accuracy}%`}</td>
                    <td className="px-3 py-2">
                      <StatePill match={match} />
                    </td>
                    {!hideComments ? (
                      <td className="max-w-md px-3 py-2 text-ink-dim">
                        <p>{match.comment || "-"}</p>
                        {match.scoutName ? <p className="mt-1 text-xs text-ink-faint">记录员：{match.scoutName}</p> : null}
                      </td>
                    ) : null}
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
  const teamSet = useMemo(() => new Set(teams.map((team) => team.team)), [teams]);
  const selectedTeams = [0, 1, 2].map((index) => {
    const team = selected[index];
    if (team === "") return "";
    return team && teamSet.has(team) ? team : defaults[index] ?? "";
  });
  const compared = selectedTeams.map((team) => teams.find((item) => item.team === team)).filter(Boolean) as TeamSummary[];
  const regionRadarMetrics = averageRadarMetrics(teams.map(radarMetrics));

  function setTeam(index: number, team: string) {
    setSelected((current) => [0, 1, 2].map((slot) => (slot === index ? team : current[slot] ?? defaults[slot] ?? "")));
  }

  return (
    <div className="space-y-3">
      <Card className="p-3">
        <div className="grid gap-3 md:grid-cols-3 md:items-end">
          {[0, 1, 2].map((index) => (
            <label key={index} className="grid gap-1 text-sm">
              <span className="font-medium text-ink-dim">Team {index + 1}</span>
              <select
                value={selectedTeams[index] ?? ""}
                onChange={(event) => setTeam(index, event.target.value)}
                className="input h-10 font-sans"
              >
                <option value="">无</option>
                {teams.map((team) => (
                  <option key={team.team} value={team.team}>
                    Team {team.team}（{team.avgTotal} 综合均分）
                  </option>
                ))}
              </select>
            </label>
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
        <Card className="p-4">
          <h3 className="mb-3 text-sm font-semibold text-ink-dim">Scout 命中率</h3>
          <ChartCanvas
            label="Scout 命中率对比"
            configKey={`cmp-accuracy:${selectedTeams.join(",")}`}
            buildConfig={(palette) => compareAccuracyConfig(compared, palette)}
          />
        </Card>
        <Card className="p-4">
          <h3 className="mb-3 text-sm font-semibold text-ink-dim">能力雷达</h3>
          <ChartCanvas
            label="队伍能力雷达对比"
            configKey={`cmp-radar:${selectedTeams.join(",")}:${regionRadarMetrics.join(",")}`}
            buildConfig={(palette) => compareRadarConfig(compared, regionRadarMetrics, palette)}
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

function PicklistBoard({
  datasetId,
  eventKey,
  teams,
  tierByTeam,
  rankByTeam,
  onOpenTeam,
}: {
  datasetId: string;
  eventKey: string;
  teams: TeamSummary[];
  tierByTeam: Map<string, TierInfo>;
  rankByTeam: Map<string, number>;
  onOpenTeam: (team: string) => void;
}) {
  const [activePick, setActivePick] = useState<PickListId>("first");
  const [crossedTeams, setCrossedTeams] = useStoredList(`cyber-strategy:picklist:${datasetId}:crossed`);
  const [firstPick, setFirstPick] = useStoredList(`cyber-strategy:picklist:${datasetId}:first`);
  const [secondPick, setSecondPick] = useStoredList(`cyber-strategy:picklist:${datasetId}:second`);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);
  const dragging = useRef(false);
  const autoScrollFrame = useRef<number | null>(null);
  const autoScrollTarget = useRef<HTMLElement | Window | null>(null);
  const autoScrollSpeed = useRef(0);
  const validTeamIds = useMemo(() => teams.map((team) => team.team), [teams]);
  const crossedSet = useMemo(() => new Set(sanitizePickList(crossedTeams, validTeamIds)), [crossedTeams, validTeamIds]);
  const firstPickTeams = useMemo(() => sanitizePickList(firstPick, validTeamIds), [firstPick, validTeamIds]);
  const secondPickTeams = useMemo(() => sanitizePickList(secondPick, validTeamIds), [secondPick, validTeamIds]);
  const pickTeams = useMemo(
    () => activePick === "first" ? firstPickTeams : secondPickTeams,
    [activePick, firstPickTeams, secondPickTeams],
  );
  const poolTeams = useMemo(() => orderPickPool(teams, crossedTeams, pickTeams), [teams, crossedTeams, pickTeams]);
  const pickTitle = activePick === "first" ? "1st Pick List" : "2nd Pick List";

  useEffect(() => {
    function stopAutoScroll() {
      dragging.current = false;
      autoScrollSpeed.current = 0;
      autoScrollTarget.current = null;
      if (autoScrollFrame.current !== null) window.cancelAnimationFrame(autoScrollFrame.current);
      autoScrollFrame.current = null;
    }

    function scrollFrame() {
      const target = autoScrollTarget.current;
      const speed = autoScrollSpeed.current;
      if (!target || !speed) {
        autoScrollFrame.current = null;
        return;
      }
      target.scrollBy({ top: speed, behavior: "auto" });
      autoScrollFrame.current = window.requestAnimationFrame(scrollFrame);
    }

    function startAutoScroll(target: HTMLElement | Window, speed: number) {
      autoScrollTarget.current = speed ? target : null;
      autoScrollSpeed.current = speed;
      if (speed && autoScrollFrame.current === null) autoScrollFrame.current = window.requestAnimationFrame(scrollFrame);
    }

    function handleDragOver(event: globalThis.DragEvent) {
      if (!dragging.current) return;
      const element = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-picklist-scroll]") : null;
      if (element) {
        const rect = element.getBoundingClientRect();
        const speed = pickListAutoScrollDelta(event.clientY, rect.top, rect.bottom);
        const canScroll = speed < 0 ? element.scrollTop > 0 : speed > 0 && element.scrollTop + element.clientHeight < element.scrollHeight;
        if (speed && canScroll) {
          startAutoScroll(element, speed);
          return;
        }
      }
      startAutoScroll(window, pickListAutoScrollDelta(event.clientY, 0, window.innerHeight));
    }

    window.addEventListener("dragover", handleDragOver);
    window.addEventListener("dragend", stopAutoScroll);
    window.addEventListener("drop", stopAutoScroll);
    return () => {
      window.removeEventListener("dragover", handleDragOver);
      window.removeEventListener("dragend", stopAutoScroll);
      window.removeEventListener("drop", stopAutoScroll);
      stopAutoScroll();
    };
  }, []);

  useEffect(() => {
    if (!printing) return;
    const timeout = window.setTimeout(() => window.print(), 250);
    const clear = () => setPrinting(false);
    window.addEventListener("afterprint", clear, { once: true });
    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener("afterprint", clear);
    };
  }, [printing]);

  function updateCurrentPick(updater: (current: string[]) => string[]) {
    const apply = (current: string[]) => sanitizePickList(updater(current), validTeamIds);
    if (activePick === "first") setFirstPick(apply);
    else setSecondPick(apply);
  }

  function toggleCrossed(team: string) {
    setCrossedTeams((current) => toggleValue(current, team));
  }

  function startDrag(event: DragEvent<HTMLElement>, team: string, source: "pool" | "pick") {
    dragging.current = true;
    event.dataTransfer.setData(PICK_DRAG_TEAM_TYPE, team);
    event.dataTransfer.setData(PICK_DRAG_SOURCE_TYPE, source);
    event.dataTransfer.setData("text/plain", team);
    event.dataTransfer.effectAllowed = source === "pick" ? "move" : "copy";
  }

  function readDraggedTeam(event: DragEvent<HTMLElement>) {
    return event.dataTransfer.getData(PICK_DRAG_TEAM_TYPE) || event.dataTransfer.getData("text/plain");
  }

  function dropTeam(event: DragEvent<HTMLElement>, beforeTeam?: string) {
    event.preventDefault();
    event.stopPropagation();
    const team = readDraggedTeam(event);
    const source = event.dataTransfer.getData(PICK_DRAG_SOURCE_TYPE);
    if (!team || !validTeamIds.includes(team)) {
      setDropTarget(null);
      return;
    }
    updateCurrentPick((current) => {
      if (beforeTeam) return insertPickListTeam(current, team, beforeTeam);
      return source === "pick" ? insertPickListTeam(current, team) : addPickListTeam(current, team);
    });
    setDropTarget(null);
  }

  return (
    <div className="grid min-h-0 gap-3 min-[700px]:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
      <Card className="overflow-hidden p-0">
        <div data-picklist-scroll className="max-h-[68dvh] overflow-y-auto p-2">
          {poolTeams.map((team) => {
            const crossed = crossedSet.has(team.team);
            return (
              <div
                key={team.team}
                draggable
                onDragStart={(event) => startDrag(event, team.team, "pool")}
                className={cn(
                  "mb-2 flex flex-wrap items-center gap-2 rounded-md border border-line bg-surface-2 px-2.5 py-2 text-sm transition hover:border-brand/50",
                  crossed && "opacity-45",
                )}
              >
                <GripVertical className="size-4 text-ink-faint" />
                <span className="w-8 text-right text-xs tabular-nums text-ink-faint">{rankByTeam.get(team.team)}</span>
                <button
                  type="button"
                  onClick={() => onOpenTeam(team.team)}
                  className={cn(
                    "w-fit shrink-0 whitespace-nowrap rounded-md px-1.5 py-1 text-left font-semibold tabular-nums text-ink hover:bg-surface hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50",
                    crossed && "line-through",
                  )}
                >
                  Team {team.team}
                </button>
                <div className="min-w-40 flex-1">
                  <p className={cn("truncate text-xs text-ink-dim", crossed && "line-through")}>
                    {team.matchCount} 场 · 可靠性 {reliability(team)}% · {trendLabel(team.trend)}
                  </p>
                </div>
                <span className="whitespace-nowrap rounded-full bg-surface px-2 py-0.5 text-xs tabular-nums text-ink-dim">
                  {team.avgTotal} 综合均分
                </span>
                <span className="whitespace-nowrap rounded-full bg-surface px-2 py-0.5 text-xs tabular-nums text-ink-dim">
                  Drive score {team.avgDriver.toFixed(1)}
                </span>
                <span className="whitespace-nowrap rounded-full bg-surface px-2 py-0.5 text-xs tabular-nums text-ink-dim">
                  Defence score {defenceScore(team).toFixed(1)}
                </span>
                <TierBadge tier={tierByTeam.get(team.team)} />
                <div className="ml-auto flex justify-end gap-1">
                  <Button
                    type="button"
                    title={`加入 ${pickTitle}`}
                    aria-label={`加入 ${pickTitle}`}
                    className="h-8 px-2"
                    onClick={() => updateCurrentPick((current) => addPickListTeam(current, team.team))}
                  >
                    <Plus className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    title={crossed ? "恢复队伍" : "划掉队伍"}
                    aria-label={crossed ? "恢复队伍" : "划掉队伍"}
                    className="h-8 px-2"
                    onClick={() => toggleCrossed(team.team)}
                  >
                    {crossed ? <RotateCcw className="size-4" /> : <X className="size-4" />}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="border-b border-line p-3">
          <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
            <div className="flex items-center gap-2">
              <span className="text-sm text-ink-dim">{pickTeams.length} 支</span>
              <Button
                type="button"
                onClick={() => setPrinting(true)}
                disabled={!firstPickTeams.length && !secondPickTeams.length}
                title="导出 Picklist PDF"
              >
                <Download className="size-4" />
                导出 PDF
              </Button>
            </div>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant={activePick === "first" ? "active" : "default"} onClick={() => setActivePick("first")}>
              1st Pick List
            </Button>
            <Button type="button" variant={activePick === "second" ? "active" : "default"} onClick={() => setActivePick("second")}>
              2nd Pick List
            </Button>
          </div>
        </div>
        <div
          data-picklist-scroll
          className="min-h-80 max-h-[68dvh] overflow-y-auto p-2"
          onDragOver={(event) => {
            event.preventDefault();
            setDropTarget("end");
          }}
          onDragEnter={() => setDropTarget("end")}
          onDragLeave={() => setDropTarget(null)}
          onDrop={(event) => dropTeam(event)}
        >
          {!pickTeams.length ? (
            <div className="grid min-h-64 place-items-center rounded-md border border-dashed border-line bg-surface-2 px-4 text-center text-sm text-ink-dim">
              从左侧拖入队伍，或点击加号加入当前列表。
            </div>
          ) : null}
          {pickTeams.map((teamNumber, index) => {
            const team = teams.find((item) => item.team === teamNumber);
            if (!team) return null;
            return (
              <div key={team.team}>
                <DropLine active={dropTarget === team.team} />
                <div
                  draggable
                  onDragStart={(event) => startDrag(event, team.team, "pick")}
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setDropTarget(team.team);
                  }}
                  onDragEnter={(event) => {
                    event.stopPropagation();
                    setDropTarget(team.team);
                  }}
                  onDrop={(event) => dropTeam(event, team.team)}
                  className="mb-2 flex flex-wrap items-center gap-2 rounded-md border border-line bg-surface-2 px-2.5 py-2 text-sm transition hover:border-brand/50"
                >
                  <GripVertical className="size-4 text-ink-faint" />
                  <span className="w-8 text-right text-xs font-semibold tabular-nums text-ink-faint">{index + 1}</span>
                  <button
                    type="button"
                    onClick={() => onOpenTeam(team.team)}
                    className="w-fit min-w-max shrink-0 whitespace-nowrap rounded-md px-1.5 py-1 text-left font-semibold tabular-nums text-ink hover:bg-surface hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
                  >
                    Team {team.team}
                  </button>
                  <span className="whitespace-nowrap rounded-full bg-surface px-2 py-0.5 text-xs tabular-nums text-ink-dim">
                    {team.avgTotal} 综合均分
                  </span>
                  <span className="whitespace-nowrap rounded-full bg-surface px-2 py-0.5 text-xs tabular-nums text-ink-dim">
                    Drive score {team.avgDriver.toFixed(1)}
                  </span>
                  <span className="whitespace-nowrap rounded-full bg-surface px-2 py-0.5 text-xs tabular-nums text-ink-dim">
                    Defence score {defenceScore(team).toFixed(1)}
                  </span>
                  <Button
                    type="button"
                    title="移出当前列表"
                    aria-label="移出当前列表"
                    className="h-8 px-2"
                    onClick={() => updateCurrentPick((current) => removePickListTeam(current, team.team))}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            );
          })}
          {pickTeams.length ? <DropLine active={dropTarget === "end"} /> : null}
        </div>
      </Card>
      {printing ? (
        <PicklistPrintDocument
          eventKey={eventKey}
          teams={teams}
          tierByTeam={tierByTeam}
          rankByTeam={rankByTeam}
          firstPick={firstPickTeams}
          secondPick={secondPickTeams}
        />
      ) : null}
    </div>
  );
}

function PicklistPrintDocument({
  eventKey,
  teams,
  tierByTeam,
  rankByTeam,
  firstPick,
  secondPick,
}: {
  eventKey: string;
  teams: TeamSummary[];
  tierByTeam: Map<string, TierInfo>;
  rankByTeam: Map<string, number>;
  firstPick: string[];
  secondPick: string[];
}) {
  const byTeam = new Map(teams.map((team) => [team.team, team]));
  const exportedAt = new Date().toLocaleString("zh-CN", { hour12: false });
  return (
    <div className="picklist-print-root" aria-hidden="true">
      <style>{PICKLIST_PRINT_CSS}</style>
      <article className="picklist-print-page">
        <header className="picklist-print-header">
          <div>
            <p>NI Robotics · Cyber Strategy</p>
            <h1>Picklist</h1>
          </div>
          <div><span>{eventKey}</span><span>{exportedAt}</span></div>
        </header>
        <div className="picklist-print-lists">
          {([["1st Pick List", firstPick], ["2nd Pick List", secondPick]] as const).map(([title, list]) => (
            <section key={title}>
              <h2>{title}</h2>
              {!list.length ? <p className="picklist-print-empty">暂无队伍</p> : null}
              {list.map((teamNumber, index) => {
                const team = byTeam.get(teamNumber);
                if (!team) return null;
                const tier = tierByTeam.get(teamNumber);
                return (
                  <div className="picklist-print-row" key={teamNumber}>
                    <strong>{index + 1}</strong>
                    <div><h3>Team {teamNumber}</h3><p>数据排名 #{rankByTeam.get(teamNumber) ?? "-"} · {team.matchCount} 场 · 可靠性 {reliability(team)}%</p></div>
                    <div className="picklist-print-stats">
                      <span>综合 <b>{team.avgTotal}</b></span>
                      <span>Drive <b>{team.avgDriver.toFixed(1)}</b></span>
                      <span>Defence <b>{defenceScore(team).toFixed(1)}</b></span>
                      {tier ? <span>分层 <b>{tierDisplayLabel(tier.label)}</b></span> : null}
                    </div>
                  </div>
                );
              })}
            </section>
          ))}
        </div>
        <footer>NI Robotics · Cyber Strategy · Picklist</footer>
      </article>
    </div>
  );
}

const PICKLIST_PRINT_CSS = `
.picklist-print-root { position: fixed; left: -10000px; top: 0; width: 210mm; height: 1px; overflow: hidden; background: #fff; color: #111827; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
.picklist-print-root * { box-sizing: border-box; }
@page { size: A4 landscape; margin: 12mm; }
@media print {
  html, body { background: #fff !important; }
  body * { visibility: hidden !important; }
  .picklist-print-root, .picklist-print-root * { visibility: visible !important; }
  .picklist-print-root { position: absolute !important; left: 0 !important; top: 0 !important; width: 100% !important; height: auto !important; overflow: visible !important; }
  .picklist-print-page { min-height: 180mm; color: #111827; background: #fff; }
  .picklist-print-header { display: flex; align-items: end; justify-content: space-between; gap: 16px; padding-bottom: 8px; border-bottom: 1px solid #d1d5db; }
  .picklist-print-header p, .picklist-print-header h1 { margin: 0; }
  .picklist-print-header p { color: #6b7280; font-size: 9px; text-transform: uppercase; letter-spacing: .08em; }
  .picklist-print-header h1 { margin-top: 2px; font-size: 22px; }
  .picklist-print-header > div:last-child { display: grid; gap: 2px; color: #6b7280; font-size: 9px; text-align: right; }
  .picklist-print-lists { display: grid; grid-template-columns: minmax(0, 1fr); gap: 10mm; margin-top: 7mm; }
  .picklist-print-lists section { min-width: 0; }
  .picklist-print-lists h2 { margin: 0 0 3mm; font-size: 15px; }
  .picklist-print-row { display: grid; grid-template-columns: 7mm minmax(0, 1fr); gap: 3mm; break-inside: avoid; margin-bottom: 2mm; border: 1px solid #e5e7eb; border-radius: 5px; padding: 2.5mm; }
  .picklist-print-row > strong { display: grid; place-items: center; border-radius: 4px; background: #f3f4f6; font-size: 12px; }
  .picklist-print-row h3, .picklist-print-row p { margin: 0; }
  .picklist-print-row h3 { font-size: 11px; }
  .picklist-print-row p { margin-top: 1px; color: #6b7280; font-size: 8px; }
  .picklist-print-stats { grid-column: 2; display: flex; flex-wrap: wrap; gap: 2mm 4mm; color: #6b7280; font-size: 8px; }
  .picklist-print-stats b { color: #111827; }
  .picklist-print-empty { color: #6b7280; font-size: 10px; }
  .picklist-print-page footer { position: fixed; right: 12mm; bottom: 5mm; left: 12mm; color: #6b7280; font-size: 8px; text-align: center; }
}
`;

function DropLine({ active }: { active: boolean }) {
  return (
    <div className="h-2">
      {active ? <div className="mx-2 h-0.5 rounded-full bg-brand shadow-[0_0_0_1px_var(--accent)]" /> : null}
    </div>
  );
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
            <h2 className="truncate text-lg font-semibold text-ink">Team {team.team}</h2>
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
            {pitInfo.drivetrain ? <Badge className="border-line bg-surface-2 text-ink-dim">{pitInfo.drivetrain}</Badge> : null}
            {pitInfo.swerveModule ? <Badge className="border-line bg-surface-2 text-ink-dim">{pitInfo.swerveModule}</Badge> : null}
            {pitInfo.canCrossTrench ? <Badge className="border-info/40 bg-info/10 text-info">trench</Badge> : null}
            {pitInfo.isSwerve ? <Badge className="border-brand/40 bg-brand/10 text-brand">swerve</Badge> : null}
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
  const polyline = points.map((point) => `${point.x},${point.y}`).join(" ");
  const repetition = analyzeRouteRepetition(points);
  const visits = showRepetition ? repetition.visits : repetition.visits.map((visit) => ({ ...visit, occurrence: 1, total: 1 }));
  const hasRepeatedVisits = repetition.visits.some((visit) => visit.total > 1);
  return (
    <div
      className="relative aspect-[2/1] overflow-hidden rounded-md border border-line bg-surface-2"
      aria-label={showRepetition && hasRepeatedVisits ? "自动路线预览，含重复经过路线" : "自动路线预览"}
    >
      <img src="/pit-field-map.webp" alt="" className="absolute inset-0 h-full w-full object-fill" />
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

function Stat({ label, value, sub }: { label: string; value: ReactNode; sub: ReactNode }) {
  return (
    <Card className="p-3">
      <p className="text-[11px] font-semibold uppercase text-ink-faint">{label}</p>
      <p className="mt-1 break-words text-xl font-semibold text-ink">{value}</p>
      <div className="mt-1 text-xs text-ink-dim">{sub}</div>
    </Card>
  );
}

function RatingDots({ value }: { value: number }) {
  const rounded = Math.round(value);
  return (
    <span className="flex gap-1">
      {[1, 2, 3, 4, 5].map((dot) => (
        <span key={dot} className={ratingDotClassName(dot <= rounded)} />
      ))}
    </span>
  );
}

export function ratingDotClassName(active: boolean) {
  return cn("size-1.5 rounded-full", active ? "bg-brand" : "bg-line");
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

const INCAP_DISPLAY_THRESHOLD_MS = 20_000;

function StatePill({ match }: { match: ScoutingMatch }) {
  const displayBotState = displayedBotState(match);
  const className =
    displayBotState === 2
      ? "border-warn/40 bg-warn/10 text-warn"
      : displayBotState === 3
        ? "border-orange-500/40 bg-orange-500/10 text-orange-600 dark:text-orange-300"
        : displayBotState === 4
          ? "border-danger/40 bg-danger/10 text-danger"
          : "border-ok/40 bg-ok/10 text-ok";
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold", className)}>
      {botStateLabel(match)}
      {match.disabled ? <span className="text-danger">已禁用</span> : null}
    </span>
  );
}

function displayedBotState(match: ScoutingMatch) {
  return isShortIncap(match) ? 1 : match.botState;
}

function botStateLabel(match: ScoutingMatch) {
  if (isShortIncap(match)) return "正常";
  const normalized = match.botStateText.trim().toLowerCase();
  const byText: Record<string, string> = {
    "no issue": "正常",
    "comms issue": "通信问题",
    "minor malfunction": "轻微故障",
    "major malfunction": "严重故障",
    "no show": "未到场",
    incap: "宕机",
    unknown: "未知",
  };
  if (byText[normalized]) return byText[normalized];
  return { 1: "正常", 2: "通信问题", 3: "轻微故障", 4: "严重故障" }[displayedBotState(match)] ?? match.botStateText;
}

function isShortIncap(match: ScoutingMatch) {
  return match.botStateText.trim().toLowerCase() === "incap" && (match.downtimeMs ?? 0) <= INCAP_DISPLAY_THRESHOLD_MS;
}

function trendLabel(trend: TeamSummary["trend"]) {
  return trend === "up" ? "上升" : trend === "down" ? "下降" : "稳定";
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
            match.botState === 4 ? "#dc2626" : match.botState === 2 ? "#f97316" : palette.accent,
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

function compareAccuracyConfig(teams: TeamSummary[], palette: ChartPaletteLike): ChartConfiguration {
  return {
    type: "bar",
    data: {
      labels: teams.map((team) => `Team ${team.team}`),
      datasets: [{ label: "Scout 命中率 %", data: teams.map((team) => team.avgAccuracy), backgroundColor: teams.map((_, index) => palette.colors[index]) }],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: tooltipOptions(palette) },
      scales: {
        x: { ticks: { color: palette.muted, callback: (value) => `${value}%` }, grid: { color: palette.grid }, min: 0, max: 101 },
        y: { ticks: { color: palette.muted }, grid: { color: palette.grid } },
      },
    },
  } as ChartConfiguration;
}

function radarMetrics(team: TeamSummary) {
  const consistency = Math.max(0, ((100 - team.stdDev) / 100) * 5);
  return [team.avgDriver, defenceScore(team), team.avgFuel, team.avgAccuracy / 20, (reliability(team) / 100) * 5, consistency];
}

export function averageRadarMetrics(metrics: number[][]) {
  if (!metrics.length) return [0, 0, 0, 0, 0, 0];
  return [0, 1, 2, 3, 4, 5].map((index) => round1(metrics.reduce((sum, values) => sum + (values[index] ?? 0), 0) / metrics.length));
}

function compareRadarConfig(teams: TeamSummary[], regionAverage: number[], palette: ChartPaletteLike): ChartConfiguration {
  return {
    type: "radar",
    data: {
      labels: ["Drive score", "Defence score", "BPS", "命中率", "可靠性", "稳定性"],
      datasets: [
        ...teams.map((team, index) => ({
          label: `Team ${team.team}`,
          data: radarMetrics(team),
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

function compareRangeConfig(teams: TeamSummary[], palette: ChartPaletteLike): ChartConfiguration {
  const avgPlugin = {
    id: "avgLines",
    afterDatasetsDraw(chart: { ctx: CanvasRenderingContext2D; scales: { x: { getPixelForValue: (value: number) => number; width: number }; y: { getPixelForValue: (value: number) => number } } }) {
      const { ctx, scales } = chart;
      teams.forEach((team, index) => {
        const x = scales.x.getPixelForValue(index);
        const y = scales.y.getPixelForValue(team.avgTotal);
        const halfWidth = scales.x.width / Math.max(teams.length, 1) * 0.15;
        ctx.save();
        ctx.strokeStyle = palette.colors[index];
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 2]);
        ctx.beginPath();
        ctx.moveTo(x - halfWidth, y);
        ctx.lineTo(x + halfWidth, y);
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
        { label: "最低", data: teams.map((team) => team.minPts), backgroundColor: "transparent", borderColor: "transparent", stack: "range" },
        { label: "范围", data: teams.map((team) => team.maxPts - team.minPts), backgroundColor: teams.map((_, index) => `${palette.colors[index]}44`), borderColor: teams.map((_, index) => palette.colors[index]), borderWidth: 1, stack: "range" },
      ],
    },
    plugins: [avgPlugin],
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: tooltipOptions(palette) },
      scales: {
        x: { stacked: true, ticks: { color: palette.muted }, grid: { color: palette.grid } },
        y: { stacked: true, ticks: { color: palette.muted }, grid: { color: palette.grid }, beginAtZero: true },
      },
    },
  } as unknown as ChartConfiguration;
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
