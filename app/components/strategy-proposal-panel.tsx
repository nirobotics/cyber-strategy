import {
  CheckCircle2,
  Download,
  Plus,
  Save,
  Send,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useFetcher, useNavigate, useNavigation, useSearchParams } from "react-router";
import { PhotoLightbox, TeamDetailModal } from "./analytics-dashboard";
import { StrategyBoard } from "./strategy-board";
import { StrategyNavigation } from "./strategy-navigation";
import { Badge, Button, Card, cn } from "./ui";
import type { SessionUser } from "../lib/auth-types";
import { reliability, type ScoutingDataset, type ScoutingEventOption, type TeamPitInfo, type TeamSummary } from "../lib/scouting";
import {
  firstProposalMatchForTeam,
  proposalMatchForKeyOrFirst,
  proposalMatchIncludesTeam,
  proposalMatchesForTeam,
  proposalMatchMatchesTeamQuery,
  type ProposalMatch,
} from "../lib/strategy-proposal-matches";
import {
  canDeleteProposalAs,
  canEditProposalAs,
  canRestoreApprovedSnapshot,
  canReviewProposal,
  ensureStrategyBoardTeams,
  proposalMatchesSnapshot,
  proposalMatchesOwnTeamQuery,
  normalizeProposalPayload,
  ownStrategyTeams,
  proposalStatuses,
  strategyShifts,
  type AutoProposalPayload,
  type AutoWinner,
  type PartnerStrategyPayload,
  type RoutePoint,
  type RouteMap,
  type StrategyBoardPhase,
  type StrategyBoardPhaseId,
  type StrategyProposal,
  type StrategyProposalPayload,
  type StrategyProposalStatus,
  type StrategyProposalType,
  type StrategyShift,
} from "../lib/strategy-proposals";

export type StrategyProposalActionData = { error?: string; ok?: boolean; proposalId?: string; deleted?: boolean };
export type StrategyProposalPanelData = {
  dataset: ScoutingDataset;
  events: ScoutingEventOption[];
  selectedEventKey: string;
  isAdmin: boolean;
  user: SessionUser;
  proposals: StrategyProposal[];
  proposalError: string | null;
  matches: ProposalMatch[];
};

type EditorState = {
  id: string | null;
  proposalType: StrategyProposalType;
  ownTeam: string;
  matchKey: string;
  payload: StrategyProposalPayload;
};

export function StrategyProposalPanel({
  data,
  initialSelectedId,
  embedded = false,
  demoMode = false,
  ownTeams = ownStrategyTeams,
  routeBase = "/",
}: {
  data: StrategyProposalPanelData;
  initialSelectedId: string | null;
  embedded?: boolean;
  demoMode?: boolean;
  ownTeams?: readonly string[];
  routeBase?: string;
}) {
  const navigate = useNavigate();
  const navigation = useNavigation();
  const proposalFetcher = useFetcher<StrategyProposalActionData>();
  const [searchParams] = useSearchParams();
  const actionData = proposalFetcher.data;
  const [statusFilter, setStatusFilter] = useState<StrategyProposalStatus | "all">("all");
  const [matchFilter, setMatchFilter] = useState("all");
  const [teamFilter, setTeamFilter] = useState("");
  const [selectedId, setSelectedId] = useState(initialSelectedId);
  const [detailTeam, setDetailTeam] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<{ team: string; index: number } | null>(null);
  const [printProposals, setPrintProposals] = useState<StrategyProposal[] | null>(null);
  const matchProposals = data.proposals.filter((proposal) => proposal.proposalType === "auto");
  const selected = matchProposals.find((proposal) => proposal.id === selectedId) ?? null;
  const [editor, setEditor] = useState(() => initialEditorState(selected, data.matches, ownTeams));
  const busy = navigation.state !== "idle" || proposalFetcher.state !== "idle";
  const editorMatches = proposalMatchesForTeam(data.matches, editor.ownTeam);
  const selectedMatch = proposalMatchForKeyOrFirst(editorMatches, editor.matchKey);
  const matchKeyValue = selectedMatch?.key ?? editor.matchKey;
  const matchLabelValue = selectedMatch?.label ?? editor.matchKey;
  const approvedSnapshot = selected?.lastApprovedSnapshot
    ? { ...selected.lastApprovedSnapshot, payload: ensureMatchPayload(selected.lastApprovedSnapshot.payload, selectedMatch) }
    : null;
  const editable = canEditProposalAs(selected, data.user.feishuOpenId, data.isAdmin);
  const deletable = canDeleteProposalAs(selected, data.user.feishuOpenId, data.isAdmin);
  const reviewer = canReviewProposal(selected, data.isAdmin);
  const restorable = canRestoreApprovedSnapshot(selected, data.user.feishuOpenId, data.isAdmin);
  const adminEditingApproved = Boolean(selected?.status === "approved" && data.isAdmin);
  const teamFilterDigits = teamFilter.replace(/\D/g, "");
  const matchFilterOptions = data.matches.filter((match) => proposalMatchMatchesTeamQuery(match, teamFilter));
  const approvedEditorChanged = Boolean(selected?.status === "approved" && !proposalMatchesSnapshot({
    ...selected,
    lastApprovedSnapshot: approvedSnapshot,
    matchKey: matchKeyValue,
    matchLabel: matchLabelValue,
    ownTeam: editor.ownTeam,
    proposalType: editor.proposalType,
    payload: editor.payload,
  }));
  const filteredProposals = matchProposals.filter((proposal) =>
    (statusFilter === "all" || proposal.status === statusFilter) &&
    (matchFilter === "all" || proposal.matchKey === matchFilter) &&
    proposalMatchesOwnTeamQuery(proposal, teamFilterDigits)
  );
  const teamDetail = detailTeam ? data.dataset.teamData[detailTeam] : null;
  const editorPayloadJson = useMemo(() => JSON.stringify(editor.payload), [editor.payload]);

  useEffect(() => {
    if (!proposalFetcher.data?.ok) return;
    if (proposalFetcher.data.deleted) {
      const timeout = window.setTimeout(() => {
        setSelectedId(null);
        setEditor(initialEditorState(null, data.matches, ownTeams));
        replaceProposalUrl(searchParams, null, embedded, routeBase);
      }, 0);
      return () => window.clearTimeout(timeout);
    }
    if (!proposalFetcher.data.proposalId) return;
    const proposalId = proposalFetcher.data.proposalId;
    const timeout = window.setTimeout(() => {
      setSelectedId(proposalId);
      setEditor((current) => ({ ...current, id: proposalId }));
      replaceProposalUrl(searchParams, proposalId, embedded, routeBase);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [proposalFetcher.data, searchParams, data.matches, data.dataset, embedded, ownTeams, routeBase]);

  useEffect(() => {
    if (!printProposals?.length) return;
    const timeout = window.setTimeout(() => window.print(), 250);
    const clear = () => setPrintProposals(null);
    window.addEventListener("afterprint", clear, { once: true });
    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener("afterprint", clear);
    };
  }, [printProposals]);

  function selectEvent(eventKey: string) {
    const params = new URLSearchParams(searchParams);
    params.set("event", eventKey);
    params.delete("proposal");
    if (embedded) params.set("tab", "proposal");
    navigate(`${embedded ? routeBase : "/strategy-proposal"}?${params.toString()}`);
  }

  function newProposal() {
    setSelectedId(null);
    setEditor(initialEditorState(null, data.matches, ownTeams));
    replaceProposalUrl(searchParams, null, embedded, routeBase);
  }

  function openProposal(id: string) {
    const proposal = matchProposals.find((item) => item.id === id) ?? null;
    setSelectedId(id);
    setEditor(initialEditorState(proposal, data.matches, ownTeams));
    replaceProposalUrl(searchParams, id, embedded, routeBase);
  }

  function updateOwnTeam(ownTeam: string) {
    setEditor((current) => {
      const currentMatch = data.matches.find((item) => item.key === current.matchKey) ?? null;
      const nextMatch = currentMatch && proposalMatchIncludesTeam(currentMatch, ownTeam)
        ? currentMatch
        : firstProposalMatchForTeam(data.matches, ownTeam);
      return {
        ...current,
        ownTeam,
        matchKey: nextMatch?.key ?? "",
        payload: ensureMatchPayload(current.payload, nextMatch),
      };
    });
  }

  function updateMatch(matchKey: string) {
    const match = data.matches.find((item) => item.key === matchKey) ?? null;
    setEditor((current) => ({
      ...current,
      matchKey,
      payload: ensureMatchPayload(current.payload, match),
    }));
  }

  function updateTeamFilter(value: string) {
    setTeamFilter(value);
    const selectedMatchFilter = data.matches.find((match) => match.key === matchFilter) ?? null;
    if (selectedMatchFilter && !proposalMatchMatchesTeamQuery(selectedMatchFilter, value)) setMatchFilter("all");
  }

  function exportProposals() {
    setPrintProposals([...filteredProposals]);
  }

  return (
    <div className="mx-auto grid w-full max-w-[1500px] gap-3">
      {!embedded ? <div className="flex flex-col gap-3 rounded-card border border-line bg-surface p-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <p className="section-label">Strategy Proposal</p>
          <p className="mt-1 text-sm text-ink-dim">
            {data.selectedEventKey} · {matchProposals.length} 个比赛策略 · {data.matches.length} 场比赛
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={data.selectedEventKey}
            onChange={(event) => selectEvent(event.target.value)}
            className="input h-9 min-w-[180px] font-sans"
            disabled={!data.events.length}
            title="选择赛事"
          >
            {!data.events.some((event) => event.eventKey === data.selectedEventKey) ? (
              <option value={data.selectedEventKey}>{data.selectedEventKey}</option>
            ) : null}
            {data.events.map((event) => (
              <option key={event.eventKey} value={event.eventKey}>
                {event.name || event.eventKey}{event.isActive ? " · 当前" : ""}
              </option>
            ))}
          </select>
          <StrategyNavigation active="proposal" eventKey={data.selectedEventKey} isAdmin={data.isAdmin} />
        </div>
      </div> : null}

      {actionData?.error ? <Card className="border-danger/40 bg-danger/10 p-3 text-sm text-danger">{actionData.error}</Card> : null}
      {data.proposalError ? <Card className="border-warn/40 bg-warn/10 p-3 text-sm text-warn">{data.proposalError}</Card> : null}

      <div className="grid gap-3 xl:grid-cols-[360px_minmax(0,1fr)]">
        <Card className="overflow-hidden p-0">
          <div className="flex items-center justify-between gap-2 border-b border-line p-3">
            <div>
              <p className="section-label">比赛策略</p>
              <h2 className="text-lg font-semibold text-ink">列表</h2>
            </div>
            <div className="flex gap-2">
              {data.isAdmin ? (
                <Button type="button" onClick={exportProposals} disabled={!filteredProposals.length} title="导出当前列表为 PDF">
                  <Download className="size-4" />
                  导出 PDF
                </Button>
              ) : null}
              <Button type="button" variant={!selected ? "active" : "default"} onClick={newProposal}>
                <Plus className="size-4" />
                新建
              </Button>
            </div>
          </div>
          <div className="grid gap-2 border-b border-line p-3">
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StrategyProposalStatus | "all")} className="input h-9 font-sans">
              <option value="all">所有状态</option>
              {proposalStatuses.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}
            </select>
            <input
              value={teamFilter}
              onChange={(event) => updateTeamFilter(event.target.value)}
              inputMode="numeric"
              className="input h-9 font-sans"
              placeholder="按己方队号查找"
              aria-label="按己方队号查找 proposal"
            />
            <select value={matchFilter} onChange={(event) => setMatchFilter(event.target.value)} className="input h-9 font-sans">
              <option value="all">所有己方比赛</option>
              {matchFilterOptions.map((match) => (
                <option key={match.key} value={match.key}>{match.label} · R {match.redTeams.join("/")} · B {match.blueTeams.join("/")}</option>
              ))}
            </select>
          </div>
          <div className="max-h-[72dvh] overflow-y-auto">
            {!filteredProposals.length ? (
              <div className="p-6 text-center text-sm text-ink-dim">暂无比赛策略。</div>
            ) : (
              filteredProposals.map((proposal) => (
                <button
                  key={proposal.id}
                  type="button"
                  onClick={() => openProposal(proposal.id)}
                  className={cn(
                    "grid w-full gap-1 border-l-2 border-transparent border-b border-line px-3 py-3 text-left transition hover:bg-surface-2",
                    selected?.id === proposal.id && "border-brand bg-brand/10",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-semibold text-ink">{proposal.title}</span>
                    <StatusBadge status={proposal.status} />
                  </div>
                  <p className="text-xs text-ink-dim">{proposal.matchLabel} · {proposalTypeLabel(proposal.proposalType)} · Team {proposal.ownTeam}</p>
                  <p className="text-xs text-ink-faint">{proposal.createdByName} · {new Date(proposal.updatedAt).toLocaleString()}</p>
                </button>
              ))
            )}
          </div>
        </Card>

        <Card className="overflow-hidden p-0">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line p-3">
            <div>
              <h2 className="text-lg font-semibold text-ink">{selected ? "编辑比赛策略" : "新建比赛策略"}</h2>
            </div>
            {selected ? <StatusBadge status={selected.status} /> : <StatusBadge status="draft" />}
          </div>

          {selected?.status === "rejected" ? (
            <div className="flex flex-wrap gap-x-2 gap-y-1 border-b border-danger/30 bg-danger/10 px-3 py-2 text-sm md:px-4">
              <span className="font-semibold text-danger">退回反馈</span>
              <span className="text-ink">{selected.reviewNote || "管理员未填写反馈。"}</span>
              {selected.reviewedAt ? <span className="text-ink-dim">{new Date(selected.reviewedAt).toLocaleString()}</span> : null}
            </div>
          ) : null}

          <proposalFetcher.Form
            method="post"
            action="/strategy-proposal"
            className="grid gap-4 p-3 md:p-4"
            onSubmit={demoMode ? (event) => event.preventDefault() : undefined}
          >
            <input type="hidden" name="id" value={editor.id ?? ""} />
            <input type="hidden" name="eventKey" value={data.selectedEventKey} />
            <input type="hidden" name="matchLabel" value={matchLabelValue} />
            <input type="hidden" name="proposalType" value={editor.proposalType} />
            <input type="hidden" name="payload" value={editorPayloadJson} />

            <div className="grid gap-3 lg:grid-cols-[160px_minmax(0,1fr)]">
              <label className="grid gap-1">
                <span className="text-sm font-medium text-ink-dim">己方队伍</span>
                <select
                  name="ownTeam"
                  value={editor.ownTeam}
                  disabled={!editable}
                  onChange={(event) => updateOwnTeam(event.target.value)}
                  className="input h-10 font-sans"
                >
                  {ownTeams.map((team) => <option key={team} value={team}>Team {team}</option>)}
                </select>
              </label>
              <label className="grid gap-1">
                <span className="text-sm font-medium text-ink-dim">比赛</span>
                <select
                  name="matchKey"
                  value={matchKeyValue}
                  disabled={!editable || !editorMatches.length}
                  onChange={(event) => updateMatch(event.target.value)}
                  className="input h-10 font-sans"
                >
                  {!editorMatches.length ? <option value="">没有 Team {editor.ownTeam} 的比赛</option> : null}
                  {editorMatches.map((match) => (
                    <option key={match.key} value={match.key}>{match.label} · R {match.redTeams.join("/")} · B {match.blueTeams.join("/")}</option>
                  ))}
                </select>
              </label>
            </div>

            {!selectedMatch ? (
              <div className="rounded-md border border-warn/40 bg-warn/10 p-3 text-sm text-warn">
                当前赛事没有 Team {editor.ownTeam} 的 Cyber Scout 赛程，暂不能创建比赛策略。
              </div>
            ) : (
              <MatchTeamsBar match={selectedMatch} activeTeam={editor.ownTeam} onOpenTeam={setDetailTeam} />
            )}

            <PayloadEditor
              match={selectedMatch}
              payload={editor.payload}
              disabled={!editable}
              onChange={(payload) => setEditor((current) => ({ ...current, payload }))}
            />

            <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-3">
              {demoMode ? <span className="text-sm text-ink-dim">Demo 中的修改不会保存。</span> : deletable ? (
                <Button
                  type="submit"
                  name="intent"
                  value="delete"
                  disabled={busy}
                  className="border-danger/40 text-danger hover:bg-danger/10"
                  onClick={(event) => {
                    if (!confirm("确认删除这个 Strategy Proposal？")) event.preventDefault();
                  }}
                >
                  <Trash2 className="size-4" />
                  删除
                </Button>
              ) : null}
              {!demoMode && restorable ? (
                <Button type="submit" name="intent" value="restore" disabled={busy}>
                  <Undo2 className="size-4" />
                  恢复到已通过版本
                </Button>
              ) : null}
              {!demoMode && editable ? (
                selected?.status === "approved" ? (
                  adminEditingApproved && approvedEditorChanged ? (
                    <Button type="submit" name="intent" value="save" disabled={busy || !selectedMatch}>
                      <Save className="size-4" />
                      保存并保持通过
                    </Button>
                  ) : approvedEditorChanged ? (
                    <Button type="submit" name="intent" value="submit" variant="primary" disabled={busy || !selectedMatch}>
                      <Send className="size-4" />
                      需要重新审核
                    </Button>
                  ) : (
                    <span className="text-sm text-ink-dim">已通过版本未修改。</span>
                  )
                ) : (
                  <>
                    <Button type="submit" name="intent" value="save" disabled={busy || !selectedMatch}>
                      <Save className="size-4" />
                      保存草稿
                    </Button>
                    <Button type="submit" name="intent" value="submit" variant="primary" disabled={busy || !selectedMatch}>
                      <Send className="size-4" />
                      提交审核
                    </Button>
                  </>
                )
              ) : !demoMode ? (
                <span className="text-sm text-ink-dim">当前状态不可编辑。</span>
              ) : null}
            </div>
          </proposalFetcher.Form>

          {reviewer && selected ? (
            <proposalFetcher.Form method="post" action="/strategy-proposal" className="grid gap-3 border-t border-line bg-surface-2 p-3 md:p-4">
              <input type="hidden" name="intent" value="review" />
              <input type="hidden" name="id" value={selected.id} />
              <input type="hidden" name="eventKey" value={data.selectedEventKey} />
              <label className="grid gap-1">
                <span className="section-label">审核备注</span>
                <textarea name="reviewNote" className="input min-h-20 font-sans" placeholder="退回时建议填写原因" />
              </label>
              <div className="flex flex-wrap justify-end gap-2">
                <Button type="submit" name="decision" value="rejected" disabled={busy}>
                  <X className="size-4" />
                  退回
                </Button>
                <Button type="submit" name="decision" value="approved" variant="primary" disabled={busy}>
                  <CheckCircle2 className="size-4" />
                  通过
                </Button>
              </div>
            </proposalFetcher.Form>
          ) : null}
        </Card>
      </div>

      {detailTeam && teamDetail ? (
        <TeamDetailModal
          team={teamDetail}
          photos={data.dataset.teamPhotos[teamDetail.team] ?? []}
          pitInfo={data.dataset.teamPitData?.[teamDetail.team]}
          onOpenPhoto={(index) => setLightbox({ team: teamDetail.team, index })}
          onClose={() => setDetailTeam(null)}
          hideComments={demoMode}
        />
      ) : null}
      {detailTeam && !teamDetail ? <MissingTeamDetailModal team={detailTeam} onClose={() => setDetailTeam(null)} /> : null}
      {lightbox ? (
        <PhotoLightbox
          photos={data.dataset.teamPhotos[lightbox.team] ?? []}
          index={lightbox.index}
          onChange={(index) => setLightbox({ ...lightbox, index })}
          onClose={() => setLightbox(null)}
        />
      ) : null}
      {printProposals?.length ? (
        <StrategyProposalPrintDocument
          eventKey={data.selectedEventKey}
          dataset={data.dataset}
          matches={data.matches}
          proposals={printProposals}
        />
      ) : null}
    </div>
  );
}

function PayloadEditor({
  match,
  payload,
  disabled,
  onChange,
}: {
  match: ProposalMatch | null;
  payload: StrategyProposalPayload;
  disabled: boolean;
  onChange: (payload: StrategyProposalPayload) => void;
}) {
  if (!match) return null;
  const matchPayload = ensureMatchPayload(payload, match);
  return <StrategyBoard payload={matchPayload} match={match} disabled={disabled} onChange={onChange} />;
}

function MatchTeamsBar({ match, activeTeam, onOpenTeam }: { match: ProposalMatch; activeTeam: string; onOpenTeam: (team: string) => void }) {
  return (
    <div className="grid gap-2 rounded-md border border-line bg-surface-2 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge className="border-danger/40 bg-danger/10 text-danger">Red</Badge>
        {match.redTeams.map((team) => <TeamChip key={team} team={team} active={team === activeTeam} onOpenTeam={onOpenTeam} />)}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge className="border-info/40 bg-info/10 text-info">Blue</Badge>
        {match.blueTeams.map((team) => <TeamChip key={team} team={team} active={team === activeTeam} onOpenTeam={onOpenTeam} />)}
      </div>
    </div>
  );
}

function TeamChip({ team, active, onOpenTeam }: { team: string; active: boolean; onOpenTeam: (team: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onOpenTeam(team)}
      className={cn("rounded-md border px-2 py-1 text-sm font-semibold", active ? "border-brand bg-brand/10 text-brand" : "border-line bg-surface text-ink-dim")}
      title="查看队伍详情"
    >
      Team {team}
    </button>
  );
}

function MissingTeamDetailModal({ team, onClose }: { team: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/55 p-3" role="dialog" aria-modal="true" onMouseDown={onClose}>
      <Card className="w-full max-w-md p-4" onMouseDown={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="section-label">队伍详情</p>
            <h2 className="text-xl font-semibold text-ink">Team {team}</h2>
          </div>
          <button type="button" className="grid size-9 place-items-center rounded-md border border-line text-ink-dim hover:text-ink" onClick={onClose} aria-label="关闭">
            <X className="size-4" />
          </button>
        </div>
        <p className="mt-3 text-sm text-ink-dim">当前数据集里没有这支队伍的详细数据。</p>
      </Card>
    </div>
  );
}

function StrategyProposalPrintDocument({
  eventKey,
  dataset,
  matches,
  proposals,
}: {
  eventKey: string;
  dataset: ScoutingDataset;
  matches: ProposalMatch[];
  proposals: StrategyProposal[];
}) {
  const exportedAt = new Date().toLocaleString("zh-CN", { hour12: false });
  return (
    <div className="proposal-print-root" aria-hidden="true">
      <style>{PROPOSAL_PRINT_CSS}</style>
      {proposals.map((proposal, index) => (
        <PrintableProposal
          key={proposal.id}
          eventKey={eventKey}
          exportedAt={exportedAt}
          proposal={proposal}
          match={matches.find((item) => item.key === proposal.matchKey) ?? null}
          dataset={dataset}
          index={index + 1}
          count={proposals.length}
        />
      ))}
    </div>
  );
}

function PrintableProposal({
  eventKey,
  exportedAt,
  proposal,
  match,
  dataset,
  index,
  count,
}: {
  eventKey: string;
  exportedAt: string;
  proposal: StrategyProposal;
  match: ProposalMatch | null;
  dataset: ScoutingDataset;
  index: number;
  count: number;
}) {
  const teams = printMatchTeams(match, proposal);
  return (
    <article className="proposal-print-page">
      <header className="proposal-print-header">
        <div className="proposal-print-brand">
          <img src="/ni-logo.png" alt="" />
          <div>
            <p>NI Robotics</p>
            <strong>Cyber Strategy</strong>
          </div>
        </div>
        <div className="proposal-print-meta">
          <span>{eventKey}</span>
          <span>{exportedAt}</span>
          <span>Proposal {index} / {count}</span>
        </div>
      </header>

      <section className="proposal-print-title">
        <p>Strategy Proposal</p>
        <h1>{proposal.title}</h1>
      </section>

      <section className="proposal-print-grid proposal-print-summary">
        <PrintInfo label="比赛场次" value={proposal.matchLabel || proposal.matchKey || "-"} />
        <PrintInfo label="类型" value={proposalTypeLabel(proposal.proposalType)} />
        <PrintInfo label="状态" value={statusLabel(proposal.status)} />
        <PrintInfo label="己方队伍" value={`Team ${proposal.ownTeam}`} highlight />
        <PrintInfo label="创建者" value={proposal.createdByName || "-"} />
        <PrintInfo label="更新时间" value={new Date(proposal.updatedAt).toLocaleString("zh-CN", { hour12: false })} />
      </section>

      <section className="proposal-print-section">
        <h2>比赛队伍</h2>
        {match ? (
          <div className="proposal-print-alliances">
            <PrintAlliance label="Red" teams={match.redTeams} tone="red" />
            <PrintAlliance label="Blue" teams={match.blueTeams} tone="blue" />
          </div>
        ) : (
          <div className="proposal-print-team-row">
            {teams.map((team) => <PrintTeamPill key={team} team={team} />)}
          </div>
        )}
      </section>

      <section className="proposal-print-section">
        <h2>六队详细信息</h2>
        <div className="proposal-print-team-grid">
          {teams.map((team) => (
            <PrintTeamDetail
              key={team}
              team={team}
              summary={dataset.teamData[team] ?? null}
              pitInfo={dataset.teamPitData?.[team] ?? null}
            />
          ))}
        </div>
      </section>

      <section className="proposal-print-section proposal-print-break-before">
        <h2>场地图与批注</h2>
        <PrintableProposalMaps proposal={proposal} match={match} />
      </section>

      <section className="proposal-print-section">
        <h2>备注</h2>
        <PrintProposalNotes proposal={proposal} />
      </section>

      <footer className="proposal-print-footer">
        <span>NI Robotics · Cyber Strategy</span>
        <span className="proposal-print-page-number" />
      </footer>
    </article>
  );
}

function PrintInfo({ label, value, highlight = false }: { label: string; value: ReactNode; highlight?: boolean }) {
  return (
    <div className={cn("proposal-print-info", highlight && "proposal-print-info-highlight")}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function PrintAlliance({ label, teams, tone }: { label: string; teams: string[]; tone: "red" | "blue" }) {
  return (
    <div className={cn("proposal-print-alliance", tone === "red" ? "proposal-print-red" : "proposal-print-blue")}>
      <strong>{label}</strong>
      <div className="proposal-print-team-row">
        {teams.map((team) => <PrintTeamPill key={team} team={team} />)}
      </div>
    </div>
  );
}

function PrintTeamPill({ team }: { team: string }) {
  return <span className={cn("proposal-print-team-pill", isOwnStrategyTeam(team) && "proposal-print-own-team")}>Team {team}</span>;
}

function PrintTeamDetail({
  team,
  summary,
  pitInfo,
}: {
  team: string;
  summary: TeamSummary | null;
  pitInfo: TeamPitInfo | null;
}) {
  if (!summary) {
    return (
      <div className="proposal-print-team-card">
        <h3><PrintTeamPill team={team} /></h3>
        <p className="proposal-print-muted">当前数据集没有这支队伍的详细数据。</p>
      </div>
    );
  }

  return (
    <div className="proposal-print-team-card">
      <div className="proposal-print-team-card-title">
        <PrintTeamPill team={team} />
        <span>{summary.matchCount} 场</span>
      </div>
      <div className="proposal-print-badges">
        <span>{teamTrendLabel(summary.trend)}</span>
        {pitInfo?.canCrossTrench ? <span>trench</span> : null}
        {pitInfo?.isSwerve ? <span>swerve</span> : null}
        {pitInfo?.drivetrain ? <span>{pitInfo.drivetrain}</span> : null}
      </div>
      <div className="proposal-print-stats">
        <PrintStat label="综合均分" value={formatPrintNumber(summary.avgTotal)} />
        <PrintStat label="自动贡献" value={formatPrintNumber(summary.avgAuto)} />
        <PrintStat label="手动贡献" value={formatPrintNumber(summary.avgTele)} />
        <PrintStat label="Transfer" value={summary.avgTransferPieces ? formatPrintNumber(summary.avgTransferPieces) : "-"} />
        <PrintStat label="平均 BPS" value={summary.avgBps ? formatPrintNumber(summary.avgBps) : "-"} />
        <PrintStat label="命中率" value={summary.avgAccuracy > 0 ? `${formatPrintNumber(summary.avgAccuracy)}%` : "-"} />
        <PrintStat label="可靠性" value={`${formatPrintNumber(reliability(summary))}%`} />
        <PrintStat label="标准差" value={`±${formatPrintNumber(summary.stdDev)}`} />
        <PrintStat label="综合分范围" value={`${formatPrintNumber(summary.minPts)}–${formatPrintNumber(summary.maxPts)}`} />
        <PrintStat label="Drive score" value={formatPrintNumber(summary.avgDriver)} />
        <PrintStat label="Defence score" value={formatPrintNumber(printDefenceScore(summary))} />
      </div>
    </div>
  );
}

function PrintStat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function PrintableProposalMaps({ proposal, match }: { proposal: StrategyProposal; match: ProposalMatch | null }) {
  const payload = proposal.payload;
  if (payload.kind === "self_strategy") {
    const opponents = opponentTeams(match, proposal.ownTeam);
    const teams = [proposal.ownTeam, ...opponents, ...routeTeamsForPayload(payload)].filter(uniqueString);
    return (
      <div className="proposal-print-map-grid">
        {strategyShifts.map((shift) => {
          const current = payload.shifts[shift];
          return (
            <PrintRouteMap
              key={shift}
              title={`我们自己 · ${shiftLabel(shift)}`}
              teams={teams}
              routes={{ ...current.opponentRoutes, [proposal.ownTeam]: current.points }}
              notes={current.note ? [{ label: "备注", value: current.note }] : []}
            />
          );
        })}
      </div>
    );
  }

  if (payload.kind === "partner_strategy") {
    const partners = partnerTeams(match, proposal.ownTeam);
    const opponents = opponentTeams(match, proposal.ownTeam);
    const teams = [...partners, ...payload.partners, ...opponents, ...routeTeamsForPayload(payload)].filter(uniqueString);
    return (
      <div className="proposal-print-map-grid">
        {strategyShifts.map((shift) => {
          const current = payload.shifts[shift];
          return (
            <PrintRouteMap
              key={shift}
              title={`队友策略 · ${shiftLabel(shift)}`}
              teams={teams}
              routes={current.routes}
              notes={partnerMapNotes(payload, current.note)}
            />
          );
        })}
      </div>
    );
  }

  const teams = printMatchTeams(match, proposal);
  const matchPayload = match ? ensureStrategyBoardTeams(payload, match.redTeams, match.blueTeams) : payload;
  return (
    <div className="proposal-print-map-grid">
      {(Object.keys(matchPayload.phases) as StrategyBoardPhaseId[]).map((phase) => (
        <PrintStrategyBoardPhase key={phase} title={strategyBoardPhaseLabel(phase)} phase={matchPayload.phases[phase]} match={match} teams={teams} />
      ))}
    </div>
  );
}

function PrintStrategyBoardPhase({
  title,
  phase,
  match,
  teams,
}: {
  title: string;
  phase: StrategyBoardPhase;
  match: ProposalMatch | null;
  teams: string[];
}) {
  return (
    <div className="proposal-print-map-card">
      <div className="proposal-print-map-head">
        <h3>{title}</h3>
        <div className="proposal-print-map-legend">
          {teams.map((team) => <span key={team}>Team {team}</span>)}
        </div>
      </div>
      <div className="proposal-print-field">
        <img src="/strategy-board-2026.png" alt="" />
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
          {phase.strokes.map((stroke) => (
            <polyline
              key={stroke.id}
              points={stroke.points.map((point) => `${point.x},${point.y}`).join(" ")}
              fill="none"
              stroke={stroke.color}
              strokeWidth="2.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {phase.robots.map((robot) => {
            const red = match?.redTeams.includes(robot.team) ?? false;
            return (
              <g key={robot.team} transform={`translate(${robot.x} ${robot.y}) rotate(${robot.rotation})`}>
                <rect x="-2.171" y="-4.733" width="4.342" height="9.466" rx="0.7" fill={red ? "#ef4444" : "#3b82f6"} />
                <rect x="-1.687" y="-3.678" width="3.374" height="7.356" rx="0.45" fill="#242429" />
                <text x="0" y="0.65" textAnchor="middle" fill="#fff" fontSize="1.8" fontWeight="700">{robot.team}</text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

function PrintRouteMap({
  title,
  teams,
  routes,
  notes,
}: {
  title: string;
  teams: string[];
  routes: RouteMap;
  notes: Array<{ label: string; value: string }>;
}) {
  const orderedTeams = [...teams, ...Object.keys(routes)].filter(uniqueString);
  const hasRoutes = orderedTeams.some((team) => (routes[team] ?? []).length > 0);
  return (
    <div className="proposal-print-map-card">
      <div className="proposal-print-map-head">
        <h3>{title}</h3>
        <div className="proposal-print-map-legend">
          {orderedTeams.map((team, index) => (
            <span key={team}>
              <i style={{ backgroundColor: routeColor(index) }} />
              Team {team}
            </span>
          ))}
        </div>
      </div>
      <div className="proposal-print-field">
        <img src="/pit-field-map.webp" alt="" />
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
          {orderedTeams.map((team, index) => {
            const points = routes[team] ?? [];
            return (
              <g key={team}>
                {routeSegments(points).map((segment, segmentIndex) => (
                  <polyline
                    key={`${team}:${segmentIndex}`}
                    points={segment.map((point) => `${point.x},${point.y}`).join(" ")}
                    fill="none"
                    stroke={routeColor(index)}
                    strokeWidth="2.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
                {points.map((point, pointIndex) => point.start || pointIndex === points.length - 1 ? (
                  <circle
                    key={`${team}:point:${pointIndex}`}
                    cx={point.x}
                    cy={point.y}
                    r={point.start ? 1.7 : 1.2}
                    fill={routeColor(index)}
                    stroke="#fff"
                    strokeWidth="0.6"
                    vectorEffect="non-scaling-stroke"
                  />
                ) : null)}
              </g>
            );
          })}
        </svg>
        {!hasRoutes ? <div className="proposal-print-empty-map">暂无路线</div> : null}
      </div>
      {notes.length ? (
        <div className="proposal-print-notes">
          {notes.map((note) => (
            <p key={`${note.label}:${note.value}`}><strong>{note.label}</strong>{note.value}</p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function PrintProposalNotes({ proposal }: { proposal: StrategyProposal }) {
  const payload = proposal.payload;
  const notes: Array<{ label: string; value: string }> = [];
  if (payload.kind === "match_strategy") {
    notes.push({ label: "预测自动阶段结果", value: autoWinnerLabel(payload.autoWinner) });
    notes.push(...teamNoteRows(payload.teamNotes));
    if (payload.note) notes.push({ label: "整场备注", value: payload.note });
  } else if (payload.kind === "self_strategy") {
    for (const shift of strategyShifts) {
      const note = payload.shifts[shift].note;
      if (note) notes.push({ label: `我们自己 ${shiftLabel(shift)}`, value: note });
    }
  } else {
    notes.push(...teamNoteRows(payload.partnerNotes));
    for (const shift of strategyShifts) {
      const note = payload.shifts[shift].note;
      if (note) notes.push({ label: `队友策略 ${shiftLabel(shift)}`, value: note });
    }
  }

  if (!notes.length) return <p className="proposal-print-muted">暂无备注。</p>;
  return (
    <div className="proposal-print-notes proposal-print-notes-block">
      {notes.map((note) => (
        <p key={`${note.label}:${note.value}`}><strong>{note.label}</strong>{note.value}</p>
      ))}
    </div>
  );
}

function StatusBadge({ status }: { status: StrategyProposalStatus }) {
  return (
    <Badge
      className={cn(
        status === "draft" && "border-line bg-surface-2 text-ink-dim",
        status === "submitted" && "border-info/40 bg-info/10 text-info",
        status === "approved" && "border-ok/40 bg-ok/10 text-ok",
        status === "rejected" && "border-danger/40 bg-danger/10 text-danger",
      )}
    >
      {statusLabel(status)}
    </Badge>
  );
}

function initialEditorState(
  proposal: StrategyProposal | null,
  matches: ProposalMatch[],
  ownTeams: readonly string[],
): EditorState {
  const proposalType: StrategyProposalType = "auto";
  const ownTeam = proposal?.ownTeam ?? ownTeams[0] ?? ownStrategyTeams[0];
  const ownMatches = proposalMatchesForTeam(matches, ownTeam);
  const match = proposal ? proposalMatchForKeyOrFirst(ownMatches, proposal.matchKey) : firstProposalMatchForTeam(matches, ownTeam);
  const payload = proposal?.proposalType === "auto" ? proposal.payload : normalizeProposalPayload("auto", {});
  return {
    id: proposal?.id ?? null,
    proposalType,
    ownTeam,
    matchKey: match?.key ?? proposal?.matchKey ?? "",
    payload: ensureMatchPayload(payload, match),
  };
}

function ensureMatchPayload(payload: StrategyProposalPayload, match: ProposalMatch | null): AutoProposalPayload {
  const matchPayload = payload.kind === "match_strategy"
    ? payload
    : normalizeProposalPayload("auto", {}) as AutoProposalPayload;
  return match
    ? ensureStrategyBoardTeams(matchPayload, match.redTeams, match.blueTeams)
    : matchPayload;
}

function partnerTeams(match: ProposalMatch | null, ownTeam: string) {
  if (!match) return [];
  if (match.redTeams.includes(ownTeam)) return match.redTeams.filter((team) => team !== ownTeam);
  if (match.blueTeams.includes(ownTeam)) return match.blueTeams.filter((team) => team !== ownTeam);
  return [];
}

function opponentTeams(match: ProposalMatch | null, ownTeam: string) {
  if (!match) return [];
  if (match.redTeams.includes(ownTeam)) return match.blueTeams;
  if (match.blueTeams.includes(ownTeam)) return match.redTeams;
  return [];
}

function replaceProposalUrl(searchParams: URLSearchParams, id: string | null, embedded: boolean, routeBase: string) {
  const params = new URLSearchParams(searchParams);
  if (id) params.set("proposal", id);
  else params.delete("proposal");
  if (embedded) params.set("tab", "proposal");
  const search = params.toString();
  const path = embedded ? routeBase : "/strategy-proposal";
  window.history.replaceState(null, "", search ? `${path}?${search}` : path);
}

function proposalTypeLabel(type: StrategyProposalType) {
  if (type === "auto") return "比赛策略";
  if (type === "self_strategy") return "我们自己";
  return "队友策略";
}

function statusLabel(status: StrategyProposalStatus) {
  if (status === "submitted") return "待审核";
  if (status === "approved") return "已通过";
  if (status === "rejected") return "已退回";
  return "草稿";
}

function shiftLabel(shift: StrategyShift) {
  if (shift === "inactive") return "Inactive";
  if (shift === "endgame") return "Endgame";
  return "Active";
}

function strategyBoardPhaseLabel(phase: StrategyBoardPhaseId) {
  if (phase === "auto") return "AUTO";
  if (phase === "transition") return "TRANSITION";
  if (phase === "active") return "ACTIVE";
  return "INACTIVE";
}

function autoWinnerLabel(value: AutoWinner) {
  if (value === "red") return "红方";
  if (value === "blue") return "蓝方";
  if (value === "tie") return "平局";
  return "未知";
}

function printMatchTeams(match: ProposalMatch | null, proposal: StrategyProposal) {
  if (match) return [...match.redTeams, ...match.blueTeams];
  return [proposal.ownTeam, ...routeTeamsForPayload(proposal.payload)].filter(uniqueString);
}

function routeTeamsForPayload(payload: StrategyProposalPayload) {
  const teams: string[] = [];
  function addRoutes(routes: RouteMap) {
    teams.push(...Object.keys(routes));
  }

  if (payload.kind === "match_strategy") {
    for (const phase of Object.values(payload.phases)) teams.push(...phase.robots.map((robot) => robot.team));
    teams.push(...Object.keys(payload.teamNotes));
  } else if (payload.kind === "self_strategy") {
    for (const shift of strategyShifts) addRoutes(payload.shifts[shift].opponentRoutes);
  } else {
    teams.push(...payload.partners, ...Object.keys(payload.partnerNotes));
    for (const shift of strategyShifts) addRoutes(payload.shifts[shift].routes);
  }

  return teams.filter(uniqueString);
}

function teamNoteRows(notes: Record<string, string>) {
  return Object.entries(notes)
    .filter(([, note]) => note.trim())
    .map(([team, note]) => ({ label: `Team ${team}`, value: note.trim() }));
}

function partnerMapNotes(payload: PartnerStrategyPayload, shiftNote: string) {
  return [...teamNoteRows(payload.partnerNotes), ...(shiftNote ? [{ label: "备注", value: shiftNote }] : [])];
}

function isOwnStrategyTeam(team: string) {
  return (ownStrategyTeams as readonly string[]).includes(team);
}

function uniqueString(value: string, index: number, values: string[]) {
  return Boolean(value) && values.indexOf(value) === index;
}

function formatPrintNumber(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, "");
}

function printDefenceScore(team: TeamSummary) {
  return team.avgDefense || averagePositive(team.matches.map((match) => match.defenseRating));
}

function averagePositive(values: number[]) {
  const positive = values.filter((value) => value > 0);
  if (!positive.length) return 0;
  return Math.round((positive.reduce((sum, value) => sum + value, 0) / positive.length) * 10) / 10;
}

function teamTrendLabel(trend: TeamSummary["trend"]) {
  return trend === "up" ? "趋势上升" : trend === "down" ? "趋势下降" : "趋势稳定";
}

function routeSegments(points: RoutePoint[]) {
  const segments: RoutePoint[][] = [];
  for (const point of points) {
    if (point.start || !segments.length) segments.push([point]);
    else segments[segments.length - 1].push(point);
  }
  return segments.filter((segment) => segment.length > 1);
}

function routeColor(index: number) {
  const colors = ["#ef4444", "#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899"];
  return colors[((index % colors.length) + colors.length) % colors.length];
}

const PROPOSAL_PRINT_CSS = `
.proposal-print-root {
  position: fixed;
  left: -10000px;
  top: 0;
  width: 210mm;
  height: 1px;
  overflow: hidden;
  background: #fff;
  color: #111827;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

.proposal-print-root * {
  box-sizing: border-box;
}

@page {
  size: A4;
  margin: 12mm 10mm 18mm;
  @bottom-center {
    content: "NI Robotics · Cyber Strategy · " counter(page) " / " counter(pages);
    color: #6b7280;
    font-size: 8.5px;
  }
}

@media print {
  html,
  body {
    background: #fff !important;
  }

  body * {
    visibility: hidden !important;
  }

  .proposal-print-root,
  .proposal-print-root * {
    visibility: visible !important;
  }

  .proposal-print-root {
    position: absolute !important;
    left: 0 !important;
    top: 0 !important;
    width: 100% !important;
    height: auto !important;
    overflow: visible !important;
  }

  .proposal-print-page {
    position: relative;
    min-height: 260mm;
    padding: 0;
    page-break-after: always;
    color: #111827;
    background: #fff;
  }

  .proposal-print-page:last-child {
    page-break-after: auto;
  }

  .proposal-print-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding-bottom: 8px;
    border-bottom: 1px solid #d1d5db;
  }

  .proposal-print-brand {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .proposal-print-brand img {
    width: 34px;
    height: 34px;
    object-fit: contain;
  }

  .proposal-print-brand p,
  .proposal-print-title p {
    margin: 0;
    color: #6b7280;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: .12em;
    text-transform: uppercase;
  }

  .proposal-print-brand strong {
    display: block;
    font-size: 15px;
    line-height: 1.2;
  }

  .proposal-print-meta {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 2px;
    color: #6b7280;
    font-size: 9px;
  }

  .proposal-print-title {
    margin: 12px 0 10px;
  }

  .proposal-print-title h1 {
    margin: 2px 0 0;
    font-size: 24px;
    line-height: 1.15;
  }

  .proposal-print-section {
    margin-top: 12px;
  }

  .proposal-print-section h2 {
    margin: 0 0 6px;
    color: #374151;
    font-size: 13px;
    letter-spacing: .08em;
    text-transform: uppercase;
  }

  .proposal-print-break-before {
    page-break-before: auto;
  }

  .proposal-print-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 6px;
  }

  .proposal-print-info,
  .proposal-print-team-card,
  .proposal-print-map-card,
  .proposal-print-alliance,
  .proposal-print-notes-block {
    border: 1px solid #d1d5db;
    border-radius: 6px;
    background: #fff;
  }

  .proposal-print-info {
    padding: 7px 8px;
  }

  .proposal-print-info span,
  .proposal-print-stats span {
    display: block;
    color: #6b7280;
    font-size: 8.5px;
    font-weight: 700;
    letter-spacing: .06em;
    text-transform: uppercase;
  }

  .proposal-print-info strong {
    display: block;
    margin-top: 2px;
    font-size: 12px;
  }

  .proposal-print-info-highlight {
    border-color: #8b5cf6;
    background: #f5f3ff;
  }

  .proposal-print-alliances {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  .proposal-print-alliance {
    padding: 8px;
  }

  .proposal-print-alliance > strong {
    display: block;
    margin-bottom: 6px;
    font-size: 11px;
  }

  .proposal-print-red > strong {
    color: #dc2626;
  }

  .proposal-print-blue > strong {
    color: #2563eb;
  }

  .proposal-print-team-row,
  .proposal-print-badges,
  .proposal-print-map-legend {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
  }

  .proposal-print-team-pill,
  .proposal-print-badges span,
  .proposal-print-map-legend span {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    border-radius: 999px;
    border: 1px solid #d1d5db;
    padding: 2px 7px;
    color: #374151;
    font-size: 10px;
    font-weight: 700;
    white-space: nowrap;
  }

  .proposal-print-own-team {
    border-color: #8b5cf6;
    background: #ede9fe;
    color: #6d28d9;
  }

  .proposal-print-team-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  .proposal-print-team-card {
    break-inside: avoid;
    padding: 8px;
  }

  .proposal-print-team-card h3 {
    margin: 0;
  }

  .proposal-print-team-card-title {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 6px;
  }

  .proposal-print-team-card-title > span {
    color: #6b7280;
    font-size: 10px;
  }

  .proposal-print-badges {
    margin-bottom: 6px;
  }

  .proposal-print-badges span {
    padding: 1px 6px;
    font-size: 8.5px;
    font-weight: 600;
  }

  .proposal-print-stats {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 5px;
  }

  .proposal-print-stats div {
    min-width: 0;
    border-radius: 5px;
    background: #f9fafb;
    padding: 5px;
  }

  .proposal-print-stats strong {
    display: block;
    margin-top: 1px;
    overflow: hidden;
    color: #111827;
    font-size: 11px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .proposal-print-map-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .proposal-print-map-card {
    break-inside: avoid;
    overflow: hidden;
  }

  .proposal-print-map-head {
    display: grid;
    gap: 5px;
    padding: 8px;
    border-bottom: 1px solid #e5e7eb;
  }

  .proposal-print-map-head h3 {
    margin: 0;
    font-size: 12px;
  }

  .proposal-print-map-legend span {
    border: 0;
    padding: 0;
    font-size: 8.5px;
    font-weight: 600;
  }

  .proposal-print-map-legend i {
    display: inline-block;
    width: 7px;
    height: 7px;
    border-radius: 999px;
  }

  .proposal-print-field {
    position: relative;
    aspect-ratio: 3510 / 1610;
    background: #000;
  }

  .proposal-print-field img,
  .proposal-print-field svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }

  .proposal-print-field img {
    object-fit: fill;
  }

  .proposal-print-empty-map {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    color: #6b7280;
    font-size: 12px;
    font-weight: 700;
    background: rgba(255, 255, 255, .58);
  }

  .proposal-print-notes {
    display: grid;
    gap: 4px;
    padding: 7px 8px;
    color: #374151;
    font-size: 10px;
    line-height: 1.35;
  }

  .proposal-print-notes p {
    margin: 0;
  }

  .proposal-print-notes strong {
    margin-right: 6px;
    color: #111827;
  }

  .proposal-print-muted {
    margin: 0;
    color: #6b7280;
    font-size: 11px;
  }

  .proposal-print-footer {
    position: fixed;
    right: 10mm;
    bottom: 6mm;
    left: 10mm;
    display: flex;
    align-items: center;
    justify-content: space-between;
    color: #6b7280;
    font-size: 8.5px;
  }

  .proposal-print-page-number::after {
    content: counter(page) " / " counter(pages);
  }
}
`;
