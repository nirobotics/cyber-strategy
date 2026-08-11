import { useEffect, useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Download, GripVertical } from "lucide-react";
import { Button, cn } from "./ui";
import { reliability, type TeamSummary } from "../lib/scouting";
import { tierDisplayLabel, type TierInfo } from "../lib/tier-settings";
import {
  PICKLIST_COLUMNS,
  buildPicklistColumns,
  emptyPicklistBoard,
  migrateLegacyPicklist,
  movePicklistTeam,
  sanitizePicklistBoard,
  type PicklistBoard as PicklistBoardState,
  type PicklistColumn,
} from "../lib/picklist";

const COLUMN_LABELS: Record<PicklistColumn, string> = {
  tier1: "Tier 1",
  tier2: "Tier 2",
  tier3: "Tier 3",
  dnp: "DNP",
  pool: "队伍列表",
};

export function PicklistBoard({
  datasetId,
  eventKey,
  teams,
  tierByTeam,
  rankByTeam,
  onOpenTeam,
}: {
  datasetId: string;
  eventKey: string;
  teams: TeamSummary[];
  tierByTeam: Map<string, TierInfo>;
  rankByTeam: Map<string, number>;
  onOpenTeam: (team: string) => void;
}) {
  const validTeams = useMemo(() => teams.map((team) => team.team), [teams]);
  const [board, setBoard] = useStoredPicklistBoard(datasetId, validTeams);
  const [activeTeam, setActiveTeam] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);
  const columns = useMemo(() => buildPicklistColumns(teams, board), [board, teams]);
  const byTeam = useMemo(() => new Map(teams.map((team) => [team.team, team])), [teams]);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 160, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    if (!printing) return;
    const timeout = window.setTimeout(() => window.print(), 250);
    const clear = () => setPrinting(false);
    window.addEventListener("afterprint", clear, { once: true });
    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener("afterprint", clear);
    };
  }, [printing]);

  function finishDrag(event: DragEndEvent) {
    setActiveTeam(null);
    const team = event.active.data.current?.team as string | undefined;
    const targetColumn = event.over?.data.current?.column as PicklistColumn | undefined;
    const beforeTeam = event.over?.data.current?.team as string | undefined;
    if (!team || !targetColumn) return;
    setBoard((current) => movePicklistTeam(current, validTeams, team, targetColumn, beforeTeam));
  }

  return (
    <div className="min-h-0">
      <div className="mb-3 flex justify-end">
        <Button
          type="button"
          className="shrink-0"
          onClick={() => setPrinting(true)}
          disabled={!PICKLIST_COLUMNS.some((column) => column !== "pool" && columns[column].length)}
          title="导出 Picklist PDF"
        >
          <Download className="size-4" />
          导出 PDF
        </Button>
      </div>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={(event) => setActiveTeam(event.active.data.current?.team as string | null)}
        onDragCancel={() => setActiveTeam(null)}
        onDragEnd={finishDrag}
      >
        <div className="grid items-start gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {PICKLIST_COLUMNS.map((column) => (
            <PicklistColumnView
              key={column}
              column={column}
              teamIds={columns[column]}
              byTeam={byTeam}
              tierByTeam={tierByTeam}
              rankByTeam={rankByTeam}
              onOpenTeam={onOpenTeam}
            />
          ))}
        </div>
        <DragOverlay dropAnimation={null}>
          {activeTeam && byTeam.get(activeTeam) ? (
            <TeamCard
              team={byTeam.get(activeTeam)!}
              column={findTeamColumn(columns, activeTeam)}
              tier={tierByTeam.get(activeTeam)}
              rank={rankByTeam.get(activeTeam)}
              onOpenTeam={onOpenTeam}
              overlay
            />
          ) : null}
        </DragOverlay>
      </DndContext>
      {printing ? <PicklistPrintDocument eventKey={eventKey} teams={teams} rankByTeam={rankByTeam} board={board} /> : null}
    </div>
  );
}

function PicklistColumnView({
  column,
  teamIds,
  byTeam,
  tierByTeam,
  rankByTeam,
  onOpenTeam,
}: {
  column: PicklistColumn;
  teamIds: string[];
  byTeam: Map<string, TeamSummary>;
  tierByTeam: Map<string, TierInfo>;
  rankByTeam: Map<string, number>;
  onOpenTeam: (team: string) => void;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: `column:${column}`, data: { column } });
  return (
    <section className={cn("min-w-0 overflow-hidden rounded-md border bg-surface transition", isOver ? "border-brand ring-2 ring-brand/20" : "border-line")}>
      <header className="flex items-center justify-between border-b border-line px-3 py-2.5">
        <h2 className="font-semibold text-ink">{COLUMN_LABELS[column]}</h2>
        <span className="text-xs tabular-nums text-ink-dim">{teamIds.length} 支</span>
      </header>
      <SortableContext items={teamIds.map(teamDragId)} strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef} className="min-h-28 space-y-2 p-2 xl:max-h-[68dvh] xl:overflow-y-auto">
          {teamIds.map((teamNumber) => {
            const team = byTeam.get(teamNumber);
            return team ? (
              <SortableTeamCard
                key={teamNumber}
                team={team}
                column={column}
                tier={tierByTeam.get(teamNumber)}
                rank={rankByTeam.get(teamNumber)}
                onOpenTeam={onOpenTeam}
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

function SortableTeamCard(props: Omit<Parameters<typeof TeamCard>[0], "dragHandleProps" | "style">) {
  const { attributes, listeners, isDragging, isOver, setNodeRef, transform, transition } = useSortable({
    id: teamDragId(props.team.team),
    data: { type: "team", team: props.team.team, column: props.column },
  });
  return (
    <TeamCard
      {...props}
      cardRef={setNodeRef}
      dragHandleProps={{ ...attributes, ...listeners }}
      className={cn(isDragging && "opacity-25", isOver && !isDragging && "border-brand ring-2 ring-brand/20")}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    />
  );
}

function TeamCard({
  team,
  tier,
  rank,
  onOpenTeam,
  cardRef,
  dragHandleProps,
  className,
  style,
  overlay = false,
}: {
  team: TeamSummary;
  column: PicklistColumn;
  tier?: TierInfo;
  rank?: number;
  onOpenTeam: (team: string) => void;
  cardRef?: (node: HTMLElement | null) => void;
  dragHandleProps?: React.ButtonHTMLAttributes<HTMLButtonElement>;
  className?: string;
  style?: React.CSSProperties;
  overlay?: boolean;
}) {
  return (
    <article
      ref={cardRef}
      style={style}
      className={cn(
        "rounded-md border border-line bg-surface-2 p-2.5 shadow-sm transition-colors hover:border-brand/45",
        overlay && "w-60 rotate-1 border-brand shadow-lg",
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <button
          type="button"
          {...dragHandleProps}
          className="grid size-8 shrink-0 touch-none place-items-center rounded-md text-ink-faint hover:bg-surface hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
          aria-label={`拖拽 Team ${team.team}`}
        >
          <GripVertical className="size-4" />
        </button>
        <span className="w-6 shrink-0 text-right text-xs tabular-nums text-ink-faint">{rank ?? "-"}</span>
        <button
          type="button"
          onClick={() => onOpenTeam(team.team)}
          className="min-w-0 truncate rounded-md px-1 py-1 text-left font-semibold tabular-nums text-ink hover:bg-surface hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
        >
          Team {team.team}
        </button>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-1.5 text-center">
        <PicklistStat label="综合分" value={team.avgTotal.toFixed(1)} />
        <PicklistStat label="Drive" value={team.avgDriver.toFixed(1)} />
        <PicklistStat label="Defence" value={teamDefenceScore(team).toFixed(1)} />
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-[10px] text-ink-faint">所属类别</span>
        {tier ? (
          <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-semibold", tier.className)}>
            {tierDisplayLabel(tier.label)}
          </span>
        ) : <span className="text-[10px] text-ink-faint">-</span>}
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

function PicklistPrintDocument({
  eventKey,
  teams,
  rankByTeam,
  board,
}: {
  eventKey: string;
  teams: TeamSummary[];
  rankByTeam: Map<string, number>;
  board: PicklistBoardState;
}) {
  const byTeam = new Map(teams.map((team) => [team.team, team]));
  const exportedAt = new Date().toLocaleString("zh-CN", { hour12: false });
  return (
    <div className="picklist-print-root" aria-hidden="true">
      <style>{PICKLIST_PRINT_CSS}</style>
      <article className="picklist-print-page">
        <header className="picklist-print-header">
          <div><p>NI Robotics · Cyber Strategy</p><h1>Picklist</h1></div>
          <div><span>{eventKey}</span><span>{exportedAt}</span></div>
        </header>
        <div className="picklist-print-lists">
          {PICKLIST_COLUMNS.filter((column) => column !== "pool").map((column) => (
            <section key={column}>
              <h2>{COLUMN_LABELS[column]}</h2>
              {!board[column].length ? <p className="picklist-print-empty">暂无队伍</p> : null}
              {board[column].map((teamNumber, index) => {
                const team = byTeam.get(teamNumber);
                return team ? (
                  <div className="picklist-print-row" key={teamNumber}>
                    <strong>{index + 1}</strong>
                    <div><h3>Team {teamNumber}</h3><p>数据排名 #{rankByTeam.get(teamNumber) ?? "-"} · {team.matchCount} 场 · 可靠性 {reliability(team)}%</p></div>
                    <div className="picklist-print-stats">
                      <span>综合 <b>{team.avgTotal.toFixed(1)}</b></span>
                      <span>Drive <b>{team.avgDriver.toFixed(1)}</b></span>
                      <span>Defence <b>{teamDefenceScore(team).toFixed(1)}</b></span>
                    </div>
                  </div>
                ) : null;
              })}
            </section>
          ))}
        </div>
        <footer>NI Robotics · Cyber Strategy · Picklist</footer>
      </article>
    </div>
  );
}

function useStoredPicklistBoard(datasetId: string, validTeams: string[]) {
  const key = `cyber-strategy:picklist:${datasetId}:board`;
  const [board, setBoard] = useState<PicklistBoardState>(emptyPicklistBoard);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const validSignature = validTeams.join(",");

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      try {
        const raw = window.localStorage.getItem(key);
        const next = raw
          ? sanitizePicklistBoard(JSON.parse(raw) as PicklistBoardState, validTeams)
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
  }, [datasetId, key, validSignature, validTeams]);

  useEffect(() => {
    if (loadedKey !== key) return;
    window.localStorage.setItem(key, JSON.stringify(sanitizePicklistBoard(board, validTeams)));
  }, [board, key, loadedKey, validSignature, validTeams]);

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

const PICKLIST_PRINT_CSS = `
.picklist-print-root { position: fixed; left: -10000px; top: 0; width: 297mm; height: 1px; overflow: hidden; background: #fff; color: #111827; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
.picklist-print-root * { box-sizing: border-box; }
@page { size: A4 landscape; margin: 10mm; }
@media print {
  html, body { background: #fff !important; }
  body * { visibility: hidden !important; }
  .picklist-print-root, .picklist-print-root * { visibility: visible !important; }
  .picklist-print-root { position: absolute !important; left: 0 !important; top: 0 !important; width: 100% !important; height: auto !important; overflow: visible !important; }
  .picklist-print-page { min-height: 180mm; color: #111827; background: #fff; }
  .picklist-print-header { display: flex; align-items: end; justify-content: space-between; gap: 16px; padding-bottom: 8px; border-bottom: 1px solid #d1d5db; }
  .picklist-print-header p, .picklist-print-header h1 { margin: 0; }
  .picklist-print-header p { color: #6b7280; font-size: 9px; text-transform: uppercase; letter-spacing: .08em; }
  .picklist-print-header h1 { margin-top: 2px; font-size: 22px; }
  .picklist-print-header > div:last-child { display: grid; gap: 2px; color: #6b7280; font-size: 9px; text-align: right; }
  .picklist-print-lists { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 5mm; margin-top: 6mm; }
  .picklist-print-lists section { min-width: 0; }
  .picklist-print-lists h2 { margin: 0 0 3mm; font-size: 14px; }
  .picklist-print-row { display: grid; grid-template-columns: 7mm minmax(0, 1fr); gap: 2mm; break-inside: avoid; margin-bottom: 2mm; border: 1px solid #e5e7eb; border-radius: 5px; padding: 2mm; }
  .picklist-print-row > strong { display: grid; place-items: center; border-radius: 4px; background: #f3f4f6; font-size: 11px; }
  .picklist-print-row h3, .picklist-print-row p { margin: 0; }
  .picklist-print-row h3 { font-size: 10px; }
  .picklist-print-row p { margin-top: 1px; color: #6b7280; font-size: 7px; }
  .picklist-print-stats { grid-column: 2; display: flex; flex-wrap: wrap; gap: 1mm 3mm; color: #6b7280; font-size: 7px; }
  .picklist-print-stats b { color: #111827; }
  .picklist-print-empty { color: #6b7280; font-size: 9px; }
  .picklist-print-page footer { position: fixed; right: 10mm; bottom: 4mm; left: 10mm; color: #6b7280; font-size: 8px; text-align: center; }
}
`;
