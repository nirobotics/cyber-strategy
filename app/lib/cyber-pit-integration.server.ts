import type { CyberPitEmbedPayload } from "./cyber-pit-embed.server";
import { hasCyberScoutTarget, loadCyberScoutDataset } from "./cyber-scout.server";
import { getDatasetForEvent, hasStoredDatasetTarget } from "./datasets.server";
import { fetchFrcMatchSchedule } from "./frc-events.server";
import { matchIdentity, matchScheduleIdentity, matchTeams, type CombinedMatch, type StatboticsMatch } from "./match-analysis";
import { getDataRange } from "./settings.server";
import type { DataRange } from "./data-range";
import type { TeamData, TeamPitData } from "./scouting";
import { timeServerTask, type ServerTimingEntry } from "./server-timing.server";

export async function canResolveCyberPitEmbed(payload: CyberPitEmbedPayload) {
  const teamNumber = payload.kind === "team" ? payload.target : undefined;
  const available = hasCyberPitData(payload.eventKey, teamNumber);
  if (payload.kind === "team") return available;

  const range = cyberPitMatchDataRange(payload.target, payload.eventKey);
  if (!range) return false;
  const [dataRange, hasDataset, schedule] = await Promise.all([
    getDataRange(),
    available,
    fetchFrcMatchSchedule(payload.eventKey, [range]).catch(() => []),
  ]);
  return dataRange.includes(range) && hasDataset
    && schedule.some((match) => matchesCyberPitMatch(match, payload.eventKey, payload.target));
}

export async function resolveCyberPitEmbedData(payload: CyberPitEmbedPayload, timings: ServerTimingEntry[] = []) {
  const dataRange = await timeServerTask(timings, "embed_settings", getDataRange);
  const [scout, schedule] = await Promise.all([
    timeServerTask(timings, "embed_dataset", () => loadCyberScoutDataset(payload.eventKey, dataRange)),
    payload.kind === "match"
      ? timeServerTask(timings, "embed_schedule", () => fetchFrcMatchSchedule(payload.eventKey, dataRange).catch(() => []))
      : Promise.resolve([]),
  ]);
  const dataset = scout.dataset?.eventKey === payload.eventKey
    ? scout.dataset
    : await getDatasetForEvent(payload.eventKey);
  if (!dataset) return null;

  if (payload.kind === "team") {
    return dataset.teamData[payload.target]
      ? { dataset, dataRange, schedule: [], selectedMatchKey: null }
      : null;
  }

  const selectedMatch = schedule.find((match) => matchesCyberPitMatch(match, payload.eventKey, payload.target));
  return selectedMatch
    ? { dataset, dataRange, schedule, selectedMatch, selectedMatchKey: matchIdentity(selectedMatch) }
    : null;
}

export function selectCyberPitMatchData(match: CombinedMatch, teamData: TeamData, teamPitData?: TeamPitData) {
  const teams = [...matchTeams(match, "red"), ...matchTeams(match, "blue")];
  return {
    teamData: selectTeamValues(teams, teamData),
    teamPitData: selectTeamValues(teams, teamPitData),
  };
}

function selectTeamValues<T>(teams: string[], values: Record<string, T> | undefined): Record<string, T> {
  return Object.fromEntries(teams.flatMap((team) => values?.[team] ? [[team, values[team]]] : []));
}

export function cyberPitMatchDataRange(target: string, eventKey = ""): DataRange | null {
  const value = eventKey && target.startsWith(`${eventKey}_`)
    ? target.slice(eventKey.length + 1)
    : target;
  if (/^practice(?:-|\d)/.test(value)) return "practice";
  if (/^qm(?:-|\d)/.test(value)) return "qualification";
  if (/^(?:ef|qf|sf|f)(?:-|\d)/.test(value)) return "playoff";
  return null;
}

export function matchesCyberPitMatch(
  match: Pick<StatboticsMatch, "key" | "comp_level" | "set_number" | "match_number">,
  eventKey: string,
  target: string,
) {
  if (matchScheduleIdentity(match) === target || match.key === target) return true;
  const level = match.comp_level ?? "qm";
  const setNumber = match.set_number ?? 0;
  const matchNumber = match.match_number ?? 0;
  if (level === "practice" || level === "qm") {
    return target === `${eventKey}_${level}${matchNumber}`;
  }
  if (target === `${eventKey}_${level}${setNumber}m${matchNumber}`) return true;
  return level === "sf" && matchNumber === 1
    && target === `${eventKey}_ef${setNumber}m${setNumber}`;
}

async function hasCyberPitData(eventKey: string, teamNumber?: string) {
  if (await hasCyberScoutTarget(eventKey, teamNumber).catch(() => false)) return true;
  return hasStoredDatasetTarget(eventKey, teamNumber).catch(() => false);
}
