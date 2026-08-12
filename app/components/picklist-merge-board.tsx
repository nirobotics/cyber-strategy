import { useEffect, useMemo, useRef, useState } from "react";
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
import { tierDisplayLabel, type TierInfo } from "../lib/tier-settings";
import {
  buildPicklistColumns,
  findPicklistTeamTier,
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

const TIER_LABELS: Record<PicklistAssignedColumn, string> = { tier1: "Tier 1", tier2: "Tier 2", tier3: "Tier 3", dnp: "DNP" };

export function PicklistMergeBoard({
  board,
  column,
  personalLists,
  teams,
  tierByTeam,
  highlightedTeam,
  onChange,
  onOpenTeam,
}: {
  board: PicklistBoard;
  column: PicklistAssignedColumn;
  personalLists: SharedPicklist[];
  teams: TeamSummary[];
  tierByTeam: Map<string, TierInfo>;
  highlightedTeam: string | null;
  onChange: (board: PicklistBoard) => void;
  onOpenTeam: (team: string) => void;
}) {
  const validTeams = useMemo(() => teams.map((team) => team.team), [teams]);
  const byTeam = useMemo(() => new Map(teams.map((team) => [team.team, team])), [teams]);
  const columns = useMemo(() => buildPicklistColumns(teams, board), [board, teams]);
  const [preview, setPreview] = useState<PicklistBoard | null>(null);
  const [activeTeam, setActiveTeam] = useState<string | null>(null);
  const [pendingDrop, setPendingDrop] = useState<{ column: PicklistAssignedColumn; beforeTeam?: string } | null>(null);
  const previewRef = useRef<PicklistBoard | null>(null);
  const previousColumn = useRef<PicklistColumn>("pool");
  const activeSource = useRef<"main" | "personal" | "pool">("pool");
  const boardRef = useRef<HTMLDivElement | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 160, tolerance: 6 } }),
  );
  const visibleBoard = preview ?? board;
  const mainTeams = visibleBoard[column];

  useEffect(() => {
    if (!highlightedTeam) return;
    boardRef.current?.querySelector<HTMLElement>(`[data-team="${highlightedTeam}"]`)?.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
  }, [column, highlightedTeam]);

  function previewDrag(event: DragOverEvent) {
    const team = event.active.data.current?.team as string | undefined;
    const targetColumn = event.over?.data.current?.column as PicklistColumn | undefined;
    const beforeTeam = event.over?.data.current?.team as string | undefined;
    if (!team || !targetColumn || beforeTeam === team) {
      if (activeSource.current !== "main") setPendingDrop(null);
      return;
    }
    if (activeSource.current !== "main") {
      if (targetColumn === "pool") {
        setPendingDrop(null);
        return;
      }
      setPendingDrop({ column: targetColumn, beforeTeam });
      return;
    }
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
    const team = event.active.data.current?.team as string | undefined;
    if (event.over && activeSource.current !== "main" && team && pendingDrop) {
      onChange(previewPicklistTeam(board, validTeams, "pool", { team, ...pendingDrop }));
    } else if (event.over && previewRef.current) {
      onChange(previewRef.current);
    }
    clearDrag();
  }

  function clearDrag() {
    setActiveTeam(null);
    setPreview(null);
    setPendingDrop(null);
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
      <div ref={boardRef} className="flex min-h-0 flex-1 gap-3 overflow-x-auto overflow-y-hidden">
        <MergeColumn title="Main" count={mainTeams.length} column={column}>
          <SortableContext items={mainTeams.map(mainDragId)} strategy={verticalListSortingStrategy}>
            {mainTeams.map((team) => (
              <div key={team}>
                {pendingDrop?.column === column && pendingDrop.beforeTeam === team ? <DropIndicator /> : null}
                <MainTeam team={team} summary={byTeam.get(team)} tier={tierByTeam.get(team)} column={column} highlighted={team === highlightedTeam} onOpenTeam={onOpenTeam} />
              </div>
            ))}
          </SortableContext>
          {pendingDrop?.column === column && !pendingDrop.beforeTeam ? <DropIndicator /> : null}
          {!mainTeams.length ? <Empty text="拖拽到这里" /> : null}
        </MergeColumn>

        {personalLists.map((list) => (
          <ReadOnlyColumn key={list.id} title={`${list.name} · ${list.createdByName}`} count={list.board[column].length}>
            {list.board[column].map((team) => {
              const mainTier = findPicklistTeamTier(team, [visibleBoard]);
              return <SourceTeam key={team} id={`personal:${list.id}:${team}`} team={team} summary={byTeam.get(team)} tier={tierByTeam.get(team)} source="personal" mainAssignment={mainTier ? `Main · ${TIER_LABELS[mainTier]}` : undefined} highlighted={team === highlightedTeam} onOpenTeam={onOpenTeam} />;
            })}
            {!list.board[column].length ? <Empty text="该 Tier 暂无队伍" /> : null}
          </ReadOnlyColumn>
        ))}

        <MergeColumn title="队伍列表" count={columns.pool.length} column="pool">
          {columns.pool.map((team) => <SourceTeam key={team} id={`pool:${team}`} team={team} summary={byTeam.get(team)} tier={tierByTeam.get(team)} source="pool" highlighted={team === highlightedTeam} onOpenTeam={onOpenTeam} />)}
        </MergeColumn>
      </div>

      <DragOverlay dropAnimation={null}>
        {activeTeam ? <TeamRow team={activeTeam} summary={byTeam.get(activeTeam)} tier={tierByTeam.get(activeTeam)} overlay onOpenTeam={onOpenTeam} /> : null}
      </DragOverlay>
    </DndContext>
  );
}

function MergeColumn({ title, count, column, children }: { title: string; count: number; column: PicklistColumn; children: React.ReactNode }) {
  const { isOver, setNodeRef } = useDroppable({ id: `merge-column:${column}`, data: { column } });
  return (
    <section className={cn("flex min-h-0 min-w-60 flex-1 basis-0 flex-col overflow-hidden rounded-md border bg-surface", isOver ? "border-brand ring-2 ring-brand/20" : "border-line")}>
      <header className="flex items-center justify-between border-b border-line px-3 py-2.5"><h3 className="font-semibold text-ink">{title}</h3><span className="text-xs text-ink-dim">{count} 支</span></header>
      <div ref={setNodeRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">{children}</div>
    </section>
  );
}

function ReadOnlyColumn({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <section className="flex min-h-0 min-w-60 flex-1 basis-0 flex-col overflow-hidden rounded-md border border-line bg-surface">
      <header className="flex items-center justify-between gap-2 border-b border-line px-3 py-2.5">
        <h3 className="min-w-0 truncate font-semibold text-ink">{title}</h3>
        <span className="flex shrink-0 items-center gap-1 text-xs text-ink-dim"><LockKeyhole className="size-3.5" />{count} 支</span>
      </header>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">{children}</div>
    </section>
  );
}

function MainTeam({ team, summary, tier, column, highlighted, onOpenTeam }: { team: string; summary?: TeamSummary; tier?: TierInfo; column: PicklistAssignedColumn; highlighted: boolean; onOpenTeam: (team: string) => void }) {
  const sortable = useSortable({ id: mainDragId(team), data: { team, column, source: "main" } });
  return <TeamRow team={team} summary={summary} tier={tier} highlighted={highlighted} onOpenTeam={onOpenTeam} cardRef={sortable.setNodeRef} dragProps={{ ...sortable.attributes, ...sortable.listeners }} style={{ transform: CSS.Transform.toString(sortable.transform), transition: sortable.transition }} className={cn(sortable.isDragging && "opacity-25", sortable.isOver && !sortable.isDragging && "border-brand ring-2 ring-brand/20")} />;
}

function SourceTeam({ id, team, summary, tier, source, mainAssignment, highlighted, onOpenTeam }: { id: string; team: string; summary?: TeamSummary; tier?: TierInfo; source: "personal" | "pool"; mainAssignment?: string; highlighted: boolean; onOpenTeam: (team: string) => void }) {
  const draggable = useDraggable({ id, data: { team, source, column: source === "pool" ? "pool" : undefined } });
  return <TeamRow team={team} summary={summary} tier={tier} mainAssignment={mainAssignment} highlighted={highlighted} onOpenTeam={onOpenTeam} cardRef={draggable.setNodeRef} dragProps={{ ...draggable.attributes, ...draggable.listeners }} className={draggable.isDragging ? "opacity-40" : undefined} />;
}

function TeamRow({ team, summary, tier, mainAssignment, highlighted = false, onOpenTeam, cardRef, dragProps, style, className, overlay = false }: { team: string; summary?: TeamSummary; tier?: TierInfo; mainAssignment?: string; highlighted?: boolean; onOpenTeam: (team: string) => void; cardRef?: (node: HTMLElement | null) => void; dragProps?: React.HTMLAttributes<HTMLElement>; style?: React.CSSProperties; className?: string; overlay?: boolean }) {
  return (
    <article ref={cardRef} style={style} {...dragProps} data-team={team} className={cn("cursor-grab select-none rounded-md border border-line bg-surface-2 p-2.5 active:cursor-grabbing", overlay && "w-60 border-brand shadow-lg", highlighted && "border-brand bg-brand/10 ring-2 ring-brand/40", className)}>
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="grid size-8 shrink-0 place-items-center text-ink-faint" aria-hidden="true"><GripVertical className="size-4" /></span>
        <button type="button" onClick={() => onOpenTeam(team)} className="min-w-0 rounded-md px-1 py-1 text-left hover:bg-surface hover:text-brand">
          <span className="block truncate font-semibold tabular-nums text-ink">Team {team}</span>
          {mainAssignment ? <span className="mt-0.5 block truncate text-[10px] font-medium text-brand">{mainAssignment}</span> : null}
        </button>
        {tier ? <span className={cn("ml-auto shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold", tier.className)}>{tierDisplayLabel(tier.label)}</span> : null}
      </div>
      {summary ? (
        <div className="mt-2 grid grid-cols-3 gap-1.5 text-center">
          <MergeStat label="综合分" value={summary.avgTotal.toFixed(1)} />
          <MergeStat label="Drive" value={summary.avgDriver.toFixed(1)} />
          <MergeStat label="Defence" value={teamDefenceScore(summary).toFixed(1)} />
        </div>
      ) : null}
    </article>
  );
}

function MergeStat({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0 rounded-md bg-surface px-1 py-1.5"><p className="truncate text-[9px] text-ink-faint">{label}</p><p className="mt-0.5 truncate text-xs font-semibold tabular-nums text-ink">{value}</p></div>;
}

function Empty({ text }: { text: string }) {
  return <div className="grid min-h-20 place-items-center rounded-md border border-dashed border-line px-3 text-center text-xs text-ink-faint">{text}</div>;
}

function DropIndicator() {
  return <div className="my-1 h-1 rounded-full bg-brand/45 ring-1 ring-brand/30" aria-hidden="true" />;
}

function mainDragId(team: string) {
  return `main:${team}`;
}

function teamDefenceScore(team: TeamSummary) {
  if (team.avgDefense) return team.avgDefense;
  const ratings = team.matches.map((match) => match.defenseRating).filter((rating) => rating > 0);
  return ratings.length ? ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length : 0;
}
