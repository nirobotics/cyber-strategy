import { useEffect, useMemo, useState, type DragEvent, type ReactNode } from "react";
import type { ChartConfiguration } from "chart.js";
import {
  BarChart3,
  Bot,
  ChevronLeft,
  ChevronRight,
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
import { NavLink, useNavigate, useSearchParams } from "react-router";
import { Badge, Button, Card, Input, cn } from "./ui";
import { ChartCanvas } from "./chart-canvas";
import { MatchAnalysis } from "./match-analysis";
import {
  reliability,
  sortedTeams,
  type DatasetSourceStatus,
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
  removePickListTeam,
  sanitizePickList,
  type PickListId,
} from "../lib/picklist";
import { buildTierAssignments, tierDisplayLabel, type TierInfo, type TierPercentages } from "../lib/tier-settings";

type Tab = "browser" | "compare" | "match" | "picklist";

const EVENT_STORAGE_KEY = "cyber-strategy:selected-event";
const PICK_DRAG_TEAM_TYPE = "application/x-cyber-strategy-team";
const PICK_DRAG_SOURCE_TYPE = "application/x-cyber-strategy-source";

export function AnalyticsDashboard({
  dataset,
  events,
  selectedEventKey,
  sourceStatus,
  isAdmin,
  tierPercentages,
}: {
  dataset: ScoutingDataset;
  events: ScoutingEventOption[];
  selectedEventKey: string | null;
  sourceStatus: DatasetSourceStatus;
  isAdmin: boolean;
  tierPercentages: TierPercentages;
}) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const teams = useMemo(() => sortedTeams(dataset.teamData), [dataset.teamData]);
  const tierByTeam = useMemo(() => buildTierAssignments(teams, tierPercentages), [teams, tierPercentages]);
  const rankByTeam = useMemo(() => new Map(teams.map((team, index) => [team.team, index + 1])), [teams]);
  const [tab, setTab] = useState<Tab>(() => readDashboardTab(searchParams.get("tab")));
  const [selectedTeam, setSelectedTeam] = useState(() => teams[0]?.team ?? "");
  const [search, setSearch] = useState("");
  const [hiddenTeams, setHiddenTeams] = useStoredList(`cyber-strategy:hidden:${dataset.id}`);
  const [lightbox, setLightbox] = useState<{ team: string; index: number } | null>(null);
  const [detailTeam, setDetailTeam] = useState<string | null>(null);

  const hiddenSet = useMemo(() => new Set(hiddenTeams), [hiddenTeams]);
  const visibleTeams = teams.filter((team) => team.team.includes(search.trim()));
  const selected = dataset.teamData[selectedTeam] ?? teams[0];
  const photos = selected ? dataset.teamPhotos[selected.team] ?? [] : [];
  const detail = detailTeam ? dataset.teamData[detailTeam] : null;

  useEffect(() => {
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
  }, [events, navigate]);

  function selectEvent(eventKey: string) {
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
    setTab(next);
    const params = new URLSearchParams(window.location.search);
    if (next === "browser") params.delete("tab");
    else params.set("tab", next);
    const search = params.toString();
    window.history.replaceState(null, "", search ? `/?${search}` : "/");
  }

  function toggleHidden(team: string) {
    setHiddenTeams((current) => toggleValue(current, team));
  }

  return (
    <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-3">
      <div className="flex flex-col gap-3 rounded-card border border-line bg-surface p-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0">
          <p className="section-label">当前数据集</p>
          <h1 className="truncate text-xl font-semibold text-ink">{dataset.title}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink-dim">
            <span>{dataset.eventKey} · {teams.length} 支队伍 · {teams.reduce((sum, team) => sum + team.matchCount, 0)} 条记录</span>
            <Badge
              className={cn(
                sourceStatus.source === "cyber-scout" && "border-ok/40 bg-ok/10 text-ok",
                sourceStatus.source === "fallback" && "border-warn/40 bg-warn/10 text-warn",
              )}
            >
              {sourceStatus.label}
            </Badge>
            <span className="text-xs text-ink-faint">
              {sourceStatus.updatedAt ? new Date(sourceStatus.updatedAt).toLocaleString() : sourceStatus.message}
            </span>
          </div>
          {sourceStatus.error ? <p className="mt-1 truncate text-xs text-danger">{sourceStatus.error}</p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="grid min-w-[170px] gap-1 text-sm">
            <span className="sr-only">赛事</span>
            <select
              value={selectedEventKey ?? dataset.eventKey}
              onChange={(event) => selectEvent(event.target.value)}
              className="input h-9 font-sans"
              disabled={!events.length}
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
          <SegmentedTab active={tab} value="browser" onClick={selectTab} icon={<Bot className="size-4" />}>
            队伍浏览
          </SegmentedTab>
          <SegmentedTab active={tab} value="compare" onClick={selectTab} icon={<BarChart3 className="size-4" />}>
            队伍对比
          </SegmentedTab>
          <SegmentedTab active={tab} value="match" onClick={selectTab} icon={<Table2 className="size-4" />}>
            赛程分析
          </SegmentedTab>
          <SegmentedTab active={tab} value="picklist" onClick={selectTab} icon={<ListChecks className="size-4" />}>
            Picklist
          </SegmentedTab>
          <NavLink
            to={`/strategy-proposal?event=${encodeURIComponent(selectedEventKey ?? dataset.eventKey)}`}
            className="btn"
          >
            <FileText className="size-4" />
            Strategy Proposal
          </NavLink>
          {isAdmin ? (
            <>
              <NavLink
                to={`/scouting-lead?event=${encodeURIComponent(selectedEventKey ?? dataset.eventKey)}`}
                className="btn"
              >
                <ShieldCheck className="size-4" />
                Scouting Lead
              </NavLink>
              <NavLink to="/admin" className="btn">
                <Settings className="size-4" />
                管理
              </NavLink>
            </>
          ) : null}
        </div>
      </div>

      {!teams.length ? (
        <Card className="p-6 text-sm text-ink-dim">
          当前赛事还没有可分析的队伍记录。请确认 cyber-scout 已上传普通/超级侦察记录，或在管理页保留备用 CSV 数据集。
        </Card>
      ) : null}

      {teams.length && tab === "browser" && selected ? (
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
            onOpenPhoto={(index) => setLightbox({ team: selected.team, index })}
          />
        </div>
      ) : null}

      {teams.length && tab === "compare" ? <CompareTeams teams={teams} /> : null}
      {tab === "match" ? <MatchAnalysis eventKey={dataset.eventKey} teamData={dataset.teamData} /> : null}
      {teams.length && tab === "picklist" ? (
        <PicklistBoard
          datasetId={dataset.id}
          teams={teams}
          tierByTeam={tierByTeam}
          rankByTeam={rankByTeam}
          onOpenTeam={setDetailTeam}
        />
      ) : null}

      {detail ? (
        <TeamDetailModal
          team={detail}
          tier={tierByTeam.get(detail.team)}
          photos={dataset.teamPhotos[detail.team] ?? []}
          pitInfo={dataset.teamPitData?.[detail.team]}
          onOpenPhoto={(index) => setLightbox({ team: detail.team, index })}
          onClose={() => setDetailTeam(null)}
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
    </div>
  );
}

function readDashboardTab(value: string | null): Tab {
  return value === "compare" || value === "match" || value === "picklist" ? value : "browser";
}

function TeamDetail({
  team,
  tier,
  photos,
  pitInfo,
  onOpenPhoto,
}: {
  team: TeamSummary;
  tier?: TierInfo;
  photos: string[];
  pitInfo?: TeamPitInfo;
  onOpenPhoto: (index: number) => void;
}) {
  const [routeOpen, setRouteOpen] = useState(false);
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
            自动路线
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
        <Stat label="平均 BPS" value={(team.avgBps ?? 0) > 0 ? team.avgBps : "-"} sub="Scout" />
        <Stat label="命中率" value={team.avgAccuracy > 0 ? `${team.avgAccuracy}%` : "-"} sub="Scout" />
        <Stat label="可靠性" value={`${reliability(team)}%`} sub={`${team.malfunctions} 次故障`} />
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

      <div className="grid gap-3 xl:grid-cols-2">
        <Card className="p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink-dim">
            <LineChart className="size-4" />
            逐场综合分
          </h3>
          <ChartCanvas
            label={`Team ${team.team} 逐场综合分`}
            configKey={`team-line:${team.team}:${team.matches.map((match) => match.totalPts).join(",")}`}
            buildConfig={(palette) => teamLineConfig(team, palette)}
          />
        </Card>
        <Card className="p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink-dim">
            <BarChart3 className="size-4" />
            自动 / 手动贡献
          </h3>
          <ChartCanvas
            label={`Team ${team.team} 自动和手动贡献拆分`}
            configKey={`team-bars:${team.team}:${team.matches.map((match) => `${match.autoPts}/${match.telePts}`).join(",")}`}
            buildConfig={(palette) => teamBarConfig(team, palette)}
          />
        </Card>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="border-b border-line p-3">
          <h3 className="section-label">逐场数据</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead className="bg-surface-2 text-xs uppercase text-ink-faint">
              <tr>
                <th className="px-3 py-2 text-left">场次</th>
                <th className="px-3 py-2 text-left">综合分</th>
                <th className="px-3 py-2 text-left">自动贡献</th>
                <th className="px-3 py-2 text-left">手动贡献</th>
                <th className="px-3 py-2 text-left">命中率</th>
                <th className="px-3 py-2 text-left">状态</th>
                <th className="px-3 py-2 text-left">备注</th>
              </tr>
            </thead>
            <tbody>
              {team.matches.map((match) => (
                <tr key={match.match} className="border-t border-line align-top">
                  <td className="px-3 py-2 font-semibold">M{match.match}</td>
                  <td className="px-3 py-2">
                    <PointsBar value={match.totalPts} max={team.maxPts} />
                  </td>
                  <td className="px-3 py-2">{match.autoPts}</td>
                  <td className="px-3 py-2">{match.telePts}</td>
                  <td className="px-3 py-2">{match.accuracy == null ? "-" : `${match.accuracy}%`}</td>
                  <td className="px-3 py-2">
                    <StatePill match={match} />
                  </td>
                  <td className="max-w-md px-3 py-2 text-ink-dim">
                    <p>{match.comment || "-"}</p>
                    {match.scoutName ? <p className="mt-1 text-xs text-ink-faint">记录员：{match.scoutName}</p> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      {routeOpen && pitInfo ? <AutoRouteModal team={team.team} pitInfo={pitInfo} onClose={() => setRouteOpen(false)} /> : null}
    </div>
  );
}

function CompareTeams({ teams }: { teams: TeamSummary[] }) {
  const defaults = [teams[0]?.team, teams[1]?.team, teams[2]?.team].filter(Boolean) as string[];
  const [selected, setSelected] = useState<string[]>(defaults);
  const selectedTeams = selected.length ? selected : defaults;
  const compared = selectedTeams.map((team) => teams.find((item) => item.team === team)).filter(Boolean) as TeamSummary[];

  function setTeam(index: number, team: string) {
    setSelected((current) => current.map((value, currentIndex) => (currentIndex === index ? team : value)));
  }

  return (
    <div className="space-y-3">
      <Card className="p-3">
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto] md:items-end">
          {[0, 1, 2].map((index) => (
            <label key={index} className="grid gap-1 text-sm">
              <span className="font-medium text-ink-dim">Team {index + 1}</span>
              <select
              value={selectedTeams[index] ?? ""}
                onChange={(event) => setTeam(index, event.target.value)}
                className="input h-10 font-sans"
              >
                {teams.map((team) => (
                  <option key={team.team} value={team.team}>
                    Team {team.team}（{team.avgTotal} 综合均分）
                  </option>
                ))}
              </select>
            </label>
          ))}
          <div className="rounded-md border border-line bg-surface-2 px-3 py-2 text-sm text-ink-dim">
            已选择 {compared.length} 支
          </div>
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
            configKey={`cmp-radar:${selectedTeams.join(",")}`}
            buildConfig={(palette) => compareRadarConfig(compared, palette)}
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
  teams,
  tierByTeam,
  rankByTeam,
  onOpenTeam,
}: {
  datasetId: string;
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
  const validTeamIds = useMemo(() => teams.map((team) => team.team), [teams]);
  const crossedSet = useMemo(() => new Set(sanitizePickList(crossedTeams, validTeamIds)), [crossedTeams, validTeamIds]);
  const poolTeams = useMemo(() => orderPickPool(teams, crossedTeams), [teams, crossedTeams]);
  const pickTeams = useMemo(
    () => sanitizePickList(activePick === "first" ? firstPick : secondPick, validTeamIds),
    [activePick, firstPick, secondPick, validTeamIds],
  );
  const pickTitle = activePick === "first" ? "1st Pick" : "2nd Pick";

  function updateCurrentPick(updater: (current: string[]) => string[]) {
    const apply = (current: string[]) => sanitizePickList(updater(current), validTeamIds);
    if (activePick === "first") setFirstPick(apply);
    else setSecondPick(apply);
  }

  function toggleCrossed(team: string) {
    setCrossedTeams((current) => toggleValue(current, team));
  }

  function startDrag(event: DragEvent<HTMLElement>, team: string, source: "pool" | "pick") {
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
    <div className="grid min-h-0 gap-3 xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)]">
      <Card className="overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line p-3">
          <div>
            <p className="section-label">队伍池</p>
            <h2 className="text-base font-semibold text-ink">综合分排名</h2>
          </div>
          <span className="text-sm text-ink-dim">{teams.length} 支队伍</span>
        </div>
        <div className="max-h-[68dvh] overflow-y-auto p-2">
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
                    "w-fit shrink-0 rounded-md px-1.5 py-1 text-left font-semibold tabular-nums text-ink hover:bg-surface hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50",
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
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="section-label">Picklist</p>
              <h2 className="text-base font-semibold text-ink">{pickTitle}</h2>
            </div>
            <span className="text-sm text-ink-dim">{pickTeams.length} 支</span>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant={activePick === "first" ? "active" : "default"} onClick={() => setActivePick("first")}>
              1st Pick
            </Button>
            <Button type="button" variant={activePick === "second" ? "active" : "default"} onClick={() => setActivePick("second")}>
              2nd Pick
            </Button>
          </div>
        </div>
        <div
          className={cn(
            "min-h-80 max-h-[68dvh] overflow-y-auto p-2 transition-colors",
            dropTarget === "end" && "bg-brand/10",
          )}
          onDragOver={(event) => event.preventDefault()}
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
              <div
                key={team.team}
                draggable
                onDragStart={(event) => startDrag(event, team.team, "pick")}
                onDragOver={(event) => event.preventDefault()}
                onDragEnter={() => setDropTarget(team.team)}
                onDragLeave={() => setDropTarget(null)}
                onDrop={(event) => dropTeam(event, team.team)}
                className={cn(
                  "mb-2 flex flex-wrap items-center gap-2 rounded-md border border-line bg-surface-2 px-2.5 py-2 text-sm transition hover:border-brand/50",
                  dropTarget === team.team && "border-brand bg-brand/10",
                )}
              >
                <GripVertical className="size-4 text-ink-faint" />
                <span className="w-8 text-right text-xs font-semibold tabular-nums text-ink-faint">{index + 1}</span>
                <button
                  type="button"
                  onClick={() => onOpenTeam(team.team)}
                  className="w-fit flex-1 rounded-md px-1.5 py-1 text-left font-semibold tabular-nums text-ink hover:bg-surface hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
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
            );
          })}
        </div>
      </Card>
    </div>
  );
}

export function TeamDetailModal({
  team,
  tier,
  photos,
  pitInfo,
  onOpenPhoto,
  onClose,
}: {
  team: TeamSummary;
  tier?: TierInfo;
  photos: string[];
  pitInfo?: TeamPitInfo;
  onOpenPhoto: (index: number) => void;
  onClose: () => void;
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
          <TeamDetail team={team} tier={tier} photos={photos} pitInfo={pitInfo} onOpenPhoto={onOpenPhoto} />
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

function AutoRoutePreview({ points }: { points: TeamPitInfo["autoRoutes"][number]["points"] }) {
  const polyline = points.map((point) => `${point.x},${point.y}`).join(" ");
  return (
    <div className="relative aspect-[2/1] overflow-hidden rounded-md border border-line bg-surface-2" aria-label="自动路线预览">
      <img src="/pit-field-map.webp" alt="" className="absolute inset-0 h-full w-full object-fill" />
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden>
        <polyline points={polyline} fill="none" stroke="rgb(var(--brand))" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
      {points.map((point, index) => (
        <span
          key={`${point.x}-${point.y}-${index}`}
          className="absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-brand shadow-sm"
          style={{ left: `${point.x}%`, top: `${point.y}%` }}
        />
      ))}
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
}: {
  active: Tab;
  value: Tab;
  icon: ReactNode;
  children: ReactNode;
  onClick: (value: Tab) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onClick(value)}
      className={cn("btn", active === value && "btn-active bg-brand/10")}
    >
      {icon}
      {children}
    </button>
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
  return (
    <div className="flex min-w-32 items-center gap-2">
      <span className="h-1.5 rounded-full bg-brand" style={{ width: `${Math.max(4, (value / Math.max(max, 1)) * 72)}px` }} />
      <span>{value}</span>
    </div>
  );
}

function StatePill({ match }: { match: ScoutingMatch }) {
  const className =
    match.botState === 2
      ? "border-warn/40 bg-warn/10 text-warn"
      : match.botState === 3
        ? "border-orange-500/40 bg-orange-500/10 text-orange-600 dark:text-orange-300"
        : match.botState === 4
          ? "border-danger/40 bg-danger/10 text-danger"
          : "border-ok/40 bg-ok/10 text-ok";
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold", className)}>
      {botStateLabel(match)}
      {match.disabled ? <span className="text-danger">已禁用</span> : null}
    </span>
  );
}

function botStateLabel(match: ScoutingMatch) {
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
  return { 1: "正常", 2: "通信问题", 3: "轻微故障", 4: "严重故障" }[match.botState] ?? match.botStateText;
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

function teamLineConfig(team: TeamSummary, palette: { accent: string; muted: string; grid: string; panel: string }): ChartConfiguration {
  return {
    type: "line",
    data: {
      labels: team.matches.map((match) => `M${match.match}`),
      datasets: [
        {
          label: "综合分",
          data: team.matches.map((match) => match.totalPts),
          borderColor: palette.accent,
          backgroundColor: `${palette.accent}18`,
          pointBackgroundColor: team.matches.map((match) =>
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

function teamBarConfig(team: TeamSummary, palette: { accent: string; muted: string; grid: string; panel: string }): ChartConfiguration {
  return {
    type: "bar",
    data: {
      labels: team.matches.map((match) => `M${match.match}`),
      datasets: [
        { label: "自动贡献", data: team.matches.map((match) => match.autoPts), backgroundColor: palette.accent, stack: "points" },
        { label: "手动贡献", data: team.matches.map((match) => match.telePts), backgroundColor: "#16a34a", stack: "points" },
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
          title: { display: true, text: "队伍第 n 场", color: palette.muted },
          ticks: { color: palette.muted, precision: 0, callback: (value) => `M${value}` },
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

function compareRadarConfig(teams: TeamSummary[], palette: ChartPaletteLike): ChartConfiguration {
  return {
    type: "radar",
    data: {
      labels: ["Drive score", "Defence score", "BPS", "命中率", "可靠性", "稳定性"],
      datasets: teams.map((team, index) => {
        const consistency = Math.max(0, ((100 - team.stdDev) / 100) * 5);
        return {
          label: `Team ${team.team}`,
          data: [team.avgDriver, defenceScore(team), team.avgFuel, team.avgAccuracy / 20, (reliability(team) / 100) * 5, consistency],
          borderColor: palette.colors[index],
          backgroundColor: `${palette.colors[index]}22`,
          pointBackgroundColor: palette.colors[index],
        };
      }),
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
