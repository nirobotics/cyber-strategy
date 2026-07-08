export const ownStrategyTeams = ["8214", "9635"] as const;
export const proposalTypes = ["auto", "self_strategy", "partner_strategy"] as const;
export const proposalStatuses = ["draft", "submitted", "approved", "rejected"] as const;
export const strategyShifts = ["active", "inactive", "endgame"] as const;
export const autoWinners = ["unknown", "red", "blue", "tie"] as const;

export type OwnStrategyTeam = (typeof ownStrategyTeams)[number];
export type StrategyProposalType = (typeof proposalTypes)[number];
export type StrategyProposalStatus = (typeof proposalStatuses)[number];
export type StrategyShift = (typeof strategyShifts)[number];
export type AutoWinner = (typeof autoWinners)[number];

export type RoutePoint = { x: number; y: number; start?: boolean };
export type RouteMap = Record<string, RoutePoint[]>;

export type AutoProposalPayload = {
  kind: "auto";
  autoWinner: AutoWinner;
  autoRoutes: RouteMap;
  transitionRoutes: RouteMap;
  teamNotes: Record<string, string>;
  note: string;
};

export type SelfStrategyPayload = {
  kind: "self_strategy";
  shifts: Record<StrategyShift, { points: RoutePoint[]; note: string }>;
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

export function buildStrategyProposalExport(eventKey: string, proposals: StrategyProposal[], exportedAt = new Date().toISOString()) {
  return {
    eventKey,
    exportedAt,
    count: proposals.length,
    proposals,
  };
}

export function strategyProposalExportFilename(eventKey: string, date = new Date()) {
  const safeEventKey = eventKey.replace(/[^a-zA-Z0-9_-]+/g, "-") || "event";
  return `strategy-proposals-${safeEventKey}-${date.toISOString().slice(0, 10)}.json`;
}

export function normalizeOwnTeam(value: unknown): OwnStrategyTeam {
  return value === "9635" ? "9635" : "8214";
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
  const label = type === "auto" ? "Auto" : type === "self_strategy" ? "我们自己" : "队友策略";
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
          return [shift, { points: normalizePoints(shiftRecord.points), note: stringValue(shiftRecord.note) }];
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

  return {
    kind: "auto",
    autoWinner: autoWinners.includes(record.autoWinner as AutoWinner) ? (record.autoWinner as AutoWinner) : "unknown",
    autoRoutes: normalizeRouteMap(record.autoRoutes),
    transitionRoutes: normalizeRouteMap(record.transitionRoutes),
    teamNotes: normalizeNoteMap(record.teamNotes),
    note: stringValue(record.note),
  };
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
  proposal: Pick<StrategyProposal, "lastApprovedSnapshot" | "matchKey" | "matchLabel" | "ownTeam" | "proposalType" | "payload">,
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
  return value
    .map((point) => {
      const record = objectValue(point);
      const x = boundedPercent(record.x);
      const y = boundedPercent(record.y);
      if (x == null || y == null) return null;
      return record.start === true || record.s === true ? { x, y, start: true } : { x, y };
    })
    .filter((point): point is RoutePoint => Boolean(point));
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
