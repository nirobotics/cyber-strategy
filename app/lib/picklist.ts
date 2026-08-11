export const PICKLIST_ASSIGNED_COLUMNS = ["tier1", "tier2", "tier3", "dnp"] as const;
export const PICKLIST_COLUMNS = [...PICKLIST_ASSIGNED_COLUMNS, "pool"] as const;

export type PicklistAssignedColumn = (typeof PICKLIST_ASSIGNED_COLUMNS)[number];
export type PicklistColumn = (typeof PICKLIST_COLUMNS)[number];
export type PicklistBoard = Record<PicklistAssignedColumn, string[]>;

export function emptyPicklistBoard(): PicklistBoard {
  return { tier1: [], tier2: [], tier3: [], dnp: [] };
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
