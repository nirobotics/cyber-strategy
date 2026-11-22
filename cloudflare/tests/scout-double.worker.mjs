// Test double of the cyber-scout Worker behind the SCOUT service binding. Test code only: it is never deployed.
//
// It answers the /_scout/v1 contract that app/lib/scout-api.server.ts speaks: the same request signature and the
// same routes and JSON shapes, on its own local D1 database and R2 bucket (one row_json per record, as Scout keeps
// them), so a test can look at what a Strategy action left behind on the Scout side.
// The fixture that starts it is tests/scout-double.mjs.
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const prefix = "/_scout/v1", origin = "https://scout.team8214.com", positions = ["R1", "R2", "R3", "B1", "B2", "B3"];
const headers = { "Cache-Control": "private, no-store" };
const reply = (value) => Response.json(value, { headers });
const refuse = (status, text) => new Response(text, { status, headers });
const sha256 = (text) => createHash("sha256").update(text).digest("hex");
const digits = (value) => String(value ?? "").match(/\d+/)?.[0] ?? "";
const allianceOf = (value) => ({ red: "red", r: "red", blue: "blue", b: "blue" })[String(value ?? "").toLowerCase()] ?? null;
const matchTypeOf = (value) => { const text = String(value ?? "").toLowerCase(); return ["p", "practice"].includes(text) ? "practice" : ["q", "qm", "qualification"].includes(text) ? "qualification" : "playoff"; };
const within = (value, max) => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= max;
async function rows(db, sql, ...values) { return (await db.prepare(sql).bind(...values).all()).results.map((row) => JSON.parse(row.row_json)); }

// X-Scout-Signature = HMAC-SHA256(shared secret, the lines below); the time must be within a minute of now.
function authorize(request, url, body, secret) {
  if (typeof secret !== "string" || secret.length < 32) return null;
  const at = request.headers.get("X-Scout-Time") ?? "", actor = request.headers.get("X-Scout-Actor") ?? "", capability = request.headers.get("X-Scout-Capability") ?? "";
  if (!/^\d{13}$/.test(at) || Math.abs(Date.now() - Number(at)) > 60_000 || !/^[a-zA-Z0-9_-]{1,160}$/.test(actor) || !["read", "admin"].includes(capability)) return null;
  const expected = createHmac("sha256", secret).update(["scout-strategy-v1", request.method, url.pathname + url.search, at, actor, capability, sha256(body)].join("\n")).digest("hex");
  const actual = request.headers.get("X-Scout-Signature") ?? "";
  return /^[a-f0-9]{64}$/.test(actual) && timingSafeEqual(Buffer.from(expected), Buffer.from(actual)) ? { actor, admin: capability === "admin" } : null;
}

async function photo(request, env, path) {
  if (!/^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_:-]+\/[1-6]\.(?:jpg|jpeg|png|webp)$/i.test(path)) return refuse(400, "Invalid photo path");
  const object = await env.DB.prepare("SELECT r2_key,metadata_json FROM native_objects WHERE path=?").bind(path).first();
  if (!object) return refuse(404, "Not found");
  const meta = JSON.parse(object.metadata_json), size = Number(meta.size), wanted = request.headers.get("Range");
  let range;
  if (wanted) {
    const match = /^bytes=(\d+)-(\d*)$/.exec(wanted), start = Number(match?.[1]), end = match?.[2] ? Math.min(size - 1, Number(match[2])) : size - 1;
    if (!match || start > end || start >= size) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}`, "Accept-Ranges": "bytes" } });
    range = { offset: start, length: end - start + 1 };
  }
  const data = await env.FILES.get(object.r2_key, range ? { range } : undefined);
  if (!data) return refuse(404, "Not found");
  const answer = new Headers({ ...headers, "Content-Type": data.httpMetadata?.contentType || meta.contentType || "application/octet-stream", "X-Content-Type-Options": "nosniff", "Accept-Ranges": "bytes", "Content-Length": String(range ? range.length : data.size) });
  if (range) answer.set("Content-Range", `bytes ${range.offset}-${range.offset + range.length - 1}/${data.size}`);
  return new Response(request.method === "HEAD" ? null : data.body, { status: range ? 206 : 200, headers: answer });
}

// Only the assignments change; every other field of the stored event configuration stays as it is.
async function assignment(db, action, input, actor, body) {
  const setting = (await rows(db, "SELECT row_json FROM app_settings WHERE id='event_config'"))[0], config = setting?.config ?? {};
  const id = String(input.id || "assignment-" + sha256(actor + "\n" + body).slice(0, 32));
  const assignments = (Array.isArray(config.assignments) ? config.assignments : []).filter((item) => item.id !== id);
  if (action === "save") {
    const startMatch = Number(input.startMatch), endMatch = Number(input.endMatch), position = String(input.position), userName = String(input.userName ?? "").trim();
    if (!Number.isInteger(startMatch) || startMatch < 1 || !Number.isInteger(endMatch) || endMatch < startMatch || !positions.includes(position) || !userName) return refuse(400, "Invalid assignment");
    assignments.push({ id, matchType: "qm", startMatch, endMatch, position, userName });
    assignments.sort((a, b) => a.startMatch - b.startMatch || a.endMatch - b.endMatch || positions.indexOf(a.position) - positions.indexOf(b.position));
  }
  const now = new Date().toISOString();
  await db.prepare("UPDATE app_settings SET row_json=json_set(row_json,'$.config.assignments',json(?),'$.config.tbaEventKey',?,'$.config.savedAt',?,'$.updated_at',?) WHERE id='event_config'")
    .bind(JSON.stringify(assignments), input.eventKey || config.tbaEventKey || "", now, now).run();
  return reply({ ok: true });
}

// json_set rewrites only the named paths, so every other number in row_json keeps its exact text.
async function edit(db, input, actor) {
  const query = input.query ?? {}, normal = input.normal ?? null, superValues = input.superValues ?? null;
  if (!/^[a-z0-9_-]+$/i.test(String(query.eventKey)) || !/^\d+$/.test(String(query.team)) || !Number.isInteger(query.matchNumber) || query.matchNumber < 1 || !["practice", "qualification", "playoff"].includes(query.matchType)) return refuse(400, "Invalid match");
  if (normal && !(within(normal.shootingSeconds, 150) && within(normal.transferSeconds, 150))) return refuse(400, "Invalid normal values");
  if (superValues && !(within(superValues.driveScore, 5) && within(superValues.defenseScore, 5) && within(superValues.accuracy, 100) && within(superValues.bps, 35))) return refuse(400, "Invalid super values");
  const event = (await rows(db, "SELECT row_json FROM scouting_events")).find((row) => row.tba_event_key === query.eventKey);
  if (!event) return refuse(404, "Event not found");
  const records = (await rows(db, "SELECT row_json FROM scouting_records WHERE json_extract(row_json,'$.event_id')=?", event.id))
    .filter((row) => row.match_number === query.matchNumber && matchTypeOf(row.match_type ?? row.payload.matchType) === query.matchType);
  const normalRows = records.filter((row) => row.record_type === "normal_match" && digits(row.team_number ?? row.payload.teamNumber) === String(query.team));
  const superRow = records.find((row) => row.record_type === "super_match" && Array.isArray(row.payload.teams) && row.payload.teams.some((team) => digits(team) === String(query.team))
    && (!query.alliance || allianceOf(row.alliance ?? row.payload.alliance) === query.alliance));
  if ((normal && !normalRows.length) || (superValues && !superRow)) return refuse(404, "Scouting records not found");
  const patch = (id, changes) => db.prepare(`UPDATE scouting_records SET row_json=json_set(row_json,${changes.map(() => "?,json(?)").join(",")}) WHERE id=?`).bind(...changes.flatMap(([path, value]) => [path, JSON.stringify(value)]), id);
  const statements = [];
  if (normal) for (const row of normalRows) statements.push(patch(row.id, [
    ["$.payload.strategyOverride.shootingMs", Math.round(normal.shootingSeconds * 1000)], ["$.payload.strategyOverride.transferShootingMs", Math.round(normal.transferSeconds * 1000)],
    ["$.payload.strategyOverride.updatedAt", new Date().toISOString()], ["$.payload.strategyOverride.updatedBy", actor]]));
  if (superValues && superRow) {
    const index = superRow.payload.teams.findIndex((team) => digits(team) === String(query.team));
    statements.push(patch(superRow.id, [["drive", "driveScore"], ["defense", "defenseScore"], ["accuracy", "accuracy"], ["bps", "bps"]].map(([field, key]) => [`$.payload.${field}[${index}]`, superValues[key]])));
  }
  if (statements.length) await db.batch(statements);
  return reply({ ok: true });
}

// The record goes; its photos are unlinked and queued for removal from the bucket.
async function remove(db, id) {
  const row = (await rows(db, "SELECT row_json FROM scouting_records WHERE id=?", id))[0];
  if (!row) return reply(false);
  const paths = Array.isArray(row.payload?.photoPaths) ? row.payload.photoPaths.filter((path) => typeof path === "string") : [];
  await db.batch([
    ...paths.flatMap((path) => [db.prepare("INSERT OR IGNORE INTO native_object_gc(r2_key) SELECT r2_key FROM native_objects WHERE path=?").bind(path), db.prepare("DELETE FROM native_objects WHERE path=?").bind(path)]),
    db.prepare("DELETE FROM scouting_records WHERE id=?").bind(id),
  ]);
  return reply(true);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url), path = url.pathname.slice(prefix.length), method = request.method, db = env.DB;
    if (url.origin !== origin) return refuse(421, "Formal host required");
    if (!url.pathname.startsWith(prefix + "/")) return refuse(404, "Not found");
    const body = ["GET", "HEAD"].includes(method) ? "" : await request.text();
    if (body.length > 64 * 1024) return refuse(413, "Too large");
    const auth = authorize(request, url, body, env.SCOUT_STRATEGY_SECRET);
    if (!auth) return refuse(403, "Forbidden");
    if (method === "GET") {
      if (path === "/events") return reply(await rows(db, "SELECT row_json FROM scouting_events ORDER BY json_extract(row_json,'$.is_active') DESC,json_extract(row_json,'$.updated_at') DESC,id"));
      if (path === "/users") return reply((await rows(db, "SELECT row_json FROM user_profiles ORDER BY json_extract(row_json,'$.display_name')")).map(({ id, display_name }) => ({ id, display_name })));
      if (path === "/config") { const row = (await rows(db, "SELECT row_json FROM app_settings WHERE id='event_config'"))[0]; return reply(row ? { ...row.config, savedAt: row.updated_at } : { tbaEventKey: "", eventName: "", teams: [], matches: [], assignments: [], savedAt: null }); }
      const records = /^\/events\/([a-zA-Z0-9_-]+)\/records$/.exec(path);
      if (records) return reply(await rows(db, "SELECT row_json FROM scouting_records WHERE json_extract(row_json,'$.event_id')=? ORDER BY json_extract(row_json,'$.uploaded_at') DESC,id", records[1]));
    }
    if (["GET", "HEAD"].includes(method) && path === "/photo") return photo(request, env, url.searchParams.get("path") ?? "");
    // Everything below changes Scout data: the admin capability is required.
    if (!auth.admin) return refuse(403, "Forbidden");
    if (method === "DELETE" && /^\/records\/[a-f0-9-]{36}$/i.test(path)) return remove(db, path.split("/")[2]);
    if (method === "POST") {
      let input; try { input = body ? JSON.parse(body) : {}; } catch { return refuse(400, "Invalid JSON"); }
      if (!input || typeof input !== "object" || Array.isArray(input)) input = {};
      if (path === "/assignments/save" || path === "/assignments/delete") return assignment(db, path.split("/")[2], input, auth.actor, body);
      if (path === "/edits") return edit(db, input, auth.actor);
    }
    return refuse(404, "Not found");
  },
};
