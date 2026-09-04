import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { FileSyncWorker, SyncError, buildRelativePath } from "./syncWorker.js";
import type { CompleteSyncInput, GatewayApi, GatewayConfig, Logger, SyncCandidate } from "./types.js";

const organizationId = "11111111-1111-4111-8111-111111111111";
const documentId = "22222222-2222-4222-8222-222222222222";
const attachmentId = "33333333-3333-4333-8333-333333333333";
const locationId = "44444444-4444-4444-8444-444444444444";
const objectId = "55555555-5555-4555-8555-555555555555";
const bytes = new TextEncoder().encode("gateway fixture\n");
const checksum = createHash("sha256").update(bytes).digest("hex");

const config = (rootPath: string): GatewayConfig => ({
  supabaseUrl: "http://127.0.0.1:54321",
  gatewayId: "66666666-6666-4666-8666-666666666666",
  token: "x".repeat(48),
  rootPath,
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

const candidate = (overrides: Partial<SyncCandidate> = {}): SyncCandidate => ({
  cloud_location_id: locationId,
  attachment_id: attachmentId,
  document_id: documentId,
  organization_id: organizationId,
  bucket_id: "rural-documents",
  object_key: `${organizationId}/${documentId}/${attachmentId}/${objectId}`,
  mime_type: "text/plain",
  file_size: bytes.byteLength,
  checksum,
  location_version: 1,
  attempt_count: 1,
  ...overrides,
});

class FakeApi implements GatewayApi {
  candidates: SyncCandidate[] = [];
  completed: CompleteSyncInput[] = [];
  failures: Array<{ locationId: string; errorCode: string; retryAfterSeconds: number }> = [];
  failCompletion = false;

  async claim() { return this.candidates; }
  async getDownloadUrl() { return "https://storage.invalid/signed"; }
  async complete(input: CompleteSyncInput) {
    if (this.failCompletion) throw new Error("temporary completion failure");
    this.completed.push(input);
  }
  async failed(location: string, errorCode: string, retryAfterSeconds: number) {
    this.failures.push({ locationId: location, errorCode, retryAfterSeconds });
  }
}

const silentLogger: Logger = { info() {}, warn() {}, error() {} };
const withRoot = async (run: (root: string) => Promise<void>) => {
  const root = await mkdtemp(join(tmpdir(), "file-gateway-test-"));
  try { await run(root); } finally { await rm(root, { recursive: true, force: true }); }
};

const listFiles = async (directory: string): Promise<string[]> => {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const child = join(directory, entry.name);
    return entry.isDirectory() ? listFiles(child) : [child];
  }));
  return nested.flat();
};

test("synchronizes Cloud bytes, verifies SHA-256 and completes metadata", async () => withRoot(async (root) => {
  const api = new FakeApi();
  const worker = new FileSyncWorker(config(root), api, silentLogger, async () => bytes);
  await worker.syncCandidate(candidate());
  const completed = api.completed[0];
  assert.ok(completed);
  assert.equal(completed.checksum, checksum);
  assert.equal(completed.fileSize, bytes.byteLength);
  assert.deepEqual(await readFile(join(root, ...completed.relativePath.split("/"))), Buffer.from(bytes));
}));

test("rejects a divergent Cloud checksum and removes partial files", async () => withRoot(async (root) => {
  const api = new FakeApi();
  const worker = new FileSyncWorker(config(root), api, silentLogger, async () => new TextEncoder().encode("different"));
  await assert.rejects(worker.syncCandidate(candidate()), (error: unknown) => error instanceof SyncError && error.code === "checksum_mismatch");
  assert.equal(api.completed.length, 0);
}));

test("an existing equal local file is idempotently completed without download", async () => withRoot(async (root) => {
  const api = new FakeApi();
  const value = candidate();
  const relativePath = buildRelativePath(value);
  const destination = join(root, ...relativePath.split("/"));
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, bytes);
  let downloads = 0;
  const worker = new FileSyncWorker(config(root), api, silentLogger, async () => { downloads += 1; return bytes; });
  await worker.syncCandidate(value);
  assert.equal(downloads, 0);
  assert.equal(api.completed.length, 1);
}));

test("an existing divergent local file is a conflict and is not overwritten", async () => withRoot(async (root) => {
  const api = new FakeApi();
  const value = candidate();
  const destination = join(root, ...buildRelativePath(value).split("/"));
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, "local data");
  const worker = new FileSyncWorker(config(root), api, silentLogger, async () => bytes);
  await assert.rejects(worker.syncCandidate(value), (error: unknown) => error instanceof SyncError && error.code === "local_conflict");
  assert.equal(await readFile(destination, "utf8"), "local data");
}));

test("a restart completes an already published file without duplication", async () => withRoot(async (root) => {
  const firstApi = new FakeApi();
  firstApi.failCompletion = true;
  firstApi.candidates = [candidate()];
  const first = new FileSyncWorker(config(root), firstApi, silentLogger, async () => bytes);
  await first.runOnce();
  assert.equal(firstApi.failures[0]?.errorCode, "sync_failed");
  assert.ok((await listFiles(root)).every((file) => !file.includes(".partial-")));

  const secondApi = new FakeApi();
  secondApi.candidates = [candidate({ attempt_count: 2 })];
  let downloads = 0;
  const second = new FileSyncWorker(config(root), secondApi, silentLogger, async () => { downloads += 1; return bytes; });
  await second.runOnce();
  assert.equal(downloads, 0);
  assert.equal(secondApi.completed.length, 1);
}));

test("rejects cross-tenant and structurally inconsistent object metadata", () => {
  assert.throws(
    () => buildRelativePath(candidate({ object_key: `aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/${documentId}/${attachmentId}/${objectId}` })),
    (error: unknown) => error instanceof SyncError && error.code === "metadata_inconsistent",
  );
  assert.throws(
    () => buildRelativePath(candidate({ object_key: `${organizationId}/${documentId}/${objectId}` })),
    (error: unknown) => error instanceof SyncError && error.code === "metadata_inconsistent",
  );
});

test("reports a missing Cloud object with a bounded retry delay", async () => withRoot(async (root) => {
  const api = new FakeApi();
  api.candidates = [candidate()];
  const worker = new FileSyncWorker(config(root), api, silentLogger, async () => { throw new SyncError("object_missing"); });
  await worker.runOnce();
  assert.equal(api.failures[0]?.errorCode, "object_missing");
  assert.equal(api.failures[0]?.retryAfterSeconds, 5);
}));
