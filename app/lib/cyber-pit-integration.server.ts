import type { CyberPitEmbedPayload } from "./cyber-pit-embed.server";
import { hasCyberScoutTarget, loadCyberScoutDataset } from "./cyber-scout.server";
import { getDatasetForEvent, hasStoredDatasetTarget } from "./datasets.server";
import { fetchFrcMatchSchedule } from "./frc-events.server";
import { matchScheduleIdentity } from "./match-analysis";
import { getDataRange } from "./settings.server";
import type { DataRange } from "./data-range";

export async function canResolveCyberPitEmbed(payload: CyberPitEmbedPayload) {
  const teamNumber = payload.kind === "team" ? payload.target : undefined;
  const available = hasCyberPitData(payload.eventKey, teamNumber);
  if (payload.kind === "team") return available;

  const range = cyberPitMatchDataRange(payload.target);
  if (!range) return false;
  const [dataRange, hasDataset, schedule] = await Promise.all([
    getDataRange(),
    available,
    fetchFrcMatchSchedule(payload.eventKey, [range]).catch(() => []),
  ]);
  return dataRange.includes(range) && hasDataset
    && schedule.some((match) => matchScheduleIdentity(match) === payload.target);
}

export async function resolveCyberPitEmbedData(payload: CyberPitEmbedPayload) {
  const dataRange = await getDataRange();
  const [scout, schedule] = await Promise.all([
    loadCyberScoutDataset(payload.eventKey, dataRange),
    payload.kind === "match"
      ? fetchFrcMatchSchedule(payload.eventKey, dataRange).catch(() => [])
      : Promise.resolve([]),
  ]);
  const dataset = scout.dataset?.eventKey === payload.eventKey
    ? scout.dataset
    : await getDatasetForEvent(payload.eventKey);
  if (!dataset) return null;

  if (payload.kind === "team") {
    return dataset.teamData[payload.target] ? { dataset, dataRange, schedule: [] } : null;
  }

  return schedule.some((match) => matchScheduleIdentity(match) === payload.target)
    ? { dataset, dataRange, schedule }
    : null;
}

export function cyberPitMatchDataRange(target: string): DataRange | null {
  if (target.startsWith("practice-")) return "practice";
  if (target.startsWith("qm-")) return "qualification";
  if (/^(?:ef|qf|sf|f)-/.test(target)) return "playoff";
  return null;
}

async function hasCyberPitData(eventKey: string, teamNumber?: string) {
  if (await hasCyberScoutTarget(eventKey, teamNumber).catch(() => false)) return true;
  return hasStoredDatasetTarget(eventKey, teamNumber).catch(() => false);
}
