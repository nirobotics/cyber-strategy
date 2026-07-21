import { loadSuperScoutMatchResults } from "./cyber-scout.server";
import { fetchFrcMatchResults } from "./frc-events.server";
import { mergeMatchResults } from "./match-analysis";

export async function fetchMatchResults(eventKey: string) {
  const official = await fetchFrcMatchResults(eventKey).catch(() => []);
  const fallback = await loadSuperScoutMatchResults(eventKey).catch(() => []);
  return mergeMatchResults(official, fallback);
}
