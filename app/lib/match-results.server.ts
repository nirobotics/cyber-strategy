import { loadSuperScoutMatchResults } from "./cyber-scout.server";
import { fetchFrcMatchResults } from "./frc-events.server";
import { mergeMatchResults } from "./match-analysis";

export async function fetchMatchResults(eventKey: string) {
  const [official, fallback] = await Promise.all([
    fetchFrcMatchResults(eventKey).catch(() => []),
    loadSuperScoutMatchResults(eventKey).catch(() => []),
  ]);
  return mergeMatchResults(official, fallback);
}
