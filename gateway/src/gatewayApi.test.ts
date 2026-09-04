import assert from "node:assert/strict";
import test from "node:test";
import { HttpGatewayApi } from "./gatewayApi.js";
import type { GatewayConfig } from "./types.js";

const config: GatewayConfig = {
  supabaseUrl: "https://example.invalid",
  gatewayId: "66666666-6666-4666-8666-666666666666",
  token: "test-secret-not-for-logs".padEnd(48, "x"),
  rootPath: "C:\\temporary\\gateway",
  batchSize: 10,
  pollIntervalMs: 5_000,
  requestTimeoutMs: 1_000,
  downloadTimeoutMs: 1_000,
  maxRequestRetries: 2,
  retryBaseMs: 1,
  maxSyncAttempts: 10,
  leaseSeconds: 300,
};

test("retries retryable gateway responses and then succeeds", async () => {
  let requests = 0;
  const fetcher = (async () => {
    requests += 1;
    if (requests < 3) return new Response(JSON.stringify({ code: "temporary" }), { status: 503, headers: { "content-type": "application/json" } });
    return new Response(JSON.stringify({ candidates: [] }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  const api = new HttpGatewayApi(config, fetcher);
  assert.deepEqual(await api.claim(), []);
  assert.equal(requests, 3);
});

test("does not retry authorization failures", async () => {
  let requests = 0;
  const fetcher = (async () => {
    requests += 1;
    return new Response(JSON.stringify({ code: "unauthenticated" }), { status: 401, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  const api = new HttpGatewayApi(config, fetcher);
  await assert.rejects(api.claim());
  assert.equal(requests, 1);
});
