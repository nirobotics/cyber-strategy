import { useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type CollisionDetection,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, RotateCcw } from "lucide-react";
import { Button, cn } from "./ui";
import type { TeamSummary } from "../lib/scouting";
import { tierDisplayLabel, type TierInfo } from "../lib/tier-settings";
import {
  PICKLIST_ASSIGNED_COLUMNS,
  PICKLIST_COLUMNS,
  buildPicklistColumns,
  emptyPicklistBoard,
  migrateLegacyPicklist,
  previewPicklistTeam,
  sanitizePicklistBoard,
  type PicklistBoard as PicklistBoardState,
  type PicklistColumn,
  type PicklistDropTarget,
} from "../lib/picklist";

const picklistCollisionDetection: CollisionDetection = (args) => {
  const pointerHits = pointerWithin(args);
  return pointerHits.length ? pointerHits : closestCenter(args);
};

const COLUMN_LABELS: Record<PicklistColumn, string> = {
  tier1: "Tier 1",
  tier2: "Tier 2",
  tier3: "Tier 3",
  dnp: "DNP",
  pool: "队伍列表",
};

export function PicklistBoard({
  datasetId,
  storageKey,
  initialBoard,
  readOnly = false,
  preferInitial = false,
  onBoardChange,
  teams,
  tierByTeam,
  onOpenTeam,
}: {
  datasetId: string;
  storageKey?: string;
  initialBoard?: PicklistBoardState;
  readOnly?: boolean;
  preferInitial?: boolean;
  onBoardChange?: (board: PicklistBoardState) => void;
  teams: TeamSummary[];
  tierByTeam: Map<string, TierInfo>;
  onOpenTeam: (team: string) => void;
}) {
  const validTeams = useMemo(() => teams.map((team) => team.team), [teams]);
  const resolvedStorageKey = storageKey ?? `cyber-strategy:picklist:${datasetId}:board`;
  const [board, setBoard] = useStoredPicklistBoard(resolvedStorageKey, datasetId, validTeams, initialBoard, preferInitial, onBoardChange);
  const [previewBoard, setPreviewBoard] = useState<PicklistBoardState | null>(null);
  const [activeTeam, setActiveTeam] = useState<string | null>(null);
  const dragColumn = useRef<PicklistColumn | null>(null);
  const previewBoardRef = useRef<PicklistBoardState | null>(null);
  const columns = useMemo(() => buildPicklistColumns(teams, previewBoard ?? board), [board, previewBoard, teams]);
  const byTeam = useMemo(() => new Map(teams.map((team) => [team.team, team])), [teams]);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 160, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const hasAssignments = PICKLIST_ASSIGNED_COLUMNS.some((column) => board[column].length);

  function previewDrag(event: DragOverEvent) {
    const target = readDragTarget(event);
    if (!target || target.beforeTeam === target.team) return;
    const base = previewBoardRef.current ?? board;
    const next = previewPicklistTeam(base, validTeams, dragColumn.current ?? target.column, target);
    previewBoardRef.current = next;
    dragColumn.current = target.column;
    setPreviewBoard(next);
  }

  function finishDrag(event: DragEndEvent) {
    if (event.over && previewBoardRef.current) setBoard(previewBoardRef.current);
    clearDrag();
  }

  function clearDrag() {
    setActiveTeam(null);
    setPreviewBoard(null);
    dragColumn.current = null;
    previewBoardRef.current = null;
  }

  return (
    <div className="min-h-0 sm:flex sm:flex-1 sm:flex-col sm:overflow-hidden">
      {!readOnly ? <div className="mb-3 flex shrink-0 justify-end">
        <Button
          type="button"
          className="shrink-0"
          onClick={() => setBoard(emptyPicklistBoard())}
          disabled={!hasAssignments}
          title="重置 Picklist"
        >
          <RotateCcw className="size-4" />
          重置
        </Button>
      </div> : null}
      <DndContext
        sensors={sensors}
        collisionDetection={picklistCollisionDetection}
        onDragStart={(event) => {
          if (readOnly) return;
          setActiveTeam(event.active.data.current?.team as string | null);
          setPreviewBoard(board);
          previewBoardRef.current = board;
          dragColumn.current = event.active.data.current?.column as PicklistColumn | null;
        }}
        onDragOver={previewDrag}
        onDragCancel={clearDrag}
        onDragEnd={finishDrag}
      >
        <div className="grid grid-cols-1 items-start gap-3 landscape:grid-cols-5 sm:min-h-0 sm:flex-1 sm:grid-cols-5 sm:items-stretch">
          {PICKLIST_COLUMNS.map((column) => (
            <PicklistColumnView
              key={column}
              column={column}
              teamIds={columns[column]}
              byTeam={byTeam}
              tierByTeam={tierByTeam}
              onOpenTeam={onOpenTeam}
              readOnly={readOnly}
            />
          ))}
        </div>
        <DragOverlay dropAnimation={null}>
          {activeTeam && byTeam.get(activeTeam) ? (
            <TeamCard
              team={byTeam.get(activeTeam)!}
              column={findTeamColumn(columns, activeTeam)}
              tier={tierByTeam.get(activeTeam)}
              onOpenTeam={onOpenTeam}
              overlay
            />
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

function PicklistColumnView({
  column,
  teamIds,
  byTeam,
  tierByTeam,
  onOpenTeam,
  readOnly,
}: {
  column: PicklistColumn;
  teamIds: string[];
  byTeam: Map<string, TeamSummary>;
  tierByTeam: Map<string, TierInfo>;
  onOpenTeam: (team: string) => void;
  readOnly: boolean;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: `column:${column}`, data: { column } });
  return (
    <section className={cn("min-w-0 overflow-hidden rounded-md border bg-surface transition sm:flex sm:h-full sm:min-h-0 sm:flex-col", isOver ? "border-brand ring-2 ring-brand/20" : "border-line")}>
      <header className="flex items-center justify-between border-b border-line px-3 py-2.5">
        <h2 className="font-semibold text-ink">{COLUMN_LABELS[column]}</h2>
        <span className="text-xs tabular-nums text-ink-dim">{teamIds.length} 支</span>
      </header>
      <SortableContext items={teamIds.map(teamDragId)} strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef} className="min-h-28 space-y-2 p-2 sm:min-h-0 sm:flex-1 sm:overflow-y-auto">
          {teamIds.map((teamNumber) => {
            const team = byTeam.get(teamNumber);
            return team ? (
              <SortableTeamCard
                key={teamNumber}
                team={team}
                column={column}
                tier={tierByTeam.get(teamNumber)}
                onOpenTeam={onOpenTeam}
                readOnly={readOnly}
              />
            ) : null;
          })}
          {!teamIds.length ? (
            <div className="grid min-h-24 place-items-center rounded-md border border-dashed border-line px-3 text-center text-xs text-ink-faint">
              拖拽队伍到这里
            </div>
          ) : null}
        </div>
      </SortableContext>
    </section>
  );
}

function SortableTeamCard(props: Omit<Parameters<typeof TeamCard>[0], "dragProps" | "style">) {
  const { attributes, listeners, isDragging, isOver, setNodeRef, transform, transition } = useSortable({
    id: teamDragId(props.team.team),
    data: { type: "team", team: props.team.team, column: props.column },
    disabled: props.readOnly,
  });
  return (
    <TeamCard
      {...props}
      cardRef={setNodeRef}
      dragProps={{ ...attributes, ...listeners }}
      className={cn(isDragging && "opacity-25", isOver && !isDragging && "border-brand ring-2 ring-brand/20")}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    />
  );
}

function TeamCard({
  team,
  tier,
  onOpenTeam,
  cardRef,
  dragProps,
  className,
  style,
  overlay = false,
  readOnly = false,
}: {
  team: TeamSummary;
  column: PicklistColumn;
  tier?: TierInfo;
  onOpenTeam: (team: string) => void;
  cardRef?: (node: HTMLElement | null) => void;
  dragProps?: React.HTMLAttributes<HTMLElement>;
  className?: string;
  style?: React.CSSProperties;
  overlay?: boolean;
  readOnly?: boolean;
}) {
  return (
    <article
      ref={cardRef}
      style={style}
      {...dragProps}
      className={cn(
        "select-none rounded-md border border-line bg-surface-2 p-2.5 shadow-sm transition-colors hover:border-brand/45",
        readOnly ? "cursor-default" : "cursor-grab active:cursor-grabbing",
        overlay && "w-60 rotate-1 border-brand shadow-lg",
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="grid size-8 shrink-0 place-items-center text-ink-faint" aria-hidden="true">
          <GripVertical className="size-4" />
        </span>
        <button
          type="button"
          onClick={() => onOpenTeam(team.team)}
          className="min-w-0 truncate rounded-md px-1 py-1 text-left font-semibold tabular-nums text-ink hover:bg-surface hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
        >
          Team {team.team}
        </button>
        {tier ? (
          <span className={cn("ml-auto shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold", tier.className)}>
            {tierDisplayLabel(tier.label)}
          </span>
        ) : null}
      </div>
      <div className="mt-2 grid grid-cols-3 gap-1.5 text-center">
        <PicklistStat label="综合分" value={team.avgTotal.toFixed(1)} />
        <PicklistStat label="Drive" value={team.avgDriver.toFixed(1)} />
        <PicklistStat label="Defence" value={teamDefenceScore(team).toFixed(1)} />
      </div>
    </article>
  );
}

function PicklistStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md bg-surface px-1 py-1.5">
      <p className="truncate text-[9px] text-ink-faint">{label}</p>
      <p className="mt-0.5 truncate text-xs font-semibold tabular-nums text-ink">{value}</p>
    </div>
  );
}

function readDragTarget(event: DragOverEvent | DragEndEvent): PicklistDropTarget | null {
  const team = event.active.data.current?.team as string | undefined;
  const column = event.over?.data.current?.column as PicklistColumn | undefined;
  const beforeTeam = event.over?.data.current?.team as string | undefined;
  return team && column ? { team, column, beforeTeam } : null;
}

function useStoredPicklistBoard(
  key: string,
  datasetId: string,
  validTeams: string[],
  initialBoard: PicklistBoardState | undefined,
  preferInitial: boolean,
  onBoardChange: ((board: PicklistBoardState) => void) | undefined,
) {
  const [board, setBoard] = useState<PicklistBoardState>(emptyPicklistBoard);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const validSignature = validTeams.join(",");
  const initialSignature = JSON.stringify(initialBoard ?? emptyPicklistBoard());

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      try {
        const raw = window.localStorage.getItem(key);
        const next = preferInitial
          ? sanitizePicklistBoard(initialBoard, validTeams)
          : raw
          ? sanitizePicklistBoard(JSON.parse(raw) as PicklistBoardState, validTeams)
          : initialBoard
            ? sanitizePicklistBoard(initialBoard, validTeams)
            : migrateLegacyPicklist(
              readStoredList(`cyber-strategy:picklist:${datasetId}:first`),
              readStoredList(`cyber-strategy:picklist:${datasetId}:second`),
              readStoredList(`cyber-strategy:picklist:${datasetId}:crossed`),
              validTeams,
            );
        setBoard(next);
      } catch {
        setBoard(emptyPicklistBoard());
      }
      setLoadedKey(key);
    });
    return () => {
      cancelled = true;
    };
  }, [datasetId, initialBoard, initialSignature, key, preferInitial, validSignature, validTeams]);

  useEffect(() => {
    if (loadedKey !== key) return;
    const sanitized = sanitizePicklistBoard(board, validTeams);
    window.localStorage.setItem(key, JSON.stringify(sanitized));
    onBoardChange?.(sanitized);
  }, [board, key, loadedKey, onBoardChange, validSignature, validTeams]);

  return [board, setBoard] as const;
}

function readStoredList(key: string) {
  const raw = window.localStorage.getItem(key);
  return raw ? (JSON.parse(raw) as string[]) : [];
}

function findTeamColumn(columns: Record<PicklistColumn, string[]>, team: string) {
  return PICKLIST_COLUMNS.find((column) => columns[column].includes(team)) ?? "pool";
}

function teamDragId(team: string) {
  return `team:${team}`;
}

function teamDefenceScore(team: TeamSummary) {
  if (team.avgDefense) return team.avgDefense;
  const ratings = team.matches.map((match) => match.defenseRating).filter((rating) => rating > 0);
  return ratings.length ? ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length : 0;
}
