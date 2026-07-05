import {
  CheckCircle2,
  Eye,
  Plus,
  Save,
  Send,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import { useEffect, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { useFetcher, useNavigate, useNavigation, useSearchParams } from "react-router";
import { PhotoLightbox, TeamDetailModal } from "./analytics-dashboard";
import { StrategyNavigation } from "./strategy-navigation";
import { Badge, Button, Card, cn } from "./ui";
import type { SessionUser } from "../lib/auth-types";
import { type ScoutingDataset, type ScoutingEventOption } from "../lib/scouting";
import {
  firstProposalMatchForTeam,
  proposalMatchForKeyOrFirst,
  proposalMatchIncludesTeam,
  proposalMatchesForTeam,
  proposalMatchMatchesTeamQuery,
  type ProposalMatch,
} from "../lib/strategy-proposal-matches";
import {
  autoWinners,
  canDeleteProposalAs,
  canEditProposalAs,
  canRestoreApprovedSnapshot,
  canReviewProposal,
  proposalMatchesSnapshot,
  proposalMatchesOwnTeamQuery,
  normalizeProposalPayload,
  ownStrategyTeams,
  proposalStatuses,
  proposalTypes,
  strategyShifts,
  type AutoProposalPayload,
  type AutoWinner,
  type OwnStrategyTeam,
  type PartnerStrategyPayload,
  type RouteMap,
  type SelfStrategyPayload,
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

type TeamGroup = { label: string; tone: "red" | "blue" | "neutral"; teams: string[] };
type EditorState = {
  id: string | null;
  proposalType: StrategyProposalType;
  ownTeam: OwnStrategyTeam;
  matchKey: string;
  payload: StrategyProposalPayload;
};

export function StrategyProposalPanel({
  data,
  initialSelectedId,
  embedded = false,
}: {
  data: StrategyProposalPanelData;
  initialSelectedId: string | null;
  embedded?: boolean;
}) {
  const navigate = useNavigate();
  const navigation = useNavigation();
  const proposalFetcher = useFetcher<StrategyProposalActionData>();
  const [searchParams] = useSearchParams();
  const actionData = proposalFetcher.data;
  const [typeFilter, setTypeFilter] = useState<StrategyProposalType | "all">("all");
  const [statusFilter, setStatusFilter] = useState<StrategyProposalStatus | "all">("all");
  const [matchFilter, setMatchFilter] = useState("all");
  const [teamFilter, setTeamFilter] = useState("");
  const [selectedId, setSelectedId] = useState(initialSelectedId);
  const [detailTeam, setDetailTeam] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<{ team: string; index: number } | null>(null);
  const selected = data.proposals.find((proposal) => proposal.id === selectedId) ?? null;
  const [editor, setEditor] = useState(() => initialEditorState(selected, data.matches, data.dataset));
  const busy = navigation.state !== "idle" || proposalFetcher.state !== "idle";
  const editorMatches = proposalMatchesForTeam(data.matches, editor.ownTeam);
  const selectedMatch = proposalMatchForKeyOrFirst(editorMatches, editor.matchKey);
  const matchKeyValue = selectedMatch?.key ?? editor.matchKey;
  const matchLabelValue = selectedMatch?.label ?? editor.matchKey;
  const allMatchTeams = selectedMatch ? [...selectedMatch.redTeams, ...selectedMatch.blueTeams] : [];
  const editable = canEditProposalAs(selected, data.user.feishuOpenId, data.isAdmin);
  const deletable = canDeleteProposalAs(selected, data.user.feishuOpenId, data.isAdmin);
  const reviewer = canReviewProposal(selected, data.isAdmin);
  const restorable = canRestoreApprovedSnapshot(selected, data.user.feishuOpenId, data.isAdmin);
  const adminEditingApproved = Boolean(selected?.status === "approved" && data.isAdmin);
  const teamFilterDigits = teamFilter.replace(/\D/g, "");
  const matchFilterOptions = data.matches.filter((match) => proposalMatchMatchesTeamQuery(match, teamFilter));
  const approvedEditorChanged = Boolean(selected?.status === "approved" && !proposalMatchesSnapshot({
    ...selected,
    matchKey: matchKeyValue,
    matchLabel: matchLabelValue,
    ownTeam: editor.ownTeam,
    proposalType: editor.proposalType,
    payload: editor.payload,
  }));
  const filteredProposals = data.proposals.filter((proposal) =>
    (typeFilter === "all" || proposal.proposalType === typeFilter) &&
    (statusFilter === "all" || proposal.status === statusFilter) &&
    (matchFilter === "all" || proposal.matchKey === matchFilter) &&
    proposalMatchesOwnTeamQuery(proposal, teamFilterDigits)
  );
  const teamDetail = detailTeam ? data.dataset.teamData[detailTeam] : null;

  useEffect(() => {
    if (!proposalFetcher.data?.ok) return;
    if (proposalFetcher.data.deleted) {
      const timeout = window.setTimeout(() => {
        setSelectedId(null);
        setEditor(initialEditorState(null, data.matches, data.dataset));
        replaceProposalUrl(searchParams, null, embedded);
      }, 0);
      return () => window.clearTimeout(timeout);
    }
    if (!proposalFetcher.data.proposalId) return;
    const proposalId = proposalFetcher.data.proposalId;
    const timeout = window.setTimeout(() => {
      setSelectedId(proposalId);
      setEditor((current) => ({ ...current, id: proposalId }));
      replaceProposalUrl(searchParams, proposalId, embedded);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [proposalFetcher.data, searchParams, data.matches, data.dataset, embedded]);

  function selectEvent(eventKey: string) {
    const params = new URLSearchParams(searchParams);
    params.set("event", eventKey);
    params.delete("proposal");
    if (embedded) params.set("tab", "proposal");
    navigate(`${embedded ? "/" : "/strategy-proposal"}?${params.toString()}`);
  }

  function newProposal() {
    setSelectedId(null);
    setEditor(initialEditorState(null, data.matches, data.dataset));
    replaceProposalUrl(searchParams, null, embedded);
  }

  function openProposal(id: string) {
    const proposal = data.proposals.find((item) => item.id === id) ?? null;
    setSelectedId(id);
    setEditor(initialEditorState(proposal, data.matches, data.dataset));
    replaceProposalUrl(searchParams, id, embedded);
  }

  function updateType(type: StrategyProposalType) {
    setEditor((current) => ({
      ...current,
      proposalType: type,
      payload: emptyPayload(type, current.ownTeam, allMatchTeams, partnerTeams(selectedMatch, current.ownTeam)),
    }));
  }

  function updateOwnTeam(ownTeam: OwnStrategyTeam) {
    setEditor((current) => {
      const currentMatch = data.matches.find((item) => item.key === current.matchKey) ?? null;
      const nextMatch = currentMatch && proposalMatchIncludesTeam(currentMatch, ownTeam)
        ? currentMatch
        : firstProposalMatchForTeam(data.matches, ownTeam);
      const teams = nextMatch ? [...nextMatch.redTeams, ...nextMatch.blueTeams] : [];
      return {
        ...current,
        ownTeam,
        matchKey: nextMatch?.key ?? "",
        payload: current.payload.kind === "partner_strategy"
          ? ensurePartnerPayload(current.payload, partnerTeams(nextMatch, ownTeam))
          : current.payload.kind === "auto"
            ? ensureAutoPayload(current.payload, teams)
            : current.payload,
      };
    });
  }

  function updateMatch(matchKey: string) {
    const match = data.matches.find((item) => item.key === matchKey) ?? null;
    const teams = match ? [...match.redTeams, ...match.blueTeams] : [];
    setEditor((current) => ({
      ...current,
      matchKey,
      payload: current.payload.kind === "partner_strategy"
        ? ensurePartnerPayload(current.payload, partnerTeams(match, current.ownTeam))
        : current.payload.kind === "auto"
          ? ensureAutoPayload(current.payload, teams)
          : current.payload,
    }));
  }

  function updateTeamFilter(value: string) {
    setTeamFilter(value);
    const selectedMatchFilter = data.matches.find((match) => match.key === matchFilter) ?? null;
    if (selectedMatchFilter && !proposalMatchMatchesTeamQuery(selectedMatchFilter, value)) setMatchFilter("all");
  }

  return (
    <div className="mx-auto grid w-full max-w-[1500px] gap-3">
      {!embedded ? <div className="flex flex-col gap-3 rounded-card border border-line bg-surface p-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <p className="section-label">Strategy Proposal</p>
          <p className="mt-1 text-sm text-ink-dim">
            {data.selectedEventKey} · {data.proposals.length} 个 proposal · {data.matches.length} 场比赛
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
              <p className="section-label">Proposal</p>
              <h2 className="text-lg font-semibold text-ink">列表</h2>
            </div>
            <Button type="button" variant={!selected ? "active" : "default"} onClick={newProposal}>
              <Plus className="size-4" />
              新建
            </Button>
          </div>
          <div className="grid gap-2 border-b border-line p-3">
            <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as StrategyProposalType | "all")} className="input h-9 font-sans">
              <option value="all">所有类型</option>
              {proposalTypes.map((type) => <option key={type} value={type}>{proposalTypeLabel(type)}</option>)}
            </select>
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
              <div className="p-6 text-center text-sm text-ink-dim">暂无 proposal。</div>
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
              <h2 className="text-lg font-semibold text-ink">{selected ? "编辑 Proposal" : "新建 Proposal"}</h2>
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

          <proposalFetcher.Form method="post" action="/strategy-proposal" className="grid gap-4 p-3 md:p-4">
            <input type="hidden" name="id" value={editor.id ?? ""} />
            <input type="hidden" name="eventKey" value={data.selectedEventKey} />
            <input type="hidden" name="matchLabel" value={matchLabelValue} />
            <input type="hidden" name="proposalType" value={editor.proposalType} />
            <input type="hidden" name="payload" value={JSON.stringify(editor.payload)} />

            <div className="grid gap-3 lg:grid-cols-[160px_160px_minmax(0,1fr)]">
              <label className="grid gap-1">
                <span className="text-sm font-medium text-ink-dim">类型</span>
                <select
                  value={editor.proposalType}
                  disabled={!editable || Boolean(editor.id)}
                  onChange={(event) => updateType(event.target.value as StrategyProposalType)}
                  className="input h-10 font-sans"
                >
                  {proposalTypes.map((type) => <option key={type} value={type}>{proposalTypeLabel(type)}</option>)}
                </select>
              </label>
              <label className="grid gap-1">
                <span className="text-sm font-medium text-ink-dim">己方队伍</span>
                <select
                  name="ownTeam"
                  value={editor.ownTeam}
                  disabled={!editable}
                  onChange={(event) => updateOwnTeam(event.target.value as OwnStrategyTeam)}
                  className="input h-10 font-sans"
                >
                  {ownStrategyTeams.map((team) => <option key={team} value={team}>Team {team}</option>)}
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
                当前赛事没有 Team {editor.ownTeam} 的 TBA 赛程，暂不能创建 proposal。
              </div>
            ) : (
              <MatchTeamsBar match={selectedMatch} activeTeam={editor.ownTeam} onOpenTeam={setDetailTeam} dataset={data.dataset} />
            )}

            <PayloadEditor
              proposalType={editor.proposalType}
              ownTeam={editor.ownTeam}
              match={selectedMatch}
              payload={editor.payload}
              teamData={data.dataset.teamData}
              disabled={!editable}
              onOpenTeam={setDetailTeam}
              onChange={(payload) => setEditor((current) => ({ ...current, payload }))}
            />

            <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-3">
              {deletable ? (
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
              {restorable ? (
                <Button type="submit" name="intent" value="restore" disabled={busy}>
                  <Undo2 className="size-4" />
                  恢复到已通过版本
                </Button>
              ) : null}
              {editable ? (
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
              ) : (
                <span className="text-sm text-ink-dim">当前状态不可编辑。</span>
              )}
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

      {teamDetail ? (
        <TeamDetailModal
          team={teamDetail}
          photos={data.dataset.teamPhotos[teamDetail.team] ?? []}
          pitInfo={data.dataset.teamPitData?.[teamDetail.team]}
          onOpenPhoto={(index) => setLightbox({ team: teamDetail.team, index })}
          onClose={() => setDetailTeam(null)}
        />
      ) : null}
      {lightbox ? (
        <PhotoLightbox
          photos={data.dataset.teamPhotos[lightbox.team] ?? []}
          index={lightbox.index}
          onChange={(index) => setLightbox({ ...lightbox, index })}
          onClose={() => setLightbox(null)}
        />
      ) : null}
    </div>
  );
}

function PayloadEditor({
  proposalType,
  ownTeam,
  match,
  payload,
  teamData,
  disabled,
  onOpenTeam,
  onChange,
}: {
  proposalType: StrategyProposalType;
  ownTeam: OwnStrategyTeam;
  match: ProposalMatch | null;
  payload: StrategyProposalPayload;
  teamData: ScoutingDataset["teamData"];
  disabled: boolean;
  onOpenTeam: (team: string) => void;
  onChange: (payload: StrategyProposalPayload) => void;
}) {
  const matchTeamList = match ? [...match.redTeams, ...match.blueTeams] : [];
  if (proposalType === "self_strategy") {
    return (
      <SelfStrategyEditor
        payload={payload.kind === "self_strategy" ? payload : emptySelfPayload()}
        ownTeam={ownTeam}
        teamData={teamData}
        disabled={disabled}
        onOpenTeam={onOpenTeam}
        onChange={onChange}
      />
    );
  }

  if (proposalType === "partner_strategy") {
    const partners = partnerTeams(match, ownTeam);
    return (
      <PartnerStrategyEditor
        payload={payload.kind === "partner_strategy" ? ensurePartnerPayload(payload, partners) : emptyPartnerPayload(partners)}
        partners={partners}
        teamData={teamData}
        disabled={disabled}
        onOpenTeam={onOpenTeam}
        onChange={onChange}
      />
    );
  }

  return (
    <AutoProposalEditor
      payload={payload.kind === "auto" ? ensureAutoPayload(payload, matchTeamList) : emptyAutoPayload(matchTeamList)}
      match={match}
      teamData={teamData}
      disabled={disabled}
      onOpenTeam={onOpenTeam}
      onChange={onChange}
    />
  );
}

function AutoProposalEditor({
  payload,
  match,
  teamData,
  disabled,
  onOpenTeam,
  onChange,
}: {
  payload: AutoProposalPayload;
  match: ProposalMatch | null;
  teamData: ScoutingDataset["teamData"];
  disabled: boolean;
  onOpenTeam: (team: string) => void;
  onChange: (payload: AutoProposalPayload) => void;
}) {
  const teams = match ? [...match.redTeams, ...match.blueTeams] : [];
  const teamGroups = match ? allianceGroups(match) : undefined;
  const [activeAutoTeam, setActiveAutoTeam] = useState(teams[0] ?? "");
  const [activeTransitionTeam, setActiveTransitionTeam] = useState(teams[0] ?? "");
  const resolvedAutoTeam = teams.includes(activeAutoTeam) ? activeAutoTeam : teams[0] ?? "";
  const resolvedTransitionTeam = teams.includes(activeTransitionTeam) ? activeTransitionTeam : teams[0] ?? "";

  return (
    <div className="grid gap-4">
      <label className="grid max-w-xs gap-1">
        <span className="text-sm font-medium text-ink-dim">预测 Auto 结果</span>
        <select
          value={payload.autoWinner}
          disabled={disabled}
          onChange={(event) => onChange({ ...payload, autoWinner: event.target.value as AutoWinner })}
          className="input h-10 font-sans"
        >
          {autoWinners.map((winner) => <option key={winner} value={winner}>{autoWinnerLabel(winner)}</option>)}
        </select>
      </label>
      <RoutePlanner
        title="Auto 路线"
        teams={teams}
        teamGroups={teamGroups}
        activeTeam={resolvedAutoTeam}
        routes={payload.autoRoutes}
        disabled={disabled}
        teamData={teamData}
        onActiveTeam={setActiveAutoTeam}
        onOpenTeam={onOpenTeam}
        onRoutesChange={(autoRoutes) => onChange({ ...payload, autoRoutes })}
      />
      <RoutePlanner
        title="Transition 路线"
        teams={teams}
        teamGroups={teamGroups}
        activeTeam={resolvedTransitionTeam}
        routes={payload.transitionRoutes}
        disabled={disabled}
        teamData={teamData}
        onActiveTeam={setActiveTransitionTeam}
        onOpenTeam={onOpenTeam}
        onRoutesChange={(transitionRoutes) => onChange({ ...payload, transitionRoutes })}
      />
      <TeamNoteRows
        title="队伍备注"
        teams={teams}
        notes={payload.teamNotes}
        disabled={disabled}
        onChange={(teamNotes) => onChange({ ...payload, teamNotes })}
      />
      <NoteBox value={payload.note} disabled={disabled} onChange={(note) => onChange({ ...payload, note })} />
    </div>
  );
}

function SelfStrategyEditor({
  payload,
  ownTeam,
  teamData,
  disabled,
  onOpenTeam,
  onChange,
}: {
  payload: SelfStrategyPayload;
  ownTeam: string;
  teamData: ScoutingDataset["teamData"];
  disabled: boolean;
  onOpenTeam: (team: string) => void;
  onChange: (payload: SelfStrategyPayload) => void;
}) {
  const [shift, setShift] = useState<StrategyShift>("active");
  const current = payload.shifts[shift];
  return (
    <ShiftSection activeShift={shift} onShift={setShift}>
      <RoutePlanner
        title={`${shiftLabel(shift)} 路线`}
        teams={[ownTeam]}
        activeTeam={ownTeam}
        routes={{ [ownTeam]: current.points }}
        disabled={disabled}
        teamData={teamData}
        onActiveTeam={() => undefined}
        onOpenTeam={onOpenTeam}
        onRoutesChange={(routes) => onChange({
          ...payload,
          shifts: { ...payload.shifts, [shift]: { ...current, points: routes[ownTeam] ?? [] } },
        })}
      />
      <NoteBox value={current.note} disabled={disabled} onChange={(note) => onChange({ ...payload, shifts: { ...payload.shifts, [shift]: { ...current, note } } })} />
    </ShiftSection>
  );
}

function PartnerStrategyEditor({
  payload,
  partners,
  teamData,
  disabled,
  onOpenTeam,
  onChange,
}: {
  payload: PartnerStrategyPayload;
  partners: string[];
  teamData: ScoutingDataset["teamData"];
  disabled: boolean;
  onOpenTeam: (team: string) => void;
  onChange: (payload: PartnerStrategyPayload) => void;
}) {
  const [shift, setShift] = useState<StrategyShift>("active");
  const [activeTeam, setActiveTeam] = useState(partners[0] ?? "");
  const current = payload.shifts[shift];
  const resolvedActiveTeam = partners.includes(activeTeam) ? activeTeam : partners[0] ?? "";

  return (
    <ShiftSection activeShift={shift} onShift={setShift}>
      {!partners.length ? (
        <div className="rounded-md border border-warn/40 bg-warn/10 p-3 text-sm text-warn">
          所选己方队伍不在当前比赛中，无法自动识别队友。
        </div>
      ) : null}
      <RoutePlanner
        title={`${shiftLabel(shift)} 队友共享地图`}
        teams={partners}
        activeTeam={resolvedActiveTeam}
        routes={current.routes}
        disabled={disabled}
        teamData={teamData}
        onActiveTeam={setActiveTeam}
        onOpenTeam={onOpenTeam}
        onRoutesChange={(routes) => onChange({ ...payload, partners, shifts: { ...payload.shifts, [shift]: { ...current, routes } } })}
      />
      <TeamNoteRows
        title="队友备注"
        teams={partners}
        notes={payload.partnerNotes}
        disabled={disabled}
        onChange={(partnerNotes) => onChange({ ...payload, partners, partnerNotes })}
      />
      <NoteBox value={current.note} disabled={disabled} onChange={(note) => onChange({ ...payload, partners, shifts: { ...payload.shifts, [shift]: { ...current, note } } })} />
    </ShiftSection>
  );
}

function TeamNoteRows({
  title,
  teams,
  notes,
  disabled,
  onChange,
}: {
  title: string;
  teams: string[];
  notes: Record<string, string>;
  disabled: boolean;
  onChange: (notes: Record<string, string>) => void;
}) {
  if (!teams.length) return null;
  return (
    <div className="grid gap-2 rounded-md border border-line bg-surface-2 p-3">
      <p className="section-label">{title}</p>
      <div className="grid gap-2 md:grid-cols-2">
        {teams.map((team) => (
          <label key={team} className="grid gap-1">
            <span className="text-sm font-medium text-ink-dim">Team {team}</span>
            <input
              value={notes[team] ?? ""}
              disabled={disabled}
              onChange={(event) => onChange({ ...notes, [team]: event.target.value })}
              className="input h-10 font-sans"
              placeholder="备注"
            />
          </label>
        ))}
      </div>
    </div>
  );
}

function ShiftSection({ activeShift, onShift, children }: { activeShift: StrategyShift; onShift: (shift: StrategyShift) => void; children: ReactNode }) {
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-2">
        {strategyShifts.map((shift) => (
          <Button key={shift} type="button" variant={activeShift === shift ? "active" : "default"} onClick={() => onShift(shift)}>
            {shiftLabel(shift)}
          </Button>
        ))}
      </div>
      {children}
    </div>
  );
}

function RoutePlanner({
  title,
  teams,
  teamGroups,
  activeTeam,
  routes,
  disabled,
  teamData,
  onActiveTeam,
  onOpenTeam,
  onRoutesChange,
}: {
  title: string;
  teams: string[];
  teamGroups?: TeamGroup[];
  activeTeam: string;
  routes: RouteMap;
  disabled: boolean;
  teamData: ScoutingDataset["teamData"];
  onActiveTeam: (team: string) => void;
  onOpenTeam: (team: string) => void;
  onRoutesChange: (routes: RouteMap) => void;
}) {
  const displayGroups = teamGroups?.length ? teamGroups : [{ label: "队伍", tone: "neutral" as const, teams }];
  const orderedTeams = displayGroups.flatMap((group) => group.teams);
  const activePoints = routes[activeTeam] ?? [];

  function addPoint(event: ReactMouseEvent<HTMLButtonElement>) {
    if (disabled || !activeTeam) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const point = {
      x: Math.round(((event.clientX - rect.left) / rect.width) * 1000) / 10,
      y: Math.round(((event.clientY - rect.top) / rect.height) * 1000) / 10,
    };
    if (point.x < 0 || point.x > 100 || point.y < 0 || point.y > 100) return;
    onRoutesChange({ ...routes, [activeTeam]: [...activePoints, point] });
  }

  function undo() {
    onRoutesChange({ ...routes, [activeTeam]: activePoints.slice(0, -1) });
  }

  function clear() {
    onRoutesChange({ ...routes, [activeTeam]: [] });
  }

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line p-3">
        <div>
          <p className="section-label">{title}</p>
          <h3 className="text-base font-semibold text-ink">{activeTeam ? `编辑 Team ${activeTeam}` : "请选择队伍"}</h3>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={undo} disabled={disabled || !activePoints.length}>
            <Undo2 className="size-4" />
            撤销
          </Button>
          <Button type="button" onClick={clear} disabled={disabled || !activePoints.length}>
            <Trash2 className="size-4" />
            清空
          </Button>
        </div>
      </div>
      <div className="grid gap-3 p-3">
        <div className="grid gap-2">
          {displayGroups.map((group) => (
            <div key={group.label} className="flex flex-wrap items-center gap-2">
              <Badge
                className={cn(
                  group.tone === "red" && "border-danger/40 bg-danger/10 text-danger",
                  group.tone === "blue" && "border-info/40 bg-info/10 text-info",
                  group.tone === "neutral" && "border-line bg-surface-2 text-ink-dim",
                )}
              >
                {group.label}
              </Badge>
              {group.teams.map((team) => {
                const index = orderedTeams.indexOf(team);
                const active = activeTeam === team;
                return (
                  <div
                    key={team}
                    className={cn(
                      "flex items-center overflow-hidden rounded-md border border-line bg-surface-2 transition",
                      active && "border-brand bg-brand/10 text-brand ring-2 ring-brand/30",
                    )}
                  >
                    <button
                      type="button"
                      className={cn("px-2 py-1 text-sm font-semibold text-ink", active && "text-brand")}
                      onClick={() => onActiveTeam(team)}
                    >
                      <span className="mr-1 inline-block size-2 rounded-full" style={{ backgroundColor: routeColor(index) }} />
                      Team {team}
                    </button>
                    <button type="button" className="border-l border-line px-2 py-1 text-ink-faint hover:text-ink" title="查看队伍详情" onClick={() => onOpenTeam(team)} disabled={!teamData[team]}>
                      <Eye className="size-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <button
          type="button"
          className={cn("relative aspect-[2/1] overflow-hidden rounded-md border border-line bg-surface-2", !disabled && activeTeam && "cursor-crosshair")}
          onClick={addPoint}
          disabled={disabled || !activeTeam}
          aria-label={title}
        >
          <img src="/pit-field-map.webp" alt="" className="absolute inset-0 h-full w-full object-fill" />
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden>
            {orderedTeams.map((team, index) => {
              const points = routes[team] ?? [];
              if (points.length < 2) return null;
              return (
                <polyline
                  key={team}
                  points={points.map((point) => `${point.x},${point.y}`).join(" ")}
                  fill="none"
                  stroke={routeColor(index)}
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
              );
            })}
          </svg>
          {orderedTeams.flatMap((team, teamIndex) => (routes[team] ?? []).map((point, pointIndex) => (
            <span
              key={`${team}-${point.x}-${point.y}-${pointIndex}`}
              className="absolute grid size-5 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-white text-[10px] font-bold text-white shadow-sm"
              style={{ left: `${point.x}%`, top: `${point.y}%`, backgroundColor: routeColor(teamIndex) }}
            >
              {pointIndex + 1}
            </span>
          )))}
        </button>
      </div>
    </Card>
  );
}

function MatchTeamsBar({ match, activeTeam, onOpenTeam, dataset }: { match: ProposalMatch; activeTeam: string; onOpenTeam: (team: string) => void; dataset: ScoutingDataset }) {
  return (
    <div className="grid gap-2 rounded-md border border-line bg-surface-2 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge className="border-danger/40 bg-danger/10 text-danger">Red</Badge>
        {match.redTeams.map((team) => <TeamChip key={team} team={team} active={team === activeTeam} onOpenTeam={onOpenTeam} disabled={!dataset.teamData[team]} />)}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge className="border-info/40 bg-info/10 text-info">Blue</Badge>
        {match.blueTeams.map((team) => <TeamChip key={team} team={team} active={team === activeTeam} onOpenTeam={onOpenTeam} disabled={!dataset.teamData[team]} />)}
      </div>
    </div>
  );
}

function TeamChip({ team, active, onOpenTeam, disabled }: { team: string; active: boolean; onOpenTeam: (team: string) => void; disabled: boolean }) {
  return (
    <button
      type="button"
      onClick={() => onOpenTeam(team)}
      disabled={disabled}
      className={cn("rounded-md border px-2 py-1 text-sm font-semibold", active ? "border-brand bg-brand/10 text-brand" : "border-line bg-surface text-ink-dim", disabled && "opacity-50")}
      title={disabled ? "暂无队伍详情" : "查看队伍详情"}
    >
      Team {team}
    </button>
  );
}

function NoteBox({ value, disabled, onChange }: { value: string; disabled: boolean; onChange: (value: string) => void }) {
  return (
    <label className="grid gap-1">
      <span className="text-sm font-medium text-ink-dim">备注</span>
      <textarea value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} className="input min-h-24 font-sans" />
    </label>
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

function initialEditorState(proposal: StrategyProposal | null, matches: ProposalMatch[], dataset: ScoutingDataset): EditorState {
  const proposalType = proposal?.proposalType ?? "auto";
  const ownTeam = proposal?.ownTeam ?? "8214";
  const ownMatches = proposalMatchesForTeam(matches, ownTeam);
  const match = proposal ? proposalMatchForKeyOrFirst(ownMatches, proposal.matchKey) : firstProposalMatchForTeam(matches, ownTeam);
  const teams = match ? [...match.redTeams, ...match.blueTeams] : Object.keys(dataset.teamData).slice(0, 6);
  return {
    id: proposal?.id ?? null,
    proposalType,
    ownTeam,
    matchKey: match?.key ?? proposal?.matchKey ?? "",
    payload: proposal?.payload ?? emptyPayload(proposalType, ownTeam, teams, partnerTeams(match ?? null, ownTeam)),
  };
}

function emptyPayload(type: StrategyProposalType, ownTeam: string, teams: string[], partners: string[]): StrategyProposalPayload {
  if (type === "self_strategy") {
    return emptySelfPayload();
  }
  if (type === "partner_strategy") {
    return emptyPartnerPayload(partners);
  }
  return emptyAutoPayload(teams.includes(ownTeam) ? teams : teams);
}

function emptyAutoPayload(teams: string[]): AutoProposalPayload {
  return ensureAutoPayload(normalizeProposalPayload("auto", {}) as AutoProposalPayload, teams);
}

function emptySelfPayload(): SelfStrategyPayload {
  return normalizeProposalPayload("self_strategy", {
    shifts: Object.fromEntries(strategyShifts.map((shift) => [shift, { points: [], note: "" }])),
  }) as SelfStrategyPayload;
}

function emptyPartnerPayload(partners: string[]): PartnerStrategyPayload {
  return ensurePartnerPayload(normalizeProposalPayload("partner_strategy", { partners }) as PartnerStrategyPayload, partners);
}

function ensureAutoPayload(payload: AutoProposalPayload, teams: string[]): AutoProposalPayload {
  return {
    ...payload,
    autoRoutes: keepRouteTeams(payload.autoRoutes, teams),
    transitionRoutes: keepRouteTeams(payload.transitionRoutes, teams),
    teamNotes: keepNotesForTeams(payload.teamNotes, teams),
  };
}

function ensurePartnerPayload(payload: PartnerStrategyPayload, partners: string[]): PartnerStrategyPayload {
  return {
    ...payload,
    partners,
    partnerNotes: keepNotesForTeams(payload.partnerNotes, partners),
    shifts: Object.fromEntries(strategyShifts.map((shift) => [
      shift,
      {
        note: payload.shifts[shift]?.note ?? "",
        routes: keepRouteTeams(payload.shifts[shift]?.routes ?? {}, partners),
      },
    ])) as PartnerStrategyPayload["shifts"],
  };
}

function keepRouteTeams(routes: RouteMap, teams: string[]) {
  const next: RouteMap = {};
  for (const team of teams) next[team] = routes[team] ?? [];
  return next;
}

function keepNotesForTeams(notes: Record<string, string>, teams: string[]) {
  const next: Record<string, string> = {};
  for (const team of teams) next[team] = notes[team] ?? "";
  return next;
}

function partnerTeams(match: ProposalMatch | null, ownTeam: string) {
  if (!match) return [];
  if (match.redTeams.includes(ownTeam)) return match.redTeams.filter((team) => team !== ownTeam);
  if (match.blueTeams.includes(ownTeam)) return match.blueTeams.filter((team) => team !== ownTeam);
  return [];
}

function allianceGroups(match: ProposalMatch): TeamGroup[] {
  return [
    { label: "Red", tone: "red", teams: match.redTeams },
    { label: "Blue", tone: "blue", teams: match.blueTeams },
  ];
}

function replaceProposalUrl(searchParams: URLSearchParams, id: string | null, embedded: boolean) {
  const params = new URLSearchParams(searchParams);
  if (id) params.set("proposal", id);
  else params.delete("proposal");
  if (embedded) params.set("tab", "proposal");
  const search = params.toString();
  const path = embedded ? "/" : "/strategy-proposal";
  window.history.replaceState(null, "", search ? `${path}?${search}` : path);
}

function proposalTypeLabel(type: StrategyProposalType) {
  if (type === "auto") return "Auto";
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

function autoWinnerLabel(value: AutoWinner) {
  if (value === "red") return "红方";
  if (value === "blue") return "蓝方";
  if (value === "tie") return "平局";
  return "未知";
}

function routeColor(index: number) {
  const colors = ["#ef4444", "#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899"];
  return colors[((index % colors.length) + colors.length) % colors.length];
}
