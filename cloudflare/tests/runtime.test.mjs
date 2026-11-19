import test from "node:test";
import assert from "node:assert/strict";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { sidecar, repo, json, hash } from "../scripts/common.mjs";
import { setup, env, origin, normalId, superId, pitId, photoPath, photoBytes } from "./native-fixture.mjs";

const assets = json(resolve(sidecar, ".required-tool-outputs/assets.json")), secret = env().SESSION_SECRET, embedSecret = env().CYBER_STRATEGY_EMBED_SECRET;
function privateResponse(response) {
  assert.equal(response.headers.get("cache-control"), "private, no-store, max-age=0"); assert.equal(response.headers.get("cloudflare-cdn-cache-control"), "no-store");
  assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow, noarchive"); assert.equal(response.headers.get("etag"), null);
}
// The app's own session/state sealing (app/lib/crypto.server.ts): AES-256-GCM keyed by SESSION_SECRET.
const key = () => createHash("sha256").update(secret).digest();
function unseal(token) { const bytes = Buffer.from(token, "base64url"), decipher = createDecipheriv("aes-256-gcm", key(), bytes.subarray(0, 12)); decipher.setAuthTag(bytes.subarray(12, 28)); return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString()); }
function sealedSession(payload) { const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", key(), iv), bytes = Buffer.concat([cipher.update(JSON.stringify(payload)), cipher.final()]); return "strategy_session=" + Buffer.concat([iv, cipher.getAuthTag(), bytes]).toString("base64url"); }
async function begin(r, path = "/api/auth/login?returnTo=%2Fpicklists%3Fevent%3D2026test") {
  const response = await r.fetch(path); assert.equal(response.status, 302); privateResponse(response);
  const auth = new URL(response.headers.get("location")), state = auth.searchParams.get("state"), payload = unseal(state);
  assert.equal(auth.origin, "https://accounts.feishu.cn"); assert.equal(auth.searchParams.get("redirect_uri"), origin + "/auth/feishu/callback");
  assert.equal(auth.searchParams.get("code_challenge_method"), "S256"); assert.equal(auth.searchParams.get("code_challenge"), createHash("sha256").update(payload.v).digest("base64url"));
  const cookie = response.headers.get("set-cookie").split(";")[0]; assert(cookie.startsWith("__Host-strategy_oauth="));
  return { state, cookie };
}
async function login(r, code = "member") {
  const start = await begin(r), response = await r.fetch("/auth/feishu/callback?" + new URLSearchParams({ code, state: start.state }), { headers: { Cookie: start.cookie } });
  assert.equal(response.status, 302); assert.equal(response.headers.get("location"), "/picklists?event=2026test");
  const raw = response.headers.get("set-cookie"); assert.match(raw, /^strategy_session=/);
  for (const flag of ["HttpOnly", "Secure", "SameSite=Lax", "Path=/", "Max-Age=604800"]) assert(raw.includes(flag), flag);
  assert(!raw.includes("Domain=")); assert.equal(unseal(decodeURIComponent(raw.split(";")[0].split("=")[1])).user.feishuOpenId, "synthetic-" + code);
  return raw.split(";")[0];
}
// A document form POST, and the same submission as React Router's fetcher sends it (POST <route>.data).
function form(values, cookie) { return { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: origin, ...(cookie ? { Cookie: cookie } : {}) }, body: new URLSearchParams(values).toString() }; }
const fetcher = (r, path, values, cookie) => r.fetch(path + ".data", form(values, cookie));
async function rows(db, table) { return (await db.prepare(`SELECT row_json FROM ${table} ORDER BY id`).all()).results.map((row) => JSON.parse(row.row_json)); }
async function proposal(r, cookie, values = {}) { return r.fetch("/strategy-proposal", form({ intent: "save", eventKey: "2026test", matchKey: "2026test_qm1", matchLabel: "Q1", ownTeam: "8214", proposalType: "auto", payload: JSON.stringify({ note: "original-approved-note" }), ...values }, cookie)); }

test("a missing secret, binding or tenant list makes every route answer 503 without leaking a secret or calling out", async (t) => {
  for (const name of ["SESSION_SECRET", "FEISHU_APP_ID", "FEISHU_APP_SECRET", "FEISHU_ALLOWED_TENANT_KEYS", "SCOUT_STRATEGY_SECRET", "CYBER_STRATEGY_EMBED_SECRET", "TBA_API_KEY"]) await t.test(name, async (t) => {
    const r = await setup(t, { [name]: "" });
    for (const path of ["/__ready", "/auth/login", "/", "/scouting-lead"]) { const response = await r.fetch(path); assert.equal(response.status, 503, path); privateResponse(response); assert(!(await response.text()).includes(secret)); }
    assert.deepEqual(r.calls, []);
  });
  const r = await setup(t, { FEISHU_ALLOWED_TENANT_KEYS: " , , " }, false), response = await r.fetch("/__ready");
  assert.equal(response.status, 503); const state = await response.json();
  assert(state.invalid.includes("FEISHU_ALLOWED_TENANT_KEYS")); assert(state.missing.includes("ASSETS"));
});

test("unknown and private paths are 404; other hosts, ports and plain HTTP are not served", async (t) => {
  const r = await setup(t);
  for (const path of ["/unknown", "/unknown.data", "/.env", "/%2eenv", "/_headers", "/app/root.tsx", "/cloudflare/cloudflare.config.ts", "/package.json", "/pnpm-lock.yaml", "/assets/nope.js", "/assets/app.css.map", "/api/admin/export", "/build/server/index.js", "/public/ni-logo.png"]) {
    const response = await r.fetch(path); assert.equal(response.status, 404, path); privateResponse(response);
  }
  for (const url of ["https://strategy-cf.team8214.com/", "https://strategy.team8214.com.evil.invalid/", "https://strategy.team8214.com:444/", "http://strategy.team8214.com:8080/"]) assert.equal((await r.mf.dispatchFetch(url, { redirect: "manual" })).status, 421, url);
});

test("the login page is server-rendered HTML with the packaged stylesheet, the product version and no analytics", async (t) => {
  const r = await setup(t), response = await r.fetch("/auth/login");
  assert.equal(response.status, 200); privateResponse(response);
  const html = await response.text(); assert.match(html, /<html/); assert.match(html, /Cyber Strategy/); assert.match(html, /飞书登录/);
  assert(html.includes(json(resolve(repo, "package.json")).version), "product version in the footer");
  const sheet = /href="(\/assets\/[\w.-]+\.css)"/.exec(html); assert(sheet && assets[sheet[1]], "links the packaged stylesheet");
  assert(!/_vercel\/insights|va\.vercel-scripts/.test(html));
  const head = await r.fetch("/auth/login", { method: "HEAD" }); assert.equal(head.status, 200); assert.equal(await head.text(), "");
});

test("login exactly as the browser does it: the login form POST, the Feishu redirect, the callback and a seven-day session", async (t) => {
  const r = await setup(t);
  // <Form method="post" reloadDocument> on /auth/login: a plain document POST.
  const submitted = await r.fetch("/auth/login", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: origin, "Sec-Fetch-Site": "same-origin" }, body: "returnTo=%2Fpicklists%3Fevent%3D2026test" });
  assert.equal(submitted.status, 302); assert.equal(submitted.headers.get("location"), "/api/auth/login?returnTo=%2Fpicklists%3Fevent%3D2026test");
  const start = await begin(r, submitted.headers.get("location"));
  const callback = await r.fetch("/auth/feishu/callback?" + new URLSearchParams({ code: "member", state: start.state }), { headers: { Cookie: start.cookie } });
  assert.equal(callback.status, 302); assert.equal(callback.headers.get("location"), "/picklists?event=2026test");
  const cookie = callback.headers.get("set-cookie").split(";")[0];
  const page = await r.fetch("/picklists?event=2026test", { headers: { Cookie: cookie } }); assert.equal(page.status, 200);
  assert((await rows(r.db, "audit_logs")).some((row) => row.action === "auth.login" && row.actor_open_id === "synthetic-member"));
  // The other callback path the app declares works the same way.
  const again = await begin(r), second = await r.fetch("/api/auth/callback?" + new URLSearchParams({ code: "admin", state: again.state }), { headers: { Cookie: again.cookie } });
  assert.equal(second.status, 302); assert.match(second.headers.get("set-cookie"), /^strategy_session=/);
});

test("logout works signed in and anonymous, as a document request and as a client navigation, and is audited", async (t) => {
  const r = await setup(t), cookie = await login(r), before = (await rows(r.db, "audit_logs")).filter((row) => row.action === "auth.logout").length;
  const out = await r.fetch("/auth/logout", { headers: { Cookie: cookie } });
  assert.equal(out.status, 302); assert.equal(out.headers.get("location"), "/auth/login?signedOut=1"); assert.match(out.headers.get("set-cookie"), /^strategy_session=;.*Max-Age=0/);
  // <Link to="/auth/logout">: React Router asks for /auth/logout.data and follows the redirect it gets back.
  const navigated = await r.fetch("/auth/logout.data", { headers: { Cookie: cookie } });
  assert.equal(navigated.status, 202); assert.match(await navigated.text(), /\/auth\/login\?signedOut=1/); assert.match(navigated.headers.get("set-cookie"), /^strategy_session=;/);
  const logged = (await rows(r.db, "audit_logs")).filter((row) => row.action === "auth.logout");
  assert.equal(logged.length, before + 2); assert(logged.every((row) => row.actor_open_id === "synthetic-member"));
  const anonymous = await r.fetch("/auth/logout"); assert.equal(anonymous.status, 302); assert.equal(anonymous.headers.get("location"), "/auth/login?signedOut=1");
  assert.equal((await rows(r.db, "audit_logs")).filter((row) => row.action === "auth.logout").length, before + 2);
});

test("Feishu tenant check, profile and admin flag: a foreign tenant gets no session, members and admins do", async (t) => {
  const r = await setup(t), start = await begin(r); r.state.tenant = "wrong-tenant";
  const denied = await r.fetch("/auth/feishu/callback?" + new URLSearchParams({ code: "member", state: start.state }), { headers: { Cookie: start.cookie } });
  assert.equal(denied.headers.get("set-cookie"), null); assert.equal(denied.headers.get("location"), "/auth/login?error=tenant_not_allowed");
  r.state.tenant = "synthetic-tenant"; await login(r); const admin = await login(r, "admin");
  assert((await rows(r.db, "profiles")).find((row) => row.open_id === "synthetic-admin").is_admin);
  assert.equal((await r.fetch("/admin", { headers: { Cookie: admin } })).status, 200);
});

test("the OAuth state is bound to the browser and usable once: missing cookie, tampered, replayed and expired callbacks are refused", async (t) => {
  const r = await setup(t), start = await begin(r), before = (await rows(r.db, "audit_logs")).length;
  let response = await r.fetch("/auth/feishu/callback?" + new URLSearchParams({ code: "member", state: start.state })); assert.match(response.headers.get("location"), /bad_state/);
  response = await r.fetch("/auth/feishu/callback?code=member&state=tampered", { headers: { Cookie: start.cookie } }); assert.match(response.headers.get("location"), /bad_state/);
  assert.equal(r.calls.length, 0);
  const good = await r.fetch("/auth/feishu/callback?" + new URLSearchParams({ code: "member", state: start.state }), { headers: { Cookie: start.cookie } }); assert(good.headers.get("set-cookie"));
  const calls = r.calls.length;
  response = await r.fetch("/auth/feishu/callback?" + new URLSearchParams({ code: "member", state: start.state }), { headers: { Cookie: start.cookie } }); assert.match(response.headers.get("location"), /bad_state/);
  assert.equal(r.calls.length, calls); assert.equal((await rows(r.db, "audit_logs")).length, before + 1);
  const expired = await begin(r); await r.db.prepare("UPDATE native_oauth_states SET expires_ms=1 WHERE used=0").run();
  response = await r.fetch("/auth/feishu/callback?" + new URLSearchParams({ code: "member", state: expired.state }), { headers: { Cookie: expired.cookie } }); assert.match(response.headers.get("location"), /bad_state/);
});

test("anonymous, expired and tampered sessions cannot read photos or change anything in either app", async (t) => {
  const r = await setup(t), expired = sealedSession({ user: { id: "synthetic-admin", feishuOpenId: "synthetic-admin", displayName: "Synthetic" }, exp: 1 }), before = (await rows(r.scoutDB, "scouting_records")).length;
  for (const cookie of [undefined, expired, expired + "tampered"]) {
    for (const path of ["/admin", "/picklists", "/strategy-proposal", "/scouting-record", "/scouting-lead"].flatMap((path) => [path, path + ".data"])) assert.equal((await r.fetch(path, form({ intent: "delete-record", recordId: pitId }, cookie))).status, 401, path);
    assert.equal((await r.fetch("/api/cyber-scout/photos?path=" + encodeURIComponent(photoPath), { headers: cookie ? { Cookie: cookie } : {} })).status, 401);
    assert.equal((await r.fetch("/picklists?event=2026test", { headers: cookie ? { Cookie: cookie } : {} })).status, 302);
  }
  assert.equal((await rows(r.scoutDB, "scouting_records")).length, before); assert.deepEqual(r.calls, []);
});

test("members and revoked admins cannot change settings, Scout records or assignments, or review proposals", async (t) => {
  const r = await setup(t), member = await login(r);
  for (const path of ["/admin", "/scouting-record", "/scouting-lead"].flatMap((path) => [path, path + ".data"])) assert.equal((await r.fetch(path, form({ intent: "delete-record", recordId: pitId }, member))).status, 403, path);
  await proposal(r, member, { intent: "submit" }); const saved = (await rows(r.db, "strategy_proposals"))[0];
  const denied = await r.fetch("/strategy-proposal", form({ intent: "review", id: saved.id, decision: "approved" }, member)); assert.equal(denied.status, 200);
  assert.equal((await rows(r.db, "strategy_proposals"))[0].status, "submitted");
  const admin = await login(r, "admin");
  await r.db.prepare("UPDATE profiles SET row_json=json_set(row_json,'$.is_admin',json('false')) WHERE id='synthetic-admin'").run();
  assert.equal((await r.fetch("/admin", form({ intent: "save-data-range", dataRange: "playoff" }, admin))).status, 403);
});

test("the dashboard (document and .data) shows real Scout data that arrives through the Scout Worker binding", async (t) => {
  const r = await setup(t), cookie = await login(r, "admin");
  let response = await r.fetch("/?event=2026test", { headers: { Cookie: cookie } }); assert.equal(response.status, 200); privateResponse(response);
  const html = await response.text(); for (const text of ["Synthetic Regional", "Synthetic runtime record", "cyber-scout-2026test", "8214"]) assert(html.includes(text), text);
  response = await r.fetch("/_root.data?event=2026test", { headers: { Cookie: cookie } }); assert.equal(response.status, 200); assert((await response.text()).includes("Synthetic Regional"));
  assert(r.calls.some((call) => call.host === "frc-api.firstinspires.org")); assert(r.calls.some((call) => call.host === "www.thebluealliance.com"));
  assert(r.calls.every((call) => !call.path.startsWith("/rest/v1/") && !call.path.startsWith("/storage/v1/")), "no Supabase call");
});

test("the Feishu Wiki video library returns links when configured, and an empty list when it is not", async (t) => {
  let r = await setup(t), cookie = await login(r), response = await r.fetch("/api/match-videos?event=2026test", { headers: { Cookie: cookie } });
  assert.equal(response.status, 200); privateResponse(response); assert.equal((await response.json()).videos["2026test_qm1"][0].title, "2026test_qm1.mp4");
  assert(r.calls.some((call) => call.path.endsWith("/tenant_access_token/internal"))); assert(r.calls.some((call) => call.path.endsWith("/spaces/synthetic-space/nodes")));
  // Production today has no video library configured: the app shows no links, exactly like the original.
  r = await setup(t, { FEISHU_VIDEO_LIBRARY_NODE_TOKEN: "", FEISHU_VIDEO_LIBRARY_URL: "" });
  const ready = await r.fetch("/__ready"); assert.equal(ready.status, 200); assert.equal((await ready.json()).videoLibraryConfigured, false);
  cookie = await login(r); response = await r.fetch("/api/match-videos?event=2026test", { headers: { Cookie: cookie } });
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), { videos: {} });
  assert(!r.calls.some((call) => call.path.includes("/wiki/") || call.path.endsWith("/tenant_access_token/internal")));
});

test("Cyber Pit embed: bearer-protected POST returns a five-minute signed /embed link that only pit.team8214.com may frame", async (t) => {
  const r = await setup(t), input = { eventKey: "2026test", kind: "team", target: "8214", theme: "dark" };
  // Cyber Pit's server sends this without cookie or Origin (repos/cyber-pit/app/lib/cyber-strategy.server.ts).
  const init = { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) };
  assert.equal((await r.fetch("/api/cyber-pit-embed", init)).status, 401);
  assert.equal((await r.fetch("/api/cyber-pit-embed", { ...init, headers: { ...init.headers, Authorization: "Bearer wrong" } })).status, 401);
  const now = Date.now(), response = await r.fetch("/api/cyber-pit-embed", { ...init, headers: { ...init.headers, Authorization: "Bearer " + embedSecret } });
  assert.equal(response.status, 200);
  const url = new URL((await response.json()).url), expires = Number(url.searchParams.get("expires"));
  assert.equal(url.origin, origin); assert.equal(url.pathname, "/embed"); assert(expires >= now + 300000 && expires <= Date.now() + 300000);
  assert.equal(url.searchParams.get("signature"), createHmac("sha256", embedSecret).update([input.eventKey, input.kind, input.target, input.theme, expires].join("\n")).digest("base64url"));
  const embedded = await r.mf.dispatchFetch(url.toString()); assert.equal(embedded.status, 200); privateResponse(embedded);
  assert.equal(embedded.headers.get("content-security-policy"), "frame-ancestors https://pit.team8214.com"); assert.equal(embedded.headers.get("referrer-policy"), "no-referrer");
  assert((await embedded.text()).includes("8214"));
  assert.equal((await r.fetch("/api/cyber-pit-embed", { ...init, headers: { ...init.headers, Authorization: "Bearer " + embedSecret }, body: JSON.stringify({ ...input, target: "9999" }) })).status, 404, "a team without data");
  url.searchParams.set("target", "1"); assert.equal((await r.mf.dispatchFetch(url.toString())).status, 404);
  url.searchParams.set("expires", "1"); assert.equal((await r.mf.dispatchFetch(url.toString())).status, 404);
  assert.equal((await rows(r.db, "audit_logs")).length, 1, "the embed request writes nothing");
});

test("private Scout photos reach a signed-in user only through the app API, with Range and HEAD", async (t) => {
  const r = await setup(t), cookie = await login(r);
  let response = await r.fetch("/api/cyber-scout/photos?path=" + encodeURIComponent(photoPath), { headers: { Cookie: cookie, Range: "bytes=1-3" } });
  assert.equal(response.status, 206); assert.equal(response.headers.get("content-range"), `bytes 1-3/${photoBytes.length}`); assert.deepEqual(new Uint8Array(await response.arrayBuffer()), photoBytes.slice(1, 4));
  response = await r.fetch("/api/cyber-scout/photos?path=" + encodeURIComponent(photoPath), { headers: { Cookie: cookie } });
  assert.equal(response.status, 200); assert.deepEqual(new Uint8Array(await response.arrayBuffer()), photoBytes);
  response = await r.fetch("/api/cyber-scout/photos?path=" + encodeURIComponent(photoPath), { method: "HEAD", headers: { Cookie: cookie } }); assert.equal(response.status, 200); assert.equal(await response.text(), "");
  assert.equal((await r.fetch("/api/cyber-scout/photos?path=../private", { headers: { Cookie: cookie } })).status, 400);
});

test("admin edits of Scout records, assignments and record deletion are written in the Scout database through the binding", async (t) => {
  const r = await setup(t), cookie = await login(r, "admin"), untouched = "9223372036854775807";
  await r.scoutDB.prepare("UPDATE scouting_records SET row_json=substr(row_json,1,length(row_json)-1)||',\"history_raw\":9223372036854775807}' WHERE id=?").bind(normalId).run();
  const loaded = await r.fetch("/scouting-record?" + new URLSearchParams({ event: "2026test", team: "8214", matchType: "qualification", matchNumber: "1", alliance: "red" }), { headers: { Cookie: cookie } });
  assert.equal(loaded.status, 200); assert.equal((await loaded.json()).ok, true);
  let response = await r.fetch("/scouting-record", { method: "POST", headers: { Cookie: cookie, Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify({ eventKey: "2026test", team: "8214", matchType: "qualification", matchNumber: 1, alliance: "red", normal: { shootingSeconds: 12, transferSeconds: 3 }, super: { driveScore: 4, defenseScore: 3, accuracy: 90, bps: 12 } }) });
  assert.equal(response.status, 200); assert.equal((await response.json()).saved, true);
  const normal = await r.scoutDB.prepare("SELECT row_json FROM scouting_records WHERE id=?").bind(normalId).first();
  assert(normal.row_json.includes(untouched), "numbers the edit did not touch keep their exact text"); assert.equal(JSON.parse(normal.row_json).payload.strategyOverride.shootingMs, 12000);
  assert.equal((await rows(r.scoutDB, "scouting_records")).find((row) => row.id === superId).payload.drive[0], 4);
  // The lead panel submits through React Router fetchers: POST /scouting-lead.data
  response = await fetcher(r, "/scouting-lead", { intent: "save-assignment", assignmentId: "synthetic-assignment", event: "2026test", startMatch: "1", endMatch: "3", position: "R1", userName: "Synthetic Scout" }, cookie); assert.equal(response.status, 200);
  const config = (await rows(r.scoutDB, "app_settings"))[0].config; assert.equal(config.assignments[0].userName, "Synthetic Scout"); assert.equal(config.matches.length, 1);
  assert.equal((await fetcher(r, "/scouting-lead", { intent: "delete-assignment", assignmentId: "synthetic-assignment" }, cookie)).status, 200);
  assert.equal((await rows(r.scoutDB, "app_settings"))[0].config.assignments.length, 0);
  assert.equal((await fetcher(r, "/scouting-lead", { intent: "delete-record", recordId: pitId }, cookie)).status, 200);
  assert(!(await rows(r.scoutDB, "scouting_records")).some((row) => row.id === pitId));
  assert.equal(await r.scoutDB.prepare("SELECT path FROM native_objects WHERE path=?").bind(photoPath).first(), null); assert.equal((await r.scoutDB.prepare("SELECT count(*) n FROM native_object_gc").first()).n, 1);
});

test("proposal create, submit, review, edit after approval, restore, reject and delete keep permissions and the approved snapshot", async (t) => {
  const r = await setup(t), member = await login(r), admin = await login(r, "admin"), other = await login(r, "other");
  assert.equal((await proposal(r, member, { intent: "submit" })).status, 200);
  let saved = (await rows(r.db, "strategy_proposals"))[0]; assert.equal(saved.status, "submitted"); assert.equal(saved.created_by, "synthetic-member");
  assert.equal((await fetcher(r, "/strategy-proposal", { intent: "review", id: saved.id, decision: "approved", reviewNote: "Approved" }, admin)).status, 200);
  saved = (await rows(r.db, "strategy_proposals"))[0]; assert.equal(saved.status, "approved");
  const snapshot = structuredClone(saved.last_approved_snapshot); assert.equal(snapshot.payload.note, "original-approved-note");
  await proposal(r, other, { id: saved.id, payload: JSON.stringify({ note: "unauthorized" }) }); assert.equal((await rows(r.db, "strategy_proposals"))[0].payload.note, "original-approved-note");
  await proposal(r, member, { id: saved.id, payload: JSON.stringify({ note: "creator-edited" }) });
  saved = (await rows(r.db, "strategy_proposals"))[0]; assert.equal(saved.status, "submitted"); assert.deepEqual(saved.last_approved_snapshot, snapshot);
  await r.fetch("/strategy-proposal", form({ intent: "restore", id: saved.id }, member));
  saved = (await rows(r.db, "strategy_proposals"))[0]; assert.equal(saved.status, "approved"); assert.equal(saved.payload.note, "original-approved-note");
  await proposal(r, member, { id: saved.id, intent: "submit", payload: JSON.stringify({ note: "resubmit" }) });
  await r.fetch("/strategy-proposal", form({ intent: "review", id: saved.id, decision: "rejected", reviewNote: "Revise" }, admin));
  saved = (await rows(r.db, "strategy_proposals"))[0]; assert.equal(saved.status, "rejected"); assert.deepEqual(saved.last_approved_snapshot, snapshot);
  await r.fetch("/strategy-proposal", form({ intent: "delete", id: saved.id }, admin)); assert.equal((await rows(r.db, "strategy_proposals")).length, 0);
  for (const action of ["strategy_proposal.submit", "strategy_proposal.approve", "strategy_proposal.restore_approved", "strategy_proposal.reject", "strategy_proposal.delete"]) assert((await rows(r.db, "audit_logs")).some((row) => row.action === action), action);
  // The list the panel loads.
  const listed = await r.fetch("/strategy-proposal.data?event=2026test", { headers: { Cookie: member } }); assert.equal(listed.status, 200);
});

test("picklists: admin main list, personal lists with idempotent resubmission, owner-only deletion", async (t) => {
  const r = await setup(t), member = await login(r), admin = await login(r, "admin"), other = await login(r, "other"), lists = async () => (await rows(r.db, "app_settings")).filter((row) => row.key.startsWith("picklist:"));
  await fetcher(r, "/picklists", { intent: "create-main", eventKey: "2026test", name: "Main" }, member); assert.equal((await lists()).length, 0);
  assert.equal((await fetcher(r, "/picklists", { intent: "create-main", eventKey: "2026test", name: "Main" }, admin)).status, 200);
  const main = (await lists()).find((row) => row.value?.kind === "main"); assert(main);
  const personal = { intent: "submit-personal", eventKey: "2026test", clientId: "offline-client-1", name: "Personal", board: "{}" };
  await Promise.all(Array.from({ length: 3 }, () => fetcher(r, "/picklists", personal, member)));
  assert.equal((await lists()).length, 2); const own = (await lists()).find((row) => row.value.kind === "personal"); assert.equal(own.value.createdBy, "synthetic-member");
  await fetcher(r, "/picklists", { intent: "delete-personal", id: own.value.id }, other); assert.equal((await lists()).length, 2);
  await fetcher(r, "/picklists", { intent: "save-main", id: main.value.id, board: "{}" }, admin);
  await fetcher(r, "/picklists", { intent: "delete-personal", id: own.value.id }, member);
  await fetcher(r, "/picklists", { intent: "delete-main", id: main.value.id }, admin); assert.equal((await lists()).length, 0);
  assert.equal((await r.fetch("/picklists.data?event=2026test", { headers: { Cookie: member } })).status, 200);
});

test("admin settings are saved with their audit row, and nothing is saved when the audit row cannot be written", async (t) => {
  const r = await setup(t), admin = await login(r, "admin");
  assert.equal((await fetcher(r, "/admin", { intent: "save-data-range", dataRange: "playoff" }, admin)).status, 200);
  assert.deepEqual((await rows(r.db, "app_settings")).find((row) => row.key === "data_range").value, ["playoff"]);
  assert.equal((await fetcher(r, "/admin", { intent: "save-tier-percentages", tier_S: "10", tier_A: "30", tier_B: "30", tier_C: "30" }, admin)).status, 200);
  assert((await rows(r.db, "audit_logs")).some((row) => row.action === "settings.data_range.update" && row.actor_open_id === "synthetic-admin"));
  const before = JSON.stringify(await rows(r.db, "app_settings"));
  await r.db.prepare("CREATE TRIGGER synthetic_audit_failure BEFORE INSERT ON audit_logs BEGIN SELECT RAISE(ABORT,'synthetic-audit-failure'); END;").run();
  await r.fetch("/admin", form({ intent: "save-data-range", dataRange: "qualification" }, admin)); assert.equal(JSON.stringify(await rows(r.db, "app_settings")), before);
  await proposal(r, admin); assert.equal((await rows(r.db, "strategy_proposals")).length, 0);
});

test("a cross-site write with a valid session is refused before anything changes", async (t) => {
  const r = await setup(t), cookie = await login(r, "admin"), before = JSON.stringify(await rows(r.db, "app_settings"));
  const foreign = form({ intent: "save-data-range", dataRange: "playoff" }, cookie); foreign.headers.Origin = "https://evil.invalid";
  assert.equal((await r.fetch("/admin", foreign)).status, 403);
  const crossSite = form({ intent: "save-data-range", dataRange: "playoff" }, cookie); delete crossSite.headers.Origin; crossSite.headers["Sec-Fetch-Site"] = "cross-site";
  assert.equal((await r.fetch("/admin.data", crossSite)).status, 403);
  assert.equal(JSON.stringify(await rows(r.db, "app_settings")), before);
});

test("every packaged browser file is served byte-exact (GET/HEAD only): /assets/* straight from Static Assets with immutable caching", async (t) => {
  const r = await setup(t);
  for (const [name, record] of Object.entries(assets)) {
    const response = await r.fetch(name); assert.equal(response.status, 200, name);
    const bytes = Buffer.from(await response.arrayBuffer()); assert.equal(hash(bytes), record.sha256, name); assert.equal(bytes.length, record.bytes);
    assert.equal(response.headers.get("content-type").split(";")[0], record.mime.split(";")[0], name); assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.equal(response.headers.get("cache-control"), name.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "public, max-age=3600", name);
    const head = await r.fetch(name, { method: "HEAD" }); assert.equal(head.status, 200); assert.equal(await head.text(), "");
    assert.equal((await r.fetch(name, { method: "POST" })).status, 405, name);
  }
  assert.deepEqual(r.calls, []);
});

// The Worker must not put a route or method allow-list in front of the app: every route file is served by the app.
test("every route the app declares (app/routes/*) is reachable, signed in and anonymous", async (t) => {
  const r = await setup(t), admin = await login(r, "admin");
  // Flat-routes file name -> URL path ("_app" is a pathless layout, "_index" its index).
  const declared = [...new Set(readdirSync(resolve(repo, "app/routes")).filter((name) => /\.tsx?$/.test(name) && !/\.test\./.test(name))
    .map((name) => "/" + name.replace(/\.tsx?$/, "").split(".").filter((part) => !part.startsWith("_")).join("/")))].filter((path) => path !== "/");
  assert(declared.length >= 18, "routes read from app/routes");
  // What the app itself answers to a bare GET by a signed-in admin. A route not listed here must still be served by the app.
  const expected = { "/admin": 200, "/picklists": 200, "/scouting-lead": 200, "/strategy-proposal": 200, "/demo": 200, "/auth/login": 200,
    "/auth/logout": 302, "/api/auth/login": 302, "/api/auth/callback": 302, "/auth/feishu/callback": 302,
    "/scouting-record": 400, "/api/match-results": 400, "/api/match-schedule": 400, "/api/tba/matches": 400, "/api/cyber-scout/photos": 400, // no query given
    "/api/match-videos": 200, "/api/cyber-pit-embed": 405 /* POST only */, "/embed": 404 /* needs a signed link */ };
  for (const path of ["/", ...declared]) {
    const response = await r.fetch(path, { headers: { Cookie: admin } }), body = await response.text();
    assert(![409, 421, 503].includes(response.status), `${path} -> ${response.status}`);
    assert(!/^\{"error":"(?:not_found|method_not_allowed|host_not_served|configuration_unavailable|request_failed)"/.test(body), `${path} was answered by the Worker, not the app: ${body.slice(0, 60)}`);
    if (path in expected) assert.equal(response.status, expected[path], path);
  }
  // With their query, the read APIs answer 200.
  for (const path of ["/?event=2026test", "/_root.data?event=2026test", "/scouting-lead?event=2026test", "/scouting-lead.data?event=2026test", "/api/match-results?event=2026test", "/api/match-schedule?event=2026test", "/api/tba/matches?event=2026test", "/api/match-videos?event=2026test"])
    assert.equal((await r.fetch(path, { headers: { Cookie: admin } })).status, 200, path);
  // Anonymous: pages send the browser to the login page, APIs answer 401, public pages are served.
  for (const path of ["/", "/picklists", "/strategy-proposal", "/admin", "/scouting-lead"]) { const response = await r.fetch(path); assert.equal(response.status, 302, path); assert.match(response.headers.get("location"), /^\/auth\/login\?returnTo=/); }
  for (const path of ["/api/match-results?event=2026test", "/api/match-schedule?event=2026test", "/api/match-videos?event=2026test", "/api/tba/matches?event=2026test", "/api/cyber-scout/photos?path=x", "/scouting-record"]) assert.equal((await r.fetch(path)).status, 401, path);
  for (const path of ["/auth/login", "/demo", "/demo.data"]) assert.equal((await r.fetch(path)).status, 200, path);
});
