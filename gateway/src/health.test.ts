import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { checkGatewayHealth } from "./health.js";
import { sanitizeLogValue } from "./logger.js";
import { atomicPublishErrorCode } from "./syncWorker.js";
import type { GatewayConfig, GatewayHealthApi } from "./types.js";

const config = (rootPath: string): GatewayConfig => ({
  supabaseUrl: "http://127.0.0.1:54321",
  gatewayId: "66666666-6666-4666-8666-666666666666",
  token: "x".repeat(48),
  rootPath,
  tempPath: join(rootPath, ".gateway-tmp"),
  batchSize: 10,
  pollIntervalMs: 5_000,
  requestTimeoutMs: 1_000,
  downloadTimeoutMs: 1_000,
  maxRequestRetries: 1,
  retryBaseMs: 100,
  maxSyncAttempts: 10,
  leaseSeconds: 300,
  maxUploadBytes: 20 * 1024 * 1024,
});

const backend: GatewayHealthApi = {
  async health() {
    return {
      gatewayActive: true,
      backendConnected: true,
      pendingJobs: 2,
      failedJobs: 1,
      retryingJobs: 1,
      lastJobAt: "2026-09-04T10:00:00.000Z",
      lastSynchronizationAt: "2026-09-04T09:59:00.000Z",
      lastFailureAt: "2026-09-04T09:58:00.000Z",
    };
  },
};

test("health check validates writable root, temporary directory, atomic publish and safe metrics", async () => {
  const root = await mkdtemp(join(tmpdir(), "gateway-health-á-"));
  try {
    const result = await checkGatewayHealth(config(root), backend);
    assert.equal(result.healthy, true);
    assert.equal(result.rootAccessible, true);
    assert.equal(result.tempAccessible, true);
    assert.equal(result.atomicPublishSupported, true);
    assert.equal(result.pendingJobs, 2);
    assert.ok(result.spaceAvailableBytes === null || result.spaceAvailableBytes >= 0);
    assert.equal(JSON.stringify(result).includes(root), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("health check fails safely when root is unavailable", async () => {
  const root = join(tmpdir(), `gateway-missing-${Date.now()}`);
  const result = await checkGatewayHealth(config(root), backend);
  assert.equal(result.healthy, false);
  assert.equal(result.rootAccessible, false);
  assert.ok(result.errorCodes.includes("root_unavailable"));
  assert.equal(JSON.stringify(result).includes(root), false);
});

test("cross-volume and unsupported links are classified without fallback copy", () => {
  assert.equal(atomicPublishErrorCode({ code: "EXDEV" }), "atomic_publish_unsupported");
  assert.equal(atomicPublishErrorCode({ code: "ENOTSUP" }), "atomic_publish_unsupported");
  assert.equal(atomicPublishErrorCode({ code: "EPERM" }), "atomic_publish_unsupported");
  assert.equal(atomicPublishErrorCode({ code: "EEXIST" }), "local_conflict");
});

test("structured log sanitizer removes credentials, URLs and Windows paths recursively", () => {
  const value = sanitizeLogValue({
    gatewayId: "safe-id",
    token: "do-not-log",
    nested: { source: "\\\\server\\share\\secret", authorization: "Bearer value" },
    endpoint: "https://example.invalid/signed?token=value",
  });
  const serialized = JSON.stringify(value);
  assert.ok(serialized.includes("safe-id"));
  assert.equal(serialized.includes("do-not-log"), false);
  assert.equal(serialized.includes("server"), false);
  assert.equal(serialized.includes("example.invalid"), false);
  assert.equal(serialized.includes("Bearer value"), false);
});
