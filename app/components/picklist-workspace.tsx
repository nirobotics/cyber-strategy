import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, Check, GitMerge, LockKeyhole, Plus, RotateCcw, Search, Send, Trash2, UserRound, Users, X } from "lucide-react";
import { useFetcher } from "react-router";
import { PicklistBoard } from "./picklist-board";
import { PicklistMergeBoard } from "./picklist-merge-board";
import { Badge, Button, Card, Input, cn } from "./ui";
import type { PicklistActionData } from "../routes/_app.picklists";
import type { TeamSummary } from "../lib/scouting";
import type { TierInfo } from "../lib/tier-settings";
import {
  PICKLIST_ASSIGNED_COLUMNS,
  emptyPicklistBoard,
  findPicklistTeamTier,
  samePicklistBoard,
  type PicklistAssignedColumn,
  type PicklistBoard as PicklistBoardState,
  type PicklistResource,
  type SharedPicklist,
} from "../lib/picklist";

type LocalPersonalList = { id: string; name: string; createdAt: string };
type ActiveList =
  | { kind: "personal"; local: LocalPersonalList; remote: SharedPicklist | null }
  | { kind: "main"; remote: SharedPicklist };

const TIER_LABELS: Record<PicklistAssignedColumn, string> = { tier1: "Tier 1", tier2: "Tier 2", tier3: "Tier 3", dnp: "DNP" };

export function PicklistWorkspace({
  datasetId,
  eventKey,
  teams,
  tierByTeam,
  onOpenTeam,
  resource,
  demoMode = false,
}: {
  datasetId: string;
  eventKey: string;
  teams: TeamSummary[];
  tierByTeam: Map<string, TierInfo>;
  onOpenTeam: (team: string) => void;
  resource: PicklistResource;
  demoMode?: boolean;
}) {
  const commandFetcher = useFetcher<PicklistActionData>();
  const saveFetcher = useFetcher<PicklistActionData>();
  const personalKey = personalListsKey(datasetId, resource.userOpenId);
  const demoListsKey = `cyber-strategy:picklist:${datasetId}:demo-main-lists`;
  const [personalLists, setPersonalLists] = useLocalPersonalLists(personalKey, datasetId);
  const [sharedLists, setSharedLists] = useState(resource.lists);
  const [demoMainLoaded, setDemoMainLoaded] = useState(false);
  const [active, setActive] = useState<ActiveList | null>(null);
  const [activeBoard, setActiveBoard] = useState<PicklistBoardState | null>(null);
  const [personalName, setPersonalName] = useState("");
  const [mainName, setMainName] = useState("");
  const [pendingCommand, setPendingCommand] = useState<"create-main" | "submit-personal" | "delete-personal" | null>(null);
  const [pendingDelete, setPendingDelete] = useState<LocalPersonalList | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LocalPersonalList | null>(null);
  const [mergeMainId, setMergeMainId] = useState("");
  const [mergePersonalIds, setMergePersonalIds] = useState<string[]>([]);
  const [mergeTier, setMergeTier] = useState<PicklistAssignedColumn>("tier1");
  const [mergeMode, setMergeMode] = useState(false);
  const [resetToken, setResetToken] = useState(0);
  const [teamSearch, setTeamSearch] = useState("");
  const [stalePersonalIds, setStalePersonalIds] = useState<Set<string>>(new Set());
  const handledCommand = useRef<PicklistActionData | undefined>(undefined);
  const handledSave = useRef<PicklistActionData | undefined>(undefined);
  const submitMain = saveFetcher.submit;

  const mainLists = sharedLists.filter((list) => list.kind === "main");
  const submittedPersonal = sharedLists.filter((list) => list.kind === "personal" && list.submittedAt);
  const ownSubmissions = new Map(submittedPersonal
    .filter((list) => list.createdBy === resource.userOpenId && list.clientId)
    .map((list) => [list.clientId!, list]));
  const selectedMergeMain = mainLists.find((list) => list.id === mergeMainId) ?? null;
  const selectedMergePersonal = submittedPersonal.filter((list) => mergePersonalIds.includes(list.id));
  const handleBoardChange = useCallback((board: PicklistBoardState) => {
    setActiveBoard(board);
    if (demoMode && active?.kind === "main") {
      setSharedLists((current) => current.map((list) => list.id === active.remote.id ? { ...list, board, updatedAt: new Date().toISOString() } : list));
    }
    if (active?.kind === "personal" && active.remote) {
      setStalePersonalIds((current) => updateSet(current, active.local.id, !samePicklistBoard(board, active.remote!.board)));
    }
  }, [active, demoMode]);
  const removeLocalPersonal = useCallback((local: LocalPersonalList, remoteId?: string) => {
    setPersonalLists((current) => current.filter((list) => list.id !== local.id));
    localStorage.removeItem(personalBoardKey(datasetId, local.id));
    setSharedLists((current) => current.filter((list) => list.id !== remoteId && list.clientId !== local.id));
    setMergePersonalIds((current) => current.filter((id) => id !== remoteId));
    setStalePersonalIds((current) => updateSet(current, local.id, false));
  }, [datasetId, setPersonalLists]);

  useEffect(() => {
    if (demoMode) return;
    queueMicrotask(() => setSharedLists(resource.lists));
  }, [demoMode, resource.lists]);

  useEffect(() => {
    if (!demoMode) return;
    queueMicrotask(() => {
      try {
        setSharedLists(normalizeDemoLists(JSON.parse(localStorage.getItem(demoListsKey) ?? "[]"), eventKey));
      } catch {
        setSharedLists([]);
      }
      setDemoMainLoaded(true);
    });
  }, [demoListsKey, demoMode, eventKey]);

  useEffect(() => {
    if (demoMode && demoMainLoaded) localStorage.setItem(demoListsKey, JSON.stringify(sharedLists));
  }, [demoListsKey, demoMainLoaded, demoMode, sharedLists]);

  useEffect(() => {
    const imports = resource.lists.filter((list) =>
      list.kind === "personal" && list.createdBy === resource.userOpenId && list.clientId && !personalLists.some((local) => local.id === list.clientId)
    );
    if (!imports.length) return;
    queueMicrotask(() => setPersonalLists((current) => [
        ...current,
        ...imports.map((list) => ({ id: list.clientId!, name: list.name, createdAt: list.updatedAt })),
      ]));
  }, [personalLists, resource.lists, resource.userOpenId, setPersonalLists]);

  useEffect(() => {
    const result = commandFetcher.data;
    if (!result || handledCommand.current === result) return;
    handledCommand.current = result;
    if (!result.ok) {
      queueMicrotask(() => {
        setPendingCommand(null);
        setPendingDelete(null);
      });
      return;
    }
    queueMicrotask(() => {
      if (result.picklist) {
        const list = result.picklist;
        setSharedLists((current) => [list, ...current.filter((item) => item.id !== list.id)]);
        if (pendingCommand === "create-main") {
          setActive({ kind: "main", remote: list });
          setMainName("");
        }
        if (pendingCommand === "submit-personal" && list.clientId) {
          setStalePersonalIds((current) => updateSet(current, list.clientId!, false));
          setActive((current) => current?.kind === "personal" && current.local.id === list.clientId ? { ...current, remote: list } : current);
        }
      }
      if (pendingCommand === "delete-personal" && pendingDelete && result.deletedId) {
        removeLocalPersonal(pendingDelete, result.deletedId);
      }
      setPendingCommand(null);
      setPendingDelete(null);
    });
  }, [commandFetcher.data, pendingCommand, pendingDelete, removeLocalPersonal]);

  useEffect(() => {
    const list = saveFetcher.data?.picklist;
    if (!saveFetcher.data?.ok || !list || handledSave.current === saveFetcher.data) return;
    handledSave.current = saveFetcher.data;
    queueMicrotask(() => setSharedLists((current) => current.map((item) => item.id === list.id ? list : item)));
  }, [saveFetcher.data]);

  useEffect(() => {
    if (!activeBoard || active?.kind !== "main" || !resource.isAdmin || demoMode) return;
    const timeout = window.setTimeout(() => {
      submitMain({
        intent: "save-main",
        id: active.remote.id,
        board: JSON.stringify(activeBoard),
      }, { method: "post", action: "/picklists" });
    }, 600);
    return () => window.clearTimeout(timeout);
  }, [active, activeBoard, demoMode, resource.isAdmin, submitMain]);

  function createPersonal() {
    const name = personalName.trim();
    if (!name) return;
    const local = { id: crypto.randomUUID(), name: name.slice(0, 80), createdAt: new Date().toISOString() };
    setPersonalLists((current) => [local, ...current]);
    setPersonalName("");
    setActive({ kind: "personal", local, remote: null });
  }

  function createMain() {
    const name = mainName.trim();
    if (!name || !resource.isAdmin) return;
    if (demoMode) {
      const now = new Date().toISOString();
      const list: SharedPicklist = {
        id: `demo-main-${crypto.randomUUID()}`,
        clientId: null,
        eventKey,
        name: name.slice(0, 80),
        kind: "main",
        board: emptyPicklistBoard(),
        createdBy: resource.userOpenId,
        createdByName: "Demo Admin",
        submittedAt: null,
        updatedAt: now,
      };
      setSharedLists((current) => [list, ...current]);
      setMainName("");
      setActive({ kind: "main", remote: list });
      return;
    }
    setPendingCommand("create-main");
    commandFetcher.submit({ intent: "create-main", eventKey, name }, { method: "post", action: "/picklists" });
  }

  function submitPersonal() {
    if (active?.kind !== "personal" || !activeBoard) return;
    if (demoMode) {
      const now = new Date().toISOString();
      const submission: SharedPicklist = {
        id: `demo-personal-${active.local.id}`,
        clientId: active.local.id,
        eventKey,
        name: active.local.name,
        kind: "personal",
        board: activeBoard,
        createdBy: resource.userOpenId,
        createdByName: "Demo Admin",
        submittedAt: now,
        updatedAt: now,
      };
      setSharedLists((current) => [submission, ...current.filter((list) => list.id !== submission.id)]);
      setActive({ kind: "personal", local: active.local, remote: submission });
      setStalePersonalIds((current) => updateSet(current, active.local.id, false));
      return;
    }
    setPendingCommand("submit-personal");
    commandFetcher.submit({
      intent: "submit-personal",
      eventKey,
      clientId: active.local.id,
      name: active.local.name,
      board: JSON.stringify(activeBoard),
    }, { method: "post", action: "/picklists" });
  }

  function openPersonal(local: LocalPersonalList) {
    setActiveBoard(null);
    setActive({ kind: "personal", local, remote: ownSubmissions.get(local.id) ?? null });
  }

  function deletePersonal(local: LocalPersonalList) {
    const remote = ownSubmissions.get(local.id);
    if (demoMode || !remote) {
      removeLocalPersonal(local, remote?.id);
      return;
    }
    setPendingDelete(local);
    setPendingCommand("delete-personal");
    commandFetcher.submit({ intent: "delete-personal", id: remote.id }, { method: "post", action: "/picklists" });
  }

  function openMain(remote: SharedPicklist) {
    setActiveBoard(null);
    setActive({ kind: "main", remote });
  }

  function startMerge() {
    if (!selectedMergeMain || !selectedMergePersonal.length) return;
    setActiveBoard(selectedMergeMain.board);
    setActive({ kind: "main", remote: selectedMergeMain });
    setMergeMode(true);
  }

  if (!active) {
    return (
      <div className="min-h-0 min-w-0 space-y-3 sm:flex sm:flex-1 sm:flex-col sm:overflow-y-auto">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-ink">选择 Picklist</h2>
          {resource.error ? <Badge className="border-danger/40 bg-danger/10 text-danger">{resource.error}</Badge> : null}
        </div>

        <div className="grid min-w-0 gap-3 lg:grid-cols-2">
          <PicklistCollection title="Main" icon={<Users className="size-4" />} count={mainLists.length}>
            {mainLists.map((list) => (
              <ListButton key={list.id} list={list} onClick={() => openMain(list)} readOnly={!resource.isAdmin} />
            ))}
            {!mainLists.length ? <EmptyCollection text="暂无 Main Picklist" /> : null}
            {resource.isAdmin ? (
              <CreateRow value={mainName} onChange={setMainName} onCreate={createMain} placeholder="Main Picklist 名称" busy={!demoMode && commandFetcher.state !== "idle"} />
            ) : null}
          </PicklistCollection>

          <PicklistCollection title="Personal" icon={<UserRound className="size-4" />} count={personalLists.length}>
            {personalLists.map((list) => (
              <div key={list.id} className="flex min-w-0 items-center rounded-md border border-line bg-surface-2 hover:border-brand">
                <button type="button" onClick={() => openPersonal(list)} className="flex min-w-0 flex-1 items-center justify-between gap-3 p-3 text-left">
                  <span className="min-w-0 truncate font-semibold text-ink">{list.name}</span>
                  {ownSubmissions.has(list.id) && !stalePersonalIds.has(list.id) ? <Badge className="border-success/40 bg-success/10 text-success"><Check className="size-3" />已提交</Badge> : null}
                </button>
                <Button type="button" className="mr-2 shrink-0 px-2" onClick={() => setDeleteTarget(list)} disabled={pendingCommand === "delete-personal"} title={`删除 ${list.name}`} aria-label={`删除 ${list.name}`}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
            {!personalLists.length ? <EmptyCollection text="暂无 Personal Picklist" /> : null}
            <CreateRow value={personalName} onChange={setPersonalName} onCreate={createPersonal} placeholder="Personal Picklist 名称" busy={false} />
          </PicklistCollection>
        </div>

        {resource.isAdmin ? (
          <Card className="p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="font-semibold text-ink">Merge</h3>
              <Button type="button" variant="primary" disabled={!selectedMergeMain || !selectedMergePersonal.length} onClick={startMerge}>
                <GitMerge className="size-4" />Merge
              </Button>
            </div>
            <div className="grid items-start gap-3 md:grid-cols-2">
              <label className="grid content-start gap-1.5 text-sm text-ink-dim">
                Main Picklist
                <select className="input h-10 font-sans" value={mergeMainId} onChange={(event) => setMergeMainId(event.target.value)}>
                  <option value="">选择 Main</option>
                  {mainLists.map((list) => <option key={list.id} value={list.id}>{list.name}</option>)}
                </select>
              </label>
              <div className="grid gap-1.5 text-sm text-ink-dim">
                已提交 Personal Picklist
                <div className="max-h-40 min-h-10 overflow-y-auto rounded-md border border-line bg-surface-2">
                  {submittedPersonal.map((list) => (
                    <label key={list.id} className={cn("flex h-10 cursor-pointer items-center gap-2 border-b border-line px-3 text-ink last:border-b-0 hover:bg-surface", mergePersonalIds.includes(list.id) && "bg-brand/10 text-brand")}>
                      <input className="accent-brand" type="checkbox" checked={mergePersonalIds.includes(list.id)} onChange={() => setMergePersonalIds((current) => toggleId(current, list.id))} />
                      <span className="min-w-0 truncate">{list.name} · {list.createdByName}</span>
                    </label>
                  ))}
                  {!submittedPersonal.length ? <div className="px-3 py-2 text-ink-faint">暂无提交</div> : null}
                </div>
              </div>
            </div>
          </Card>
        ) : null}
        {deleteTarget ? (
          <DeletePicklistDialog
            list={deleteTarget}
            busy={pendingCommand === "delete-personal"}
            onCancel={() => setDeleteTarget(null)}
            onConfirm={() => {
              const target = deleteTarget;
              setDeleteTarget(null);
              deletePersonal(target);
            }}
          />
        ) : null}
      </div>
    );
  }

  const isMain = active.kind === "main";
  const editable = !isMain || resource.isAdmin;
  const listName = isMain ? active.remote.name : active.local.name;
  const personalSubmission = !isMain && !stalePersonalIds.has(active.local.id) ? ownSubmissions.get(active.local.id) : null;
  const remoteBoard = isMain ? active.remote.board : active.remote?.board;
  const storageKey = isMain
    ? `cyber-strategy:picklist:${datasetId}:main:${active.remote.id}:board`
    : personalBoardKey(datasetId, active.local.id);
  const searchedTeam = teams.some((team) => team.team === teamSearch.replace(/^frc/i, "").trim())
    ? teamSearch.replace(/^frc/i, "").trim()
    : null;

  return (
    <div className="min-h-0 sm:flex sm:flex-1 sm:flex-col sm:overflow-hidden">
      <div className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Button type="button" className="shrink-0 px-2" onClick={() => { setActive(null); setActiveBoard(null); setMergeMode(false); }} title="返回 Picklist 选择">
            <ArrowLeft className="size-4" />
          </Button>
          <h2 className="truncate font-semibold text-ink">{listName}</h2>
          <Badge className={isMain ? "border-brand/40 bg-brand/10 text-brand" : "border-line bg-surface-2 text-ink-dim"}>{isMain ? "Main" : "Personal"}</Badge>
          {personalSubmission ? <Badge className="border-success/40 bg-success/10 text-success"><Check className="size-3" />已提交</Badge> : null}
          {!editable ? <LockKeyhole className="size-4 text-ink-faint" aria-label="只读" /> : null}
          {saveFetcher.state !== "idle" ? <span className="text-xs text-ink-faint">保存中</span> : null}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {mergeMode ? PICKLIST_ASSIGNED_COLUMNS.map((column) => (
            <Button key={column} type="button" variant={mergeTier === column ? "active" : "default"} onClick={() => setMergeTier(column)}>
              {TIER_LABELS[column]}
            </Button>
          )) : null}
          <label className="relative block w-36 sm:w-44">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
            <Input
              className="h-9 pl-8 font-sans"
              value={teamSearch}
              onChange={(event) => {
                const value = event.target.value.replace(/[^\dFRCfrc]/g, "");
                const team = value.replace(/^frc/i, "").trim();
                setTeamSearch(value);
                if (mergeMode && activeBoard && teams.some((item) => item.team === team)) {
                  const tier = findPicklistTeamTier(team, [activeBoard, ...selectedMergePersonal.map((list) => list.board)]);
                  if (tier) setMergeTier(tier);
                }
              }}
              placeholder="查找队伍"
              inputMode="numeric"
              aria-label="查找队伍"
            />
          </label>
          {editable ? (
            <Button
              type="button"
              className="shrink-0"
              onClick={() => mergeMode && activeBoard
                ? handleBoardChange({ ...activeBoard, [mergeTier]: [] })
                : setResetToken((value) => value + 1)}
              disabled={!activeBoard || (mergeMode ? !activeBoard[mergeTier].length : !PICKLIST_ASSIGNED_COLUMNS.some((column) => activeBoard[column].length))}
              title={mergeMode ? `重置 ${TIER_LABELS[mergeTier]}` : "重置 Picklist"}
            >
              <RotateCcw className="size-4" />重置
            </Button>
          ) : null}
          {!isMain ? (
            <Button type="button" variant="primary" onClick={submitPersonal} disabled={!activeBoard || (!demoMode && commandFetcher.state !== "idle")}>
              <Send className="size-4" />提交
            </Button>
          ) : null}
        </div>
      </div>

      {commandFetcher.data?.error ? <div className="mb-3 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{commandFetcher.data.error}</div> : null}
      {saveFetcher.data?.error ? <div className="mb-3 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{saveFetcher.data.error}</div> : null}

      {mergeMode && activeBoard ? (
        <div className="min-h-0 flex flex-1 flex-col overflow-hidden">
          <PicklistMergeBoard board={activeBoard} column={mergeTier} personalLists={selectedMergePersonal} teams={teams} tierByTeam={tierByTeam} highlightedTeam={searchedTeam} onChange={handleBoardChange} onOpenTeam={onOpenTeam} />
        </div>
      ) : <PicklistBoard
        datasetId={datasetId}
        storageKey={storageKey}
        initialBoard={remoteBoard ?? emptyPicklistBoard()}
        preferInitial={isMain}
        resetToken={resetToken}
        highlightedTeam={searchedTeam}
        readOnly={!editable}
        onBoardChange={handleBoardChange}
        teams={teams}
        tierByTeam={tierByTeam}
        onOpenTeam={onOpenTeam}
      />}
    </div>
  );
}

function DeletePicklistDialog({ list, busy, onCancel, onConfirm }: { list: LocalPersonalList; busy: boolean; onCancel: () => void; onConfirm: () => void }) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) onCancel();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [busy, onCancel]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/55 p-3" role="dialog" aria-modal="true" aria-labelledby="delete-picklist-title" onMouseDown={() => { if (!busy) onCancel(); }}>
      <Card className="w-full max-w-md overflow-hidden p-0 shadow-xl" onMouseDown={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-line p-4">
          <div className="flex min-w-0 items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-md border border-danger/40 bg-danger/10 text-danger"><AlertTriangle className="size-5" /></span>
            <div className="min-w-0">
              <p className="section-label text-danger">危险操作</p>
              <h2 id="delete-picklist-title" className="mt-1 text-lg font-semibold text-ink">删除 Personal Picklist</h2>
            </div>
          </div>
          <Button type="button" className="shrink-0 px-2" onClick={onCancel} disabled={busy} title="关闭"><X className="size-4" /></Button>
        </div>
        <div className="space-y-3 p-4">
          <p className="text-sm text-ink-dim">确定删除 <strong className="font-semibold text-ink">{list.name}</strong>？</p>
          <p className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">本机草稿和已提交版本都会被删除，此操作无法撤销。</p>
        </div>
        <div className="flex justify-end gap-2 border-t border-line bg-surface-2 p-3">
          <Button type="button" onClick={onCancel} disabled={busy}>取消</Button>
          <Button type="button" className="border-danger bg-danger text-white hover:border-danger hover:bg-danger hover:text-white hover:brightness-110" onClick={onConfirm} disabled={busy}>
            <Trash2 className="size-4" />{busy ? "删除中" : "删除 Picklist"}
          </Button>
        </div>
      </Card>
    </div>
  );
}

function PicklistCollection({ title, icon, count, children }: { title: string; icon: React.ReactNode; count: number; children: React.ReactNode }) {
  return <Card className="min-w-0 p-0"><div className="flex items-center justify-between border-b border-line p-3"><h3 className="flex items-center gap-2 font-semibold text-ink">{icon}{title}</h3><span className="text-xs text-ink-dim">{count} 个</span></div><div className="min-w-0 space-y-2 p-3">{children}</div></Card>;
}

function ListButton({ list, onClick, readOnly }: { list: SharedPicklist; onClick: () => void; readOnly: boolean }) {
  return <button type="button" onClick={onClick} className="flex w-full items-center justify-between gap-3 rounded-md border border-line bg-surface-2 p-3 text-left hover:border-brand"><span className="min-w-0 truncate font-semibold text-ink">{list.name}</span><span className="flex shrink-0 items-center gap-2 text-xs text-ink-dim">{readOnly ? <LockKeyhole className="size-3" /> : null}{list.createdByName}</span></button>;
}

function CreateRow({ value, onChange, onCreate, placeholder, busy }: { value: string; onChange: (value: string) => void; onCreate: () => void; placeholder: string; busy: boolean }) {
  return <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_auto]"><Input className="min-w-0 font-sans" value={value} onChange={(event) => onChange(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") onCreate(); }} placeholder={placeholder} maxLength={80} /><Button type="button" variant="primary" onClick={onCreate} disabled={!value.trim() || busy}><Plus className="size-4" />创建</Button></div>;
}

function EmptyCollection({ text }: { text: string }) {
  return <div className="rounded-md border border-dashed border-line px-3 py-6 text-center text-sm text-ink-faint">{text}</div>;
}

function personalListsKey(datasetId: string, userOpenId: string) {
  return `cyber-strategy:picklist:${datasetId}:personal-lists:${encodeURIComponent(userOpenId)}`;
}

function personalBoardKey(datasetId: string, id: string) {
  return id === "legacy" ? `cyber-strategy:picklist:${datasetId}:board` : `cyber-strategy:picklist:${datasetId}:personal:${id}:board`;
}

function useLocalPersonalLists(key: string, datasetId: string) {
  const [lists, setLists] = useState<LocalPersonalList[]>([]);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      try {
        const raw = localStorage.getItem(key);
        if (raw) setLists(normalizeLocalLists(JSON.parse(raw)));
        else if (localStorage.getItem(`cyber-strategy:picklist:${datasetId}:board`)) setLists([{ id: "legacy", name: "我的 Picklist", createdAt: new Date().toISOString() }]);
        else setLists([]);
      } catch {
        setLists([]);
      }
      setLoadedKey(key);
    });
    return () => { cancelled = true; };
  }, [datasetId, key]);
  useEffect(() => {
    if (loadedKey === key) localStorage.setItem(key, JSON.stringify(lists));
  }, [key, lists, loadedKey]);
  return [lists, setLists] as const;
}

function normalizeLocalLists(value: unknown): LocalPersonalList[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const source = item as Partial<LocalPersonalList>;
    const id = String(source.id ?? "").trim();
    const name = String(source.name ?? "").trim().slice(0, 80);
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(id) || !name || seen.has(id)) return [];
    seen.add(id);
    return [{ id, name, createdAt: String(source.createdAt ?? "") || new Date().toISOString() }];
  });
}

function normalizeDemoLists(value: unknown, eventKey: string): SharedPicklist[] {
  if (!Array.isArray(value)) return [];
  return value.filter((list): list is SharedPicklist => Boolean(
    list && typeof list === "object" && (list.kind === "main" || list.kind === "personal") && list.eventKey === eventKey && typeof list.id === "string" && typeof list.name === "string",
  ));
}

function toggleId(values: string[], id: string) {
  return values.includes(id) ? values.filter((value) => value !== id) : [...values, id];
}

function updateSet(values: Set<string>, id: string, present: boolean) {
  const next = new Set(values);
  if (present) next.add(id);
  else next.delete(id);
  return next;
}
