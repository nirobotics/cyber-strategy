import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { ChartConfiguration } from "chart.js";
import {
  BarChart3,
  Bot,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  GripVertical,
  LineChart,
  ListChecks,
  Search,
  Settings,
  Table2,
  X,
} from "lucide-react";
import { NavLink, useNavigate } from "react-router";
import { Badge, Button, Card, Input, cn } from "./ui";
import { ChartCanvas } from "./chart-canvas";
import { MatchAnalysis } from "./match-analysis";
import {
  getTier,
  reliability,
  sortedTeams,
  type DatasetSourceStatus,
  type ScoutingDataset,
  type ScoutingEventOption,
  type ScoutingMatch,
  type TeamSummary,
} from "../lib/scouting";

type Tab = "browser" | "compare" | "match";

const EVENT_STORAGE_KEY = "cyber-strategy:selected-event";

export function AnalyticsDashboard({
  dataset,
  events,
  selectedEventKey,
  sourceStatus,
  isAdmin,
}: {
  dataset: ScoutingDataset;
  events: ScoutingEventOption[];
  selectedEventKey: string | null;
  sourceStatus: DatasetSourceStatus;
  isAdmin: boolean;
}) {
  const navigate = useNavigate();
  const teams = useMemo(() => sortedTeams(dataset.teamData), [dataset.teamData]);
  const [tab, setTab] = useState<Tab>("browser");
  const [selectedTeam, setSelectedTeam] = useState(() => teams[0]?.team ?? "");
  const [search, setSearch] = useState("");
  const [hiddenTeams, setHiddenTeams] = useStoredList(`cyber-strategy:hidden:${dataset.id}`);
  const [dnpTeams, setDnpTeams] = useStoredList(`cyber-strategy:dnp:${dataset.id}`);
  const [pickList, setPickList] = useStoredList(`cyber-strategy:pick:${dataset.id}`);
  const [pickModalOpen, setPickModalOpen] = useState(false);
  const [draggedTeam, setDraggedTeam] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<{ team: string; index: number } | null>(null);

  const hiddenSet = useMemo(() => new Set(hiddenTeams), [hiddenTeams]);
  const dnpSet = useMemo(() => new Set(dnpTeams), [dnpTeams]);
  const orderedTeams = useMemo(
    () => orderTeams(teams, pickList, dnpSet, hiddenSet),
    [teams, pickList, dnpSet, hiddenSet],
  );
  const visibleTeams = orderedTeams.filter((team) => team.team.includes(search.trim()));
  const selected = dataset.teamData[selectedTeam] ?? teams[0];
  const photos = selected ? dataset.teamPhotos[selected.team] ?? [] : [];

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

  function toggleHidden(team: string) {
    setHiddenTeams((current) => toggleValue(current, team));
  }

  function reorder(from: string, to: string) {
    if (from === to || dnpSet.has(from) || hiddenSet.has(from) || dnpSet.has(to) || hiddenSet.has(to)) return;
    const active = orderedTeams.filter((team) => !dnpSet.has(team.team) && !hiddenSet.has(team.team)).map((team) => team.team);
    const fromIndex = active.indexOf(from);
    const toIndex = active.indexOf(to);
    if (fromIndex === -1 || toIndex === -1) return;
    active.splice(toIndex, 0, active.splice(fromIndex, 1)[0]);
    setPickList(active);
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
          <SegmentedTab active={tab} value="browser" onClick={setTab} icon={<Bot className="size-4" />}>
            队伍浏览
          </SegmentedTab>
          <SegmentedTab active={tab} value="compare" onClick={setTab} icon={<BarChart3 className="size-4" />}>
            队伍对比
          </SegmentedTab>
          <SegmentedTab active={tab} value="match" onClick={setTab} icon={<Table2 className="size-4" />}>
            赛程分析
          </SegmentedTab>
          {isAdmin ? (
            <NavLink to="/admin" className="btn">
              <Settings className="size-4" />
              管理
            </NavLink>
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
              <Button
                type="button"
                variant={pickList.length || dnpTeams.length ? "active" : "default"}
                onClick={() => setPickModalOpen(true)}
                title="选队名单"
                className="h-9 px-2"
              >
                <ListChecks className="size-4" />
              </Button>
            </div>
            <div className="max-h-[460px] overflow-y-auto lg:max-h-[calc(100dvh-18rem)]">
              {visibleTeams.map((team, index) => (
                <button
                  key={team.team}
                  type="button"
                  draggable={!dnpSet.has(team.team) && !hiddenSet.has(team.team)}
                  onDragStart={() => setDraggedTeam(team.team)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => {
                    if (draggedTeam) reorder(draggedTeam, team.team);
                    setDraggedTeam(null);
                  }}
                  onClick={() => setSelectedTeam(team.team)}
                  className={cn(
                    "grid w-full grid-cols-[1.75rem_minmax(3.5rem,1fr)_auto_auto_auto] items-center gap-1.5 border-l-2 border-transparent px-2.5 py-2 text-left text-sm transition hover:bg-surface-2 sm:grid-cols-[auto_2rem_minmax(3.5rem,1fr)_auto_auto_auto]",
                    selected.team === team.team && "border-brand bg-brand/10 text-brand",
                    hiddenSet.has(team.team) && "opacity-40",
                    dnpSet.has(team.team) && "opacity-45",
                  )}
                >
                  <GripVertical
                    className={cn(
                      "hidden size-4 text-ink-faint sm:block",
                      (hiddenSet.has(team.team) || dnpSet.has(team.team)) && "opacity-0",
                    )}
                  />
                  <span className="text-right text-xs tabular-nums text-ink-faint">
                    {hiddenSet.has(team.team) || dnpSet.has(team.team) ? "" : index + 1}
                  </span>
                  <span className="min-w-0 whitespace-nowrap font-semibold tabular-nums">
                    {team.team}
                  </span>
                  <span className="whitespace-nowrap rounded-full bg-surface-2 px-2 py-0.5 text-xs tabular-nums text-ink-dim">
                    {team.avgTotal} 综合均分
                  </span>
                  <TierBadge team={team} />
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

          <TeamDetail team={selected} photos={photos} onOpenPhoto={(index) => setLightbox({ team: selected.team, index })} />
        </div>
      ) : null}

      {teams.length && tab === "compare" ? <CompareTeams teams={teams} /> : null}
      {tab === "match" ? <MatchAnalysis eventKey={dataset.eventKey} teamData={dataset.teamData} /> : null}

      {pickModalOpen ? (
        <PickListModal
          teams={teams}
          pickList={pickList}
          dnpTeams={dnpTeams}
          onClose={() => setPickModalOpen(false)}
          onSave={(nextPickList, nextDnpTeams) => {
            setPickList(nextPickList);
            setDnpTeams(nextDnpTeams);
            setPickModalOpen(false);
          }}
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

function TeamDetail({
  team,
  photos,
  onOpenPhoto,
}: {
  team: TeamSummary;
  photos: string[];
  onOpenPhoto: (index: number) => void;
}) {
  const trendText = team.trend === "up" ? "上升" : team.trend === "down" ? "下降" : "稳定";
  return (
    <div className="min-w-0 space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-2xl font-semibold text-ink">队伍 {team.team}</h2>
        <TierBadge team={team} large />
        <Badge
          className={cn(
            team.trend === "up" && "border-ok/40 bg-ok/10 text-ok",
            team.trend === "down" && "border-danger/40 bg-danger/10 text-danger",
            team.trend === "stable" && "border-line bg-surface-2 text-ink-dim",
          )}
        >
          {trendText}
        </Badge>
        <span className="text-sm text-ink-dim">
          前半程 {team.firstHalfAvg} → 后半程 {team.secondHalfAvg}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
        <Stat label="平均综合分" value={team.avgTotal} sub="每场" />
        <Stat label="自动贡献" value={team.avgAuto} sub="分" />
        <Stat label="手动贡献" value={team.avgTele} sub="分" />
        <Stat label="命中率" value={team.avgAccuracy > 0 ? `${team.avgAccuracy}%` : "-"} sub="Scout" />
        <Stat label="可靠性" value={`${reliability(team)}%`} sub={`${team.malfunctions} 次故障`} />
        <Stat label="标准差" value={`±${team.stdDev}`} sub="稳定性" />
        <Stat label="综合分范围" value={`${team.minPts}–${team.maxPts}`} sub="最低 / 最高" />
        <Stat label="驾驶" value={team.avgDriver} sub={<RatingDots value={team.avgDriver} />} />
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
                <img src={src} alt={`队伍 ${team.team}`} loading="lazy" className="h-full w-full object-cover" />
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
            label={`队伍 ${team.team} 逐场综合分`}
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
            label={`队伍 ${team.team} 自动和手动贡献拆分`}
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
              <span className="font-medium text-ink-dim">队伍 {index + 1}</span>
              <select
              value={selectedTeams[index] ?? ""}
                onChange={(event) => setTeam(index, event.target.value)}
                className="input h-10 font-sans"
              >
                {teams.map((team) => (
                  <option key={team.team} value={team.team}>
                    队伍 {team.team}（{team.avgTotal} 综合均分）
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

function PickListModal({
  teams,
  pickList,
  dnpTeams,
  onClose,
  onSave,
}: {
  teams: TeamSummary[];
  pickList: string[];
  dnpTeams: string[];
  onClose: () => void;
  onSave: (pickList: string[], dnpTeams: string[]) => void;
}) {
  const validTeams = useMemo(() => new Set(teams.map((team) => team.team)), [teams]);
  const [pickText, setPickText] = useState((pickList.length ? pickList : teams.map((team) => team.team)).join("\n"));
  const [dnpText, setDnpText] = useState(dnpTeams.join("\n"));

  function parseList(value: string) {
    return value
      .split(/[\n,\s]+/)
      .map((item) => item.trim())
      .filter((item, index, items) => item && validTeams.has(item) && items.indexOf(item) === index);
  }

  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/60 p-4" onMouseDown={onClose}>
      <Card className="w-full max-w-lg p-4 shadow-xl" onMouseDown={(event) => event.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">选队名单</h2>
          <Button type="button" onClick={onClose} className="h-9 px-2" title="关闭">
            <X className="size-4" />
          </Button>
        </div>
        <div className="grid gap-3">
          <label className="grid gap-1">
            <span className="text-sm font-medium text-ink-dim">排序</span>
            <textarea
              value={pickText}
              onChange={(event) => setPickText(event.target.value)}
              className="input h-44 resize-none font-mono"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-sm font-medium text-ink-dim">不选队伍</span>
            <textarea
              value={dnpText}
              onChange={(event) => setDnpText(event.target.value)}
              className="input h-24 resize-none font-mono"
            />
          </label>
          <div className="flex gap-2">
            <Button type="button" variant="primary" onClick={() => onSave(parseList(pickText), parseList(dnpText))}>
              保存
            </Button>
            <Button
              type="button"
              onClick={() => {
                setPickText("");
                setDnpText("");
              }}
            >
              清空
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

function PhotoLightbox({
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
        <img src={photos[safeIndex]} alt="队伍机器人" className="max-h-[82dvh] max-w-[78vw] rounded-md object-contain" />
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

function TierBadge({ team, large = false }: { team: TeamSummary; large?: boolean }) {
  const tier = getTier(team.avgTotal);
  return <Badge className={cn("shrink-0 whitespace-nowrap", tier.className, large && "px-3 py-1 text-sm")}>{tierLabel(tier.label)}</Badge>;
}

function Stat({ label, value, sub }: { label: string; value: ReactNode; sub: ReactNode }) {
  return (
    <Card className="p-3">
      <p className="text-[11px] font-semibold uppercase text-ink-faint">{label}</p>
      <p className="mt-1 truncate text-xl font-semibold text-ink">{value}</p>
      <div className="mt-1 text-xs text-ink-dim">{sub}</div>
    </Card>
  );
}

function RatingDots({ value }: { value: number }) {
  const rounded = Math.round(value);
  return (
    <span className="flex gap-1">
      {[1, 2, 3, 4, 5].map((dot) => (
        <span key={dot} className={cn("size-1.5 rounded-full bg-line", dot <= rounded && "bg-brand")} />
      ))}
    </span>
  );
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

function tierLabel(label: string) {
  return {
    Elite: "顶级",
    Strong: "强队",
    Mid: "中游",
    Low: "低分",
    Struggling: "待观察",
  }[label] ?? label;
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

function orderTeams(teams: TeamSummary[], pickList: string[], dnpSet: Set<string>, hiddenSet: Set<string>) {
  const byTeam = new Map(teams.map((team) => [team.team, team]));
  const base = pickList.length
    ? [...pickList.filter((team) => byTeam.has(team)), ...teams.map((team) => team.team).filter((team) => !pickList.includes(team))]
    : teams.map((team) => team.team);
  const ordered = base.map((team) => byTeam.get(team)).filter(Boolean) as TeamSummary[];
  const active = ordered.filter((team) => !dnpSet.has(team.team) && !hiddenSet.has(team.team));
  const dnp = ordered.filter((team) => dnpSet.has(team.team) && !hiddenSet.has(team.team));
  const hidden = ordered.filter((team) => hiddenSet.has(team.team));
  return [...active, ...dnp, ...hidden];
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
        label: `队伍 ${team.team}`,
        data: team.matches.map((match) => ({ x: match.match, y: match.totalPts })),
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
        x: { type: "linear", title: { display: true, text: "场次", color: palette.muted }, ticks: { color: palette.muted }, grid: { color: palette.grid } },
        y: { title: { display: true, text: "综合分", color: palette.muted }, ticks: { color: palette.muted }, grid: { color: palette.grid }, beginAtZero: true },
      },
    },
  } as ChartConfiguration;
}

function compareBarConfig(teams: TeamSummary[], palette: ChartPaletteLike): ChartConfiguration {
  return {
    type: "bar",
    data: {
      labels: teams.map((team) => `队伍 ${team.team}`),
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
      labels: teams.map((team) => `队伍 ${team.team}`),
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
      labels: ["驾驶", "BPS", "命中率", "可靠性", "稳定性"],
      datasets: teams.map((team, index) => {
        const consistency = Math.max(0, ((100 - team.stdDev) / 100) * 5);
        return {
          label: `队伍 ${team.team}`,
          data: [team.avgDriver, team.avgFuel, team.avgAccuracy / 20, (reliability(team) / 100) * 5, consistency],
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
      labels: teams.map((team) => `队伍 ${team.team}`),
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
