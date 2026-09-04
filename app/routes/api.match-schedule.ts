import type { Route } from "./+types/api.match-schedule";
import { requireUser } from "../lib/auth.server";
import { fetchFrcMatchSchedule } from "../lib/frc-events.server";
import { getDataRange } from "../lib/settings.server";
import { cleanTbaEventKey } from "../lib/tba.server";

export async function loader({ request }: Route.LoaderArgs) {
  await requireUser(request);
  const eventKey = cleanTbaEventKey(new URL(request.url).searchParams.get("event"));
  if (!eventKey) return Response.json({ eventKey: null, matches: [] }, { status: 400 });

  const matches = await fetchFrcMatchSchedule(eventKey, await getDataRange()).catch(() => []);
  return Response.json(
    { eventKey, matches },
    { headers: { "Cache-Control": "private, max-age=15" } },
  );
}
