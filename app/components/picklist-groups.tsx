import { useEffect, useState, type ComponentProps } from "react";
import { useFetcher } from "react-router";
import { PicklistWorkspace } from "./picklist-workspace";
import { Button, Card, Input } from "./ui";
import type { PicklistGroup, PicklistGroupUser, PicklistResource } from "../lib/picklist";
import type { PicklistActionData } from "../routes/_app.picklists";

type WorkspaceProps = ComponentProps<typeof PicklistWorkspace>;

export function PicklistGroups(props: WorkspaceProps) {
  const { resource, eventKey } = props;
  const groups = resource.groups ?? [];
  const groupFetcher = useFetcher<PicklistResource>();
  const [selectedId, setSelectedId] = useState("");
  const [refreshCount, setRefreshCount] = useState(0);
  const [editor, setEditor] = useState<"create" | "manage" | null>(null);
  const [managedId, setManagedId] = useState("");
  const joined = groups.filter((group) => group.joined);
  const group = joined.find((item) => item.id === selectedId) ?? (resource.isAdmin ? undefined : joined[0]);
  const groupId = group?.id;
  const groupUrl = groupId ? "/picklists?" + new URLSearchParams({ event: eventKey, group: groupId }) : null;
  const { load } = groupFetcher;
  useEffect(() => {
    if (groupUrl) void load(groupUrl);
  }, [groupUrl, load]);

  if (resource.error) return <Card className="p-4 text-danger" role="alert">{resource.error}</Card>;
  if (!resource.isAdmin && !group) return <Card className="p-4">等待管理员分配</Card>;

  const workspace = !groupId ? resource : groupFetcher.data?.groupId === groupId ? groupFetcher.data : null;
  const managing = resource.isAdmin ? groups.find((item) => item.id === managedId) ?? group ?? groups[0] : group;
  const canManage = resource.isAdmin || (workspace?.isAdmin && !workspace.error);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <select className="input min-w-36" aria-label="Picklist 工作区" value={groupId ?? ""} onChange={(event) => {
          setSelectedId(event.target.value);
          setEditor(null);
        }}>
          {resource.isAdmin ? <option value="">赛事总工作区</option> : null}
          {joined.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
        {groupUrl ? <Button type="button" disabled={groupFetcher.state !== "idle"} onClick={async () => { await load(groupUrl); setRefreshCount((value) => value + 1); }}>重新加载</Button> : null}
        {resource.isAdmin && !group ? <Button type="button" onClick={() => setEditor((value) => value === "create" ? null : "create")}>创建 Group</Button> : null}
        {canManage && managing ? <Button type="button" onClick={() => setEditor((value) => value === "manage" ? null : "manage")}>{resource.isAdmin ? "管理 Group" : "管理学生"}</Button> : null}
      </div>
      {editor && canManage ? (
        <div className="shrink-0">
          {editor === "manage" && resource.isAdmin ? (
            <select className="input mb-2" aria-label="管理的 Group" value={managing?.id ?? ""} onChange={(event) => setManagedId(event.target.value)}>
              {groups.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          ) : null}
          <RosterEditor key={editor === "create" ? "create" : managing?.id} eventKey={eventKey} group={editor === "manage" ? managing : undefined}
            admin={resource.isAdmin} onClose={() => setEditor(null)} />
        </div>
      ) : null}
      <div hidden={Boolean(editor && canManage)} className={editor && canManage ? "hidden" : "flex min-h-0 flex-1 flex-col"}>
      {workspace?.error ? <Card className="p-4 text-danger" role="alert">{workspace.error}</Card>
        : workspace ? (
          <PicklistWorkspace key={(groupId ?? "event") + ":" + refreshCount} {...props} resource={workspace} />
        ) : <Card className="p-4" role="status">正在加载 Group Picklist</Card>}
      </div>
    </div>
  );
}

function RosterEditor({ eventKey, group, admin, onClose }: { eventKey: string; group?: PicklistGroup; admin: boolean; onClose: () => void }) {
  const directory = useFetcher<PicklistActionData>();
  const command = useFetcher<PicklistActionData>();
  const [name, setName] = useState(group?.name ?? "");
  const [leaderId, setLeaderId] = useState(group?.leaderId ?? "");
  const [studentIds, setStudentIds] = useState(group?.students.map((user) => user.openId) ?? []);
  const [rosterVersion] = useState(group?.rosterVersion);
  const [query, setQuery] = useState("");
  const busy = command.state !== "idle";
  const known = new Map<string, PicklistGroupUser>();
  if (group) known.set(group.leaderId, { openId: group.leaderId, name: group.leaderName });
  for (const user of [...(group?.students ?? []), ...(directory.data?.directory ?? [])]) known.set(user.openId, user);
  const candidates = [...known.values()].filter((user) => user.name.toLowerCase().includes(query.trim().toLowerCase()));

  useEffect(() => {
    if (command.state === "idle" && command.data?.ok) onClose();
  }, [command.state, command.data, onClose]);

  function loadDirectory() {
    void directory.submit({ intent: "directory", eventKey, groupId: group?.id ?? "" }, { method: "post", action: "/picklists" });
  }

  return (
    <Card className="max-h-[55vh] space-y-3 overflow-auto p-4">
      <form className="space-y-3" onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData();
        form.set("intent", group ? admin ? "update-group" : "update-students" : "create-group");
        form.set("eventKey", eventKey);
        form.set("groupId", group?.id ?? "");
        form.set("rosterVersion", String(rosterVersion ?? 0));
        form.set("name", name);
        form.set("leaderId", leaderId);
        for (const id of studentIds) if (id !== leaderId) form.append("studentId", id);
        void command.submit(form, { method: "post", action: "/picklists" });
      }}>
        <fieldset className="space-y-3" disabled={busy}>
          <div className="flex flex-wrap items-end gap-2">
            {admin ? <label className="grid gap-1 text-sm">Group 名称<Input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} required /></label> : null}
            {admin ? <label className="grid gap-1 text-sm">Leader<select className="input" aria-label="Leader" value={leaderId} onChange={(event) => setLeaderId(event.target.value)} required>
              <option value="">选择 Leader</option>
              {[...known.values()].map((user) => <option key={user.openId} value={user.openId}>{user.name}</option>)}
            </select></label> : <span className="text-sm">Leader · {group?.leaderName}</span>}
            <Button type="button" onClick={loadDirectory} disabled={directory.state !== "idle"}>{directory.state === "idle" ? "打开飞书通讯录" : "正在读取飞书通讯录"}</Button>
          </div>
          {directory.data?.directoryWarning ? <p className="text-sm text-ink-dim" role="status">{directory.data.directoryWarning}</p> : null}
          {directory.data?.error ? <p className="text-sm text-danger" role="alert">{directory.data.error}</p> : null}
          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold">学生</legend>
            <div className="flex flex-wrap gap-2">
              {studentIds.filter((id) => id !== leaderId).map((id) => <Button key={id} type="button" onClick={() => setStudentIds((values) => values.filter((value) => value !== id))}>
                移除 {known.get(id)?.name ?? id}
              </Button>)}
            </div>
            {directory.data?.directory ? <>
              <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索飞书成员" aria-label="搜索飞书成员" />
              <div className="grid max-h-36 gap-1 overflow-auto rounded-md border border-line p-2 sm:grid-cols-2">
                {candidates.filter((user) => user.openId !== leaderId).map((user) => <label key={user.openId} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={studentIds.includes(user.openId)} onChange={(event) => {
                    const { checked } = event.target;
                    setStudentIds((values) => checked ? [...values, user.openId] : values.filter((value) => value !== user.openId));
                  }} />{user.name}
                </label>)}
              </div>
            </> : null}
          </fieldset>
        </fieldset>
        {command.data?.error ? <p className="text-sm text-danger" role="alert">{command.data.error}</p> : null}
        <div className="flex gap-2">
          <Button type="submit" variant="primary" disabled={busy || (admin && (!leaderId || !name.trim()))}>保存分组</Button>
          <Button type="button" disabled={busy} onClick={onClose}>关闭</Button>
        </div>
      </form>
    </Card>
  );
}
