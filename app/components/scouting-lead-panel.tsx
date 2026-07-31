import {
  ClipboardList,
  Save,
  Target,
  Trash2,
  Trophy,
  UserPlus,
  X,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useFetcher, useNavigation, useSearchParams } from "react-router";
import { Badge, Button, Card, Input, cn } from "./ui";
import type {
  ScoutConfidenceResult,
  ScoutLeadAssignment,
  ScoutScheduleCell,
  ScoutScheduleMatch,
} from "../lib/cyber-scout.server";
import type {
  ScoutConfidenceMatch,
  ScoutConfidencePerson,
  ScoutConfidenceReport,
} from "../lib/scout-confidence";

export type ScoutingLeadActionData = { error?: string; ok?: boolean; view?: LeadView };
export type ScoutingLeadPanelData = ScoutConfidenceResult;
type LeadView = "confidence" | "records" | "assignments";

const leadViews: Array<{ id: LeadView; label: string; icon: ReactNode }> = [
  { id: "confidence", label: "信心分", icon: <Trophy className="size-4" /> },
  { id: "records", label: "提交记录", icon: <ClipboardList className="size-4" /> },
  { id: "assignments", label: "人员分配", icon: <UserPlus className="size-4" /> },
];

const scoutPositions = ["R1", "R2", "R3", "B1", "B2", "B3"] as const;

export function ScoutingLeadPanel({
  data,
  readOnly = false,
  routeBase = "/",
}: {
  data: ScoutingLeadPanelData;
  readOnly?: boolean;
  routeBase?: string;
}) {
  const navigation = useNavigation();
  const [searchParams] = useSearchParams();
  const [view, setView] = useState<LeadView>(() => readView(searchParams.get("view")));
  const { report, selectedEventKey, leadData } = data;
  const busy = navigation.state !== "idle";

  function selectView(next: LeadView) {
    setView(next);
    replaceLeadViewUrl(searchParams, next, routeBase);
  }

  return (
    <div className="mx-auto grid w-full max-w-[1500px] gap-3">
      <div className="flex flex-wrap gap-2 rounded-card border border-line bg-surface p-2">
        {leadViews.map((item) => (
          <Button key={item.id} type="button" variant={view === item.id ? "active" : "default"} onClick={() => selectView(item.id)}>
            {item.icon}
            {item.label}
          </Button>
        ))}
      </div>

      {view === "confidence" ? <ConfidenceView report={report} /> : null}
      {view === "records" ? <RecordsView eventKey={selectedEventKey} schedule={leadData.recordSchedule} busy={busy} readOnly={readOnly} /> : null}
      {view === "assignments" ? (
        <AssignmentsView
          eventKey={selectedEventKey}
          assignments={leadData.assignments}
          users={leadData.users}
          busy={busy}
          readOnly={readOnly}
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
            <h2 className="text-lg font-semibold text-ink">净信心分</h2>
          </div>
          <Badge className="border-line bg-surface-2 text-ink-dim">{report.people.length} 人</Badge>
        </div>
        <PeopleTable people={report.people} />
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="border-b border-line p-3">
          <h2 className="text-lg font-semibold text-ink">预测分布</h2>
        </div>
        <MatchTable matches={report.matches} />
      </Card>
    </>
  );
}

function RecordsView({
  eventKey,
  schedule,
  busy,
  readOnly,
}: {
  eventKey: string | null;
  schedule: ScoutingLeadPanelData["leadData"]["recordSchedule"];
  busy: boolean;
  readOnly: boolean;
}) {
  const [selected, setSelected] = useState<{ matchType: ScoutScheduleMatch["matchType"]; matchNumber: number; label?: string; cell: ScoutScheduleCell } | null>(null);

  return (
    <>
      <Card className="overflow-hidden p-0">
        <div className="border-b border-line p-3">
          <h2 className="text-lg font-semibold text-ink">提交记录</h2>
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
                  <tr key={`${match.matchType}-${match.label ?? match.matchNumber}`} className="align-top">
                    <td className="px-3 py-3 font-semibold text-ink">{scoutMatchLabel(match)}</td>
                    <td className="px-3 py-2">
                      <AllianceCells matchNumber={match.matchNumber} cells={match.red} onSelect={(cell) => setSelected({ matchType: match.matchType, matchNumber: match.matchNumber, label: match.label, cell })} />
                    </td>
                    <td className="px-3 py-2">
                      <AllianceCells matchNumber={match.matchNumber} cells={match.blue} onSelect={(cell) => setSelected({ matchType: match.matchType, matchNumber: match.matchNumber, label: match.label, cell })} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {selected ? <RecordModal eventKey={eventKey} selected={selected} busy={busy} readOnly={readOnly} onClose={() => setSelected(null)} /> : null}
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
  readOnly,
  onClose,
}: {
  eventKey: string | null;
  selected: { matchType: ScoutScheduleMatch["matchType"]; matchNumber: number; label?: string; cell: ScoutScheduleCell };
  busy: boolean;
  readOnly: boolean;
  onClose: () => void;
}) {
  const recordFetcher = useFetcher<ScoutingLeadActionData>();
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
            <p className="section-label">{scoutMatchLabel(selected)} · {selected.cell.position}</p>
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
                  <Badge className={record.recordType === "normal_match" ? "border-info/40 bg-info/10 text-info" : "border-brand/40 bg-brand/10 text-brand"}>
                    {record.recordType === "normal_match" ? "Normal Scout" : "Super Scout"}
                  </Badge>
                  <p className="mt-2 text-sm text-ink-dim">上传人：{record.completedBy}</p>
                  <p className="mt-1 text-xs text-ink-faint">上传 {formatDate(record.uploadedAt)}</p>
                </div>
                {!readOnly ? <recordFetcher.Form method="post" action="/scouting-lead">
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
                </recordFetcher.Form> : null}
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
  busy,
  readOnly,
}: {
  eventKey: string | null;
  assignments: ScoutLeadAssignment[];
  users: Array<{ id: string; displayName: string }>;
  busy: boolean;
  readOnly: boolean;
}) {
  return (
    <div className="grid gap-3">
      {!readOnly ? <Card className="p-4">
        <h2 className="mb-3 text-lg font-semibold text-ink">新增分配</h2>
        <AssignmentForm eventKey={eventKey} users={users} busy={busy} />
      </Card> : null}

      <Card className="overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line p-3">
          <div>
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
                {readOnly ? (
                  <AssignmentSummary assignment={assignment} />
                ) : (
                  <>
                    <AssignmentForm eventKey={eventKey} assignment={assignment} users={users} busy={busy} compact />
                    <AssignmentDeleteForm eventKey={eventKey} assignmentId={assignment.id} busy={busy} />
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function AssignmentSummary({ assignment }: { assignment: ScoutLeadAssignment }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <Badge className="border-brand/40 bg-brand/10 text-brand">Q{assignment.startMatch}–Q{assignment.endMatch}</Badge>
      <Badge className="border-line bg-surface-2 text-ink-dim">{assignment.position}</Badge>
      <span className="font-semibold text-ink">{assignment.userName}</span>
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
  const assignmentFetcher = useFetcher<ScoutingLeadActionData>();
  const saving = busy || assignmentFetcher.state !== "idle";
  const hasCurrentUser = assignment ? users.some((user) => user.displayName === assignment.userName) : true;
  return (
    <assignmentFetcher.Form method="post" action="/scouting-lead" className={cn("grid gap-2", compact ? "md:grid-cols-[110px_110px_110px_minmax(160px,1fr)_auto]" : "md:grid-cols-[120px_120px_120px_minmax(180px,1fr)_auto]")}>
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
  const deleteFetcher = useFetcher<ScoutingLeadActionData>();
  const deleting = busy || deleteFetcher.state !== "idle";
  return (
    <deleteFetcher.Form method="post" action="/scouting-lead" className="flex justify-end">
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
    <div className="grid gap-3 sm:grid-cols-2">
      <StatCard icon={<Trophy className="size-4" />} label="全员净分" value={signed(report.summary.totalNetScore)} tone={report.summary.totalNetScore >= 0 ? "ok" : "danger"} />
      <StatCard icon={<Target className="size-4" />} label="准确率" value={percent(report.summary.accuracy)} />
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
            <tr key={`${match.matchType}-${match.matchNumber}`} className="hover:bg-surface-2/70">
              <td className="px-3 py-2 font-semibold text-ink">{scoutMatchLabel(match)}</td>
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

function replaceLeadViewUrl(searchParams: URLSearchParams, view: LeadView, routeBase: string) {
  const params = new URLSearchParams(searchParams);
  params.set("view", view);
  params.set("tab", "lead");
  window.history.replaceState(null, "", `${routeBase}?${params.toString()}`);
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

function scoutMatchLabel(match: Pick<ScoutConfidenceMatch, "matchType" | "matchNumber"> & { label?: string }) {
  if (match.label) return match.label;
  if (match.matchType === "practice") return `P${match.matchNumber}`;
  if (match.matchType === "qualification") return `Q${match.matchNumber}`;
  return `E${match.matchNumber}`;
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}
