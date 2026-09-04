import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { Client } from "pg";
import { HttpGatewayApi } from "../dist/gatewayApi.js";
import { LocalToCloudWorker, RemoteCopyError } from "../dist/remoteCopyWorker.js";

const supabaseUrl = process.env.TEST_SUPABASE_URL?.replace(/\/+$/, "");
const anonKey = process.env.TEST_SUPABASE_ANON_KEY;
const serviceKey = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY;
const databaseUrl = process.env.TEST_DATABASE_URL;
if (!supabaseUrl || !anonKey || !serviceKey || !databaseUrl) throw new Error("Set the isolated local Supabase test variables.");
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(supabaseUrl)) throw new Error("Phase C tests are restricted to local Supabase.");
if (!/^postgresql:\/\/[^@]+@(127\.0\.0\.1|localhost):\d+\//i.test(databaseUrl)) throw new Error("Phase C tests are restricted to local PostgreSQL.");

const testBase = await mkdtemp(join(tmpdir(), "file-gateway-phase-c-"));
const rootPath = join(testBase, "root");
await mkdir(rootPath);
const database = new Client({ connectionString: databaseUrl });
await database.connect();
const ids = { organizations: [], users: [], farms: [], types: [], documents: [], attachments: [], gateways: [] };
const objectKeys = [];
const serviceHeaders = { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey };
const quiet = { info() {}, warn() {}, error() {} };
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

const http = async (path, init = {}, headers = serviceHeaders, expected = 200) => {
  const response = await fetch(`${supabaseUrl}${path}`, { ...init, headers: { ...headers, ...(init.headers ?? {}) } });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : undefined;
  if (response.status !== expected) throw new Error(`Unexpected local fixture response (${response.status}, expected ${expected}): ${String(payload?.code ?? payload?.message ?? "unknown")}`);
  return payload;
};

const insert = async (table, value) => {
  if (!/^[a-z_]+$/.test(table)) throw new Error("Invalid fixture table.");
  const columns = Object.keys(value);
  if (!columns.length || columns.some((column) => !/^[a-z_]+$/.test(column))) throw new Error("Invalid fixture columns.");
  const result = await database.query(
    `insert into public.${table} (${columns.join(",")}) values (${columns.map((_, index) => `$${index + 1}`).join(",")}) returning *`,
    columns.map((column) => value[column]),
  );
  return result.rows[0];
};

const createOrganization = async (label) => {
  const id = randomUUID();
  await insert("organizations", { id, legal_name: `Phase C ${label} ${id}`, status: "active" });
  ids.organizations.push(id);
  return id;
};

const createUser = async (organizationId, roleKey, label) => {
  const email = `phase-c-${label}-${randomUUID()}@example.invalid`;
  const password = `Local-${randomBytes(18).toString("base64url")}!`;
  const created = await http("/auth/v1/admin/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  const userId = created.id ?? created.user?.id;
  assert.ok(userId);
  ids.users.push(userId);
  await insert("profiles", { id: userId, organization_id: organizationId, full_name: `Phase C ${label}`, role_key: roleKey, status: "active" });
  const signedIn = await http("/auth/v1/token?grant_type=password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  }, { apikey: anonKey });
  assert.ok(signedIn.access_token);
  return { id: userId, token: signedIn.access_token };
};

const createGateway = async (organizationId, label) => {
  const id = randomUUID();
  const token = randomBytes(48).toString("base64url");
  await insert("file_gateway_instances", { id, organization_id: organizationId, name: `Phase C Gateway ${label}`, token_hash: digest(token), status: "active" });
  ids.gateways.push(id);
  return { id, token };
};

const gatewayConfig = (gateway) => ({
  supabaseUrl,
  gatewayId: gateway.id,
  token: gateway.token,
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

const createNetworkFixture = async (organizationId, label, bytes, options = {}) => {
  const farmId = randomUUID();
  const typeId = randomUUID();
  const documentId = randomUUID();
  const attachmentId = randomUUID();
  const reference = options.reference ?? `${label}/${randomUUID()}.txt`;
  await insert("farms", { id: farmId, organization_id: organizationId, name: `Phase C Farm ${label}`, municipality: "Local Test", state: "TO", total_area: 1, status: "active" });
  await insert("document_types", { id: typeId, organization_id: organizationId, name: `Phase C Type ${label}`, code: `PC-${label.slice(0, 8)}-${typeId.slice(0, 5)}`, status: "active" });
  await insert("rural_documents", { id: documentId, organization_id: organizationId, farm_id: farmId, document_type_id: typeId, status: "active" });
  await insert("document_attachments", {
    id: attachmentId,
    organization_id: organizationId,
    document_id: documentId,
    file_name: `${label}.txt`,
    storage_type: "network_share",
    file_path: reference,
    mime_type: "text/plain",
    file_size: options.persistedSize === undefined ? bytes.byteLength : options.persistedSize,
    checksum: options.persistedChecksum === undefined ? digest(bytes) : options.persistedChecksum,
    status: "active",
  });
  const sourceResult = await database.query("select id from public.attachment_locations where attachment_id = $1 and storage_type = 'network_share' and deleted_at is null", [attachmentId]);
  const sourceLocationId = sourceResult.rows[0]?.id;
  assert.ok(sourceLocationId);
  ids.farms.push(farmId); ids.types.push(typeId); ids.documents.push(documentId); ids.attachments.push(attachmentId);
  if (options.writeLocal !== false) {
    const target = resolve(rootPath, reference);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, bytes);
  }
  return { organizationId, farmId, typeId, documentId, attachmentId, sourceLocationId, reference, bytes };
};

const createCloudLocation = async (fixture, bytes) => {
  const id = randomUUID();
  const objectKey = `${fixture.organizationId}/${fixture.documentId}/${fixture.attachmentId}/${randomUUID()}`;
  await insert("attachment_locations", {
    id,
    organization_id: fixture.organizationId,
    attachment_id: fixture.attachmentId,
    source_location_id: fixture.sourceLocationId,
    storage_type: "supabase_storage",
    bucket_id: "rural-documents",
    object_key: objectKey,
    is_primary: false,
    mime_type: "text/plain",
    file_size: bytes.byteLength,
    checksum: digest(bytes),
    status: "active",
  });
  await http(`/storage/v1/object/rural-documents/${objectKey}`, { method: "POST", headers: { "Content-Type": "text/plain", "x-upsert": "false" }, body: bytes });
  objectKeys.push(objectKey);
  return { id, objectKey };
};

const requestRemote = async (token, fixture, expected = 200) => http("/functions/v1/document-files", {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
  body: JSON.stringify({ action: "request-remote-copy", attachmentId: fixture.attachmentId, sourceLocationId: fixture.sourceLocationId }),
}, { apikey: anonKey }, expected);

const failCandidate = async (api, candidate, error) => {
  const code = error instanceof RemoteCopyError ? error.code : typeof error?.code === "string" ? error.code : "remote_copy_failed";
  await api.failRemoteCopy(candidate.job_id, code, 5);
  return code;
};

const processOne = async (api, worker) => {
  const claimed = await api.claimRemoteCopies();
  assert.equal(claimed.length, 1);
  await worker.copyCandidate(claimed[0]);
  return claimed[0];
};

try {
  const organizationA = await createOrganization("A");
  const organizationB = await createOrganization("B");
  const adminA = await createUser(organizationA, "admin", "admin-a");
  const viewerA = await createUser(organizationA, "viewer", "viewer-a");
  const adminB = await createUser(organizationB, "admin", "admin-b");
  const gatewayA = await createGateway(organizationA, "A");
  const gatewayB = await createGateway(organizationB, "B");
  const apiA = new HttpGatewayApi(gatewayConfig(gatewayA));
  const apiB = new HttpGatewayApi(gatewayConfig(gatewayB));
  const workerA = new LocalToCloudWorker(gatewayConfig(gatewayA), apiA, quiet);
  const invalidApi = new HttpGatewayApi(gatewayConfig({ id: gatewayA.id, token: [...gatewayA.token].reverse().join("") }));
  await assert.rejects(invalidApi.claimRemoteCopies());

  const normalBytes = new TextEncoder().encode("phase c local to cloud\n");
  const normal = await createNetworkFixture(organizationA, "normal", normalBytes, { persistedChecksum: null, persistedSize: null });
  const tenantB = await createNetworkFixture(organizationB, "tenant-b", normalBytes);
  await requestRemote(viewerA.token, normal, 403);
  await requestRemote(adminA.token, tenantB, 403);
  const requested = await requestRemote(adminA.token, normal);
  assert.equal(requested.status, "pending");
  assert.equal((await apiB.claimRemoteCopies()).length, 0);
  const normalCandidate = (await apiA.claimRemoteCopies())[0];
  assert.ok(normalCandidate);
  assert.equal(normalCandidate.organization_id, organizationA);
  await assert.rejects(apiB.prepareRemoteUpload(normalCandidate.job_id, "text/plain", normalBytes.byteLength, digest(normalBytes)));
  await workerA.copyCandidate(normalCandidate);
  const normalJob = await database.query("select status, attempt_count from public.remote_copy_jobs where id = $1", [requested.jobId]);
  assert.equal(normalJob.rows[0]?.status, "completed");
  const normalCloud = await database.query("select id, object_key, checksum, file_size, status from public.attachment_locations where source_location_id = $1 and storage_type = 'supabase_storage'", [normal.sourceLocationId]);
  assert.equal(normalCloud.rows.length, 1);
  assert.equal(normalCloud.rows[0].status, "active");
  assert.equal(normalCloud.rows[0].checksum, digest(normalBytes));
  objectKeys.push(normalCloud.rows[0].object_key);
  const persistedMetadata = await database.query("select checksum, file_size from public.document_attachments where id = $1", [normal.attachmentId]);
  assert.equal(persistedMetadata.rows[0].checksum, digest(normalBytes));
  assert.equal(Number(persistedMetadata.rows[0].file_size), normalBytes.byteLength);
  const repeated = await requestRemote(adminA.token, normal);
  assert.equal(repeated.jobId, requested.jobId);
  assert.equal(repeated.status, "completed");

  const equal = await createNetworkFixture(organizationA, "equal-cloud", normalBytes);
  const equalCloud = await createCloudLocation(equal, normalBytes);
  const equalRequest = await requestRemote(adminA.token, equal);
  await processOne(apiA, workerA);
  const equalResult = await database.query("select status, target_location_id from public.remote_copy_jobs where id = $1", [equalRequest.jobId]);
  assert.equal(equalResult.rows[0].status, "completed");
  assert.equal(equalResult.rows[0].target_location_id, equalCloud.id);
  const equalCount = await database.query("select count(*)::integer as count from public.attachment_locations where attachment_id = $1 and storage_type = 'supabase_storage'", [equal.attachmentId]);
  assert.equal(equalCount.rows[0].count, 1);

  const divergent = await createNetworkFixture(organizationA, "divergent-cloud", normalBytes);
  const divergentBytes = new TextEncoder().encode("different cloud content\n");
  const divergentCloud = await createCloudLocation(divergent, divergentBytes);
  const divergentRequest = await requestRemote(adminA.token, divergent);
  const divergentCandidate = (await apiA.claimRemoteCopies())[0];
  await assert.rejects(workerA.copyCandidate(divergentCandidate), (error) => error?.code === "location_conflict");
  await failCandidate(apiA, divergentCandidate, { code: "cloud_object_conflict" });
  const unchangedCloud = await readFile(resolve(rootPath, divergent.reference));
  assert.equal(digest(unchangedCloud), digest(normalBytes));
  const storedDivergent = await fetch(`${supabaseUrl}/storage/v1/object/rural-documents/${divergentCloud.objectKey}`, { headers: serviceHeaders });
  assert.equal(digest(new Uint8Array(await storedDivergent.arrayBuffer())), digest(divergentBytes));
  const divergentJob = await database.query("select status, error_code from public.remote_copy_jobs where id = $1", [divergentRequest.jobId]);
  assert.deepEqual(divergentJob.rows[0], { status: "failed", error_code: "cloud_object_conflict" });

  const missing = await createNetworkFixture(organizationA, "missing", normalBytes, { writeLocal: false });
  const missingRequest = await requestRemote(adminA.token, missing);
  let missingCandidate = (await apiA.claimRemoteCopies())[0];
  await assert.rejects(workerA.copyCandidate(missingCandidate), (error) => error.code === "local_file_missing");
  await failCandidate(apiA, missingCandidate, new RemoteCopyError("local_file_missing"));
  await database.query("update public.remote_copy_jobs set next_attempt_at = now() - interval '1 second' where id = $1", [missingRequest.jobId]);
  missingCandidate = (await apiA.claimRemoteCopies())[0];
  assert.equal(missingCandidate.attempt_count, 2);
  await failCandidate(apiA, missingCandidate, new RemoteCopyError("local_file_missing"));

  const checksumMismatch = await createNetworkFixture(organizationA, "checksum-mismatch", normalBytes, { persistedChecksum: "0".repeat(64) });
  await requestRemote(adminA.token, checksumMismatch);
  const checksumCandidate = (await apiA.claimRemoteCopies())[0];
  await assert.rejects(workerA.copyCandidate(checksumCandidate), (error) => error.code === "checksum_mismatch");
  await failCandidate(apiA, checksumCandidate, new RemoteCopyError("checksum_mismatch"));

  const escapeBytes = new TextEncoder().encode("outside root\n");
  await writeFile(join(testBase, "escape.txt"), escapeBytes);
  const traversal = await createNetworkFixture(organizationA, "traversal", escapeBytes, { reference: "../escape.txt", writeLocal: false });
  await requestRemote(adminA.token, traversal);
  const traversalCandidate = (await apiA.claimRemoteCopies())[0];
  await assert.rejects(workerA.copyCandidate(traversalCandidate), (error) => error.code === "path_outside_root");
  await failCandidate(apiA, traversalCandidate, new RemoteCopyError("path_outside_root"));

  const outsideAbsolutePath = join(testBase, "absolute-outside.txt");
  await writeFile(outsideAbsolutePath, escapeBytes);
  const outside = await createNetworkFixture(organizationA, "outside", escapeBytes, { reference: outsideAbsolutePath, writeLocal: false });
  await requestRemote(adminA.token, outside);
  const outsideCandidate = (await apiA.claimRemoteCopies())[0];
  await assert.rejects(workerA.copyCandidate(outsideCandidate), (error) => error.code === "path_outside_root");
  await failCandidate(apiA, outsideCandidate, new RemoteCopyError("path_outside_root"));

  const lease = await createNetworkFixture(organizationA, "lease", normalBytes);
  const leaseRequest = await requestRemote(adminA.token, lease);
  let leaseCandidate = (await apiA.claimRemoteCopies())[0];
  await database.query("update public.remote_copy_jobs set lease_until = now() - interval '1 second' where id = $1", [leaseRequest.jobId]);
  leaseCandidate = (await apiA.claimRemoteCopies())[0];
  assert.equal(leaseCandidate.attempt_count, 2);
  await workerA.copyCandidate(leaseCandidate);
  const leaseState = await database.query("select status from public.remote_copy_jobs where id = $1", [leaseRequest.jobId]);
  assert.equal(leaseState.rows[0].status, "completed");
  const leaseObject = await database.query("select object_key from public.attachment_locations where source_location_id = $1 and storage_type = 'supabase_storage'", [lease.sourceLocationId]);
  objectKeys.push(leaseObject.rows[0].object_key);

  const restart = await createNetworkFixture(organizationA, "restart", normalBytes);
  const restartRequest = await requestRemote(adminA.token, restart);
  let restartCandidate = (await apiA.claimRemoteCopies())[0];
  const checksum = digest(normalBytes);
  const prepared = await apiA.prepareRemoteUpload(restartCandidate.job_id, "text/plain", normalBytes.byteLength, checksum);
  assert.equal(prepared.status, "uploading");
  await apiA.uploadRemote(prepared.signedUploadUrl, normalBytes, "text/plain");
  await database.query("update public.remote_copy_jobs set lease_until = now() - interval '1 second' where id = $1", [restartRequest.jobId]);
  restartCandidate = (await apiA.claimRemoteCopies())[0];
  await new LocalToCloudWorker(gatewayConfig(gatewayA), apiA, quiet).copyCandidate(restartCandidate);
  const restartState = await database.query("select status from public.remote_copy_jobs where id = $1", [restartRequest.jobId]);
  assert.equal(restartState.rows[0].status, "completed");
  const restartLocation = await database.query("select object_key from public.attachment_locations where id = $1", [prepared.locationId]);
  objectKeys.push(restartLocation.rows[0].object_key);

  const events = await database.query("select action, context::text from public.file_access_log where organization_id = $1 and action like 'REMOTE_COPY_%'", [organizationA]);
  for (const action of ["REMOTE_COPY_REQUESTED", "REMOTE_COPY_STARTED", "REMOTE_COPY_COMPLETED", "REMOTE_COPY_FAILED"]) assert.ok(events.rows.some((event) => event.action === action));
  assert.ok(events.rows.every((event) => !event.context.includes(rootPath) && !event.context.includes(gatewayA.token)));
  const audit = await database.query("select count(*)::integer as count from public.audit_log where organization_id = $1 and entity_type = 'remote_copy_jobs'", [organizationA]);
  assert.ok(audit.rows[0].count > 0);
  const leaked = await database.query(
    "select (select count(*) from public.file_access_log where context::text like '%' || $1 || '%') + (select count(*) from public.audit_log where changes::text like '%' || $1 || '%' or coalesce(context::text, '') like '%' || $1 || '%') as count",
    [gatewayA.token],
  );
  assert.equal(Number(leaked.rows[0].count), 0);
  assert.equal((await apiA.claimRemoteCopies()).length, 0);

  process.stdout.write(`${JSON.stringify({ passed: true, localToCloud: true, permissionBlocked: true, crossTenantBlocked: true, gatewayTenantDerived: true, invalidSecretBlocked: true, checksumPersisted: true, equalCloudIdempotent: true, divergentCloudProtected: true, missingFileHandled: true, retryBackoff: true, leaseReclaimed: true, restartIdempotent: true, traversalBlocked: true, outsideRootBlocked: true, auditEvents: events.rows.length, auditLog: true, secretsLeaked: false })}\n`);
} finally {
  if (ids.organizations.length) {
    const fixtureObjects = await database.query(
      "select name from storage.objects where bucket_id = 'rural-documents' and split_part(name, '/', 1) = any($1::text[])",
      [ids.organizations],
    ).catch(() => ({ rows: [] }));
    objectKeys.push(...fixtureObjects.rows.map((row) => row.name));
  }
  for (const objectKey of [...new Set(objectKeys)]) {
    await http(`/storage/v1/object/rural-documents/${objectKey}`, { method: "DELETE" }).catch(() => undefined);
  }
  for (const organizationId of ids.organizations) {
    await database.query("delete from public.file_access_log where organization_id = $1", [organizationId]).catch(() => undefined);
    await database.query("delete from public.remote_copy_jobs where organization_id = $1", [organizationId]).catch(() => undefined);
    await database.query("delete from public.attachment_locations where organization_id = $1", [organizationId]).catch(() => undefined);
    await database.query("delete from public.document_attachments where organization_id = $1", [organizationId]).catch(() => undefined);
    await database.query("delete from public.rural_documents where organization_id = $1", [organizationId]).catch(() => undefined);
    await database.query("delete from public.document_types where organization_id = $1", [organizationId]).catch(() => undefined);
    await database.query("delete from public.farms where organization_id = $1", [organizationId]).catch(() => undefined);
    await database.query("delete from public.file_gateway_instances where organization_id = $1", [organizationId]).catch(() => undefined);
    await database.query("delete from public.profiles where organization_id = $1", [organizationId]).catch(() => undefined);
    await database.query("delete from public.audit_log where organization_id = $1", [organizationId]).catch(() => undefined);
  }
  for (const userId of ids.users) await http(`/auth/v1/admin/users/${userId}`, { method: "DELETE" }).catch(() => undefined);
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
  await rm(testBase, { recursive: true, force: true });
}
