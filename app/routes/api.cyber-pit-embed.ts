import type { Route } from "./+types/api.cyber-pit-embed";
import {
  createCyberPitEmbedUrl,
  isCyberPitEmbedRequestAuthorized,
  type CyberPitEmbedKind,
  type CyberPitEmbedTheme,
} from "../lib/cyber-pit-embed.server";
import { canResolveCyberPitEmbed } from "../lib/cyber-pit-integration.server";
import { formatServerTiming, recordServerTiming, timeServerTask, type ServerTimingEntry } from "../lib/server-timing.server";

export async function action({ request }: Route.ActionArgs) {
  const startedAt = performance.now();
  const timings: ServerTimingEntry[] = [];
  const secret = process.env.CYBER_STRATEGY_EMBED_SECRET?.trim() ?? "";
  if (!isCyberPitEmbedRequestAuthorized(request, secret)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const eventKey = String(body?.eventKey ?? "").trim().toLowerCase();
  const kind = body?.kind as CyberPitEmbedKind;
  const target = String(body?.target ?? "").trim();
  const theme = body?.theme as CyberPitEmbedTheme;
  if ((kind !== "match" && kind !== "team") || (theme !== "light" && theme !== "dark")) {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }
  const expires = Date.now() + 5 * 60_000;
  const payload = { eventKey, kind, target, theme, expires };
  if (!await timeServerTask(timings, "strategy_preflight", () => canResolveCyberPitEmbed(payload))) {
    recordServerTiming(timings, "strategy_total", startedAt);
    return new Response(null, { status: 404, headers: responseHeaders(timings) });
  }

  const baseUrl = process.env.APP_BASE_URL?.trim() || new URL(request.url).origin;
  recordServerTiming(timings, "strategy_total", startedAt);
  return Response.json({
    url: createCyberPitEmbedUrl(baseUrl, { eventKey, kind, target, theme }, secret),
  }, { headers: responseHeaders(timings) });
}

export function loader() {
  return new Response(null, { status: 405 });
}

function responseHeaders(timings: ServerTimingEntry[]) {
  return {
    "Cache-Control": "no-store",
    "Server-Timing": formatServerTiming(timings),
  };
}
