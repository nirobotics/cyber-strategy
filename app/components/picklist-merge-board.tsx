import { useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  closestCenter,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, LockKeyhole } from "lucide-react";
import { cn } from "./ui";
import type { TeamSummary } from "../lib/scouting";
import {
  buildPicklistColumns,
  previewPicklistTeam,
  type PicklistAssignedColumn,
  type PicklistBoard,
  type PicklistColumn,
  type SharedPicklist,
} from "../lib/picklist";

const collisionDetection: CollisionDetection = (args) => {
  const pointerHits = pointerWithin(args);
  return pointerHits.length ? pointerHits : closestCenter(args);
};

export function PicklistMergeBoard({
  board,
  column,
  personalLists,
  teams,
  onChange,
  onOpenTeam,
}: {
  board: PicklistBoard;
  column: PicklistAssignedColumn;
  personalLists: SharedPicklist[];
  teams: TeamSummary[];
  onChange: (board: PicklistBoard) => void;
  onOpenTeam: (team: string) => void;
}) {
  const validTeams = useMemo(() => teams.map((team) => team.team), [teams]);
  const byTeam = useMemo(() => new Map(teams.map((team) => [team.team, team])), [teams]);
  const columns = useMemo(() => buildPicklistColumns(teams, board), [board, teams]);
  const [preview, setPreview] = useState<PicklistBoard | null>(null);
  const [activeTeam, setActiveTeam] = useState<string | null>(null);
  const previewRef = useRef<PicklistBoard | null>(null);
  const previousColumn = useRef<PicklistColumn>("pool");
  const activeSource = useRef<"main" | "personal" | "pool">("pool");
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 160, tolerance: 6 } }),
  );
  const visibleBoard = preview ?? board;
  const mainTeams = visibleBoard[column];

  function previewDrag(event: DragOverEvent) {
    const team = event.active.data.current?.team as string | undefined;
    const targetColumn = event.over?.data.current?.column as PicklistColumn | undefined;
    const beforeTeam = event.over?.data.current?.team as string | undefined;
    if (!team || !targetColumn || beforeTeam === team) return;
    if (activeSource.current !== "main" && targetColumn === "pool") return;
    const next = previewPicklistTeam(previewRef.current ?? board, validTeams, previousColumn.current, {
      team,
      column: targetColumn,
      beforeTeam,
    });
    previewRef.current = next;
    previousColumn.current = targetColumn;
    setPreview(next);
  }

  function finishDrag(event: DragEndEvent) {
    if (event.over && previewRef.current) onChange(previewRef.current);
    clearDrag();
  }

  function clearDrag() {
    setActiveTeam(null);
    setPreview(null);
    previewRef.current = null;
    previousColumn.current = "pool";
    activeSource.current = "pool";
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={(event) => {
        const source = event.active.data.current?.source as "main" | "personal" | "pool";
        const team = event.active.data.current?.team as string;
        activeSource.current = source;
        previousColumn.current = source === "main" ? column : "pool";
        previewRef.current = board;
        setPreview(board);
        setActiveTeam(team);
      }}
      onDragOver={previewDrag}
      onDragEnd={finishDrag}
      onDragCancel={clearDrag}
    >
      <div className="grid min-h-0 flex-1 gap-3 overflow-y-auto lg:grid-cols-[minmax(15rem,1fr)_minmax(20rem,2fr)_minmax(15rem,1fr)] lg:overflow-hidden">
        <MergeColumn title="Main" count={mainTeams.length} column={column}>
          <SortableContext items={mainTeams.map(mainDragId)} strategy={verticalListSortingStrategy}>
            {mainTeams.map((team) => <MainTeam key={team} team={team} summary={byTeam.get(team)} column={column} onOpenTeam={onOpenTeam} />)}
          </SortableContext>
          {!mainTeams.length ? <Empty text="拖拽到这里" /> : null}
        </MergeColumn>

        <section className="min-h-0 min-w-0 overflow-hidden rounded-md border border-line bg-surface sm:flex sm:flex-col">
          <header className="flex items-center justify-between border-b border-line px-3 py-2.5">
            <h3 className="font-semibold text-ink">Personal Picklist</h3>
            <LockKeyhole className="size-4 text-ink-faint" aria-label="只读" />
          </header>
          <div className="grid min-h-0 flex-1 gap-3 overflow-y-auto p-2 md:grid-cols-2">
            {personalLists.map((list) => (
              <div key={list.id} className="min-w-0 rounded-md border border-line bg-surface-2">
                <div className="truncate border-b border-line px-3 py-2 text-sm font-semibold text-ink">{list.name} · {list.createdByName}</div>
                <div className="space-y-2 p-2">
                  {list.board[column].map((team) => <SourceTeam key={team} id={`personal:${list.id}:${team}`} team={team} summary={byTeam.get(team)} source="personal" onOpenTeam={onOpenTeam} />)}
                  {!list.board[column].length ? <Empty text="该 Tier 暂无队伍" /> : null}
                </div>
              </div>
            ))}
          </div>
        </section>

        <MergeColumn title="队伍列表" count={columns.pool.length} column="pool">
          {columns.pool.map((team) => <SourceTeam key={team} id={`pool:${team}`} team={team} summary={byTeam.get(team)} source="pool" onOpenTeam={onOpenTeam} />)}
        </MergeColumn>
      </div>

      <DragOverlay dropAnimation={null}>
        {activeTeam ? <TeamRow team={activeTeam} summary={byTeam.get(activeTeam)} overlay onOpenTeam={onOpenTeam} /> : null}
      </DragOverlay>
    </DndContext>
  );
}

function MergeColumn({ title, count, column, children }: { title: string; count: number; column: PicklistColumn; children: React.ReactNode }) {
  const { isOver, setNodeRef } = useDroppable({ id: `merge-column:${column}`, data: { column } });
  return (
    <section className={cn("min-h-0 min-w-0 overflow-hidden rounded-md border bg-surface sm:flex sm:flex-col", isOver ? "border-brand ring-2 ring-brand/20" : "border-line")}>
      <header className="flex items-center justify-between border-b border-line px-3 py-2.5"><h3 className="font-semibold text-ink">{title}</h3><span className="text-xs text-ink-dim">{count} 支</span></header>
      <div ref={setNodeRef} className="min-h-28 space-y-2 overflow-y-auto p-2 sm:min-h-0 sm:flex-1">{children}</div>
    </section>
  );
}

function MainTeam({ team, summary, column, onOpenTeam }: { team: string; summary?: TeamSummary; column: PicklistAssignedColumn; onOpenTeam: (team: string) => void }) {
  const sortable = useSortable({ id: mainDragId(team), data: { team, column, source: "main" } });
  return <TeamRow team={team} summary={summary} onOpenTeam={onOpenTeam} cardRef={sortable.setNodeRef} dragProps={{ ...sortable.attributes, ...sortable.listeners }} style={{ transform: CSS.Transform.toString(sortable.transform), transition: sortable.transition }} className={cn(sortable.isDragging && "opacity-25", sortable.isOver && !sortable.isDragging && "border-brand ring-2 ring-brand/20")} />;
}

function SourceTeam({ id, team, summary, source, onOpenTeam }: { id: string; team: string; summary?: TeamSummary; source: "personal" | "pool"; onOpenTeam: (team: string) => void }) {
  const draggable = useDraggable({ id, data: { team, source, column: source === "pool" ? "pool" : undefined } });
  return <TeamRow team={team} summary={summary} onOpenTeam={onOpenTeam} cardRef={draggable.setNodeRef} dragProps={{ ...draggable.attributes, ...draggable.listeners }} className={draggable.isDragging ? "opacity-40" : undefined} />;
}

function TeamRow({ team, summary, onOpenTeam, cardRef, dragProps, style, className, overlay = false }: { team: string; summary?: TeamSummary; onOpenTeam: (team: string) => void; cardRef?: (node: HTMLElement | null) => void; dragProps?: React.HTMLAttributes<HTMLElement>; style?: React.CSSProperties; className?: string; overlay?: boolean }) {
  return (
    <article ref={cardRef} style={style} {...dragProps} className={cn("flex cursor-grab select-none items-center gap-2 rounded-md border border-line bg-surface-2 px-2 py-2 active:cursor-grabbing", overlay && "w-60 border-brand shadow-lg", className)}>
      <GripVertical className="size-4 shrink-0 text-ink-faint" />
      <button type="button" onClick={() => onOpenTeam(team)} className="min-w-0 truncate rounded-md px-1 text-left font-semibold tabular-nums text-ink hover:text-brand">Team {team}</button>
      {summary ? <span className="ml-auto shrink-0 text-xs tabular-nums text-ink-dim">{summary.avgTotal.toFixed(1)}</span> : null}
    </article>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="grid min-h-20 place-items-center rounded-md border border-dashed border-line px-3 text-center text-xs text-ink-faint">{text}</div>;
}

function mainDragId(team: string) {
  return `main:${team}`;
}
