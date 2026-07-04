import { ArrowLeft, AlertTriangle, CheckCircle2, Gauge, Target, Trophy, Users } from "lucide-react";
import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router";
import type { Route } from "./+types/_app.scouting-lead";
import { Badge, Card, cn } from "../components/ui";
import { requireAdmin } from "../lib/auth.server";
import { loadScoutConfidenceForRequest } from "../lib/cyber-scout.server";
import type {
  ScoutConfidenceCalibration,
  ScoutConfidenceMatch,
  ScoutConfidencePerson,
  ScoutConfidenceReport,
  ScoutConfidenceReviewItem,
} from "../lib/scout-confidence";

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  return loadScoutConfidenceForRequest(request);
}

export default function ScoutingLeadRoute({ loaderData }: Route.ComponentProps) {
  const navigate = useNavigate();
  const { report, events, selectedEventKey, sourceStatus } = loaderData;

  function selectEvent(eventKey: string) {
    navigate(eventKey ? `/scouting-lead?event=${encodeURIComponent(eventKey)}` : "/scouting-lead");
  }

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-3">
      <div className="flex flex-col gap-3 rounded-card border border-line bg-surface p-3 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <p className="section-label">Scouting Lead</p>
          <h1 className="text-2xl font-semibold text-ink">信心分排行</h1>
          <p className="mt-1 text-sm text-ink-dim">
            预测正确加信心分，预测错误扣信心分；未完赛比赛暂不计分。
          </p>
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
          <Link to={selectedEventKey ? `/?event=${encodeURIComponent(selectedEventKey)}` : "/"} className="btn">
            <ArrowLeft className="size-4" />
            返回
          </Link>
        </div>
      </div>

      <SummaryGrid report={report} />

      <Card className="overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line p-3">
          <div>
            <p className="section-label">个人排序</p>
            <h2 className="text-lg font-semibold text-ink">净信心分</h2>
          </div>
          <Badge className="border-line bg-surface-2 text-ink-dim">
            {report.people.length} 人
          </Badge>
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
              <h2 className="text-lg font-semibold text-ink">需要关注</h2>
            </div>
            <ReviewQueue items={report.reviewQueue} />
          </Card>
        </div>
      </div>
    </div>
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
