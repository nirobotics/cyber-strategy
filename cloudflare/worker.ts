import { consumeState, registerState } from "./native/oauth";
import { inNative, type RuntimeEnv, type SerialState } from "./native/runtime";
import { createRequestHandler, matchRoutes, type RouteObject } from "react-router";
import * as build from "./.build-input/build/server/index.js";
import assetManifest from "./.required-tool-outputs/assets.json";

const handle = createRequestHandler(build, "production");
const assets: Record<string, { sha256: string; bytes: number; mime: string }> = assetManifest;
type Env = RuntimeEnv & { ASSETS?: { fetch(request: Request): Promise<Response> } };
type Context = { waitUntil(promise: Promise<unknown>): void; passThroughOnException(): void };
function routes(parentId?: string): RouteObject[] {
  return Object.values(build.routes).filter((route): route is NonNullable<typeof route> => route !== undefined && route.parentId === parentId).map((route) =>
    route.index ? { id: route.id, index: true } : {
      id: route.id, ...(route.path === undefined ? {} : { path: route.path }), children: routes(route.id),
    });
}
const routeTree = routes();
const required = [
  "SESSION_SECRET", "FEISHU_APP_ID", "FEISHU_APP_SECRET", "FEISHU_ALLOWED_TENANT_KEYS", "APP_BASE_URL",
  "SCOUT_STRATEGY_SECRET", "CYBER_SCOUT_ORIGIN", "CYBER_PIT_ORIGIN",
  "CYBER_STRATEGY_EMBED_SECRET", "FRC_EVENTS_USERNAME", "FRC_EVENTS_API_KEY", "TBA_API_KEY",
];
const privateHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  "CDN-Cache-Control": "no-store",
  "Cloudflare-CDN-Cache-Control": "no-store",
  "Surrogate-Control": "no-store",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
  "X-Content-Type-Options": "nosniff",
};
function secured(response: Response, request: Request, isStatic: boolean, pitOrigin: string): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(privateHeaders))
    if (!isStatic || !/cache-control|surrogate-control/i.test(key)) headers.set(key, value);
  if (!isStatic) {
    headers.delete("ETag"); headers.delete("Last-Modified"); headers.append("Vary", "Cookie");
    // The embedded view may only be framed by Cyber Pit.
    if (/^\/embed(?:\.data)?$/.test(new URL(request.url).pathname)) {
      headers.set("Content-Security-Policy", "frame-ancestors " + pitOrigin);
      headers.set("Referrer-Policy", "no-referrer");
    }
  }
  return new Response(request.method === "HEAD" ? null : response.body, { status: response.status, statusText: response.statusText, headers });
}
// Deployment configuration only: bindings and secrets. No database read; computed once per isolate.
type Configuration = { origin: string; pitOrigin: string; configured: boolean; missing: string[]; invalid: string[]; videoLibraryConfigured: boolean };
const configurations = new WeakMap<object, Configuration>();
function configuration(env: Env): Configuration {
  const known = configurations.get(env);
  if (known) return known;
  const text = (name: string) => typeof env[name] === "string" ? (env[name] as string).trim() : "";
  const missing = required.filter((name) => !text(name));
  if (typeof env.ASSETS?.fetch !== "function") missing.push("ASSETS");
  for (const key of ["DB", "BUSINESS", "SCOUT"]) if (!env[key]) missing.push(key);
  const invalid: string[] = [];
  for (const key of ["APP_BASE_URL", "CYBER_SCOUT_ORIGIN", "CYBER_PIT_ORIGIN"]) if (text(key) && !/^https:\/\/[a-z0-9.-]+$/.test(text(key))) invalid.push(key);
  for (const key of ["SESSION_SECRET", "CYBER_STRATEGY_EMBED_SECRET", "SCOUT_STRATEGY_SECRET"])
    if (text(key) && text(key).length < 32) invalid.push(key);
  if (typeof env.FEISHU_ALLOWED_TENANT_KEYS === "string" && env.FEISHU_ALLOWED_TENANT_KEYS && !env.FEISHU_ALLOWED_TENANT_KEYS.split(",").some((v) => v.trim()))
    invalid.push("FEISHU_ALLOWED_TENANT_KEYS");
  // The data lives in D1 (Scout data comes through the SCOUT binding); an external database must never be configured here.
  for (const key of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "CYBER_SCOUT_SUPABASE_URL", "CYBER_SCOUT_SUPABASE_SERVICE_ROLE_KEY", "DATABASE_URL"]) if (env[key] !== undefined) invalid.push(key);
  // Feishu endpoint/scope overrides exist for local development only.
  for (const key of ["FEISHU_AUTHORIZE_BASE", "FEISHU_API_BASE", "FEISHU_OAUTH_SCOPE"]) if (env[key] !== undefined) invalid.push(key);
  const value = { origin: text("APP_BASE_URL"), pitOrigin: text("CYBER_PIT_ORIGIN"), configured: missing.length === 0 && invalid.length === 0, missing, invalid,
    // Without a configured Feishu Wiki video library the app simply shows no video links (as the original did).
    videoLibraryConfigured: Boolean(text("FEISHU_VIDEO_LIBRARY_NODE_TOKEN") || text("FEISHU_VIDEO_LIBRARY_URL")) };
  configurations.set(env, value);
  return value;
}
// /__ready is the only place that probes the database; ordinary requests never pay for it.
async function ready(env: Env, state: Configuration) {
  let database = false;
  if (state.configured) { try { database = Boolean(await env.DB.prepare("SELECT (SELECT count(*) FROM profiles) AS profiles,(SELECT count(*) FROM app_settings) AS settings").first()); } catch { /* reported below */ } }
  return { service: "cyber-strategy", ready: state.configured && database, configured: state.configured, missing: state.missing, invalid: state.invalid, database, videoLibraryConfigured: state.videoLibraryConfigured };
}
function badPath(path: string): boolean {
  try {
    return decodeURIComponent(path).split("/").some((part) => part.startsWith(".") || part.includes("\\")) || /%2f|%5c/i.test(path);
  } catch { return true; }
}
// GET routes that write: OAuth start (one-time state), OAuth callback (profile, login audit), logout (logout audit).
const writingReads = ["/api/auth/login", "/api/auth/callback", "/auth/feishu/callback", "/auth/logout"];
async function fetchRequest(request: Request, env: Env, ctx: Context, serialized = false): Promise<Response> {
  const url = new URL(request.url), state = configuration(env);
  const finish = (response: Response, isStatic = false) => secured(response, request, isStatic, state.pitOrigin);
  const json = (body: unknown, status = 200) => finish(Response.json(body, { status }));
  if (!state.origin || url.origin !== state.origin) return json({ error: "host_not_served" }, 421);
  if (badPath(url.pathname)) return json({ error: "not_found" }, 404);
  if (Object.hasOwn(assets, url.pathname)) {
    if (!["GET", "HEAD"].includes(request.method)) return json({ error: "method_not_allowed" }, 405);
    if (!env.ASSETS?.fetch) return json({ error: "assets_unavailable" }, 503);
    const response = await env.ASSETS.fetch(request);
    if (response.status !== 200 && response.status !== 304) return json({ error: "asset_unavailable" }, 503);
    const headers = new Headers(response.headers);
    headers.set("Content-Type", assets[url.pathname]!.mime);
    if (request.method === "HEAD" && response.status === 200 && !headers.has("Content-Length") && !headers.has("Content-Encoding")) headers.set("Content-Length", String(assets[url.pathname]!.bytes));
    headers.set("Cache-Control", url.pathname.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "public, max-age=3600");
    return finish(new Response(response.body, { status: response.status, headers }), true);
  }
  if (url.pathname.startsWith("/assets/")) return json({ error: "not_found" }, 404);
  if (url.pathname === "/__ready") { const probe = await ready(env, state); return json(probe, probe.ready ? 200 : 503); }
  const routePath = url.pathname === "/_root.data" ? "/" : url.pathname.replace(/\.data$/, "");
  if (!matchRoutes(routeTree, routePath)) return json({ error: "not_found" }, 404);
  if (!state.configured) return json({ error: "configuration_unavailable", missing: state.missing, invalid: state.invalid }, 503);
  const write = !["GET", "HEAD", "OPTIONS"].includes(request.method);
  if (write && ((request.headers.has("Origin") && request.headers.get("Origin") !== url.origin) || request.headers.get("Sec-Fetch-Site") === "cross-site")) return json({ error: "cross_origin_write_denied" }, 403);
  // Every write is serialized through one Durable Object. The Cyber Pit embed request is a POST that only reads,
  // so it is served directly.
  const mutable = (write && routePath !== "/api/cyber-pit-embed") || writingReads.includes(routePath);
  if (mutable && !serialized) return env.BUSINESS.get(env.BUSINESS.idFromName("business-v1")).fetch(request);
  try {
    return finish(await inNative(request, env, serialized, async () => {
      if (["/api/auth/callback", "/auth/feishu/callback"].includes(routePath) && !(await consumeState(request, env))) return Response.redirect(state.origin + "/auth/login?error=bad_state", 302);
      const response = await handle(request, { cloudflare: { env, ctx } });
      return routePath === "/api/auth/login" ? registerState(response, env) : response;
    }));
  } catch (error) {
    if (error instanceof Response) return finish(error);
    console.error("request failed", request.method, url.pathname, error instanceof Error ? error.message : String(error));
    return json({ error: "request_failed" }, 503);
  }
}
export default { fetch: fetchRequest };
export class StrategyBusiness {
  constructor(private state: SerialState, private env: Env) {}
  fetch(request: Request) {
    return this.state.blockConcurrencyWhile(() => fetchRequest(request, this.env, { waitUntil() {}, passThroughOnException() {} }, true));
  }
}
