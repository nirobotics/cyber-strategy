import type { Route } from "./+types/api.tba.matches";
import { requireUser } from "../lib/auth.server";
import { cleanTbaEventKey, fetchTbaMatches } from "../lib/tba.server";

export async function loader({ request }: Route.LoaderArgs) {
  await requireUser(request);
  const eventKey = cleanTbaEventKey(new URL(request.url).searchParams.get("event"));
  if (!eventKey) return Response.json({ matches: [] }, { status: 400 });

  const matches = await fetchTbaMatches(eventKey);
  return Response.json(
    { matches },
    {
      headers: {
        "Cache-Control": "private, max-age=30",
      },
    },
  );
}
