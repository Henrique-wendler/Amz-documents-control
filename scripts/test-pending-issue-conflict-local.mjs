import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

const { PENDING_LOCAL_URL, PENDING_LOCAL_ANON_KEY, PENDING_LOCAL_JWT_SECRET, PENDING_LOCAL_ACTOR_ID } = process.env;
const settings = [PENDING_LOCAL_URL, PENDING_LOCAL_ANON_KEY, PENDING_LOCAL_JWT_SECRET, PENDING_LOCAL_ACTOR_ID];
if (!settings.every(Boolean)) throw new Error("Provide all four PENDING_LOCAL_* values for this PostgREST integration test.");

const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
const now = Math.floor(Date.now() / 1000);
const unsigned = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({
  aud: "authenticated", exp: now + 300, iat: now, iss: "supabase", sub: PENDING_LOCAL_ACTOR_ID,
  role: "authenticated", aal: "aal2",
})}`;
const token = `${unsigned}.${createHmac("sha256", PENDING_LOCAL_JWT_SECRET).update(unsigned).digest("base64url")}`;
const headers = { Authorization: `Bearer ${token}`, apikey: PENDING_LOCAL_ANON_KEY, "Content-Type": "application/json" };
const base = PENDING_LOCAL_URL.replace(/\/$/, "");
const request = async (path, options = {}) => {
  const response = await fetch(`${base}${path}`, { ...options, headers: { ...headers, ...options.headers }, signal: AbortSignal.timeout(5_000) });
  const body = await response.json();
  return { response, body };
};
const managementPath = (id) => `/pending_issue_management?select=id,version,status,assigned_to,resolution_due_date,justification&id=eq.${id}`;
const eventsPath = (id) => `/pending_issue_events?select=id&pending_issue_id=eq.${id}`;

test("PostgREST returns PT409 immediately and preserves the winning update and timeline", async () => {
  const initial = await request("/pending_issue_management?select=id,version,status,assigned_to,resolution_due_date,justification&order=id.asc&limit=1");
  assert.equal(initial.response.status, 200);
  assert.equal(initial.body.length, 1, "local synthetic pending issue fixture is required");
  const before = initial.body[0];
  const eventsBefore = await request(eventsPath(before.id));
  assert.equal(eventsBefore.response.status, 200);

  const nextStatus = before.status === "open" ? "in_progress" : "open";
  const update = (status) => request("/rpc/update_pending_issue_management", {
    method: "POST",
    body: JSON.stringify({
      p_pending_issue_id: before.id, p_expected_version: before.version,
      p_assigned_to: before.assigned_to, p_status: status,
      p_resolution_due_date: before.resolution_due_date, p_justification: before.justification,
    }),
  });
  const winner = await update(nextStatus);
  assert.equal(winner.response.status, 200, JSON.stringify(winner.body));
  assert.equal(winner.body, before.version + 1);

  const started = performance.now();
  const stale = await update(before.status);
  const durationMs = performance.now() - started;
  assert.equal(stale.response.status, 409, JSON.stringify(stale.body));
  assert.equal(stale.body.code, "PT409");
  assert.ok(durationMs < 5_000, `stale update took ${Math.round(durationMs)} ms`);

  const after = await request(managementPath(before.id));
  const eventsAfter = await request(eventsPath(before.id));
  assert.equal(after.response.status, 200);
  assert.equal(eventsAfter.response.status, 200);
  assert.equal(after.body[0].version, winner.body);
  assert.equal(after.body[0].status, nextStatus);
  assert.equal(eventsAfter.body.length, eventsBefore.body.length + 1);
  process.stdout.write(`Conflict completed in ${Math.round(durationMs)} ms; winning version ${winner.body}; one timeline event.\n`);
});
