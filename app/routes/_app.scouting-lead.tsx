import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Gauge,
  Save,
  ShieldCheck,
  Target,
  Trash2,
  Trophy,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useFetcher, useNavigate, useNavigation, useSearchParams } from "react-router";
import type { Route } from "./+types/_app.scouting-lead";
import { StrategyNavigation } from "../components/strategy-navigation";
import { Badge, Button, Card, Input, cn } from "../components/ui";
import { requireAdmin } from "../lib/auth.server";
import {
  deleteCyberScoutAssignment,
  deleteCyberScoutRecord,
  loadScoutConfidenceForRequest,
  saveCyberScoutAssignment,
  type ScoutLeadAssignment,
  type ScoutScheduleCell,
} from "../lib/cyber-scout.server";
import type {
  ScoutConfidenceCalibration,
  ScoutConfidenceMatch,
  ScoutConfidencePerson,
  ScoutConfidenceReport,
  ScoutConfidenceReviewItem,
} from "../lib/scout-confidence";

type ActionData = { error?: string; ok?: boolean; view?: LeadView };
type LeadView = "confidence" | "records" | "assignments";

const leadViews: Array<{ id: LeadView; label: string; icon: ReactNode }> = [
  { id: "confidence", label: "信心分", icon: <Trophy className="size-4" /> },
  { id: "records", label: "提交记录", icon: <ClipboardList className="size-4" /> },
  { id: "assignments", label: "人员分配", icon: <UserPlus className="size-4" /> },
];

const scoutPositions = ["R1", "R2", "R3", "B1", "B2", "B3"] as const;

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  return loadScoutConfidenceForRequest(request);
}

export async function action({ request }: Route.ActionArgs): Promise<ActionData> {
  await requireAdmin(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");
  const event = String(formData.get("event") || "");

  try {
    if (intent === "delete-record") {
      await deleteCyberScoutRecord(String(formData.get("recordId") || ""));
      return { ok: true, view: "records" };
    }

    if (intent === "save-assignment") {
      await saveCyberScoutAssignment({
        id: String(formData.get("assignmentId") || "") || null,
        eventKey: event,
        startMatch: Number(formData.get("startMatch") || 0),
        endMatch: Number(formData.get("endMatch") || 0),
        position: String(formData.get("position") || ""),
        userName: String(formData.get("userName") || ""),
      });
      return { ok: true, view: "assignments" };
    }

    if (intent === "delete-assignment") {
      await deleteCyberScoutAssignment(String(formData.get("assignmentId") || ""));
      return { ok: true, view: "assignments" };
    }
  } catch (error) {
    if (error instanceof Response) throw error;
    return { error: error instanceof Error ? error.message : "操作失败。" };
  }

  return { error: `未知操作：${intent || "空"}` };
}

export default function ScoutingLeadRoute({ loaderData }: Route.ComponentProps) {
  const navigate = useNavigate();
  const navigation = useNavigation();
  const [searchParams] = useSearchParams();
  const [view, setView] = useState<LeadView>(() => readView(searchParams.get("view")));
  const { report, events, selectedEventKey, sourceStatus, leadData } = loaderData;
  const busy = navigation.state !== "idle";

  function selectEvent(eventKey: string) {
    const params = new URLSearchParams(searchParams);
    if (eventKey) params.set("event", eventKey);
    else params.delete("event");
    navigate(`/scouting-lead?${params.toString()}`);
  }

  function selectView(next: LeadView) {
    setView(next);
    replaceLeadViewUrl(searchParams, next);
  }

  return (
    <div className="mx-auto grid w-full max-w-[1500px] gap-3">
      <div className="flex flex-col gap-3 rounded-card border border-line bg-surface p-3 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <p className="section-label">Scouting Lead</p>
          <h1 className="text-2xl font-semibold text-ink">{viewTitle(view)}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-ink-faint">
            <Badge className="border-brand/40 bg-brand/10 text-brand">{sourceStatus.label}</Badge>
            <span>{sourceStatus.message}</span>
            {sourceStatus.updatedAt ? <span>{new Date(sourceStatus.updatedAt).toLocaleString()}</span> : null}
          </div>
          {sourceStatus.error ? <p className="mt-1 text-xs text-warn">{sourceStatus.error}</p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedEventKey ?? ""}
            onChange={(event) => selectEvent(event.target.value)}
            className="input h-9 min-w-[180px] font-sans"
            disabled={!events.length}
            title="选择 cyber-scout 赛事"
          >
            {!events.some((event) => event.eventKey === selectedEventKey) ? (
              <option value={selectedEventKey ?? ""}>{selectedEventKey ?? "无赛事"}</option>
            ) : null}
            {events.map((event) => (
              <option key={event.eventKey} value={event.eventKey}>
                {event.name || event.eventKey}{event.isActive ? " · 当前" : ""}
              </option>
            ))}
          </select>
          <StrategyNavigation active="lead" eventKey={selectedEventKey} isAdmin />
        </div>
      </div>

      <div className="flex flex-wrap gap-2 rounded-card border border-line bg-surface p-2">
        {leadViews.map((item) => (
          <Button key={item.id} type="button" variant={view === item.id ? "active" : "default"} onClick={() => selectView(item.id)}>
            {item.icon}
            {item.label}
          </Button>
        ))}
      </div>

      {view === "confidence" ? <ConfidenceView report={report} /> : null}
      {view === "records" ? <RecordsView eventKey={selectedEventKey} schedule={leadData.recordSchedule} busy={busy} /> : null}
      {view === "assignments" ? (
        <AssignmentsView
          eventKey={selectedEventKey}
          assignments={leadData.assignments}
          users={leadData.users}
          configEventKey={leadData.configEventKey}
          configSavedAt={leadData.configSavedAt}
          busy={busy}
        />
      ) : null}
    </div>
  );
}

function ConfidenceView({ report }: { report: ScoutConfidenceReport }) {
  return (
    <>
      <SummaryGrid report={report} />

      <Card className="overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line p-3">
          <div>
            <p className="section-label">个人排序</p>
            <h2 className="text-lg font-semibold text-ink">净信心分</h2>
          </div>
          <Badge className="border-line bg-surface-2 text-ink-dim">{report.people.length} 人</Badge>
        </div>
        <PeopleTable people={report.people} />
      </Card>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="overflow-hidden p-0">
          <div className="border-b border-line p-3">
            <p className="section-label">比赛统计</p>
            <h2 className="text-lg font-semibold text-ink">预测分布</h2>
          </div>
          <MatchTable matches={report.matches} />
        </Card>

        <div className="grid gap-3">
          <Card className="overflow-hidden p-0">
            <div className="border-b border-line p-3">
              <p className="section-label">校准</p>
              <h2 className="text-lg font-semibold text-ink">按信心值</h2>
            </div>
            <CalibrationList rows={report.calibration} />
          </Card>

          <Card className="overflow-hidden p-0">
            <div className="border-b border-line p-3">
              <p className="section-label">复盘队列</p>
              <h2 className="text-lg font-semibold text-ink">大分歧比赛</h2>
            </div>
            <ReviewQueue items={report.reviewQueue} />
          </Card>
        </div>
      </div>
    </>
  );
}

function RecordsView({
  eventKey,
  schedule,
  busy,
}: {
  eventKey: string | null;
  schedule: Route.ComponentProps["loaderData"]["leadData"]["recordSchedule"];
  busy: boolean;
}) {
  const [selected, setSelected] = useState<{ matchNumber: number; cell: ScoutScheduleCell } | null>(null);

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard icon={<ClipboardList className="size-4" />} label="全部提交" value={schedule.totalRecords} />
        <StatCard icon={<Users className="size-4" />} label="普通 Scout" value={schedule.normalRecords} />
        <StatCard icon={<ShieldCheck className="size-4" />} label="超级 Scout" value={schedule.superRecords} />
      </div>

      <Card className="overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line p-3">
          <div>
            <p className="section-label">提交记录</p>
            <h2 className="text-lg font-semibold text-ink">按赛程查询</h2>
          </div>
          <Badge className="border-line bg-surface-2 text-ink-dim">{schedule.matches.length} 场</Badge>
        </div>
        {!schedule.matches.length ? (
          <EmptyState text="暂无可展示的赛程或提交记录。" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-left text-sm">
              <thead className="bg-surface-2 text-xs uppercase text-ink-faint">
                <tr>
                  <th className="w-20 px-3 py-2">比赛</th>
                  <th className="px-3 py-2 text-danger">Red</th>
                  <th className="px-3 py-2 text-info">Blue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {schedule.matches.map((match) => (
                  <tr key={match.matchNumber} className="align-top">
                    <td className="px-3 py-3 font-semibold text-ink">Q{match.matchNumber}</td>
                    <td className="px-3 py-2">
                      <AllianceCells matchNumber={match.matchNumber} cells={match.red} onSelect={(cell) => setSelected({ matchNumber: match.matchNumber, cell })} />
                    </td>
                    <td className="px-3 py-2">
                      <AllianceCells matchNumber={match.matchNumber} cells={match.blue} onSelect={(cell) => setSelected({ matchNumber: match.matchNumber, cell })} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {selected ? <RecordModal eventKey={eventKey} selected={selected} busy={busy} onClose={() => setSelected(null)} /> : null}
    </>
  );
}

function AllianceCells({
  matchNumber,
  cells,
  onSelect,
}: {
  matchNumber: number;
  cells: ScoutScheduleCell[];
  onSelect: (cell: ScoutScheduleCell) => void;
}) {
  if (!cells.length) return <span className="text-xs text-ink-faint">暂无队伍</span>;
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {cells.map((cell) => (
        <button
          key={`${matchNumber}-${cell.position}-${cell.team}`}
          type="button"
          onClick={() => onSelect(cell)}
          className="min-w-0 rounded-md border border-line bg-surface p-2 text-left transition hover:border-brand hover:bg-brand/5"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-ink">Team {cell.team}</span>
            <span className="text-xs text-ink-faint">{cell.position}</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            <SmallBadge>普通 {cell.normalRecords.length}</SmallBadge>
            <SmallBadge>超级 {cell.superRecords.length}</SmallBadge>
          </div>
        </button>
      ))}
    </div>
  );
}

function RecordModal({
  eventKey,
  selected,
  busy,
  onClose,
}: {
  eventKey: string | null;
  selected: { matchNumber: number; cell: ScoutScheduleCell };
  busy: boolean;
  onClose: () => void;
}) {
  const recordFetcher = useFetcher<ActionData>();
  const records = [...selected.cell.normalRecords, ...selected.cell.superRecords];
  const deleting = busy || recordFetcher.state !== "idle";

  useEffect(() => {
    if (recordFetcher.data?.ok) onClose();
  }, [recordFetcher.data, onClose]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-3" role="dialog" aria-modal="true" onMouseDown={onClose}>
      <Card className="max-h-[86vh] w-full max-w-2xl overflow-hidden p-0" onMouseDown={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between gap-2 border-b border-line p-3">
          <div className="min-w-0">
            <p className="section-label">Q{selected.matchNumber} · {selected.cell.position}</p>
            <h2 className="truncate text-lg font-semibold text-ink">Team {selected.cell.team} 提交记录</h2>
          </div>
          <Button type="button" onClick={onClose} className="h-9 px-2" title="关闭">
            <X className="size-4" />
          </Button>
        </div>
        <div className="grid max-h-[70vh] gap-3 overflow-y-auto p-3">
          {recordFetcher.data?.error ? <Card className="border-danger/40 bg-danger/10 p-3 text-sm text-danger">{recordFetcher.data.error}</Card> : null}
          {records.length ? records.map((record) => (
            <div key={record.id} className="rounded-md border border-line bg-surface-2 p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className={record.recordType === "normal_match" ? "border-info/40 bg-info/10 text-info" : "border-brand/40 bg-brand/10 text-brand"}>
                      {record.recordType === "normal_match" ? "普通 Scout" : "超级 Scout"}
                    </Badge>
                    <span className="font-semibold text-ink">{record.label}</span>
                  </div>
                  <p className="mt-1 text-sm text-ink-dim">上传人：{record.completedBy}</p>
                  <p className="mt-1 text-xs text-ink-faint">
                    上传 {formatDate(record.uploadedAt)} · 本地创建 {formatDate(record.clientCreatedAt)}
                  </p>
                </div>
                <recordFetcher.Form method="post">
                  <input type="hidden" name="intent" value="delete-record" />
                  <input type="hidden" name="event" value={eventKey ?? ""} />
                  <input type="hidden" name="view" value="records" />
                  <input type="hidden" name="recordId" value={record.id} />
                  <Button
                    type="submit"
                    disabled={deleting}
                    className="border-danger/40 text-danger hover:bg-danger/10"
                    onClick={(event) => {
                      if (!confirm("确认删除这条 cyber-scout 原始记录？")) event.preventDefault();
                    }}
                  >
                    <Trash2 className="size-4" />
                    删除
                  </Button>
                </recordFetcher.Form>
              </div>
            </div>
          )) : (
            <EmptyState text="这个队伍当前没有普通或超级 Scout 提交记录。" />
          )}
        </div>
      </Card>
    </div>
  );
}

function AssignmentsView({
  eventKey,
  assignments,
  users,
  configEventKey,
  configSavedAt,
  busy,
}: {
  eventKey: string | null;
  assignments: ScoutLeadAssignment[];
  users: Array<{ id: string; displayName: string }>;
  configEventKey: string | null;
  configSavedAt: string | null;
  busy: boolean;
}) {
  return (
    <div className="grid gap-3">
      <Card className="p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="section-label">人员分配</p>
            <h2 className="text-lg font-semibold text-ink">新增分配</h2>
          </div>
          <Badge className="border-line bg-surface-2 text-ink-dim">
            {configEventKey || "未绑定赛事"}{configSavedAt ? ` · ${new Date(configSavedAt).toLocaleString()}` : ""}
          </Badge>
        </div>
        <AssignmentForm eventKey={eventKey} users={users} busy={busy} />
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line p-3">
          <div>
            <p className="section-label">当前分配</p>
            <h2 className="text-lg font-semibold text-ink">Qualification Scout</h2>
          </div>
          <Badge className="border-line bg-surface-2 text-ink-dim">{assignments.length} 条</Badge>
        </div>
        {!assignments.length ? (
          <EmptyState text="暂无人员分配。" />
        ) : (
          <div className="divide-y divide-line">
            {assignments.map((assignment) => (
              <div key={assignment.id} className="grid gap-2 p-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
                <AssignmentForm eventKey={eventKey} assignment={assignment} users={users} busy={busy} compact />
                <AssignmentDeleteForm eventKey={eventKey} assignmentId={assignment.id} busy={busy} />
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function AssignmentForm({
  eventKey,
  assignment,
  users,
  busy,
  compact = false,
}: {
  eventKey: string | null;
  assignment?: ScoutLeadAssignment;
  users: Array<{ id: string; displayName: string }>;
  busy: boolean;
  compact?: boolean;
}) {
  const assignmentFetcher = useFetcher<ActionData>();
  const saving = busy || assignmentFetcher.state !== "idle";
  const hasCurrentUser = assignment ? users.some((user) => user.displayName === assignment.userName) : true;
  return (
    <assignmentFetcher.Form method="post" className={cn("grid gap-2", compact ? "md:grid-cols-[110px_110px_110px_minmax(160px,1fr)_auto]" : "md:grid-cols-[120px_120px_120px_minmax(180px,1fr)_auto]")}>
      <input type="hidden" name="intent" value="save-assignment" />
      <input type="hidden" name="event" value={eventKey ?? ""} />
      <input type="hidden" name="view" value="assignments" />
      {assignment ? <input type="hidden" name="assignmentId" value={assignment.id} /> : null}
      <label className="grid gap-1 text-sm">
        <span className="font-medium text-ink-dim">开始场次</span>
        <Input name="startMatch" type="number" min="1" defaultValue={assignment?.startMatch ?? 1} required />
      </label>
      <label className="grid gap-1 text-sm">
        <span className="font-medium text-ink-dim">结束场次</span>
        <Input name="endMatch" type="number" min="1" defaultValue={assignment?.endMatch ?? assignment?.startMatch ?? 1} required />
      </label>
      <label className="grid gap-1 text-sm">
        <span className="font-medium text-ink-dim">位置</span>
        <select name="position" defaultValue={assignment?.position ?? "R1"} className="input h-10 font-sans">
          {scoutPositions.map((position) => <option key={position} value={position}>{position}</option>)}
        </select>
      </label>
      <label className="grid gap-1 text-sm">
        <span className="font-medium text-ink-dim">人员</span>
        {users.length ? (
          <select name="userName" defaultValue={assignment?.userName ?? users[0]?.displayName ?? ""} className="input h-10 font-sans">
            {assignment && !hasCurrentUser ? <option value={assignment.userName}>{assignment.userName}</option> : null}
            {users.map((user) => <option key={user.id} value={user.displayName}>{user.displayName}</option>)}
          </select>
        ) : (
          <Input name="userName" defaultValue={assignment?.userName ?? ""} placeholder="Scout 名字" required />
        )}
      </label>
      {assignmentFetcher.data?.error ? <p className="text-sm text-danger md:col-span-full">{assignmentFetcher.data.error}</p> : null}
      <Button type="submit" variant={assignment ? "default" : "primary"} disabled={saving} className="self-end">
        <Save className="size-4" />
        {assignment ? "保存" : "新增"}
      </Button>
    </assignmentFetcher.Form>
  );
}

function AssignmentDeleteForm({ eventKey, assignmentId, busy }: { eventKey: string | null; assignmentId: string; busy: boolean }) {
  const deleteFetcher = useFetcher<ActionData>();
  const deleting = busy || deleteFetcher.state !== "idle";
  return (
    <deleteFetcher.Form method="post" className="flex justify-end">
      <input type="hidden" name="intent" value="delete-assignment" />
      <input type="hidden" name="event" value={eventKey ?? ""} />
      <input type="hidden" name="view" value="assignments" />
      <input type="hidden" name="assignmentId" value={assignmentId} />
      <Button
        type="submit"
        disabled={deleting}
        className="border-danger/40 text-danger hover:bg-danger/10"
        onClick={(event) => {
          if (!confirm("确认删除这条人员分配？")) event.preventDefault();
        }}
      >
        <Trash2 className="size-4" />
        删除
      </Button>
    </deleteFetcher.Form>
  );
}

function SummaryGrid({ report }: { report: ScoutConfidenceReport }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <StatCard icon={<Users className="size-4" />} label="预测记录" value={report.summary.totalRecords} />
      <StatCard icon={<CheckCircle2 className="size-4" />} label="已计分" value={report.summary.scoredRecords} />
      <StatCard icon={<Trophy className="size-4" />} label="全员净分" value={signed(report.summary.totalNetScore)} tone={report.summary.totalNetScore >= 0 ? "ok" : "danger"} />
      <StatCard icon={<Target className="size-4" />} label="准确率" value={percent(report.summary.accuracy)} />
      <StatCard icon={<Gauge className="size-4" />} label="待验证 / 未完成" value={`${report.summary.pendingRecords} / ${report.summary.incompleteRecords}`} />
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  tone = "default",
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  tone?: "default" | "ok" | "danger";
}) {
  return (
    <Card className="p-3">
      <div className="flex items-center justify-between gap-2 text-ink-faint">
        <span className="section-label">{label}</span>
        {icon}
      </div>
      <div
        className={cn(
          "mt-2 text-2xl font-semibold tabular-nums text-ink",
          tone === "ok" && "text-ok",
          tone === "danger" && "text-danger",
        )}
      >
        {value}
      </div>
    </Card>
  );
}

function PeopleTable({ people }: { people: ScoutConfidencePerson[] }) {
  if (!people.length) return <EmptyState text="暂无可排序的信心分记录。" />;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[820px] text-left text-sm">
        <thead className="bg-surface-2 text-xs uppercase text-ink-faint">
          <tr>
            <th className="px-3 py-2">#</th>
            <th className="px-3 py-2">Scout</th>
            <th className="px-3 py-2 text-right">净信心分</th>
            <th className="px-3 py-2 text-right">正确加分</th>
            <th className="px-3 py-2 text-right">错误扣分</th>
            <th className="px-3 py-2 text-right">已计分</th>
            <th className="px-3 py-2 text-right">待验证</th>
            <th className="px-3 py-2 text-right">未完成</th>
            <th className="px-3 py-2 text-right">准确率</th>
            <th className="px-3 py-2 text-right">平均净分</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {people.map((person, index) => (
            <tr key={person.scoutName} className="hover:bg-surface-2/70">
              <td className="px-3 py-2 text-ink-faint">{index + 1}</td>
              <td className="px-3 py-2 font-semibold text-ink">{person.scoutName}</td>
              <td className={cn("px-3 py-2 text-right font-semibold tabular-nums", person.netScore >= 0 ? "text-ok" : "text-danger")}>
                {signed(person.netScore)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-ok">+{person.correctPoints}</td>
              <td className="px-3 py-2 text-right tabular-nums text-danger">-{person.wrongPenalty}</td>
              <td className="px-3 py-2 text-right tabular-nums text-ink-dim">{person.scoredCount}</td>
              <td className="px-3 py-2 text-right tabular-nums text-ink-dim">{person.pendingCount}</td>
              <td className="px-3 py-2 text-right tabular-nums text-ink-dim">{person.incompleteCount}</td>
              <td className="px-3 py-2 text-right tabular-nums text-ink-dim">{percent(person.accuracy)}</td>
              <td className="px-3 py-2 text-right tabular-nums text-ink-dim">{person.averageNet == null ? "-" : signed(round1(person.averageNet))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MatchTable({ matches }: { matches: ScoutConfidenceMatch[] }) {
  if (!matches.length) return <EmptyState text="暂无比赛信心分记录。" />;

  return (
    <div className="max-h-[560px] overflow-auto">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="sticky top-0 bg-surface-2 text-xs uppercase text-ink-faint">
          <tr>
            <th className="px-3 py-2">比赛</th>
            <th className="px-3 py-2 text-right">红方预测</th>
            <th className="px-3 py-2 text-right">蓝方预测</th>
            <th className="px-3 py-2 text-right">平均信心</th>
            <th className="px-3 py-2 text-right">实际胜方</th>
            <th className="px-3 py-2 text-right">状态</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {matches.map((match) => (
            <tr key={match.matchNumber} className="hover:bg-surface-2/70">
              <td className="px-3 py-2 font-semibold text-ink">Q{match.matchNumber}</td>
              <td className="px-3 py-2 text-right tabular-nums text-danger">{match.redPredictions}</td>
              <td className="px-3 py-2 text-right tabular-nums text-info">{match.bluePredictions}</td>
              <td className="px-3 py-2 text-right tabular-nums text-ink-dim">{match.averageConfidence == null ? "-" : round1(match.averageConfidence)}</td>
              <td className="px-3 py-2 text-right text-ink-dim">{winnerLabel(match.actualWinner)}</td>
              <td className="px-3 py-2">
                <div className="flex justify-end gap-1">
                  {match.hasDisagreement ? <SmallBadge tone="warn">分歧</SmallBadge> : null}
                  {match.isLowConfidence ? <SmallBadge tone="danger">低信心</SmallBadge> : null}
                  {!match.hasDisagreement && !match.isLowConfidence ? <SmallBadge>正常</SmallBadge> : null}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CalibrationList({ rows }: { rows: ScoutConfidenceCalibration[] }) {
  return (
    <div className="divide-y divide-line">
      {rows.map((row) => (
        <div key={row.confidence} className="grid grid-cols-[2rem_1fr_auto] items-center gap-3 p-3 text-sm">
          <div className="grid size-8 place-items-center rounded-md bg-brand/10 font-semibold text-brand">{row.confidence}</div>
          <div className="min-w-0">
            <div className="h-2 overflow-hidden rounded-full bg-surface-2">
              <div className="h-full rounded-full bg-ok" style={{ width: `${Math.round((row.accuracy ?? 0) * 100)}%` }} />
            </div>
            <p className="mt-1 text-xs text-ink-faint">
              对 {row.correctCount} · 错 {row.wrongCount} · 待验证 {row.pendingCount}
            </p>
          </div>
          <div className={cn("text-right font-semibold tabular-nums", row.netScore >= 0 ? "text-ok" : "text-danger")}>
            {signed(row.netScore)}
          </div>
        </div>
      ))}
    </div>
  );
}

function ReviewQueue({ items }: { items: ScoutConfidenceReviewItem[] }) {
  if (!items.length) return <EmptyState text="暂无大分歧比赛。" />;

  return (
    <div className="max-h-[420px] divide-y divide-line overflow-auto">
      {items.slice(0, 40).map((item, index) => (
        <div key={`${item.kind}-${item.matchNumber}-${item.scoutName ?? "match"}-${item.team ?? index}`} className="p-3 text-sm">
          <div className="flex items-center gap-2">
            <AlertTriangle className="size-4 text-warn" />
            <span className="font-semibold text-ink">{item.message}</span>
          </div>
          <p className="mt-1 text-xs text-ink-faint">
            {item.scoutName ?? "比赛整体"}{item.confidence == null ? "" : ` · 信心 ${round1(item.confidence)}`}
          </p>
        </div>
      ))}
    </div>
  );
}

function SmallBadge({ children, tone = "default" }: { children: ReactNode; tone?: "default" | "warn" | "danger" }) {
  return (
    <span
      className={cn(
        "rounded-full border px-2 py-0.5 text-xs font-semibold",
        tone === "default" && "border-line bg-surface-2 text-ink-dim",
        tone === "warn" && "border-warn/40 bg-warn/10 text-warn",
        tone === "danger" && "border-danger/40 bg-danger/10 text-danger",
      )}
    >
      {children}
    </span>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="p-6 text-center text-sm text-ink-dim">{text}</div>;
}

function readView(value: string | null): LeadView {
  return value === "records" || value === "assignments" ? value : "confidence";
}

function viewTitle(view: LeadView) {
  if (view === "records") return "提交记录查询";
  if (view === "assignments") return "人员分配";
  return "信心分排行";
}

function replaceLeadViewUrl(searchParams: URLSearchParams, view: LeadView) {
  const params = new URLSearchParams(searchParams);
  params.set("view", view);
  window.history.replaceState(null, "", `/scouting-lead?${params.toString()}`);
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString() : "-";
}

function signed(value: number) {
  return `${value >= 0 ? "+" : ""}${round1(value)}`;
}

function percent(value: number | null) {
  return value == null ? "-" : `${Math.round(value * 100)}%`;
}

function winnerLabel(value: ScoutConfidenceMatch["actualWinner"]) {
  if (value === "red") return "红方";
  if (value === "blue") return "蓝方";
  if (value === "tie") return "平局";
  return "暂无";
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}
