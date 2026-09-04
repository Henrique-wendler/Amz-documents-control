import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "pg";
import { HttpGatewayApi } from "../dist/gatewayApi.js";
import { FileSyncWorker, SyncError, buildRelativePath } from "../dist/syncWorker.js";

const supabaseUrl = process.env.TEST_SUPABASE_URL?.replace(/\/+$/, "");
const serviceKey = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY;
const databaseUrl = process.env.TEST_DATABASE_URL;
if (!supabaseUrl || !serviceKey || !databaseUrl) throw new Error("Set TEST_SUPABASE_URL, TEST_SUPABASE_SERVICE_ROLE_KEY and TEST_DATABASE_URL for the isolated local test.");
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(supabaseUrl)) throw new Error("Integration tests are restricted to a local Supabase origin.");
if (!/^postgresql:\/\/[^@]+@(127\.0\.0\.1|localhost):\d+\//i.test(databaseUrl)) throw new Error("Integration tests are restricted to a local PostgreSQL connection.");

const rootPath = await mkdtemp(join(tmpdir(), "file-gateway-integration-"));
const ids = { organizations: [], farms: [], types: [], documents: [], attachments: [], locations: [], gateways: [] };
const objectKeys = [];
const authHeaders = { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey };
const quiet = { info() {}, warn() {}, error() {} };
const database = new Client({ connectionString: databaseUrl });
await database.connect();

const request = async (path, init = {}) => {
  const response = await fetch(`${supabaseUrl}${path}`, {
    ...init,
    headers: { ...authHeaders, ...(init.headers ?? {}) },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Local fixture request failed (${response.status}): ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : undefined;
};

const insert = async (table, value) => {
  if (!/^[a-z_]+$/.test(table)) throw new Error("Invalid fixture table.");
  const columns = Object.keys(value);
  if (!columns.length || columns.some((column) => !/^[a-z_]+$/.test(column))) throw new Error("Invalid fixture columns.");
  const placeholders = columns.map((_, index) => `$${index + 1}`).join(",");
  const result = await database.query(
    `insert into public.${table} (${columns.join(",")}) values (${placeholders}) returning *`,
    columns.map((column) => value[column]),
  );
  return result.rows[0];
};

const select = (table, query) => request(`/rest/v1/${table}?${query}`, { headers: { Accept: "application/json" } });
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const gatewayConfig = (gatewayId, token) => ({
  supabaseUrl,
  gatewayId,
  token,
  rootPath,
  batchSize: 20,
  pollIntervalMs: 5_000,
  requestTimeoutMs: 5_000,
  downloadTimeoutMs: 5_000,
  maxRequestRetries: 2,
  retryBaseMs: 100,
  maxSyncAttempts: 10,
  leaseSeconds: 300,
  maxUploadBytes: 20 * 1024 * 1024,
});

const createOrganization = async (label) => {
  const id = randomUUID();
  await insert("organizations", { id, legal_name: `Gateway Test ${label} ${id}`, status: "active" });
  ids.organizations.push(id);
  return id;
};

const createGateway = async (organizationId, label) => {
  const id = randomUUID();
  const token = randomBytes(48).toString("base64url");
  await insert("file_gateway_instances", { id, organization_id: organizationId, name: `Gateway ${label}`, token_hash: digest(token), status: "active" });
  ids.gateways.push(id);
  return { id, token };
};

const createFixture = async (organizationId, label, cloudBytes, options = {}) => {
  const farmId = randomUUID();
  const typeId = randomUUID();
  const documentId = randomUUID();
  const attachmentId = randomUUID();
  const objectId = randomUUID();
  const objectOrganizationId = options.objectOrganizationId ?? organizationId;
  const objectKey = `${objectOrganizationId}/${documentId}/${attachmentId}/${objectId}`;
  const databaseBytes = options.databaseBytes ?? cloudBytes;
  await insert("farms", { id: farmId, organization_id: organizationId, name: `Farm ${label}`, municipality: "Local Test", state: "TO", total_area: 1, status: "active" });
  await insert("document_types", { id: typeId, organization_id: organizationId, name: `Type ${label}`, code: `GW-${label}-${typeId.slice(0, 6)}`, status: "active" });
  await insert("rural_documents", { id: documentId, organization_id: organizationId, farm_id: farmId, document_type_id: typeId, status: "active" });
  await insert("document_attachments", {
    id: attachmentId,
    organization_id: organizationId,
    document_id: documentId,
    file_name: `${label}.txt`,
    storage_type: "supabase_storage",
    file_path: objectKey,
    mime_type: "text/plain",
    file_size: databaseBytes.byteLength,
    checksum: digest(databaseBytes),
    status: "active",
  });
  const [location] = await select("attachment_locations", `attachment_id=eq.${attachmentId}&storage_type=eq.supabase_storage&select=id`);
  assert.ok(location?.id);
  ids.farms.push(farmId); ids.types.push(typeId); ids.documents.push(documentId); ids.attachments.push(attachmentId); ids.locations.push(location.id);
  if (!options.missingObject) {
    await request(`/storage/v1/object/rural-documents/${objectKey}`, {
      method: "POST",
      headers: { "Content-Type": "text/plain", "x-upsert": "false" },
      body: cloudBytes,
    });
    objectKeys.push(objectKey);
  }
  return { attachmentId, locationId: location.id, objectKey };
};

const reportFailure = async (api, candidate, error) => {
  const code = error instanceof SyncError ? error.code : "sync_failed";
  await api.failed(candidate.cloud_location_id, code, 5);
  return code;
};

try {
  const organizationA = await createOrganization("A");
  const organizationB = await createOrganization("B");
  const gatewayA = await createGateway(organizationA, "A");
  const gatewayB = await createGateway(organizationB, "B");
  const normalBytes = new TextEncoder().encode("runtime cloud to local fixture\n");
  const normal = await createFixture(organizationA, "normal", normalBytes);
  const missing = await createFixture(organizationA, "missing", normalBytes, { missingObject: true });
  const divergent = await createFixture(organizationA, "divergent", new TextEncoder().encode("wrong-runtime-content"), { databaseBytes: new TextEncoder().encode("right-runtime-conten") });
  const inconsistent = await createFixture(organizationA, "metadata", normalBytes, { objectOrganizationId: organizationB, missingObject: true });
  await createFixture(organizationB, "tenant-b", normalBytes, { missingObject: true });

  const apiA = new HttpGatewayApi(gatewayConfig(gatewayA.id, gatewayA.token));
  const apiB = new HttpGatewayApi(gatewayConfig(gatewayB.id, gatewayB.token));
  const invalidApi = new HttpGatewayApi(gatewayConfig(gatewayA.id, [...gatewayA.token].reverse().join("")));
  await assert.rejects(invalidApi.claim());

  const storedGateway = await database.query("select token_hash from public.file_gateway_instances where id = $1", [gatewayA.id]);
  assert.equal(storedGateway.rows[0]?.token_hash, digest(gatewayA.token));
  assert.notEqual(storedGateway.rows[0]?.token_hash, gatewayA.token);
  const rawTokenColumn = await database.query(
    "select count(*)::integer as count from information_schema.columns where table_schema = 'public' and table_name = 'file_gateway_instances' and column_name in ('token', 'secret', 'credential')",
  );
  assert.equal(rawTokenColumn.rows[0]?.count, 0);

  const claimedB = await apiB.claim();
  assert.equal(claimedB.length, 1);
  assert.ok(claimedB.every((item) => item.organization_id === organizationB));
  const claimedA = await apiA.claim();
  assert.equal(claimedA.length, 4);
  assert.ok(claimedA.every((item) => item.organization_id === organizationA));
  await assert.rejects(apiB.getDownloadUrl(normal.locationId));

  await database.query("update public.attachment_locations set sync_lease_until = now() - interval '1 second' where id = $1", [missing.locationId]);
  const reclaimed = await apiA.claim();
  assert.equal(reclaimed.length, 1);
  assert.equal(reclaimed[0]?.attachment_id, missing.attachmentId);
  assert.equal(reclaimed[0]?.attempt_count, 2);
  const missingIndex = claimedA.findIndex((item) => item.attachment_id === missing.attachmentId);
  assert.notEqual(missingIndex, -1);
  claimedA[missingIndex] = reclaimed[0];

  const worker = new FileSyncWorker(gatewayConfig(gatewayA.id, gatewayA.token), apiA, quiet);
  const outcomes = new Map();
  for (const item of claimedA) {
    try {
      await worker.syncCandidate(item);
      outcomes.set(item.attachment_id, "synced");
    } catch (error) {
      outcomes.set(item.attachment_id, await reportFailure(apiA, item, error));
    }
  }
  assert.equal(outcomes.get(normal.attachmentId), "synced");
  assert.equal(outcomes.get(missing.attachmentId), "object_missing");
  assert.equal(outcomes.get(divergent.attachmentId), "checksum_mismatch");
  assert.equal(outcomes.get(inconsistent.attachmentId), "metadata_inconsistent");

  const normalCandidate = claimedA.find((item) => item.attachment_id === normal.attachmentId);
  assert.ok(normalCandidate);
  await worker.syncCandidate(normalCandidate);
  const expectedRelativePath = buildRelativePath(normalCandidate);
  assert.equal(digest(await readFile(join(rootPath, ...expectedRelativePath.split("/")))), normalCandidate.checksum);
  const networkRows = await select("attachment_locations", `source_location_id=eq.${normal.locationId}&storage_type=eq.network_share&select=id,external_reference,sync_status`);
  assert.equal(networkRows.length, 1);
  assert.equal(networkRows[0].external_reference, expectedRelativePath);
  assert.equal(networkRows[0].sync_status, "synced");

  await assert.rejects(apiA.complete({ locationId: normal.locationId, relativePath: expectedRelativePath, mimeType: "text/plain", fileSize: normalCandidate.file_size, checksum: "0".repeat(64) }));
  const events = await select("file_access_log", `organization_id=eq.${organizationA}&action=in.(FILE_SYNC_STARTED,FILE_SYNCED,FILE_SYNC_FAILED)&select=action`);
  assert.equal(events.filter((event) => event.action === "FILE_SYNC_STARTED").length, 5);
  assert.equal(events.filter((event) => event.action === "FILE_SYNCED").length, 1);
  assert.equal(events.filter((event) => event.action === "FILE_SYNC_FAILED").length, 3);
  const remaining = await apiA.claim();
  assert.equal(remaining.length, 0);
  const failedRetry = await database.query(
    "select count(*)::integer as count from public.attachment_locations where organization_id = $1 and sync_status = 'failed' and sync_next_attempt_at > now()",
    [organizationA],
  );
  assert.equal(failedRetry.rows[0]?.count, 3);
  const leakedSecrets = await database.query(
    `select
       (select count(*) from public.file_access_log where organization_id = $1 and context::text like '%' || $2 || '%')
       + (select count(*) from public.audit_log where organization_id = $1 and (changes::text like '%' || $2 || '%' or coalesce(context::text, '') like '%' || $2 || '%'))
       as count`,
    [organizationA, gatewayA.token],
  );
  assert.equal(Number(leakedSecrets.rows[0]?.count), 0);
  process.stdout.write(`${JSON.stringify({ passed: true, cloudToLocal: true, checksum: true, failures: [...outcomes.values()], idempotent: networkRows.length === 1, invalidSecretBlocked: true, leaseReclaimed: true, retryBackoffPersisted: true, crossTenantBlocked: true, auditEvents: events.length, secretsLeaked: false })}\n`);
} finally {
  for (const objectKey of objectKeys) {
    await request(`/storage/v1/object/rural-documents/${objectKey}`, { method: "DELETE" }).catch(() => undefined);
  }
  for (const organizationId of ids.organizations) {
    await database.query("delete from public.file_access_log where organization_id = $1", [organizationId]).catch(() => undefined);
    await database.query("delete from public.attachment_locations where organization_id = $1 and source_location_id is not null", [organizationId]).catch(() => undefined);
    await database.query("delete from public.attachment_locations where organization_id = $1", [organizationId]).catch(() => undefined);
    await database.query("delete from public.document_attachments where organization_id = $1", [organizationId]).catch(() => undefined);
    await database.query("delete from public.rural_documents where organization_id = $1", [organizationId]).catch(() => undefined);
    await database.query("delete from public.document_types where organization_id = $1", [organizationId]).catch(() => undefined);
    await database.query("delete from public.farms where organization_id = $1", [organizationId]).catch(() => undefined);
    await database.query("delete from public.file_gateway_instances where organization_id = $1", [organizationId]).catch(() => undefined);
    await database.query("delete from public.audit_log where organization_id = $1", [organizationId]).catch(() => undefined);
  }
  if (ids.organizations.length) {
    await database.query("begin");
    try {
      await database.query("alter table public.organizations disable trigger organizations_audit_log");
      await database.query("delete from public.organizations where id = any($1::uuid[])", [ids.organizations]);
      await database.query("alter table public.organizations enable trigger organizations_audit_log");
      await database.query("commit");
    } catch (error) {
      await database.query("rollback");
      throw error;
    }
  }
  await database.end();
  await rm(rootPath, { recursive: true, force: true });
}
