import type { Route } from "./+types/api.match-results";
import { requireUser } from "../lib/auth.server";
import { fetchMatchResults } from "../lib/match-results.server";
import { cleanTbaEventKey } from "../lib/tba.server";

export async function loader({ request }: Route.LoaderArgs) {
  requireUser(request);
  const eventKey = cleanTbaEventKey(new URL(request.url).searchParams.get("event"));
  if (!eventKey) return Response.json({ results: [] }, { status: 400 });
  return Response.json(
    { results: await fetchMatchResults(eventKey) },
    { headers: { "Cache-Control": "private, max-age=30" } },
  );
}
