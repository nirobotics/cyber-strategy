import type { Route } from "./+types/api.match-videos";
import { requireUser } from "../lib/auth.server";
import { loadMatchVideosForEvent } from "../lib/feishu-videos.server";

export async function loader({ request }: Route.LoaderArgs) {
  requireUser(request);
  const eventKey = new URL(request.url).searchParams.get("event");
  const result = await loadMatchVideosForEvent(eventKey);
  return Response.json(result, {
    headers: {
      "Cache-Control": "private, max-age=60",
    },
  });
}
