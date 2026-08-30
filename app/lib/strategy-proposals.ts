import { seasonConfig } from "../season/config";
import { defaultRobotPoint, defaultStationPoint } from "../season/fields";

export const ownStrategyTeams = seasonConfig.ownTeams;
export const proposalTypes = ["auto", "self_strategy", "partner_strategy"] as const;
export const proposalStatuses = ["draft", "submitted", "approved", "rejected"] as const;
export const strategyShifts = ["active", "inactive", "endgame"] as const;
export const autoWinners = ["unknown", "red", "blue", "tie"] as const;
export const strategyBoardPhases = seasonConfig.strategyBoard.phases.map((phase) => phase.id);
export const defaultStrategyBoardPhase = strategyBoardPhases[0] ?? "strategy";
export const strategyBoardColors = ["#f8fafc", "#ef4444", "#3b82f6", "#22c55e", "#facc15"] as const;
const legacyStrategyBoardPhases = ["auto", "transition", "active", "inactive"] as const;
const routePointMinDistance = 1.2;
const routeMaxPointsPerStroke = 100;

export type OwnStrategyTeam = string;
export type StrategyProposalType = (typeof proposalTypes)[number];
export type StrategyProposalStatus = (typeof proposalStatuses)[number];
export type StrategyShift = (typeof strategyShifts)[number];
export type AutoWinner = (typeof autoWinners)[number];
export type StrategyBoardPhaseId = string;

export type RoutePoint = { x: number; y: number; start?: boolean };
export type RouteMap = Record<string, RoutePoint[]>;
export type StrategyBoardStroke = { id: string; color: string; points: RoutePoint[] };
export type StrategyBoardRobot = { team: string; x: number; y: number; rotation: number };
export type StrategyBoardStation = { team: string; alliance: "red" | "blue"; x: number; y: number };
export type StrategyBoardPhase = { strokes: StrategyBoardStroke[]; robots: StrategyBoardRobot[] };

export type AutoProposalPayload = {
  kind: "match_strategy";
  autoWinner: AutoWinner;
  phases: Record<StrategyBoardPhaseId, StrategyBoardPhase>;
  teamNotes: Record<string, string>;
  note: string;
};

export type SelfStrategyPayload = {
  kind: "self_strategy";
  shifts: Record<StrategyShift, { points: RoutePoint[]; opponentRoutes: RouteMap; note: string }>;
};

export type PartnerStrategyPayload = {
  kind: "partner_strategy";
  partners: string[];
  partnerNotes: Record<string, string>;
  shifts: Record<StrategyShift, { routes: RouteMap; note: string }>;
};

export type StrategyProposalPayload = AutoProposalPayload | SelfStrategyPayload | PartnerStrategyPayload;

export type StrategyProposalSnapshot = {
  matchKey: string;
  matchLabel: string;
  ownTeam: OwnStrategyTeam;
  proposalType: StrategyProposalType;
  title: string;
  payload: StrategyProposalPayload;
  reviewedBy: string | null;
  reviewNote: string | null;
  reviewedAt: string | null;
};

export type StrategyProposal = {
  id: string;
  eventKey: string;
  matchKey: string;
  matchLabel: string;
  ownTeam: OwnStrategyTeam;
  proposalType: StrategyProposalType;
  status: StrategyProposalStatus;
  title: string;
  payload: StrategyProposalPayload;
  createdBy: string | null;
  createdByName: string;
  reviewedBy: string | null;
  reviewNote: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  lastApprovedSnapshot: StrategyProposalSnapshot | null;
  createdAt: string;
  updatedAt: string;
};

export function normalizeOwnTeam(value: unknown): OwnStrategyTeam {
  return teamNumber(value);
}

export function isConfiguredOwnTeam(value: unknown) {
  const team = normalizeOwnTeam(value);
  return Boolean(team && ownStrategyTeams.includes(team));
}

export function proposalMatchesOwnTeamQuery(proposal: Pick<StrategyProposal, "ownTeam">, query: string) {
  const teamQuery = query.replace(/\D/g, "");
  return !teamQuery || proposal.ownTeam.includes(teamQuery);
}

export function isProposalType(value: unknown): value is StrategyProposalType {
  return proposalTypes.includes(value as StrategyProposalType);
}

export function isProposalStatus(value: unknown): value is StrategyProposalStatus {
  return proposalStatuses.includes(value as StrategyProposalStatus);
}

export function strategyProposalTitle(type: StrategyProposalType, matchLabel: string) {
  const label = type === "auto" ? "比赛策略" : type === "self_strategy" ? "我们自己" : "队友策略";
  return `${String(matchLabel || "Match").trim() || "Match"} · ${label}`;
}

export function normalizeProposalPayload(type: StrategyProposalType, value: unknown): StrategyProposalPayload {
  const record = objectValue(value);
  if (type === "self_strategy") {
    return {
      kind: "self_strategy",
      shifts: Object.fromEntries(
        strategyShifts.map((shift) => {
          const source = objectValue(record.shifts)[shift];
          const shiftRecord = objectValue(source);
          return [shift, {
            points: normalizePoints(shiftRecord.points),
            opponentRoutes: normalizeRouteMap(shiftRecord.opponentRoutes),
            note: stringValue(shiftRecord.note),
          }];
        }),
      ) as SelfStrategyPayload["shifts"],
    };
  }

  if (type === "partner_strategy") {
    return {
      kind: "partner_strategy",
      partners: stringArray(record.partners),
      partnerNotes: normalizeNoteMap(record.partnerNotes),
      shifts: Object.fromEntries(
        strategyShifts.map((shift) => {
          const source = objectValue(record.shifts)[shift];
          const shiftRecord = objectValue(source);
          return [shift, { routes: normalizeRouteMap(shiftRecord.routes), note: stringValue(shiftRecord.note) }];
        }),
      ) as PartnerStrategyPayload["shifts"],
    };
  }

  const phaseSource = objectValue(record.phases);
  const phaseIds = strategyBoardPhaseIds(record, phaseSource);
  return {
    kind: "match_strategy",
    autoWinner: autoWinners.includes(record.autoWinner as AutoWinner) ? (record.autoWinner as AutoWinner) : "unknown",
    phases: Object.fromEntries(phaseIds.map((phase) => [
      phase,
      phaseSource[phase]
        ? normalizeStrategyBoardPhase(phaseSource[phase], phase)
        : {
            strokes: phase === "auto"
              ? legacyRoutesToStrokes(record.autoRoutes, phase)
              : phase === "transition"
                ? legacyRoutesToStrokes(record.transitionRoutes, phase)
                : [],
            robots: [],
          },
    ])) as AutoProposalPayload["phases"],
    teamNotes: normalizeNoteMap(record.teamNotes),
    note: stringValue(record.note),
  };
}

export function ensureStrategyBoardTeams(
  payload: AutoProposalPayload,
  redTeams: string[],
  blueTeams: string[],
): AutoProposalPayload {
  const defaults = defaultStrategyRobots(redTeams, blueTeams);
  return {
    ...payload,
    phases: Object.fromEntries(Object.keys(payload.phases).map((phase) => {
      const current = payload.phases[phase] ?? { strokes: [], robots: [] };
      const robots = new Map(current.robots.map((robot) => [robot.team, robot]));
      return [phase, {
        strokes: current.strokes,
        robots: defaults.map((robot) => robots.get(robot.team) ?? robot),
      }];
    })) as AutoProposalPayload["phases"],
    teamNotes: Object.fromEntries([...redTeams, ...blueTeams].map((team) => [team, payload.teamNotes[team] ?? ""])),
  };
}

export function defaultStrategyRobots(redTeams: string[], blueTeams: string[]): StrategyBoardRobot[] {
  return [
    ...redTeams.map((team, index) => sourceStrategyRobot(team, "red", index, redTeams.length)),
    ...blueTeams.map((team, index) => sourceStrategyRobot(team, "blue", index, blueTeams.length)),
  ];
}

export function strategyBoardStations(redTeams: string[], blueTeams: string[]): StrategyBoardStation[] {
  const stations = (teams: string[], alliance: StrategyBoardStation["alliance"]) => teams.map((team, index) => ({
    team,
    alliance,
    ...defaultStationPoint(alliance, index, teams.length),
  }));
  return [...stations(blueTeams, "blue"), ...stations(redTeams, "red")];
}

export function strategyBoardPhaseLabel(phase: StrategyBoardPhaseId) {
  return seasonConfig.strategyBoard.phases.find((definition) => definition.id === phase)?.label
    ?? phase.toUpperCase();
}

function sourceStrategyRobot(team: string, alliance: StrategyBoardStation["alliance"], index: number, count: number): StrategyBoardRobot {
  return {
    team,
    ...defaultRobotPoint(alliance, index, count),
    rotation: 0,
  };
}

export function eraseStrategyStrokes(
  strokes: StrategyBoardStroke[],
  point: RoutePoint,
  radius = 3,
) {
  return strokes.filter((stroke) => !strokeTouchesPoint(stroke, point, radius));
}

export function normalizeProposalSnapshot(value: unknown): StrategyProposalSnapshot | null {
  const record = objectValue(value);
  if (!isProposalType(record.proposalType)) return null;
  return {
    matchKey: stringValue(record.matchKey),
    matchLabel: stringValue(record.matchLabel),
    ownTeam: normalizeOwnTeam(record.ownTeam),
    proposalType: record.proposalType,
    title: stringValue(record.title),
    payload: normalizeProposalPayload(record.proposalType, record.payload),
    reviewedBy: typeof record.reviewedBy === "string" ? record.reviewedBy : null,
    reviewNote: typeof record.reviewNote === "string" ? record.reviewNote : null,
    reviewedAt: typeof record.reviewedAt === "string" ? record.reviewedAt : null,
  };
}

export function normalizeRouteMap(value: unknown): RouteMap {
  const record = objectValue(value);
  const routes: RouteMap = {};
  for (const [team, points] of Object.entries(record)) {
    const normalizedTeam = teamNumber(team);
    if (!normalizedTeam) continue;
    routes[normalizedTeam] = normalizePoints(points);
  }
  return routes;
}

export function compactRoutePoints(points: RoutePoint[]): RoutePoint[] {
  const strokes: RoutePoint[][] = [];
  for (const point of points) {
    if (point.start || !strokes.length) strokes.push([point]);
    else strokes[strokes.length - 1].push(point);
  }
  return strokes.flatMap(compactStroke);
}

export function shouldFinishRouteStroke(eventType: string, pointerType: string) {
  return eventType !== "pointerleave" || pointerType === "mouse";
}

function normalizeNoteMap(value: unknown) {
  const record = objectValue(value);
  const notes: Record<string, string> = {};
  for (const [team, note] of Object.entries(record)) {
    const normalizedTeam = teamNumber(team);
    if (!normalizedTeam) continue;
    notes[normalizedTeam] = stringValue(note);
  }
  return notes;
}

export function canEditProposal(proposal: Pick<StrategyProposal, "createdBy" | "status"> | null, openId: string) {
  return canEditProposalAs(proposal, openId, false);
}

export function canEditProposalAs(
  proposal: Pick<StrategyProposal, "createdBy" | "status"> | null,
  openId: string,
  isAdmin: boolean,
) {
  if (!proposal) return true;
  if (isAdmin) return true;
  return proposal.createdBy === openId && (proposal.status === "draft" || proposal.status === "rejected" || proposal.status === "approved");
}

export function canSubmitProposal(proposal: Pick<StrategyProposal, "createdBy" | "status"> | null, openId: string) {
  return canEditProposal(proposal, openId);
}

export function canReviewProposal(proposal: Pick<StrategyProposal, "status"> | null, isAdmin: boolean) {
  return Boolean(isAdmin && proposal?.status === "submitted");
}

export function canDeleteProposalAs(
  proposal: Pick<StrategyProposal, "createdBy"> | null,
  openId: string,
  isAdmin: boolean,
) {
  return Boolean(proposal && (isAdmin || proposal.createdBy === openId));
}

export function canRestoreApprovedSnapshot(
  proposal: Pick<StrategyProposal, "createdBy" | "status" | "lastApprovedSnapshot" | "matchKey" | "matchLabel" | "ownTeam" | "proposalType" | "payload"> | null,
  openId: string,
  isAdmin: boolean,
) {
  return Boolean(proposal?.lastApprovedSnapshot && (isAdmin || proposal.createdBy === openId) && !proposalMatchesSnapshot(proposal));
}

export function proposalMatchesSnapshot(
  proposal: Pick<StrategyProposal, "lastApprovedSnapshot" | "matchKey" | "matchLabel" | "proposalType" | "payload"> & { ownTeam: string },
) {
  const snapshot = proposal.lastApprovedSnapshot;
  if (!snapshot) return false;
  return JSON.stringify({
    matchKey: proposal.matchKey,
    matchLabel: proposal.matchLabel,
    ownTeam: proposal.ownTeam,
    proposalType: proposal.proposalType,
    payload: proposal.payload,
  }) === JSON.stringify({
    matchKey: snapshot.matchKey,
    matchLabel: snapshot.matchLabel,
    ownTeam: snapshot.ownTeam,
    proposalType: snapshot.proposalType,
    payload: snapshot.payload,
  });
}

function normalizePoints(value: unknown): RoutePoint[] {
  if (!Array.isArray(value)) return [];
  const points = value
    .map((point) => {
      const record = objectValue(point);
      const x = boundedPercent(record.x);
      const y = boundedPercent(record.y);
      if (x == null || y == null) return null;
      return record.start === true || record.s === true ? { x, y, start: true } : { x, y };
    })
    .filter((point): point is RoutePoint => Boolean(point));
  return compactRoutePoints(points);
}

function normalizeStrategyBoardPhase(value: unknown, phase: StrategyBoardPhaseId): StrategyBoardPhase {
  const record = objectValue(value);
  return {
    strokes: Array.isArray(record.strokes)
      ? record.strokes.map((stroke, index) => normalizeStrategyBoardStroke(stroke, `${phase}-${index}`)).filter(Boolean) as StrategyBoardStroke[]
      : [],
    robots: Array.isArray(record.robots)
      ? record.robots.map(normalizeStrategyBoardRobot).filter(Boolean) as StrategyBoardRobot[]
      : [],
  };
}

function strategyBoardPhaseIds(record: Record<string, unknown>, phaseSource: Record<string, unknown>) {
  const stored = Object.keys(phaseSource).filter((phase) => /^[a-z][a-z0-9_-]*$/i.test(phase));
  const hasLegacyRoutes = "autoRoutes" in record || "transitionRoutes" in record;
  const usesConfiguredPhase = stored.some((phase) => strategyBoardPhases.includes(phase));
  const base = hasLegacyRoutes || (stored.length > 0 && !usesConfiguredPhase && stored.some((phase) => legacyStrategyBoardPhases.includes(phase as typeof legacyStrategyBoardPhases[number])))
    ? legacyStrategyBoardPhases
    : strategyBoardPhases;
  return [...new Set([...base, ...stored])];
}

function normalizeStrategyBoardStroke(value: unknown, fallbackId: string): StrategyBoardStroke | null {
  const record = objectValue(value);
  const points = normalizePoints(record.points).map(({ x, y }) => ({ x, y }));
  if (points.length < 2) return null;
  const color = typeof record.color === "string" && /^#[0-9a-f]{6}$/i.test(record.color)
    ? record.color.toLowerCase()
    : strategyBoardColors[0];
  const id = typeof record.id === "string" && record.id.trim() ? record.id.trim().slice(0, 80) : fallbackId;
  return { id, color, points };
}

function normalizeStrategyBoardRobot(value: unknown): StrategyBoardRobot | null {
  const record = objectValue(value);
  const team = teamNumber(record.team);
  const x = boundedPercent(record.x);
  const y = boundedPercent(record.y);
  if (!team || x == null || y == null) return null;
  const rotation = Number(record.rotation);
  return { team, x, y, rotation: Number.isFinite(rotation) ? Math.round((((rotation % 360) + 360) % 360) * 10) / 10 : 0 };
}

function legacyRoutesToStrokes(value: unknown, phase: StrategyBoardPhaseId) {
  return Object.entries(normalizeRouteMap(value)).flatMap(([team, points], teamIndex) => {
    const strokes: RoutePoint[][] = [];
    for (const point of points) {
      if (point.start || !strokes.length) strokes.push([{ x: point.x, y: point.y }]);
      else strokes[strokes.length - 1].push({ x: point.x, y: point.y });
    }
    return strokes
      .filter((stroke) => stroke.length > 1)
      .map((stroke, strokeIndex) => ({
        id: `legacy-${phase}-${team}-${strokeIndex}`,
        color: strategyBoardColors[teamIndex % strategyBoardColors.length],
        points: stroke,
      }));
  });
}

function strokeTouchesPoint(stroke: StrategyBoardStroke, point: RoutePoint, radius: number) {
  for (let index = 1; index < stroke.points.length; index += 1) {
    if (distanceToSegment(point, stroke.points[index - 1], stroke.points[index]) <= radius) return true;
  }
  return false;
}

function distanceToSegment(point: RoutePoint, start: RoutePoint, end: RoutePoint) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (!dx && !dy) return Math.hypot(point.x - start.x, point.y - start.y);
  const position = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(point.x - (start.x + position * dx), point.y - (start.y + position * dy));
}

function compactStroke(points: RoutePoint[]) {
  if (points.length <= 2) return points;
  const filtered = [points[0]];
  for (const point of points.slice(1, -1)) {
    const previous = filtered[filtered.length - 1];
    if (Math.hypot(point.x - previous.x, point.y - previous.y) >= routePointMinDistance) {
      filtered.push({ x: point.x, y: point.y });
    }
  }
  const last = points[points.length - 1];
  const previous = filtered[filtered.length - 1];
  if (!previous || previous.x !== last.x || previous.y !== last.y) filtered.push({ x: last.x, y: last.y });
  if (filtered.length <= routeMaxPointsPerStroke) return filtered;

  const capped: RoutePoint[] = [filtered[0]];
  let lastIndex = 0;
  for (let index = 1; index < routeMaxPointsPerStroke - 1; index += 1) {
    const sourceIndex = Math.round((index * (filtered.length - 1)) / (routeMaxPointsPerStroke - 1));
    if (sourceIndex > lastIndex && sourceIndex < filtered.length - 1) {
      const point = filtered[sourceIndex];
      capped.push({ x: point.x, y: point.y });
      lastIndex = sourceIndex;
    }
  }
  const cappedLast = filtered[filtered.length - 1];
  capped.push({ x: cappedLast.x, y: cappedLast.y });
  return capped;
}

function boundedPercent(value: unknown) {
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) return null;
  return Math.round(parsed * 10) / 10;
}

function teamNumber(value: unknown) {
  const match = String(value ?? "").match(/\d+/);
  return match ? match[0] : "";
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.map(teamNumber).filter(Boolean) : [];
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
