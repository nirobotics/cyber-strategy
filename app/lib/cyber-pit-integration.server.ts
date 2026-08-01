import type { CyberPitEmbedPayload } from "./cyber-pit-embed.server";
import { loadCyberScoutDataset } from "./cyber-scout.server";
import { getDatasetForEvent } from "./datasets.server";
import { fetchFrcMatchSchedule } from "./frc-events.server";
import { matchScheduleIdentity } from "./match-analysis";
import { getDataRange } from "./settings.server";

export async function resolveCyberPitEmbedData(payload: CyberPitEmbedPayload) {
  const dataRange = await getDataRange();
  const scout = await loadCyberScoutDataset(payload.eventKey, dataRange);
  const dataset = scout.dataset?.eventKey === payload.eventKey
    ? scout.dataset
    : await getDatasetForEvent(payload.eventKey);
  if (!dataset) return null;

  if (payload.kind === "team") {
    return dataset.teamData[payload.target] ? { dataset, dataRange, schedule: [] } : null;
  }

  const schedule = await fetchFrcMatchSchedule(payload.eventKey, dataRange).catch(() => []);
  return schedule.some((match) => matchScheduleIdentity(match) === payload.target)
    ? { dataset, dataRange, schedule }
    : null;
}
