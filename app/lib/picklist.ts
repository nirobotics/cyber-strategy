export type PickListId = "first" | "second";

export function orderPickPool<T extends { team: string; avgTotal: number }>(teams: T[], crossedTeams: string[]) {
  const crossed = new Set(crossedTeams);
  return [...teams].sort((a, b) => {
    const aCrossed = crossed.has(a.team) ? 1 : 0;
    const bCrossed = crossed.has(b.team) ? 1 : 0;
    if (aCrossed !== bCrossed) return aCrossed - bCrossed;
    return b.avgTotal - a.avgTotal || teamNumber(a.team) - teamNumber(b.team);
  });
}

export function addPickListTeam(list: string[], team: string) {
  if (!team || list.includes(team)) return list;
  return [...list, team];
}

export function insertPickListTeam(list: string[], team: string, beforeTeam?: string) {
  if (!team) return list;
  if (team === beforeTeam) return list;
  const next = list.filter((item) => item !== team);
  const targetIndex = beforeTeam ? next.indexOf(beforeTeam) : -1;
  if (targetIndex < 0) return [...next, team];
  return [...next.slice(0, targetIndex), team, ...next.slice(targetIndex)];
}

export function removePickListTeam(list: string[], team: string) {
  return list.filter((item) => item !== team);
}

export function sanitizePickList(list: string[], validTeams: string[]) {
  const valid = new Set(validTeams);
  const seen = new Set<string>();
  return list.filter((team) => {
    if (!valid.has(team) || seen.has(team)) return false;
    seen.add(team);
    return true;
  });
}

function teamNumber(team: string) {
  const parsed = Number(team);
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}
