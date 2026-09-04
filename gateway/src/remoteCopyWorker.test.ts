import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { LocalToCloudWorker, RemoteCopyError, resolveAuthorizedSource } from "./remoteCopyWorker.js";
import type { GatewayConfig, Logger, RemoteCopyApi, RemoteCopyCandidate, RemoteUploadPreparation } from "./types.js";

const organizationId = "11111111-1111-4111-8111-111111111111";
const attachmentId = "22222222-2222-4222-8222-222222222222";
const jobId = "33333333-3333-4333-8333-333333333333";
const content = new TextEncoder().encode("legacy file fixture\n");
const checksum = createHash("sha256").update(content).digest("hex");

const config = (rootPath: string): GatewayConfig => ({
  supabaseUrl: "http://127.0.0.1:54321",
  gatewayId: "44444444-4444-4444-8444-444444444444",
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

const candidate = (overrides: Partial<RemoteCopyCandidate> = {}): RemoteCopyCandidate => ({
  job_id: jobId,
  source_location_id: "55555555-5555-4555-8555-555555555555",
  attachment_id: attachmentId,
  document_id: "66666666-6666-4666-8666-666666666666",
  organization_id: organizationId,
  source_reference: "legacy/document.txt",
  file_name: "document.txt",
  expected_mime_type: "text/plain",
  expected_file_size: content.byteLength,
  expected_checksum: checksum,
  attempt_count: 1,
  ...overrides,
});

class FakeRemoteApi implements RemoteCopyApi {
  candidates: RemoteCopyCandidate[] = [];
  preparation: RemoteUploadPreparation = { status: "uploading", locationId: "77777777-7777-4777-8777-777777777777", signedUploadUrl: "https://storage.invalid/signed" };
  prepared = 0;
  uploads = 0;
  completions = 0;
  failures: string[] = [];
  failCompletion = false;

  async claimRemoteCopies() { return this.candidates; }
  async prepareRemoteUpload() { this.prepared += 1; return this.preparation; }
  async uploadRemote(_url: string, bytes: Uint8Array) { this.uploads += 1; assert.deepEqual(bytes, content); }
  async completeRemoteUpload() { this.completions += 1; if (this.failCompletion) throw new Error("post-upload transport failure"); }
  async failRemoteCopy(_job: string, code: string) { this.failures.push(code); }
}

const silentLogger: Logger = { info() {}, warn() {}, error() {} };
const withRoot = async (run: (root: string) => Promise<void>) => {
  const root = await mkdtemp(join(tmpdir(), "remote-copy-test-"));
  try {
    await mkdir(join(root, "legacy"), { recursive: true });
    await writeFile(join(root, "legacy", "document.txt"), content);
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
};

test("uploads one authorized local file and completes the remote copy", async () => withRoot(async (root) => {
  const api = new FakeRemoteApi();
  const worker = new LocalToCloudWorker(config(root), api, silentLogger);
  await worker.copyCandidate(candidate());
  assert.equal(api.prepared, 1);
  assert.equal(api.uploads, 1);
  assert.equal(api.completions, 1);
}));

test("accepts an idempotently completed Cloud copy without upload", async () => withRoot(async (root) => {
  const api = new FakeRemoteApi();
  api.preparation = { status: "completed", locationId: "77777777-7777-4777-8777-777777777777" };
  const worker = new LocalToCloudWorker(config(root), api, silentLogger);
  await worker.copyCandidate(candidate());
  assert.equal(api.uploads, 0);
  assert.equal(api.completions, 0);
}));

test("rejects missing files and known checksum mismatches", async () => withRoot(async (root) => {
  const api = new FakeRemoteApi();
  const worker = new LocalToCloudWorker(config(root), api, silentLogger);
  await assert.rejects(worker.copyCandidate(candidate({ source_reference: "legacy/missing.txt" })), (error: unknown) => error instanceof RemoteCopyError && error.code === "local_file_missing");
  await assert.rejects(worker.copyCandidate(candidate({ expected_checksum: "0".repeat(64) })), (error: unknown) => error instanceof RemoteCopyError && error.code === "checksum_mismatch");
  assert.equal(api.uploads, 0);
}));

test("rejects traversal and an absolute source outside the configured root", async () => withRoot(async (root) => {
  await assert.rejects(resolveAuthorizedSource(root, "../outside.txt"), (error: unknown) => error instanceof RemoteCopyError && error.code === "path_outside_root");
  const outside = await mkdtemp(join(tmpdir(), "remote-copy-outside-"));
  try {
    const file = join(outside, "file.txt");
    await writeFile(file, content);
    await assert.rejects(resolveAuthorizedSource(root, file), (error: unknown) => error instanceof RemoteCopyError && error.code === "path_outside_root");
  } finally {
    await rm(outside, { recursive: true, force: true });
  }
}));

test("rejects symlink or junction escape", async (context) => withRoot(async (root) => {
  const outside = await mkdtemp(join(tmpdir(), "remote-copy-link-target-"));
  try {
    await writeFile(join(outside, "file.txt"), content);
    try {
      await symlink(outside, join(root, "escape"), process.platform === "win32" ? "junction" : "dir");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EPERM") { context.skip("Symlinks are unavailable in this environment."); return; }
      throw error;
    }
    await assert.rejects(resolveAuthorizedSource(root, "escape/file.txt"), (error: unknown) => error instanceof RemoteCopyError && error.code === "path_outside_root");
  } finally {
    await rm(outside, { recursive: true, force: true });
  }
}));

test("a failure after upload is reported and restart can finish idempotently", async () => withRoot(async (root) => {
  const firstApi = new FakeRemoteApi();
  firstApi.candidates = [candidate()];
  firstApi.failCompletion = true;
  const first = new LocalToCloudWorker(config(root), firstApi, silentLogger);
  await first.runOnce();
  assert.equal(firstApi.uploads, 1);
  assert.equal(firstApi.failures[0], "remote_copy_failed");

  const secondApi = new FakeRemoteApi();
  secondApi.candidates = [candidate({ attempt_count: 2 })];
  secondApi.preparation = { status: "completed", locationId: "77777777-7777-4777-8777-777777777777" };
  const second = new LocalToCloudWorker(config(root), secondApi, silentLogger);
  await second.runOnce();
  assert.equal(secondApi.uploads, 0);
  assert.equal(secondApi.failures.length, 0);
  assert.deepEqual(await readFile(join(root, "legacy", "document.txt")), Buffer.from(content));
}));
