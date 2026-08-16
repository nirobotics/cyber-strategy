export const PICKLIST_ASSIGNED_COLUMNS = ["tier1", "tier2", "tier3", "dnp"] as const;
export const PICKLIST_COLUMNS = [...PICKLIST_ASSIGNED_COLUMNS, "pool"] as const;

export type PicklistAssignedColumn = (typeof PICKLIST_ASSIGNED_COLUMNS)[number];
export type PicklistColumn = (typeof PICKLIST_COLUMNS)[number];
export type PicklistBoard = Record<PicklistAssignedColumn, string[]>;
export type PicklistDropTarget = { team: string; column: PicklistColumn; beforeTeam?: string };
export type PicklistKind = "main" | "personal";
export type SharedPicklist = {
  id: string;
  clientId: string | null;
  eventKey: string;
  name: string;
  kind: PicklistKind;
  board: PicklistBoard;
  createdBy: string | null;
  createdByName: string;
  submittedAt: string | null;
  updatedAt: string;
};

export type PicklistResource = {
  selectedEventKey: string;
  isAdmin: boolean;
  userOpenId: string;
  lists: SharedPicklist[];
  error: string | null;
};

export function emptyPicklistBoard(): PicklistBoard {
  return { tier1: [], tier2: [], tier3: [], dnp: [] };
}

export function samePicklistBoard(left: PicklistBoard, right: PicklistBoard) {
  return PICKLIST_ASSIGNED_COLUMNS.every((column) => left[column].join(",") === right[column].join(","));
}

export function findPicklistTeamTier(team: string, boards: PicklistBoard[]) {
  for (const board of boards) {
    const column = PICKLIST_ASSIGNED_COLUMNS.find((item) => board[item].includes(team));
    if (column) return column;
  }
  return null;
}

export function sanitizePicklistBoard(board: Partial<PicklistBoard> | null | undefined, validTeams: string[]): PicklistBoard {
  const valid = new Set(validTeams);
  const seen = new Set<string>();
  const sanitized = emptyPicklistBoard();

  for (const column of PICKLIST_ASSIGNED_COLUMNS) {
    for (const team of board?.[column] ?? []) {
      if (!valid.has(team) || seen.has(team)) continue;
      sanitized[column].push(team);
      seen.add(team);
    }
  }
  return sanitized;
}

export function normalizePicklistBoard(value: unknown): PicklistBoard {
  const source = value && typeof value === "object" ? value as Partial<Record<PicklistAssignedColumn, unknown>> : {};
  const seen = new Set<string>();
  const board = emptyPicklistBoard();
  for (const column of PICKLIST_ASSIGNED_COLUMNS) {
    const teams = Array.isArray(source[column]) ? source[column] : [];
    for (const value of teams) {
      const team = String(value ?? "").replace(/^frc/i, "").trim();
      if (!/^\d{1,6}$/.test(team) || seen.has(team)) continue;
      board[column].push(team);
      seen.add(team);
    }
  }
  return board;
}

export function canCreateMainPicklist(isAdmin: boolean) {
  return isAdmin;
}

export function canEditSharedPicklist(list: Pick<SharedPicklist, "kind" | "createdBy">, actorOpenId: string, isAdmin: boolean) {
  return list.kind === "main" ? isAdmin : list.createdBy === actorOpenId;
}

export function canViewSharedPicklist(
  list: Pick<SharedPicklist, "kind" | "createdBy" | "submittedAt">,
  actorOpenId: string,
  isAdmin: boolean,
) {
  return list.kind === "main" || list.createdBy === actorOpenId || (isAdmin && Boolean(list.submittedAt));
}

export function visiblePicklistsForEvent(lists: SharedPicklist[], eventKey: string, actorOpenId: string, isAdmin: boolean) {
  const visible = lists.filter((list) => list.eventKey === eventKey && canViewSharedPicklist(list, actorOpenId, isAdmin));
  const latestPersonalByOwner = new Map<string, SharedPicklist>();
  for (const list of visible) {
    if (list.kind !== "personal" || !list.createdBy) continue;
    const current = latestPersonalByOwner.get(list.createdBy);
    if (!current || list.updatedAt > current.updatedAt) latestPersonalByOwner.set(list.createdBy, list);
  }
  return visible.filter((list) =>
    list.kind !== "personal" || !list.createdBy || latestPersonalByOwner.get(list.createdBy)?.id === list.id
  );
}

export function comparePicklistTier(lists: Array<Pick<SharedPicklist, "id" | "board">>, column: PicklistAssignedColumn) {
  const teams = [...new Set(lists.flatMap((list) => list.board[column]))];
  return teams.map((team) => {
    const ranks = Object.fromEntries(lists.map((list) => {
      const index = list.board[column].indexOf(team);
      return [list.id, index < 0 ? null : index + 1];
    }));
    const presentRanks = Object.values(ranks).filter((rank): rank is number => rank !== null);
    return {
      team,
      ranks,
      averageRank: presentRanks.reduce((sum, rank) => sum + rank, 0) / presentRanks.length,
      appearances: presentRanks.length,
    };
  }).sort((a, b) => b.appearances - a.appearances || a.averageRank - b.averageRank || teamNumber(a.team) - teamNumber(b.team));
}

export function buildPicklistColumns<T extends { team: string; avgTotal: number }>(teams: T[], board: PicklistBoard) {
  const validTeams = teams.map((team) => team.team);
  const sanitized = sanitizePicklistBoard(board, validTeams);
  const assigned = new Set(PICKLIST_ASSIGNED_COLUMNS.flatMap((column) => sanitized[column]));
  const pool = teams
    .filter((team) => !assigned.has(team.team))
    .sort((a, b) => b.avgTotal - a.avgTotal || teamNumber(a.team) - teamNumber(b.team))
    .map((team) => team.team);
  return { ...sanitized, pool } satisfies Record<PicklistColumn, string[]>;
}

export function movePicklistTeam(
  board: PicklistBoard,
  validTeams: string[],
  team: string,
  targetColumn: PicklistColumn,
  beforeTeam?: string,
) {
  if (!validTeams.includes(team)) return sanitizePicklistBoard(board, validTeams);
  const next = sanitizePicklistBoard(board, validTeams);
  if (beforeTeam === team) return next;
  for (const column of PICKLIST_ASSIGNED_COLUMNS) next[column] = next[column].filter((item) => item !== team);
  if (targetColumn === "pool") return next;

  const target = next[targetColumn];
  const index = beforeTeam ? target.indexOf(beforeTeam) : -1;
  next[targetColumn] = index < 0 ? [...target, team] : [...target.slice(0, index), team, ...target.slice(index)];
  return next;
}

export function reorderPicklistTeam(
  board: PicklistBoard,
  validTeams: string[],
  column: PicklistColumn,
  team: string,
  overTeam: string,
) {
  const next = sanitizePicklistBoard(board, validTeams);
  if (column === "pool" || team === overTeam) return next;
  const oldIndex = next[column].indexOf(team);
  const newIndex = next[column].indexOf(overTeam);
  if (oldIndex < 0 || newIndex < 0) return next;
  const reordered = [...next[column]];
  reordered.splice(newIndex, 0, reordered.splice(oldIndex, 1)[0]);
  next[column] = reordered;
  return next;
}

export function previewPicklistTeam(
  board: PicklistBoard,
  validTeams: string[],
  previousColumn: PicklistColumn,
  target: PicklistDropTarget,
) {
  if (previousColumn !== target.column) {
    return movePicklistTeam(board, validTeams, target.team, target.column, target.beforeTeam);
  }
  if (!target.beforeTeam) return sanitizePicklistBoard(board, validTeams);
  return reorderPicklistTeam(board, validTeams, target.column, target.team, target.beforeTeam);
}

export function migrateLegacyPicklist(first: string[], second: string[], crossed: string[], validTeams: string[]) {
  const dnp = new Set(crossed);
  return sanitizePicklistBoard(
    {
      tier1: first.filter((team) => !dnp.has(team)),
      tier2: second.filter((team) => !dnp.has(team)),
      tier3: [],
      dnp: crossed,
    },
    validTeams,
  );
}

function teamNumber(team: string) {
  const parsed = Number(team);
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}
