import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { sidecar, json, hash } from "../scripts/common.mjs";

// Only the actual cf deploy --dry-run bundle is executed. No app source imports.
const dir = resolve(sidecar, ".cloudflare/output/v0/workers/default");
const config = json(resolve(dir, "worker.config.json"));
const assets = json(resolve(sidecar, ".required-tool-outputs/assets.json"));
const origin = "https://strategy-cf.team8214.com";
const secret = "synthetic-local-session-secret-not-a-credential";
const embedSecret = "synthetic-local-pit-secret-not-a-credential";
const synthetic = Object.fromEntries(Object.entries(config.env).filter(([, value]) => value.type === "text").map(([key, value]) => [key, value.value]));
for (const [key, value] of Object.entries(config.env)) if (value.type === "secret") synthetic[key] = "synthetic-" + key.toLowerCase();
Object.assign(synthetic, {
  SESSION_SECRET: secret, CYBER_STRATEGY_EMBED_SECRET: embedSecret, FEISHU_ALLOWED_TENANT_KEYS: "synthetic-tenant",
  SUPABASE_URL: "https://strategy-db.invalid", CYBER_SCOUT_SUPABASE_URL: "https://scout-db.invalid",
  STRATEGY_DATA_READY: "approved-isolated-strategy-and-scout-data", STRATEGY_INTEGRATIONS_READY: "approved-preview-contract",
  FEISHU_VIDEO_LIBRARY_NODE_TOKEN: "synthetic-wiki-root", FEISHU_VIDEO_LIBRARY_URL: "https://synthetic.feishu.cn/wiki/synthetic-wiki-root",
});
const event = { id: "11111111-1111-4111-8111-111111111111", tba_event_key: "2026test", name: "Synthetic Regional", is_active: true, updated_at: "2026-01-01T00:00:00.000Z" };
const normalId = "22222222-2222-4222-8222-222222222222";
const pitId = "33333333-3333-4333-8333-333333333333";
const stamp = "2026-01-01T00:00:00.000Z";
const records = [
  { id: normalId, event_id: event.id, record_type: "normal_match", match_type: "Q", match_number: 1, alliance: "red", team_number: 8214,
    payload: { scout: "Synthetic Scout", matchType: "Q", matchNumber: 1, teamNumber: 8214, manualShotDirect: [{ startMs: 0, endMs: 10000 }], manualZoneEvents: [{ zone: "联盟", atMs: 0 }] }, uploaded_at: stamp },
  { id: "44444444-4444-4444-8444-444444444444", event_id: event.id, record_type: "super_match", match_type: "Q", match_number: 1, alliance: "red", team_number: null,
    payload: { scout: "Synthetic Super", matchType: "Q", matchNumber: 1, alliance: "red", teams: [8214, 6328, 157], auto: [10, 20, 30], drive: [5, 3, 2], defense: [4, 2, 1], bps: [10, 5, 3], accuracy: [80, 60, 40], comments: ["Synthetic runtime record", "", ""] }, uploaded_at: stamp },
  { id: pitId, event_id: event.id, record_type: "pit", match_type: null, match_number: null, team_number: 8214,
    payload: { teamNumber: 8214, photoPaths: ["synthetic-event/synthetic-pit/1.png"], drivetrain: "Synthetic Swerve" }, uploaded_at: stamp },
];
let scoutConfig = { tbaEventKey: "2026test", eventName: event.name, teams: [8214, 6328, 157], matches: [], assignments: [], savedAt: stamp };
const tbaMatches = [{ key: "2026test_qm1", comp_level: "qm", match_number: 1, set_number: 1,
  alliances: { red: { team_keys: ["frc8214", "frc6328", "frc157"] }, blue: { team_keys: ["frc1", "frc2", "frc3"] } } }];
const calls = [], unexpected = [], runtimes = [];
const reply = (body, status = 200) => Response.json(body, { status });
function rowsResponse(request, rows) {
  const limit = new URL(request.url).searchParams.get("limit");
  if (limit !== null) rows = rows.slice(0, Number(limit));
  return reply(request.headers.get("accept")?.includes("vnd.pgrst.object") ? rows[0] ?? null : rows);
}
async function outbound(request) {
  const url = new URL(request.url);
  const text = ["GET", "HEAD"].includes(request.method) ? "" : await request.text();
  const body = text ? JSON.parse(text) : null;
  calls.push({ host: url.hostname, path: url.pathname, method: request.method, body, search: url.search });
  const auth = request.headers.get("authorization");
  if (["strategy-db.invalid", "scout-db.invalid"].includes(url.hostname)) {
    const own = url.hostname === "strategy-db.invalid";
    assert.equal(request.headers.get("apikey"), synthetic[own ? "SUPABASE_SERVICE_ROLE_KEY" : "CYBER_SCOUT_SUPABASE_SERVICE_ROLE_KEY"]);
    if (url.pathname === "/rest/v1/profiles" && own) {
      if (request.method === "GET") {
        const admin = url.searchParams.get("open_id") === "eq.synthetic-admin";
        return rowsResponse(request, [{ open_id: admin ? "synthetic-admin" : "synthetic-member", name: "Synthetic User", is_admin: admin }]);
      }
      if (request.method === "POST") return reply(null);
    }
    if (url.pathname === "/rest/v1/audit_logs" && own && request.method === "POST") return reply(null);
    if (url.pathname === "/rest/v1/app_settings") {
      if (request.method === "GET") {
        if (!own) return rowsResponse(request, [{ config: scoutConfig, updated_at: stamp }]);
        const key = url.searchParams.get("key");
        return rowsResponse(request, [{ value: key === "eq.data_range" ? ["qualification"] : { S: 10, A: 20, B: 40, C: 30 } }]);
      }
      if (request.method === "POST") {
        if (!own) scoutConfig = body.config;
        return reply(null);
      }
    }
    if (!own && url.pathname === "/rest/v1/scouting_events" && request.method === "GET") return rowsResponse(request, [event]);
    if (!own && url.pathname === "/rest/v1/user_profiles" && request.method === "GET")
      return rowsResponse(request, [{ id: "synthetic-member", display_name: "Synthetic Scout" }]);
    if (!own && url.pathname === "/rest/v1/scouting_records") {
      const id = url.searchParams.get("id")?.replace(/^eq\./, "");
      let rows = id ? records.filter((row) => row.id === id) : [...records];
      for (const key of ["team_number", "match_number", "record_type"]) {
        const filter = url.searchParams.get(key);
        if (filter?.startsWith("eq.")) rows = rows.filter((row) => String(row[key]) === filter.slice(3));
        if (filter?.startsWith("in.(")) rows = rows.filter((row) => filter.slice(4, -1).split(",").includes(String(row[key])));
      }
      if (request.method === "GET") return rowsResponse(request, rows);
      if (request.method === "PATCH") { for (const row of rows) row.payload = body.payload; return reply(null); }
      if (request.method === "DELETE") { for (const row of rows) records.splice(records.indexOf(row), 1); return reply(null); }
    }
    if (!own && url.pathname === "/storage/v1/object/pit-photos" && request.method === "DELETE") return reply([{ name: "synthetic-event/synthetic-pit/1.png" }]);
    if (!own && url.pathname === "/storage/v1/object/authenticated/pit-photos/synthetic-event/synthetic-pit/1.png" && request.method === "GET")
      return new Response(new Uint8Array([137, 80, 78, 71]), { headers: { "content-type": "image/png" } });
  }
  if (url.hostname === "open.feishu.cn") {
    if (url.pathname === "/open-apis/authen/v2/oauth/token") {
      assert.equal(request.method, "POST"); assert.equal(body.grant_type, "authorization_code");
      assert.equal(body.client_secret, synthetic.FEISHU_APP_SECRET);
      assert.equal(body.redirect_uri, origin + "/auth/feishu/callback");
      assert.match(body.code_verifier, /^[A-Za-z0-9_-]{43}$/);
      return reply({ access_token: "synthetic-access-" + body.code });
    }
    if (url.pathname === "/open-apis/authen/v1/user_info") {
      const code = auth?.replace("Bearer synthetic-access-", "");
      return reply({ data: { open_id: code === "admin" ? "synthetic-admin" : "synthetic-member", name: "Synthetic User", tenant_key: code === "outsider" ? "wrong-tenant" : "synthetic-tenant" } });
    }
    if (url.pathname === "/open-apis/auth/v3/tenant_access_token/internal") return reply({ tenant_access_token: "synthetic-wiki-token" });
    if (url.pathname === "/open-apis/wiki/v2/spaces/get_node") return reply({ code: 0, data: { node: { space_id: "synthetic-space", node_token: "synthetic-wiki-root", title: "Synthetic video library" } } });
    if (url.pathname === "/open-apis/wiki/v2/spaces/synthetic-space/nodes") return reply({ code: 0, data: { items: [{ node_token: "synthetic-video", title: "2026test_qm1.mp4", obj_type: "file", has_child: false }], has_more: false } });
  }
  if (url.hostname === "www.thebluealliance.com" && url.pathname === "/api/v3/event/2026test/matches") {
    assert.equal(request.headers.get("x-tba-auth-key"), synthetic.TBA_API_KEY); return reply(tbaMatches);
  }
  if (url.hostname === "frc-api.firstinspires.org" && url.pathname.startsWith("/v3.0/2026/")) {
    assert.equal(auth, "Basic " + Buffer.from(synthetic.FRC_EVENTS_USERNAME + ":" + synthetic.FRC_EVENTS_API_KEY).toString("base64"));
    if (url.pathname.includes("/schedule/")) return reply({ Schedule: url.searchParams.get("tournamentLevel") === "Qualification" ? [{ tournamentLevel: "Qualification", description: "Qualification 1", matchNumber: 1, teams: [{ teamNumber: 8214, station: "Red1" }] }] : [] });
    if (url.pathname.endsWith("/Qualification")) return reply({ MatchScores: [{ matchLevel: "Qualification", matchNumber: 1, alliances: [{ alliance: "red", autoPoints: 30, teleopPoints: 70, totalPoints: 100 }, { alliance: "blue", autoPoints: 20, teleopPoints: 60, totalPoints: 80 }] }] });
    return reply({ MatchScores: [] });
  }
  unexpected.push(request.method + " " + url.origin + url.pathname);
  throw new Error("Unexpected outbound request (network is never forwarded)");
}
function make(bindings = synthetic, withAssets = true) {
  const runtime = new Miniflare(convertV4MiniflareOptions({
    modules: true, compatibilityDate: config.compatibilityDate, compatibilityFlags: config.compatibilityFlags,
    scriptPath: resolve(dir, "bundle/worker.js"), bindings,
    ...(withAssets ? { serviceBindings: { ASSETS: async (request) => {
      const name = new URL(request.url).pathname;
      if (!Object.hasOwn(assets, name)) return new Response("Not found", { status: 404 });
      const bytes = readFileSync(resolve(dir, "assets", "." + name));
      return new Response(request.method === "HEAD" ? null : bytes, { headers: { "content-type": assets[name].mime, "content-length": String(bytes.length) } });
    } } } : {}),
    outboundService: outbound,
  }));
  runtimes.push(runtime); return runtime;
}
let runtime;
const request = (path, init = {}, target = runtime) => target.dispatchFetch(origin + path, { redirect: "manual", ...init });
function privateResponse(response) {
  assert.equal(response.headers.get("cache-control"), "private, no-store, max-age=0");
  assert.equal(response.headers.get("cloudflare-cdn-cache-control"), "no-store");
  assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow, noarchive");
  assert.equal(response.headers.get("etag"), null);
}
function seal(payload) {
  const iv = randomBytes(12), key = createHash("sha256").update(secret).digest();
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const bytes = Buffer.concat([cipher.update(JSON.stringify(payload)), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), bytes]).toString("base64url");
}
function unseal(token) {
  const bytes = Buffer.from(token, "base64url");
  const decipher = createDecipheriv("aes-256-gcm", createHash("sha256").update(secret).digest(), bytes.subarray(0, 12));
  decipher.setAuthTag(bytes.subarray(12, 28));
  return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString());
}
const form = (values, cookie) => ({ method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", ...(cookie ? { cookie } : {}) }, body: new URLSearchParams(values).toString() });
async function login(code = "member") {
  const response = await request("/api/auth/login?returnTo=%2Fpicklists%3Fevent%3D2026test");
  assert.equal(response.status, 302); privateResponse(response);
  const auth = new URL(response.headers.get("location"));
  assert.equal(auth.origin, "https://accounts.feishu.cn");
  assert.equal(auth.searchParams.get("redirect_uri"), origin + "/auth/feishu/callback");
  assert.equal(auth.searchParams.get("code_challenge_method"), "S256");
  const state = auth.searchParams.get("state"), payload = unseal(state);
  assert.equal(auth.searchParams.get("code_challenge"), createHash("sha256").update(payload.v).digest("base64url"));
  const callback = await request("/auth/feishu/callback?" + new URLSearchParams({ code, state }));
  assert.equal(callback.status, 302); privateResponse(callback);
  return callback;
}
before(() => { runtime = make(); });
after(async () => { for (const instance of runtimes) await instance.dispose(); assert.deepEqual(unexpected, [], "Every outbound must match a synthetic service fixture"); });

test("missing secrets/assets and nonempty tenant gate fail closed (actual bundle)", async () => {
  const missing = make({ APP_BASE_URL: origin, STRATEGY_PREVIEW_MODE: "preview-only" }, false);
  for (const path of ["/__ready", "/auth/login", "/", "/scouting-lead"]) {
    const response = await request(path, {}, missing); assert.equal(response.status, 503); privateResponse(response);
    assert.equal((await response.json()).ready, false);
  }
  const invalid = make({ ...synthetic, FEISHU_ALLOWED_TENANT_KEYS: " , , " });
  const response = await request("/__ready", {}, invalid); assert.equal(response.status, 503);
  assert((await response.json()).invalid.includes("FEISHU_ALLOWED_TENANT_KEYS"));
});
test("data and Pit/Scout configuration gates are independent and block ALL business I/O", async () => {
  const beforeCalls = calls.length;
  for (const overrides of [{ STRATEGY_DATA_READY: "blocked" }, { STRATEGY_INTEGRATIONS_READY: "blocked" }, { CYBER_PIT_ORIGIN: "https://pit.team8214.com" }, { CYBER_SCOUT_ORIGIN: "https://scout.team8214.com" }]) {
    const blocked = make({ ...synthetic, ...overrides });
    for (const path of ["/__ready", "/scouting-lead", "/api/cyber-pit-embed"]) {
      const response = await request(path, form({ intent: "delete-record", recordId: pitId }), blocked);
      assert.equal(response.status, 503); privateResponse(response);
    }
  }
  assert.equal(calls.length, beforeCalls);
});
test("unknown/private routes remain 404 before configuration and exact host is enforced", async () => {
  const missing = make({});
  for (const path of ["/unknown", "/unknown.data", "/.env", "/%2eenv", "/app/root.tsx", "/cloudflare/source-lock.json", "/package.json", "/pnpm-lock.yaml", "/assets/nope.js", "/assets/app.css.map", "/api/admin/export", "/build/server/index.js", "/public/ni-logo.png"]) {
    const response = await request(path, {}, missing); assert.equal(response.status, 404, path); privateResponse(response);
  }
  for (const url of ["https://strategy.team8214.com/", "https://strategy-cf.team8214.com.evil.invalid/", "https://strategy-cf.team8214.com:444/", "http://strategy-cf.team8214.com/"])
    assert.equal((await runtime.dispatchFetch(url)).status, 421);
});
test("SSR login is real HTML with original version/CSS, initial discovery and no analytics", async () => {
  const response = await request("/auth/login"); assert.equal(response.status, 200); privateResponse(response);
  const html = await response.text(); assert.match(html, /<html/); assert.match(html, /Cyber Strategy/); assert.match(html, /2026\.1\.77/);
  assert.match(html, /app-DQzbZJn0\.css/); assert(!/_vercel\/insights|va\.vercel-scripts|strategy-db\.invalid/.test(html));
  const head = await request("/auth/login", { method: "HEAD" }); assert.equal(head.status, 200); assert.equal(await head.text(), "");
});
test("OAuth PKCE, tenant rejection and secure host-only encrypted session survive packaging", async () => {
  const denied = await login("outsider"); assert.equal(denied.headers.get("set-cookie"), null); assert.equal(denied.headers.get("location"), "/auth/login?error=tenant_not_allowed");
  const callback = await login(); assert.equal(callback.headers.get("location"), "/picklists?event=2026test");
  const cookie = callback.headers.get("set-cookie");
  assert.match(cookie, /^strategy_session=/); for (const flag of ["HttpOnly", "Secure", "SameSite=Lax", "Path=/", "Max-Age=604800"]) assert(cookie.includes(flag));
  assert(!cookie.includes("Domain="));
  assert.equal(unseal(decodeURIComponent(cookie.split(";")[0].split("=")[1])).user.feishuOpenId, "synthetic-member");
  const bad = await request("/auth/feishu/callback?code=member&state=tampered"); assert.equal(bad.headers.get("location"), "/auth/login?error=bad_state");
  const expired = seal({ v: "x", r: "/", exp: 1 });
  assert.equal((await request("/api/auth/callback?" + new URLSearchParams({ code: "member", state: expired }))).headers.get("location"), "/auth/login?error=state_expired");
});
test("anonymous, expired and tampered sessions cannot write, read export UI or mutate Scout", async () => {
  const beforeCalls = calls.length;
  const expired = "strategy_session=" + seal({ user: { id: "synthetic-admin", feishuOpenId: "synthetic-admin", displayName: "Synthetic" }, exp: 1 });
  for (const cookie of [undefined, expired, expired + "tampered"]) {
    for (const path of ["/admin", "/picklists", "/strategy-proposal", "/scouting-record", "/scouting-lead"].flatMap((path) => [path, path + ".data"])) {
      const response = await request(path, form({ intent: "delete-record", recordId: pitId }, cookie));
      assert.equal(response.status, 401, path); privateResponse(response);
    }
    const photos = await request("/api/cyber-scout/photos?path=synthetic-event%2Fsynthetic-pit%2F1.png", { headers: cookie ? { cookie } : {} });
    assert.equal(photos.status, 401); privateResponse(photos);
    const exportUi = await request("/picklists?event=2026test", { headers: cookie ? { cookie } : {} }); assert.equal(exportUi.status, 302);
    assert.match(exportUi.headers.get("location"), /^\/auth\/login/);
  }
  assert.equal(calls.length, beforeCalls, "Denied sessions must not reach either database");
});
test("nonadmin cannot use admin settings, Scout record/assignment/photo deletion or approval", async () => {
  const callback = await login(), cookie = callback.headers.get("set-cookie").split(";")[0];
  const beforeCalls = calls.length;
  for (const path of ["/admin", "/scouting-record", "/scouting-lead"].flatMap((path) => [path, path + ".data"])) {
    const response = await request(path, form({ intent: "delete-record", recordId: pitId }, cookie)); assert.equal(response.status, 403); privateResponse(response);
  }
  const review = await request("/strategy-proposal", form({ intent: "review", id: "synthetic-proposal", decision: "approved" }, cookie));
  assert.equal(review.status, 200); assert.match(await review.text(), /error|权限/);
  assert(calls.slice(beforeCalls).every((call) => call.host === "strategy-db.invalid" && call.method === "GET" && call.path === "/rest/v1/profiles"));
});
test("authenticated SSR reads nonempty Scout dataset, real permission rows and FRC/TBA fixtures", async () => {
  const callback = await login("admin"), cookie = callback.headers.get("set-cookie").split(";")[0];
  const response = await request("/?event=2026test", { headers: { cookie } }); assert.equal(response.status, 200); privateResponse(response);
  const html = await response.text(); assert.match(html, /Synthetic Regional/); assert.match(html, /Synthetic runtime record/); assert.match(html, /cyber-scout-2026test/); assert.match(html, /8214/);
  const data = await request("/_root.data?event=2026test", { headers: { cookie } });
  assert.equal(data.status, 200); privateResponse(data); assert.match(await data.text(), /Synthetic Regional/);
  assert(calls.some((call) => call.host === "scout-db.invalid" && call.path === "/rest/v1/scouting_records"));
  assert(calls.some((call) => call.host === "frc-api.firstinspires.org")); assert(calls.some((call) => call.host === "www.thebluealliance.com"));
});
test("authenticated video API retains Feishu tenant-token/Wiki and nonempty video links", async () => {
  const callback = await login(), cookie = callback.headers.get("set-cookie").split(";")[0];
  const response = await request("/api/match-videos?event=2026test", { headers: { cookie } }); assert.equal(response.status, 200); privateResponse(response);
  const body = await response.json(); assert.equal(body.videos["2026test_qm1"][0].title, "2026test_qm1.mp4");
  assert(calls.some((call) => call.path === "/open-apis/auth/v3/tenant_access_token/internal"));
  assert(calls.some((call) => call.path === "/open-apis/wiki/v2/spaces/synthetic-space/nodes"));
});
test("Pit bearer precheck, five-minute HMAC URL and preview-only CSP contract are intact", async () => {
  const fixture = json(resolve(sidecar, "tests/cross-app-contract.json"));
  assert.equal(fixture.previewPitOrigin, synthetic.CYBER_PIT_ORIGIN); assert.equal(fixture.previewScoutOrigin, synthetic.CYBER_SCOUT_ORIGIN);
  const init = { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(fixture.input) };
  const denied = await request("/api/cyber-pit-embed", init); assert.equal(denied.status, 401); privateResponse(denied);
  const now = Date.now();
  const response = await request("/api/cyber-pit-embed", { ...init, headers: { ...init.headers, authorization: "Bearer " + embedSecret } });
  assert.equal(response.status, 200); privateResponse(response);
  const url = new URL((await response.json()).url); assert.equal(url.origin, origin); assert.equal(url.pathname, "/embed");
  const expires = Number(url.searchParams.get("expires")); assert(expires >= now + fixture.lifetimeMs && expires <= Date.now() + fixture.lifetimeMs);
  const expected = createHmac("sha256", embedSecret).update([fixture.input.eventKey, fixture.input.kind, fixture.input.target, fixture.input.theme, expires].join("\n")).digest("base64url");
  assert.equal(url.searchParams.get("signature"), expected);
  const embedded = await runtime.dispatchFetch(url.toString()); assert.equal(embedded.status, 200); privateResponse(embedded);
  assert.equal(embedded.headers.get("content-security-policy"), "frame-ancestors " + fixture.previewPitOrigin);
  assert.equal(embedded.headers.get("referrer-policy"), "no-referrer");
  assert.match(await embedded.text(), /8214/);
  url.searchParams.set("target", "1"); assert.equal((await runtime.dispatchFetch(url.toString())).status, 404);
  url.searchParams.set("expires", "1"); assert.equal((await runtime.dispatchFetch(url.toString())).status, 404);
});
test("admin original routes still PATCH Scout payloads, save/delete assignments and delete pit photos/records", async () => {
  const callback = await login("admin"), cookie = callback.headers.get("set-cookie").split(";")[0];
  const beforeCalls = calls.length;
  let response = await request("/scouting-record", { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ eventKey: "2026test", team: "8214", matchType: "qualification", matchNumber: 1, alliance: "red", normal: { shootingSeconds: 12, transferSeconds: 3 } }) });
  assert.equal(response.status, 200); assert.equal((await response.json()).saved, true);
  assert.equal(records.find((row) => row.id === normalId).payload.strategyOverride.shootingMs, 12000);
  response = await request("/scouting-lead", form({ intent: "save-assignment", assignmentId: "synthetic-assignment", event: "2026test", startMatch: "1", endMatch: "3", position: "R1", userName: "Synthetic Scout" }, cookie));
  assert.equal(response.status, 200); assert.equal(scoutConfig.assignments[0].userName, "Synthetic Scout");
  response = await request("/scouting-lead", form({ intent: "delete-assignment", assignmentId: "synthetic-assignment" }, cookie));
  assert.equal(response.status, 200); assert.equal(scoutConfig.assignments.length, 0);
  response = await request("/scouting-lead", form({ intent: "delete-record", recordId: pitId }, cookie));
  assert.equal(response.status, 200); assert(!records.some((row) => row.id === pitId));
  const mutations = calls.slice(beforeCalls).filter((call) => !["GET", "HEAD"].includes(call.method));
  assert(mutations.some((call) => call.method === "PATCH" && call.path === "/rest/v1/scouting_records"));
  assert.equal(mutations.filter((call) => call.path === "/rest/v1/app_settings").length, 2);
  const photoDelete = mutations.findIndex((call) => call.path === "/storage/v1/object/pit-photos" && call.method === "DELETE");
  const recordDelete = mutations.findIndex((call) => call.path === "/rest/v1/scouting_records" && call.method === "DELETE");
  assert(photoDelete >= 0 && recordDelete > photoDelete); assert(mutations.every((call) => call.host === "scout-db.invalid"));
});
test("every packaged asset GET matches SHA/length/MIME and HEAD is bodyless; assets never expose source", async () => {
  for (const [name, record] of Object.entries(assets)) {
    const response = await request(name); assert.equal(response.status, 200, name);
    const bytes = Buffer.from(await response.arrayBuffer()); assert.equal(hash(bytes), record.sha256, name); assert.equal(bytes.length, record.bytes);
    assert.equal(response.headers.get("content-type"), record.mime); assert.match(response.headers.get("cache-control"), /^public,/);
    assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow, noarchive");
    const head = await request(name, { method: "HEAD" }); assert.equal(head.status, 200, name); assert.equal(await head.text(), ""); assert.equal(head.headers.get("content-length"), String(record.bytes));
  }
  assert.equal((await request(Object.keys(assets)[0], { method: "POST" })).status, 405);
});
