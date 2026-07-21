import { Eraser, Pencil, RotateCw, Trash2, Undo2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Button, Card, cn } from "./ui";
import type { ProposalMatch } from "../lib/strategy-proposal-matches";
import {
  autoWinners,
  compactRoutePoints,
  defaultStrategyRobots,
  ensureStrategyBoardTeams,
  eraseStrategyStrokes,
  shouldFinishRouteStroke,
  strategyBoardColors,
  strategyBoardPhases,
  type AutoProposalPayload,
  type AutoWinner,
  type RoutePoint,
  type StrategyBoardPhase,
  type StrategyBoardPhaseId,
  type StrategyBoardRobot,
  type StrategyBoardStroke,
} from "../lib/strategy-proposals";

type BoardTool = "pen" | "eraser";
type RobotGesture = {
  kind: "move" | "rotate";
  team: string;
  before: StrategyBoardPhase;
  startX: number;
  startY: number;
  robot: StrategyBoardRobot;
};

export function StrategyBoard({
  payload,
  match,
  disabled,
  onChange,
}: {
  payload: AutoProposalPayload;
  match: ProposalMatch;
  disabled: boolean;
  onChange: (payload: AutoProposalPayload) => void;
}) {
  const normalized = useMemo(
    () => ensureStrategyBoardTeams(payload, match.redTeams, match.blueTeams),
    [match.blueTeams, match.redTeams, payload],
  );
  const [phase, setPhase] = useState<StrategyBoardPhaseId>("auto");
  const [tool, setTool] = useState<BoardTool>("pen");
  const [color, setColor] = useState<string>(strategyBoardColors[0]);
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);
  const [phaseDraft, setPhaseDraft] = useState(normalized.phases.auto);
  const [draftStroke, setDraftStroke] = useState<RoutePoint[]>([]);
  const [undoCounts, setUndoCounts] = useState<Record<StrategyBoardPhaseId, number>>({ auto: 0, transition: 0, active: 0, inactive: 0 });
  const phaseRef = useRef(phaseDraft);
  const drawingRef = useRef(false);
  const eraseChangedRef = useRef(false);
  const robotGestureRef = useRef<RobotGesture | null>(null);
  const historyRef = useRef<Record<StrategyBoardPhaseId, StrategyBoardPhase[]>>({
    auto: [],
    transition: [],
    active: [],
    inactive: [],
  });

  useEffect(() => {
    if (drawingRef.current || robotGestureRef.current) return;
    const next = normalized.phases[phase];
    phaseRef.current = next;
    setPhaseDraft(next);
  }, [normalized, phase]);

  function pointFromPointer(event: ReactPointerEvent<HTMLElement>) {
    const rect = event.currentTarget.closest("[data-strategy-field]")?.getBoundingClientRect();
    if (!rect?.width || !rect.height) return null;
    return {
      x: clampPercent(((event.clientX - rect.left) / rect.width) * 100),
      y: clampPercent(((event.clientY - rect.top) / rect.height) * 100),
    };
  }

  function updatePhase(next: StrategyBoardPhase, commit = true) {
    phaseRef.current = next;
    setPhaseDraft(next);
    if (commit) onChange({ ...normalized, phases: { ...normalized.phases, [phase]: next } });
  }

  function pushHistory(value: StrategyBoardPhase) {
    const history = historyRef.current[phase];
    history.push(value);
    if (history.length > 40) history.shift();
    setUndoCounts((current) => ({ ...current, [phase]: history.length }));
  }

  function startBoardPointer(event: ReactPointerEvent<HTMLDivElement>) {
    if (disabled || event.button > 0) return;
    const point = pointFromPointer(event);
    if (!point) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drawingRef.current = true;
    if (tool === "eraser") {
      eraseChangedRef.current = false;
      eraseAt(point);
      return;
    }
    setDraftStroke([point]);
  }

  function moveBoardPointer(event: ReactPointerEvent<HTMLDivElement>) {
    if (!drawingRef.current) return;
    const point = pointFromPointer(event);
    if (!point) return;
    event.preventDefault();
    if (tool === "eraser") {
      eraseAt(point);
      return;
    }
    setDraftStroke((current) => {
      const previous = current.at(-1);
      return previous && Math.hypot(point.x - previous.x, point.y - previous.y) < 0.6 ? current : [...current, point];
    });
  }

  function stopBoardPointer(event: ReactPointerEvent<HTMLDivElement>) {
    if (!shouldFinishRouteStroke(event.type, event.pointerType) || !drawingRef.current) return;
    drawingRef.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (tool === "eraser") {
      eraseChangedRef.current = false;
      return;
    }
    setDraftStroke((points) => {
      if (points.length > 1) {
        const compacted = compactRoutePoints(points).map(({ x, y }) => ({ x, y }));
        const stroke: StrategyBoardStroke = { id: strokeId(), color, points: compacted };
        pushHistory(phaseRef.current);
        updatePhase({ ...phaseRef.current, strokes: [...phaseRef.current.strokes, stroke] });
      }
      return [];
    });
  }

  function eraseAt(point: RoutePoint) {
    const strokes = eraseStrategyStrokes(phaseRef.current.strokes, point);
    if (strokes.length === phaseRef.current.strokes.length) return;
    if (!eraseChangedRef.current) pushHistory(phaseRef.current);
    eraseChangedRef.current = true;
    updatePhase({ ...phaseRef.current, strokes });
  }

  function startRobotGesture(
    event: ReactPointerEvent<HTMLElement>,
    robot: StrategyBoardRobot,
    kind: RobotGesture["kind"],
  ) {
    if (disabled) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setSelectedTeam(robot.team);
    robotGestureRef.current = {
      kind,
      team: robot.team,
      before: phaseRef.current,
      startX: event.clientX,
      startY: event.clientY,
      robot,
    };
  }

  function moveRobotGesture(event: ReactPointerEvent<HTMLElement>) {
    const gesture = robotGestureRef.current;
    if (!gesture) return;
    event.preventDefault();
    const field = event.currentTarget.closest("[data-strategy-field]")?.getBoundingClientRect();
    if (!field?.width || !field.height) return;
    let robot: StrategyBoardRobot;
    if (gesture.kind === "move") {
      robot = {
        ...gesture.robot,
        x: clampPercent(gesture.robot.x + ((event.clientX - gesture.startX) / field.width) * 100),
        y: clampPercent(gesture.robot.y + ((event.clientY - gesture.startY) / field.height) * 100),
      };
    } else {
      const centerX = field.left + (gesture.robot.x / 100) * field.width;
      const centerY = field.top + (gesture.robot.y / 100) * field.height;
      const allianceOffset = match.blueTeams.includes(gesture.team) ? 180 : 0;
      robot = {
        ...gesture.robot,
        rotation: Math.round((Math.atan2(event.clientY - centerY, event.clientX - centerX) * 180 / Math.PI + allianceOffset) * 10) / 10,
      };
    }
    updatePhase({
      ...phaseRef.current,
      robots: phaseRef.current.robots.map((item) => item.team === gesture.team ? robot : item),
    }, false);
  }

  function stopRobotGesture(event: ReactPointerEvent<HTMLElement>) {
    const gesture = robotGestureRef.current;
    if (!gesture) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    robotGestureRef.current = null;
    if (phaseRef.current !== gesture.before) {
      pushHistory(gesture.before);
      updatePhase(phaseRef.current);
    }
  }

  function undo() {
    const previous = historyRef.current[phase].pop();
    if (previous) {
      setUndoCounts((current) => ({ ...current, [phase]: historyRef.current[phase].length }));
      updatePhase(previous);
    }
  }

  function clearStrokes() {
    if (!phaseRef.current.strokes.length) return;
    pushHistory(phaseRef.current);
    updatePhase({ ...phaseRef.current, strokes: [] });
  }

  function resetRobots() {
    pushHistory(phaseRef.current);
    updatePhase({ ...phaseRef.current, robots: defaultStrategyRobots(match.redTeams, match.blueTeams) });
    setSelectedTeam(null);
  }

  return (
    <div className="grid gap-3">
      <Card className="overflow-hidden p-0">
        <div className="grid gap-3 border-b border-line p-3">
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" onClick={undo} disabled={disabled || !undoCounts[phase]}>
              <Undo2 className="size-4" />撤销
            </Button>
            <Button type="button" onClick={clearStrokes} disabled={disabled || !phaseDraft.strokes.length}>
              <Trash2 className="size-4" />清空笔迹
            </Button>
            <Button type="button" onClick={resetRobots} disabled={disabled}>
              <RotateCw className="size-4" />重置机器人
            </Button>
          </div>
          <div className="flex flex-wrap gap-2" aria-label="比赛阶段">
            {strategyBoardPhases.map((item) => (
              <Button key={item} type="button" variant={phase === item ? "active" : "default"} onClick={() => {
                setSelectedTeam(null);
                setDraftStroke([]);
                setPhase(item);
              }}>
                {phaseLabel(item)}
              </Button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant={tool === "pen" ? "active" : "default"} onClick={() => setTool("pen")} disabled={disabled}>
              <Pencil className="size-4" />笔
            </Button>
            <Button type="button" variant={tool === "eraser" ? "active" : "default"} onClick={() => setTool("eraser")} disabled={disabled}>
              <Eraser className="size-4" />橡皮
            </Button>
            <span className="ml-1 text-xs text-ink-dim">颜色</span>
            {strategyBoardColors.map((item) => (
              <button
                key={item}
                type="button"
                className={cn("size-8 rounded-full border-2 border-line shadow-sm", color === item && "ring-2 ring-brand ring-offset-2 ring-offset-surface")}
                style={{ backgroundColor: item }}
                onClick={() => { setColor(item); setTool("pen"); }}
                disabled={disabled}
                aria-label={`画笔颜色 ${item}`}
              />
            ))}
          </div>
        </div>

        <div
          data-strategy-field
          className={cn("relative aspect-[3510/1610] touch-none overflow-hidden bg-black", !disabled && (tool === "pen" ? "cursor-crosshair" : "cursor-cell"))}
          onPointerDown={startBoardPointer}
          onPointerMove={moveBoardPointer}
          onPointerUp={stopBoardPointer}
          onPointerCancel={stopBoardPointer}
          onPointerLeave={stopBoardPointer}
          role="application"
          aria-label={`${phaseLabel(phase)}策略绘制板`}
        >
          <img src="/strategy-board-2026.png" alt="" draggable={false} className="pointer-events-none absolute inset-0 h-full w-full select-none object-fill" />
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
            {phaseDraft.strokes.map((stroke) => (
              <polyline
                key={stroke.id}
                points={stroke.points.map((point) => `${point.x},${point.y}`).join(" ")}
                fill="none"
                stroke={stroke.color}
                strokeWidth="4"
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {draftStroke.length > 1 ? (
              <polyline
                points={draftStroke.map((point) => `${point.x},${point.y}`).join(" ")}
                fill="none"
                stroke={color}
                strokeWidth="4"
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            ) : null}
          </svg>
          {phaseDraft.robots.map((robot) => {
            const red = match.redTeams.includes(robot.team);
            const selected = selectedTeam === robot.team;
            return (
              <button
                key={robot.team}
                type="button"
                className={cn(
                  "absolute z-10 grid touch-none select-none place-items-center rounded-md p-[3px] text-[clamp(0.5rem,1.05vw,0.875rem)] font-bold text-white shadow-lg",
                  red ? "bg-danger" : "bg-info",
                  selected && "ring-2 ring-white/90 ring-offset-2 ring-offset-black/40",
                )}
                style={{
                  left: `${robot.x}%`,
                  top: `${robot.y}%`,
                  width: "max(4.342%, 2.25rem)",
                  aspectRatio: "1",
                  transform: `translate(-50%, -50%) rotate(${robot.rotation}deg)`,
                }}
                onPointerDown={(event) => startRobotGesture(event, robot, "move")}
                onPointerMove={moveRobotGesture}
                onPointerUp={stopRobotGesture}
                onPointerCancel={stopRobotGesture}
                disabled={disabled}
                aria-label={`Team ${robot.team} 机器人`}
              >
                <span className="grid size-full place-items-center rounded-[3px] bg-[#242429] leading-none">{robot.team}</span>
                {selected ? (
                  <span
                    role="button"
                    tabIndex={-1}
                    className={cn(
                      "absolute top-1/2 size-4 -translate-y-1/2 rounded-full border-2 border-[#242429] bg-white shadow",
                      red ? "-right-2" : "-left-2",
                    )}
                    onPointerDown={(event) => startRobotGesture(event, robot, "rotate")}
                    aria-label={`旋转 Team ${robot.team}`}
                  />
                ) : null}
              </button>
            );
          })}
        </div>
      </Card>

      <label className="grid max-w-xs gap-1">
        <span className="text-sm font-medium text-ink-dim">预测自动阶段结果</span>
        <select
          value={normalized.autoWinner}
          disabled={disabled}
          onChange={(event) => onChange({ ...normalized, autoWinner: event.target.value as AutoWinner })}
          className="input h-10 font-sans"
        >
          {autoWinners.map((winner) => <option key={winner} value={winner}>{autoWinnerLabel(winner)}</option>)}
        </select>
      </label>

      <div className="grid gap-2 rounded-md border border-line bg-surface-2 p-3">
        <p className="section-label">队伍备注</p>
        <div className="grid gap-2 md:grid-cols-2">
          {[...match.redTeams, ...match.blueTeams].map((team) => (
            <label key={team} className="grid gap-1">
              <span className="text-sm font-medium text-ink-dim">Team {team}</span>
              <input
                value={normalized.teamNotes[team] ?? ""}
                disabled={disabled}
                onChange={(event) => onChange({ ...normalized, teamNotes: { ...normalized.teamNotes, [team]: event.target.value } })}
                className="input h-10 font-sans"
                placeholder="分工、目标或注意事项"
              />
            </label>
          ))}
        </div>
      </div>

      <label className="grid gap-1">
        <span className="text-sm font-medium text-ink-dim">整场备注</span>
        <textarea
          value={normalized.note}
          disabled={disabled}
          onChange={(event) => onChange({ ...normalized, note: event.target.value })}
          className="input min-h-24 font-sans"
        />
      </label>
    </div>
  );
}

function phaseLabel(phase: StrategyBoardPhaseId) {
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

function clampPercent(value: number) {
  return Math.round(Math.max(3, Math.min(97, value)) * 10) / 10;
}

function strokeId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
