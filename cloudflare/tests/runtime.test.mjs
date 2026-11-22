import test from "node:test";
import assert from "node:assert/strict";
import { setup, origin } from "./native-fixture.mjs";

async function login(r, code = "member") {
  const started = await r.fetch("/api/auth/login?returnTo=%2Fpicklists%3Fevent%3D2026test");
  assert.equal(started.status, 302);
  const state = new URL(started.headers.get("location")).searchParams.get("state");
  const flow = started.headers.getSetCookie().map((cookie) => cookie.split(";")[0]).join("; ");
  assert.match(flow, /__Host-strategy_oauth=/);
  assert.match(flow, /__Host-strategy_native_oauth=/);
  const path = "/auth/feishu/callback?" + new URLSearchParams({ code, state });
  const done = await r.fetch(path, { headers: { Cookie: flow } });
  assert.equal(done.headers.get("location"), "/picklists?event=2026test");
  assert.equal((await r.fetch(path, { headers: { Cookie: flow } })).headers.get("location"), origin + "/auth/login?error=bad_state");
  return done.headers.getSetCookie().find((cookie) => cookie.startsWith("__Host-strategy_session=")).split(";")[0];
}
function form(values, cookie) {
  return { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: origin, Cookie: cookie }, body: new URLSearchParams(values).toString() };
}
const fetcher = (r, path, values, cookie) => r.fetch(path + ".data", form(values, cookie));
async function rows(db, table) {
  return (await db.prepare("SELECT row_json FROM " + table + " ORDER BY id").all()).results.map((row) => JSON.parse(row.row_json));
}

test("season template retains authenticated profile and logout revocation on D1", async (t) => {
  const r = await setup(t);
  const cookie = await login(r);
  const headers = { Cookie: cookie };
  assert.equal((await r.fetch("/picklists.data?event=2026test", { headers })).status, 200);
  assert.equal((await r.fetch("/auth/logout", form({}, cookie))).status, 302);
  assert.notEqual((await r.fetch("/picklists.data?event=2026test", { headers })).status, 200);
});

test("picklist groups: roles, isolated uploads, versioning, snapshots and removal", async (t) => {
  const r = await setup(t), leader = await login(r), admin = await login(r, "admin"), student = await login(r, "other");
  const eventKey = "2026test";
  const write = (cookie, intent, fields = {}) => fetcher(r, "/picklists", { intent, eventKey, ...fields }, cookie);
  const load = (cookie, groupId) => r.fetch("/picklists.data?" + new URLSearchParams({ event: eventKey, ...(groupId ? { group: groupId } : {}) }), { headers: { Cookie: cookie } });
  const groupRows = async () => (await rows(r.db, "app_settings")).filter((row) => row.key.startsWith("picklist-group:"));
  const member = { leaderId: "synthetic-member", studentId: "synthetic-other", name: "First Group" };
  assert.equal((await write(student, "submit-personal", { board: "{}" })).status, 403);
  assert.equal((await write(leader, "create-group", member)).status, 403);
  assert.equal((await write(admin, "directory")).status, 200);
  assert.equal((await write(admin, "create-group", member)).status, 200);
  assert.equal((await write(admin, "create-group", { ...member, name: "Second Group" })).status, 200);
  const groups = (await groupRows()).map((row) => row.value);
  const groupId = groups.find((group) => group.name === "First Group").id;
  const otherId = groups.find((group) => group.name === "Second Group").id;
  assert.equal((await load(student, groupId)).status, 200);
  assert.equal((await write(student, "directory", { groupId })).status, 403);
  const personal = { groupId, clientId: "p1", name: "Student Personal", board: '{"tier1":["8214"]}' };
  for (const id of [groupId, otherId, groupId]) assert.equal((await write(student, "submit-personal", { ...personal, groupId: id })).status, 200);
  const personals = (await rows(r.db, "app_settings")).filter((row) => row.key.startsWith("picklist-group-personal:"));
  assert.equal(personals.length, 2);
  assert.equal((await write(student, "save-group-main", { groupId, version: 0, board: "{}" })).status, 403);
  assert.equal((await write(leader, "submit-group-main", { groupId, version: 0 })).status, 400);
  const sameVersion = await Promise.all([personal.board, "{}"].map((board) => write(leader, "save-group-main", { groupId, version: 0, board })));
  assert.deepEqual(sameVersion.map((response) => response.status).sort(), [200, 409]);
  assert.equal((await write(leader, "submit-group-main", { groupId, version: 1 })).status, 200);
  const snapshot = (await groupRows()).find((row) => row.value.id === groupId).value.submission;
  assert.equal((await write(leader, "save-group-main", { groupId, version: 1, board: '{"tier1":["6328"]}' })).status, 200);
  assert.deepEqual((await groupRows()).find((row) => row.value.id === groupId).value.submission, snapshot);
  assert.equal((await write(leader, "submit-group-main", { groupId, version: 2 })).status, 200);
  assert.match(await (await load(admin)).text(), /6328/);
  assert.equal((await write(leader, "update-students", { groupId, rosterVersion: 1, studentId: "synthetic-unseen" })).status, 200);
  assert.equal((await load(student, groupId)).status, 403);
  assert.equal((await load(student, otherId)).status, 200);
  assert.equal((await write(student, "submit-personal", personal)).status, 403);
  assert.doesNotMatch(await (await load(leader, groupId)).text(), /Student Personal/);
  assert.equal((await write(admin, "create-main", { name: "Event Main" })).status, 200);
  const main = (await rows(r.db, "app_settings")).find((row) => row.key.startsWith("picklist:main:"));
  assert.equal((await write(admin, "delete-main", { id: main.value.id })).status, 200);
});
