import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, GitMerge, LockKeyhole, Plus, RotateCcw, Send, UserRound, Users } from "lucide-react";
import { useFetcher } from "react-router";
import { PicklistBoard } from "./picklist-board";
import { Badge, Button, Card, Input } from "./ui";
import type { PicklistActionData } from "../routes/_app.picklists";
import type { TeamSummary } from "../lib/scouting";
import type { TierInfo } from "../lib/tier-settings";
import {
  PICKLIST_ASSIGNED_COLUMNS,
  comparePicklistTier,
  emptyPicklistBoard,
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
  const [pendingCommand, setPendingCommand] = useState<"create-main" | "submit-personal" | null>(null);
  const [mergeMainId, setMergeMainId] = useState("");
  const [mergePersonalIds, setMergePersonalIds] = useState<string[]>([]);
  const [mergeTier, setMergeTier] = useState<PicklistAssignedColumn>("tier1");
  const [mergeMode, setMergeMode] = useState(false);
  const [resetToken, setResetToken] = useState(0);
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
  }, [active, demoMode]);

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
    if (!result?.ok || !result.picklist || handledCommand.current === result) return;
    handledCommand.current = result;
    const list = result.picklist;
    queueMicrotask(() => {
      setSharedLists((current) => [list, ...current.filter((item) => item.id !== list.id)]);
      if (pendingCommand === "create-main") {
        setActive({ kind: "main", remote: list });
        setMainName("");
      }
      setPendingCommand(null);
    });
  }, [commandFetcher.data, pendingCommand]);

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

  function openMain(remote: SharedPicklist) {
    setActiveBoard(null);
    setActive({ kind: "main", remote });
  }

  function startMerge() {
    if (!selectedMergeMain || !selectedMergePersonal.length) return;
    setActiveBoard(null);
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
              <button key={list.id} type="button" onClick={() => openPersonal(list)} className="flex w-full items-center justify-between gap-3 rounded-md border border-line bg-surface-2 p-3 text-left hover:border-brand">
                <span className="min-w-0 truncate font-semibold text-ink">{list.name}</span>
                {ownSubmissions.has(list.id) ? <Badge className="border-success/40 bg-success/10 text-success"><Check className="size-3" />已提交</Badge> : null}
              </button>
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
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
              <label className="grid gap-1.5 text-sm text-ink-dim">
                Main Picklist
                <select className="input" value={mergeMainId} onChange={(event) => setMergeMainId(event.target.value)}>
                  <option value="">选择 Main</option>
                  {mainLists.map((list) => <option key={list.id} value={list.id}>{list.name}</option>)}
                </select>
              </label>
              <div className="grid gap-1.5 text-sm text-ink-dim">
                已提交 Personal Picklist
                <div className="flex min-h-10 flex-wrap gap-2 rounded-md border border-line bg-surface-2 p-2">
                  {submittedPersonal.map((list) => (
                    <label key={list.id} className="flex items-center gap-2 rounded-md border border-line bg-surface px-2 py-1 text-ink">
                      <input type="checkbox" checked={mergePersonalIds.includes(list.id)} onChange={() => setMergePersonalIds((current) => toggleId(current, list.id))} />
                      {list.name} · {list.createdByName}
                    </label>
                  ))}
                  {!submittedPersonal.length ? <span className="text-ink-faint">暂无提交</span> : null}
                </div>
              </div>
            </div>
          </Card>
        ) : null}
      </div>
    );
  }

  const isMain = active.kind === "main";
  const editable = !isMain || resource.isAdmin;
  const listName = isMain ? active.remote.name : active.local.name;
  const personalSubmission = !isMain ? ownSubmissions.get(active.local.id) : null;
  const remoteBoard = isMain ? active.remote.board : active.remote?.board;
  const storageKey = isMain
    ? `cyber-strategy:picklist:${datasetId}:main:${active.remote.id}:board`
    : personalBoardKey(datasetId, active.local.id);
  const comparisonLists = mergeMode && selectedMergeMain
    ? [{ ...selectedMergeMain, board: activeBoard ?? selectedMergeMain.board }, ...selectedMergePersonal]
    : [];
  const comparison = comparePicklistTier(comparisonLists, mergeTier);

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
        <div className="flex items-center gap-2">
          {editable ? (
            <Button type="button" className="shrink-0" onClick={() => setResetToken((value) => value + 1)} disabled={!activeBoard || !PICKLIST_ASSIGNED_COLUMNS.some((column) => activeBoard[column].length)} title="重置 Picklist">
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

      {mergeMode ? (
        <Card className="mb-3 max-h-56 shrink-0 overflow-hidden p-0">
          <div className="flex flex-wrap items-center gap-2 border-b border-line p-2">
            {PICKLIST_ASSIGNED_COLUMNS.map((column) => (
              <Button key={column} type="button" variant={mergeTier === column ? "active" : "default"} onClick={() => setMergeTier(column)}>{TIER_LABELS[column]}</Button>
            ))}
          </div>
          <div className="overflow-auto">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead className="bg-surface-2 text-xs text-ink-faint">
                <tr><th className="px-3 py-2">Team</th>{comparisonLists.map((list) => <th key={list.id} className="px-3 py-2">{list.name}{list.kind === "personal" ? ` · ${list.createdByName}` : ""}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-line">
                {comparison.map((row) => <tr key={row.team}><td className="px-3 py-2 font-semibold text-ink">Team {row.team}</td>{comparisonLists.map((list) => <td key={list.id} className="px-3 py-2 tabular-nums text-ink-dim">{row.ranks[list.id] ?? "-"}</td>)}</tr>)}
                {!comparison.length ? <tr><td colSpan={comparisonLists.length + 1} className="px-3 py-6 text-center text-ink-faint">该 Tier 暂无队伍</td></tr> : null}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      <PicklistBoard
        datasetId={datasetId}
        storageKey={storageKey}
        initialBoard={remoteBoard ?? emptyPicklistBoard()}
        preferInitial={isMain}
        resetToken={resetToken}
        readOnly={!editable}
        onBoardChange={handleBoardChange}
        teams={teams}
        tierByTeam={tierByTeam}
        onOpenTeam={onOpenTeam}
      />
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
