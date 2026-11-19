import { consumeState, registerState } from "./native/oauth";
import {isFormal} from './production/policy';
import { inNative, sealed, canonicalOrigin, type RuntimeEnv, type SerialState } from "./native/runtime";
import { createRequestHandler, matchRoutes, type RouteObject } from "react-router";
import * as build from "./.build-input/build/server/index.js";
import assetManifest from "./.required-tool-outputs/assets.json";
import { admitCanary, executeCanary } from "./native/canary";
import { requireNative } from "../app/lib/native-context.server";

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
  "SCOUT_STRATEGY_SECRET",
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
function secured(response: Response, request: Request, isStatic = false, env?: Env): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(privateHeaders))
    if (!isStatic || !/cache-control|surrogate-control/i.test(key)) headers.set(key, value);
  if (!isStatic) {
    headers.delete("ETag"); headers.delete("Last-Modified"); headers.append("Vary", "Cookie");
    // Preview-only CSP overlay: the original production Pit contract is untouched.
    if (/^\/embed(?:\.data)?$/.test(new URL(request.url).pathname)) {
      headers.set("Content-Security-Policy", isFormal(env??{}) || env?.ORIGIN_HANDOVER === "approved-same-origin" ? "frame-ancestors https://pit.team8214.com" : "frame-ancestors https://pit-cf.team8214.com");
      headers.set("Referrer-Policy", "no-referrer");
    }
  }
  return new Response(request.method === "HEAD" ? null : response.body, { status: response.status, statusText: response.statusText, headers });
}
async function readiness(env: Env) {
  const text = (name: string) => typeof env[name] === "string" ? env[name] as string : "";
  const missing = required.filter((name) => !text(name).trim());
  if (typeof env.ASSETS?.fetch !== "function") missing.push("ASSETS");
  // Source treats an unconfigured optional Wiki library as no links, not total app outage.
  const videoLibraryConfigured = Boolean(text("FEISHU_VIDEO_LIBRARY_NODE_TOKEN").trim() || text("FEISHU_VIDEO_LIBRARY_URL").trim());
  const invalid: string[] = [];
  for (const [key, expected] of [
    ["STRATEGY_PREVIEW_MODE", isFormal(env)?'production-standby':'preview-only'], ["APP_BASE_URL", canonicalOrigin(env)],
    ["CYBER_PIT_ORIGIN", isFormal(env)||env.ORIGIN_HANDOVER === "approved-same-origin" ? "https://pit.team8214.com" : "https://pit-cf.team8214.com"], ["CYBER_SCOUT_ORIGIN", isFormal(env)||env.ORIGIN_HANDOVER === "approved-same-origin" ? "https://scout.team8214.com" : "https://scout-cf.team8214.com"],
  ] as const) if (text(key) !== expected) invalid.push(key);
  for (const key of ["SESSION_SECRET", "CYBER_STRATEGY_EMBED_SECRET", "SCOUT_STRATEGY_SECRET"])
    if (text(key) && text(key).length < 32) invalid.push(key);
  if (text("FEISHU_ALLOWED_TENANT_KEYS") && !text("FEISHU_ALLOWED_TENANT_KEYS").split(",").some((v) => v.trim()))
    invalid.push("FEISHU_ALLOWED_TENANT_KEYS");
  for (const key of ["DB", "FILES", "BUSINESS", "SCOUT"]) if (!env[key]) missing.push(key);
  for (const key of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "CYBER_SCOUT_SUPABASE_URL", "CYBER_SCOUT_SUPABASE_SERVICE_ROLE_KEY", "DATABASE_URL"]) if (env[key] !== undefined) invalid.push(key);
  // Original endpoint/scope overrides are not enabled in this bounded preview.
  for (const key of ["FEISHU_AUTHORIZE_BASE", "FEISHU_API_BASE", "FEISHU_OAUTH_SCOPE"])
    if (env[key] !== undefined) invalid.push(key);
  const dataGate = env.STRATEGY_DATA_READY === "verified-native-data" && await sealed(env);
  const integrationsGate = env.STRATEGY_INTEGRATIONS_READY === (isFormal(env)?'approved-formal-contract':'approved-preview-contract');
  const configured = missing.length === 0 && invalid.length === 0;
  const ready = configured && dataGate && integrationsGate;
  return { service:isFormal(env)?'cyber-strategy':'cyber-strategy-preview', mode:isFormal(env)?'production-standby':'preview-only', configured, ready, businessReady:false, handoverAccepted:false,
    status: !configured ? "configuration_unavailable" : !dataGate ? "data_gate_blocked" : !integrationsGate ? "integration_gate_blocked" : "ready",
    missing, invalid, dataGate, integrationsGate, authWrites: env.AUTH_WRITES === "enabled", businessWrites: env.BUSINESS_WRITES === "enabled", videoLibraryConfigured, dependencyConnectivity: "not-probed" };
}
function badPath(path: string): boolean {
  try {
    return decodeURIComponent(path).split("/").some((part) => part.startsWith(".") || part.includes("\\")) || /%2f|%5c/i.test(path);
  } catch { return true; }
}
async function fetchRequest(request: Request, env: Env, ctx: Context, serialized = false): Promise<Response> {
    const url = new URL(request.url);
    const finish = (response: Response, isStatic = false) => secured(response, request, isStatic, env);
    const json = (body: unknown, status = 200) => finish(Response.json(body, { status }));
    if (url.origin !== canonicalOrigin(env)) return json({ error: "preview_host_required" }, 421);
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
    const state = await readiness(env);
    if (url.pathname === "/__health") return json({ ...state, live: true });
    if (url.pathname === "/__ready") return json(state, state.ready ? 200 : 503);
    const routePath = url.pathname === "/_root.data" ? "/" : url.pathname.replace(/\.data$/, "");
    if (!matchRoutes(routeTree, routePath)) return json({ error: "not_found" }, 404);
    if (!state.ready) return json({ error: "preview_unavailable", ...state }, 503);
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method) &&
      ((request.headers.has("Origin") && request.headers.get("Origin") !== url.origin) || request.headers.get("Sec-Fetch-Site") === "cross-site")) return json({ error: "cross_origin_write_denied" }, 403);
    const mutable = !["GET", "HEAD", "OPTIONS"].includes(request.method) || ["/api/auth/login", "/api/auth/callback", "/auth/feishu/callback"].includes(routePath);
    const authMutable = ["/api/auth/login", "/api/auth/callback", "/auth/feishu/callback"].includes(routePath) || routePath === "/auth/login" && request.method === "POST";
    if (authMutable && env.AUTH_WRITES !== "enabled") return json({ error: "auth_writes_blocked" }, 503);
    if (mutable && !authMutable && !["enabled", "controlled-canary"].includes(String(env.BUSINESS_WRITES))) return json({ error: "business_writes_blocked" }, 503);
    if (mutable && !serialized) return env.BUSINESS.get(env.BUSINESS.idFromName("business-v1")).fetch(request);
    try {
      return finish(await inNative(request, env, serialized, async () => {
        if (mutable && !authMutable && env.BUSINESS_WRITES === "controlled-canary") {
          const admission = await admitCanary(request, env);
          requireNative().canary = admission;
          return executeCanary(request, admission);
        }
        if (["/api/auth/callback", "/auth/feishu/callback"].includes(routePath) && !(await consumeState(request, env))) return Response.redirect(canonicalOrigin(env) + "/auth/login?error=bad_state", 302);
        const response = await handle(request, { cloudflare: { env, ctx } });
        return routePath === "/api/auth/login" ? registerState(response, env) : response;
      }));
    } catch (error) {
      return error instanceof Response ? finish(error) : json({ error: "preview_request_failed" }, 503);
    }
}
export default { fetch: fetchRequest };
export class StrategyBusiness {
  constructor(private state: SerialState, private env: Env) {}
  fetch(request: Request) {
    return this.state.blockConcurrencyWhile(() => fetchRequest(request, this.env, { waitUntil() {}, passThroughOnException() {} }, true));
  }
}
