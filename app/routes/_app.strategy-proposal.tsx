import {
  ArrowLeft,
  CheckCircle2,
  Eye,
  Plus,
  Save,
  Send,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import { useState, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { Form, Link, redirect, useActionData, useNavigate, useNavigation, useSearchParams } from "react-router";
import type { Route } from "./+types/_app.strategy-proposal";
import { PhotoLightbox, TeamDetailModal } from "../components/analytics-dashboard";
import { Badge, Button, Card, Input, cn } from "../components/ui";
import { requireUser } from "../lib/auth.server";
import { getStrategyDatasetForRequest } from "../lib/cyber-scout.server";
import { matchIdentity, matchLabel, matchTeams, sortedMatches, type CombinedMatch } from "../lib/match-analysis";
import { isAdmin } from "../lib/profiles.server";
import { type ScoutingDataset } from "../lib/scouting";
import {
  listStrategyProposals,
  reviewStrategyProposal,
  restoreApprovedStrategyProposal,
  saveStrategyProposal,
} from "../lib/strategy-proposals.server";
import {
  autoWinners,
  canEditProposalAs,
  canRestoreApprovedSnapshot,
  canReviewProposal,
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
import { fetchTbaMatches } from "../lib/tba.server";

type ActionData = { error?: string };
type ProposalMatch = { key: string; label: string; redTeams: string[]; blueTeams: string[] };
type EditorState = {
  id: string | null;
  proposalType: StrategyProposalType;
  ownTeam: OwnStrategyTeam;
  matchKey: string;
  title: string;
  payload: StrategyProposalPayload;
};

export async function loader({ request }: Route.LoaderArgs) {
  const user = requireUser(request, { redirectToLogin: true });
  const data = await getStrategyDatasetForRequest(request);
  const selectedEventKey = data.selectedEventKey ?? data.dataset.eventKey;
  let proposalError: string | null = null;
  const [admin, proposals, tbaMatches] = await Promise.all([
    isAdmin(user.feishuOpenId),
    listStrategyProposals(selectedEventKey).catch((error) => {
      proposalError = error instanceof Error ? error.message : "Strategy Proposal 数据表不可用。";
      return [];
    }),
    fetchTbaMatches(selectedEventKey).catch(() => []),
  ]);

  return {
    ...data,
    selectedEventKey,
    isAdmin: admin,
    user,
    proposals,
    proposalError,
    matches: toProposalMatches(tbaMatches as CombinedMatch[]),
  };
}

export async function action({ request }: Route.ActionArgs): Promise<Response | ActionData> {
  const user = requireUser(request);
  const admin = await isAdmin(user.feishuOpenId);
  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");
  const eventKey = String(formData.get("eventKey") || "");

  try {
    if (intent === "save" || intent === "submit") {
      const proposal = await saveStrategyProposal({
        id: String(formData.get("id") || "") || null,
        actorOpenId: user.feishuOpenId,
        isAdmin: admin,
        submit: intent === "submit",
        eventKey,
        matchKey: String(formData.get("matchKey") || ""),
        matchLabel: String(formData.get("matchLabel") || ""),
        ownTeam: String(formData.get("ownTeam") || ""),
        proposalType: String(formData.get("proposalType") || ""),
        title: String(formData.get("title") || ""),
        payload: parsePayload(String(formData.get("payload") || "{}")),
      });
      throw redirect(proposalPath(eventKey, proposal.id));
    }

    if (intent === "restore") {
      const proposal = await restoreApprovedStrategyProposal({
        id: String(formData.get("id") || ""),
        actorOpenId: user.feishuOpenId,
        isAdmin: admin,
      });
      throw redirect(proposalPath(eventKey, proposal.id));
    }

    if (intent === "review") {
      await reviewStrategyProposal({
        id: String(formData.get("id") || ""),
        actorOpenId: user.feishuOpenId,
        isAdmin: admin,
        decision: String(formData.get("decision") || ""),
        note: String(formData.get("reviewNote") || ""),
      });
      throw redirect(proposalPath(eventKey, String(formData.get("id") || "")));
    }
  } catch (error) {
    if (error instanceof Response && error.status >= 300 && error.status < 400) throw error;
    if (error instanceof Response) return { error: await error.text() || "操作失败。" };
    return { error: error instanceof Error ? error.message : "操作失败。" };
  }

  return { error: "未知操作。" };
}

export default function StrategyProposalRoute({ loaderData }: Route.ComponentProps) {
  const [searchParams] = useSearchParams();
  const selectedId = searchParams.get("proposal");
  const selected = loaderData.proposals.find((proposal) => proposal.id === selectedId) ?? null;
  return (
    <StrategyProposalPage
      key={`${loaderData.selectedEventKey}:${selected?.id ?? "new"}:${loaderData.dataset.id}`}
      loaderData={loaderData}
      selected={selected}
    />
  );
}

function StrategyProposalPage({
  loaderData,
  selected,
}: {
  loaderData: Route.ComponentProps["loaderData"];
  selected: StrategyProposal | null;
}) {
  const navigate = useNavigate();
  const navigation = useNavigation();
  const [searchParams] = useSearchParams();
  const actionData = useActionData<ActionData>();
  const [typeFilter, setTypeFilter] = useState<StrategyProposalType | "all">("all");
  const [statusFilter, setStatusFilter] = useState<StrategyProposalStatus | "all">("all");
  const [detailTeam, setDetailTeam] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<{ team: string; index: number } | null>(null);
  const [editor, setEditor] = useState(() => initialEditorState(selected, loaderData.matches, loaderData.dataset));
  const busy = navigation.state !== "idle";
  const selectedMatch = loaderData.matches.find((match) => match.key === editor.matchKey) ?? loaderData.matches[0] ?? null;
  const matchLabelValue = selectedMatch?.label ?? editor.matchKey;
  const allMatchTeams = selectedMatch ? [...selectedMatch.redTeams, ...selectedMatch.blueTeams] : [];
  const editable = canEditProposalAs(selected, loaderData.user.feishuOpenId, loaderData.isAdmin);
  const reviewer = canReviewProposal(selected, loaderData.isAdmin);
  const restorable = canRestoreApprovedSnapshot(selected, loaderData.user.feishuOpenId, loaderData.isAdmin);
  const creatorEditingApproved = Boolean(selected?.status === "approved" && selected.createdBy === loaderData.user.feishuOpenId && !loaderData.isAdmin);
  const adminEditingApproved = Boolean(selected?.status === "approved" && loaderData.isAdmin);
  const filteredProposals = loaderData.proposals.filter((proposal) =>
    (typeFilter === "all" || proposal.proposalType === typeFilter) &&
    (statusFilter === "all" || proposal.status === statusFilter)
  );
  const teamDetail = detailTeam ? loaderData.dataset.teamData[detailTeam] : null;

  function selectEvent(eventKey: string) {
    const params = new URLSearchParams(searchParams);
    params.set("event", eventKey);
    params.delete("proposal");
    navigate(`/strategy-proposal?${params.toString()}`);
  }

  function newProposal() {
    const params = new URLSearchParams(searchParams);
    params.delete("proposal");
    navigate(`/strategy-proposal?${params.toString()}`);
  }

  function openProposal(id: string) {
    const params = new URLSearchParams(searchParams);
    params.set("proposal", id);
    navigate(`/strategy-proposal?${params.toString()}`);
  }

  function updateType(type: StrategyProposalType) {
    setEditor((current) => ({
      ...current,
      proposalType: type,
      title: defaultTitle(type, matchLabelValue),
      payload: emptyPayload(type, current.ownTeam, allMatchTeams, partnerTeams(selectedMatch, current.ownTeam)),
    }));
  }

  function updateOwnTeam(ownTeam: OwnStrategyTeam) {
    setEditor((current) => ({
      ...current,
      ownTeam,
      payload: current.payload.kind === "partner_strategy"
        ? ensurePartnerPayload(current.payload, partnerTeams(selectedMatch, ownTeam))
        : current.payload,
    }));
  }

  function updateMatch(matchKey: string) {
    const match = loaderData.matches.find((item) => item.key === matchKey) ?? null;
    const teams = match ? [...match.redTeams, ...match.blueTeams] : [];
    setEditor((current) => ({
      ...current,
      matchKey,
      title: current.id ? current.title : defaultTitle(current.proposalType, match?.label ?? matchKey),
      payload: current.payload.kind === "partner_strategy"
        ? ensurePartnerPayload(current.payload, partnerTeams(match, current.ownTeam))
        : current.payload.kind === "auto"
          ? ensureAutoPayload(current.payload, teams)
          : current.payload,
    }));
  }

  return (
    <div className="mx-auto grid w-full max-w-[1500px] gap-3">
      <div className="flex flex-col gap-3 rounded-card border border-line bg-surface p-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <p className="section-label">Strategy Proposal</p>
          <p className="mt-1 text-sm text-ink-dim">
            {loaderData.selectedEventKey} · {loaderData.proposals.length} 个 proposal · {loaderData.matches.length} 场比赛
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={loaderData.selectedEventKey}
            onChange={(event) => selectEvent(event.target.value)}
            className="input h-9 min-w-[180px] font-sans"
            disabled={!loaderData.events.length}
            title="选择赛事"
          >
            {!loaderData.events.some((event) => event.eventKey === loaderData.selectedEventKey) ? (
              <option value={loaderData.selectedEventKey}>{loaderData.selectedEventKey}</option>
            ) : null}
            {loaderData.events.map((event) => (
              <option key={event.eventKey} value={event.eventKey}>
                {event.name || event.eventKey}{event.isActive ? " · 当前" : ""}
              </option>
            ))}
          </select>
          <Link to={`/?event=${encodeURIComponent(loaderData.selectedEventKey)}`} className="btn">
            <ArrowLeft className="size-4" />
            返回
          </Link>
        </div>
      </div>

      {actionData?.error ? <Card className="border-danger/40 bg-danger/10 p-3 text-sm text-danger">{actionData.error}</Card> : null}
      {loaderData.proposalError ? <Card className="border-warn/40 bg-warn/10 p-3 text-sm text-warn">{loaderData.proposalError}</Card> : null}

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
              <p className="section-label">{selected ? "编辑 / 审核" : "新建"}</p>
              <h2 className="text-lg font-semibold text-ink">{selected ? selected.title : "新的 Strategy Proposal"}</h2>
            </div>
            {selected ? <StatusBadge status={selected.status} /> : <StatusBadge status="draft" />}
          </div>

          <Form method="post" className="grid gap-4 p-3 md:p-4">
            <input type="hidden" name="id" value={editor.id ?? ""} />
            <input type="hidden" name="eventKey" value={loaderData.selectedEventKey} />
            <input type="hidden" name="matchLabel" value={matchLabelValue} />
            <input type="hidden" name="payload" value={JSON.stringify(editor.payload)} />

            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_160px_160px_220px]">
              <label className="grid gap-1">
                <span className="text-sm font-medium text-ink-dim">标题</span>
                <Input
                  name="title"
                  value={editor.title}
                  disabled={!editable}
                  onChange={(event) => setEditor((current) => ({ ...current, title: event.target.value }))}
                />
              </label>
              <label className="grid gap-1">
                <span className="text-sm font-medium text-ink-dim">类型</span>
                <select
                  name="proposalType"
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
                  value={editor.matchKey}
                  disabled={!editable || !loaderData.matches.length}
                  onChange={(event) => updateMatch(event.target.value)}
                  className="input h-10 font-sans"
                >
                  {loaderData.matches.map((match) => (
                    <option key={match.key} value={match.key}>{match.label} · R {match.redTeams.join("/")} · B {match.blueTeams.join("/")}</option>
                  ))}
                </select>
              </label>
            </div>

            {!selectedMatch ? (
              <div className="rounded-md border border-warn/40 bg-warn/10 p-3 text-sm text-warn">
                当前赛事没有 TBA 赛程，暂不能创建 proposal。
              </div>
            ) : (
              <MatchTeamsBar match={selectedMatch} activeTeam={editor.ownTeam} onOpenTeam={setDetailTeam} dataset={loaderData.dataset} />
            )}

            <PayloadEditor
              proposalType={editor.proposalType}
              ownTeam={editor.ownTeam}
              match={selectedMatch}
              payload={editor.payload}
              teamData={loaderData.dataset.teamData}
              disabled={!editable}
              onOpenTeam={setDetailTeam}
              onChange={(payload) => setEditor((current) => ({ ...current, payload }))}
            />

            <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-3">
              {restorable ? (
                <Button type="submit" name="intent" value="restore" disabled={busy}>
                  <Undo2 className="size-4" />
                  恢复到已通过版本
                </Button>
              ) : null}
              {editable ? (
                creatorEditingApproved ? (
                  <Button type="submit" name="intent" value="submit" variant="primary" disabled={busy || !selectedMatch}>
                    <Send className="size-4" />
                    修改并提交审核
                  </Button>
                ) : (
                  <>
                    <Button type="submit" name="intent" value="save" disabled={busy || !selectedMatch}>
                      <Save className="size-4" />
                      {adminEditingApproved ? "保存并保持通过" : "保存草稿"}
                    </Button>
                    {!adminEditingApproved ? (
                      <Button type="submit" name="intent" value="submit" variant="primary" disabled={busy || !selectedMatch}>
                        <Send className="size-4" />
                        提交审核
                      </Button>
                    ) : null}
                  </>
                )
              ) : (
                <span className="text-sm text-ink-dim">当前状态不可编辑。</span>
              )}
            </div>
          </Form>

          {reviewer && selected ? (
            <Form method="post" className="grid gap-3 border-t border-line bg-surface-2 p-3 md:p-4">
              <input type="hidden" name="intent" value="review" />
              <input type="hidden" name="id" value={selected.id} />
              <input type="hidden" name="eventKey" value={loaderData.selectedEventKey} />
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
            </Form>
          ) : null}
        </Card>
      </div>

      {teamDetail ? (
        <TeamDetailModal
          team={teamDetail}
          photos={loaderData.dataset.teamPhotos[teamDetail.team] ?? []}
          pitInfo={loaderData.dataset.teamPitData?.[teamDetail.team]}
          onOpenPhoto={(index) => setLightbox({ team: teamDetail.team, index })}
          onClose={() => setDetailTeam(null)}
        />
      ) : null}
      {lightbox ? (
        <PhotoLightbox
          photos={loaderData.dataset.teamPhotos[lightbox.team] ?? []}
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
      teams={matchTeamList}
      teamData={teamData}
      disabled={disabled}
      onOpenTeam={onOpenTeam}
      onChange={onChange}
    />
  );
}

function AutoProposalEditor({
  payload,
  teams,
  teamData,
  disabled,
  onOpenTeam,
  onChange,
}: {
  payload: AutoProposalPayload;
  teams: string[];
  teamData: ScoutingDataset["teamData"];
  disabled: boolean;
  onOpenTeam: (team: string) => void;
  onChange: (payload: AutoProposalPayload) => void;
}) {
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
        activeTeam={resolvedTransitionTeam}
        routes={payload.transitionRoutes}
        disabled={disabled}
        teamData={teamData}
        onActiveTeam={setActiveTransitionTeam}
        onOpenTeam={onOpenTeam}
        onRoutesChange={(transitionRoutes) => onChange({ ...payload, transitionRoutes })}
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
      <NoteBox value={current.note} disabled={disabled} onChange={(note) => onChange({ ...payload, partners, shifts: { ...payload.shifts, [shift]: { ...current, note } } })} />
    </ShiftSection>
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
  activeTeam: string;
  routes: RouteMap;
  disabled: boolean;
  teamData: ScoutingDataset["teamData"];
  onActiveTeam: (team: string) => void;
  onOpenTeam: (team: string) => void;
  onRoutesChange: (routes: RouteMap) => void;
}) {
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
        <div className="flex flex-wrap gap-2">
          {teams.map((team, index) => (
            <div key={team} className={cn("flex items-center overflow-hidden rounded-md border border-line bg-surface-2", activeTeam === team && "border-brand")}>
              <button type="button" className="px-2 py-1 text-sm font-semibold text-ink" onClick={() => onActiveTeam(team)}>
                <span className="mr-1 inline-block size-2 rounded-full" style={{ backgroundColor: routeColor(team, index) }} />
                Team {team}
              </button>
              <button type="button" className="border-l border-line px-2 py-1 text-ink-faint hover:text-ink" title="查看队伍详情" onClick={() => onOpenTeam(team)} disabled={!teamData[team]}>
                <Eye className="size-4" />
              </button>
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
            {teams.map((team, index) => {
              const points = routes[team] ?? [];
              if (points.length < 2) return null;
              return (
                <polyline
                  key={team}
                  points={points.map((point) => `${point.x},${point.y}`).join(" ")}
                  fill="none"
                  stroke={routeColor(team, index)}
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
              );
            })}
          </svg>
          {teams.flatMap((team, teamIndex) => (routes[team] ?? []).map((point, pointIndex) => (
            <span
              key={`${team}-${point.x}-${point.y}-${pointIndex}`}
              className="absolute grid size-5 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-white text-[10px] font-bold text-white shadow-sm"
              style={{ left: `${point.x}%`, top: `${point.y}%`, backgroundColor: routeColor(team, teamIndex) }}
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
  const match = proposal ? matches.find((item) => item.key === proposal.matchKey) : matches[0];
  const proposalType = proposal?.proposalType ?? "auto";
  const ownTeam = proposal?.ownTeam ?? "8214";
  const teams = match ? [...match.redTeams, ...match.blueTeams] : Object.keys(dataset.teamData).slice(0, 6);
  return {
    id: proposal?.id ?? null,
    proposalType,
    ownTeam,
    matchKey: proposal?.matchKey ?? match?.key ?? "",
    title: proposal?.title ?? defaultTitle(proposalType, match?.label ?? "Match"),
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
  };
}

function ensurePartnerPayload(payload: PartnerStrategyPayload, partners: string[]): PartnerStrategyPayload {
  return {
    ...payload,
    partners,
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

function partnerTeams(match: ProposalMatch | null, ownTeam: string) {
  if (!match) return [];
  if (match.redTeams.includes(ownTeam)) return match.redTeams.filter((team) => team !== ownTeam);
  if (match.blueTeams.includes(ownTeam)) return match.blueTeams.filter((team) => team !== ownTeam);
  return [];
}

function toProposalMatches(matches: CombinedMatch[]): ProposalMatch[] {
  return sortedMatches(matches)
    .map((match) => ({
      key: matchIdentity(match),
      label: matchLabel(match),
      redTeams: matchTeams(match, "red"),
      blueTeams: matchTeams(match, "blue"),
    }))
    .filter((match) => match.redTeams.length === 3 && match.blueTeams.length === 3);
}

function parsePayload(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new Response("Proposal payload 无效", { status: 400 });
  }
}

function proposalPath(eventKey: string, id: string) {
  const params = new URLSearchParams();
  params.set("event", eventKey);
  params.set("proposal", id);
  return `/strategy-proposal?${params.toString()}`;
}

function defaultTitle(type: StrategyProposalType, match: string) {
  return `${match} · ${proposalTypeLabel(type)}`;
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

function routeColor(team: string, index: number) {
  const colors = ["#ef4444", "#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899"];
  const parsed = Number(team);
  return colors[(Number.isFinite(parsed) ? parsed : index) % colors.length];
}
