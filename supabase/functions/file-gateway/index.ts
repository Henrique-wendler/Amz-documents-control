import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.112.4";

type JsonRecord = Record<string, unknown>;
type GatewayAction = "health" | "claim" | "download" | "complete" | "failed" | "claim-remote" | "prepare-remote-upload" | "complete-remote-upload" | "fail-remote";

interface GatewayContext {
  client: SupabaseClient;
  gatewayId: string;
  organizationId: string;
}

interface CloudLocationRow {
  id: string;
  organization_id: string;
  attachment_id: string;
  bucket_id: string | null;
  object_key: string | null;
  storage_type: string;
  status: string;
  sync_status: string | null;
  sync_claimed_by: string | null;
  sync_lease_until: string | null;
  deleted_at: string | null;
}

interface RemoteJobRow {
  id: string;
  organization_id: string;
  attachment_id: string;
  source_location_id: string;
  target_location_id: string | null;
  status: "pending" | "processing" | "completed" | "failed";
  claimed_by: string | null;
  lease_until: string | null;
}

interface PreparedRemoteUpload {
  job_status: "processing" | "existing" | "completed";
  cloud_location_id: string;
  bucket_id: string;
  object_key: string;
  mime_type: string;
  file_size: number | string;
  checksum: string;
}

class HttpError extends Error {
  constructor(public status: number, message: string, public code: string) {
    super(message);
  }
}

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const storagePublicUrl = Deno.env.get("STORAGE_PUBLIC_URL")?.replace(/\/+$/, "");
const configuredExpiry = Number(Deno.env.get("FILE_GATEWAY_SIGNED_URL_SECONDS") ?? 60);
const signedUrlSeconds = Number.isSafeInteger(configuredExpiry) && configuredExpiry >= 30 && configuredExpiry <= 300
  ? configuredExpiry
  : 60;
const configuredMaximumBatch = Number(Deno.env.get("FILE_GATEWAY_MAX_BATCH_SIZE") ?? 50);
const maximumBatchSize = Number.isSafeInteger(configuredMaximumBatch) && configuredMaximumBatch >= 1 && configuredMaximumBatch <= 100
  ? configuredMaximumBatch
  : 50;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const checksumPattern = /^[a-f0-9]{64}$/i;
const errorCodePattern = /^[a-z0-9_]{1,64}$/;
const allowedMimeTypes = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "application/msword",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
]);
const rateWindows = new Map<string, { count: number; resetAt: number }>();

if (!supabaseUrl || !serviceRoleKey) throw new Error("File Gateway function environment is unavailable.");
if (Deno.env.get("ENVIRONMENT") === "production" && (!storagePublicUrl || new URL(storagePublicUrl).protocol !== "https:")) {
  throw new Error("STORAGE_PUBLIC_URL must use HTTPS in production.");
}

const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "private, no-store, max-age=0",
    "X-Content-Type-Options": "nosniff",
  },
});

const readBody = async (request: Request) => {
  if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
    throw new HttpError(415, "JSON content is required.", "unsupported_media_type");
  }
  let value: unknown;
  try {
    value = await request.json();
  } catch {
    throw new HttpError(400, "Invalid request.", "invalid_json");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpError(400, "Invalid request.", "invalid_payload");
  }
  return value as JsonRecord;
};

const actionField = (body: JsonRecord): GatewayAction => {
  const value = body.action;
  if (value !== "health" && value !== "claim" && value !== "download" && value !== "complete" && value !== "failed"
    && value !== "claim-remote" && value !== "prepare-remote-upload" && value !== "complete-remote-upload" && value !== "fail-remote") {
    throw new HttpError(400, "Invalid action.", "invalid_action");
  }
  return value;
};

const latestTimestamp = (...values: Array<string | null | undefined>) => values
  .filter((value): value is string => Boolean(value))
  .sort((left, right) => new Date(right).getTime() - new Date(left).getTime())[0];

const health = async (context: GatewayContext) => {
  const now = new Date().toISOString();
  const [
    remotePending,
    remoteFailed,
    remoteRetrying,
    localPending,
    localFailed,
    localRetrying,
    latestRemote,
    latestLocal,
    latestSuccess,
    latestFailure,
  ] = await Promise.all([
    context.client.from("remote_copy_jobs").select("id", { count: "exact", head: true }).eq("organization_id", context.organizationId).in("status", ["pending", "processing"]),
    context.client.from("remote_copy_jobs").select("id", { count: "exact", head: true }).eq("organization_id", context.organizationId).eq("status", "failed"),
    context.client.from("remote_copy_jobs").select("id", { count: "exact", head: true }).eq("organization_id", context.organizationId).eq("status", "failed").gt("next_attempt_at", now),
    context.client.from("attachment_locations").select("id", { count: "exact", head: true }).eq("organization_id", context.organizationId).eq("storage_type", "supabase_storage").eq("status", "active").in("sync_status", ["pending", "syncing"]),
    context.client.from("attachment_locations").select("id", { count: "exact", head: true }).eq("organization_id", context.organizationId).eq("storage_type", "supabase_storage").eq("status", "active").eq("sync_status", "failed"),
    context.client.from("attachment_locations").select("id", { count: "exact", head: true }).eq("organization_id", context.organizationId).eq("storage_type", "supabase_storage").eq("status", "active").eq("sync_status", "failed").gt("sync_next_attempt_at", now),
    context.client.from("remote_copy_jobs").select("updated_at").eq("organization_id", context.organizationId).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
    context.client.from("attachment_locations").select("sync_last_attempt_at").eq("organization_id", context.organizationId).not("sync_last_attempt_at", "is", null).order("sync_last_attempt_at", { ascending: false }).limit(1).maybeSingle(),
    context.client.from("file_access_log").select("created_at").eq("organization_id", context.organizationId).in("action", ["FILE_SYNCED", "REMOTE_COPY_COMPLETED"]).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    context.client.from("file_access_log").select("created_at").eq("organization_id", context.organizationId).in("action", ["FILE_SYNC_FAILED", "REMOTE_COPY_FAILED"]).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const results = [remotePending, remoteFailed, remoteRetrying, localPending, localFailed, localRetrying, latestRemote, latestLocal, latestSuccess, latestFailure];
  if (results.some((result) => result.error)) throw new HttpError(500, "Gateway health data is unavailable.", "health_query_failed");
  return {
    gatewayActive: true,
    backendConnected: true,
    pendingJobs: (remotePending.count ?? 0) + (localPending.count ?? 0),
    failedJobs: (remoteFailed.count ?? 0) + (localFailed.count ?? 0),
    retryingJobs: (remoteRetrying.count ?? 0) + (localRetrying.count ?? 0),
    lastJobAt: latestTimestamp(latestRemote.data?.updated_at as string | undefined, latestLocal.data?.sync_last_attempt_at as string | undefined),
    lastSynchronizationAt: latestSuccess.data?.created_at as string | undefined,
    lastFailureAt: latestFailure.data?.created_at as string | undefined,
  };
};

const integerField = (body: JsonRecord, key: string, fallback: number, minimum: number, maximum: number) => {
  const value = body[key] ?? fallback;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new HttpError(400, "Invalid numeric parameter.", "invalid_payload");
  }
  return value;
};

const textField = (body: JsonRecord, key: string, maximum: number) => {
  const value = body[key];
  if (typeof value !== "string" || !value.trim() || value.length > maximum) {
    throw new HttpError(400, "Invalid parameter.", "invalid_payload");
  }
  return value.trim();
};

const uuidField = (body: JsonRecord, key: string) => {
  const value = textField(body, key, 36);
  if (!uuidPattern.test(value)) throw new HttpError(400, "Invalid identifier.", "invalid_id");
  return value;
};

const sha256 = async (value: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

const constantTimeEqual = (left: string, right: string) => {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
};

const authenticate = async (request: Request): Promise<GatewayContext> => {
  const gatewayId = request.headers.get("x-gateway-id")?.trim() ?? "";
  const token = (request.headers.get("authorization") ?? "").match(/^Bearer\s+(.+)$/i)?.[1] ?? "";
  if (!uuidPattern.test(gatewayId) || token.length < 32 || token.length > 512) {
    throw new HttpError(401, "Gateway authentication failed.", "unauthenticated");
  }
  const { data, error } = await serviceClient
    .from("file_gateway_instances")
    .select("id,organization_id,token_hash,status,organizations!inner(status,deleted_at)")
    .eq("id", gatewayId)
    .eq("status", "active")
    .maybeSingle();
  const organization = data?.organizations as unknown as { status: string; deleted_at: string | null } | undefined;
  const suppliedHash = await sha256(token);
  if (error || !data || !organization || organization.status !== "active" || organization.deleted_at || !constantTimeEqual(suppliedHash, data.token_hash.toLowerCase())) {
    throw new HttpError(401, "Gateway authentication failed.", "unauthenticated");
  }
  return { client: serviceClient, gatewayId, organizationId: data.organization_id as string };
};

const checkRateLimit = (gatewayId: string) => {
  const now = Date.now();
  const current = rateWindows.get(gatewayId);
  if (!current || current.resetAt <= now) {
    rateWindows.set(gatewayId, { count: 1, resetAt: now + 60_000 });
    return;
  }
  if (current.count >= 240) throw new HttpError(429, "Gateway rate limit exceeded.", "rate_limited");
  current.count += 1;
};

const friendlyDatabaseError = (error: { code?: string } | null) => {
  if (error?.code === "42501") return new HttpError(403, "Gateway scope rejected.", "forbidden");
  if (error?.code === "22023") return new HttpError(400, "File metadata was rejected.", "invalid_metadata");
  if (error?.code === "23505") return new HttpError(409, "A conflicting synchronized location exists.", "location_conflict");
  return new HttpError(500, "Gateway database operation failed.", "database_error");
};

const externalizeStorageUrl = (value: string) => {
  if (!storagePublicUrl) return value;
  const internalUrl = new URL(value);
  return new URL(`${internalUrl.pathname}${internalUrl.search}`, `${storagePublicUrl}/`).toString();
};

const checksumBytes = async (value: Blob) => {
  const digest = await crypto.subtle.digest("SHA-256", await value.arrayBuffer());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

const inspectStoredObject = async (bucketId: string, objectKey: string) => {
  const { data, error } = await serviceClient.storage.from(bucketId).download(objectKey);
  if (error) {
    const status = Number((error as { statusCode?: string | number }).statusCode);
    if (status === 400 || status === 404 || /not found/i.test(error.message)) return undefined;
    throw new HttpError(502, "Cloud object could not be inspected.", "storage_inspection_failed");
  }
  if (!data) return undefined;
  return { size: data.size, mimeType: data.type.split(";", 1)[0].trim().toLowerCase(), checksum: await checksumBytes(data) };
};

const loadClaimedLocation = async (context: GatewayContext, locationId: string) => {
  const { data, error } = await context.client
    .from("attachment_locations")
    .select("id,organization_id,attachment_id,bucket_id,object_key,storage_type,status,sync_status,sync_claimed_by,sync_lease_until,deleted_at")
    .eq("id", locationId)
    .eq("organization_id", context.organizationId)
    .eq("storage_type", "supabase_storage")
    .eq("status", "active")
    .eq("sync_status", "syncing")
    .eq("sync_claimed_by", context.gatewayId)
    .is("deleted_at", null)
    .maybeSingle();
  const location = data as CloudLocationRow | null;
  if (error || !location || !location.bucket_id || !location.object_key || !location.sync_lease_until || new Date(location.sync_lease_until).getTime() < Date.now()) {
    throw new HttpError(403, "The file is not claimed by this gateway.", "invalid_claim");
  }
  return location;
};

const claim = async (context: GatewayContext, body: JsonRecord) => {
  const limit = integerField(body, "limit", 20, 1, maximumBatchSize);
  const leaseSeconds = integerField(body, "leaseSeconds", 300, 30, 3600);
  const maxAttempts = integerField(body, "maxAttempts", 10, 1, 100);
  const { data, error } = await context.client.rpc("claim_file_sync_candidates", {
    p_gateway_id: context.gatewayId,
    p_limit: limit,
    p_lease_seconds: leaseSeconds,
    p_max_attempts: maxAttempts,
  });
  if (error) throw friendlyDatabaseError(error);
  return { candidates: data ?? [] };
};

const download = async (context: GatewayContext, body: JsonRecord) => {
  const locationId = uuidField(body, "locationId");
  const location = await loadClaimedLocation(context, locationId);
  const { data, error } = await context.client.storage.from(location.bucket_id!).createSignedUrl(location.object_key!, signedUrlSeconds);
  if (error || !data?.signedUrl) throw new HttpError(404, "Cloud object is unavailable.", "object_unavailable");
  const internalUrl = new URL(data.signedUrl);
  const signedUrl = externalizeStorageUrl(internalUrl.toString());
  return { signedUrl, expiresIn: signedUrlSeconds };
};

const complete = async (context: GatewayContext, body: JsonRecord) => {
  const locationId = uuidField(body, "locationId");
  const relativePath = textField(body, "relativePath", 1200).replace(/\\/g, "/");
  const mimeType = textField(body, "mimeType", 255).toLowerCase();
  const checksum = textField(body, "checksum", 64).toLowerCase();
  if (!checksumPattern.test(checksum)) throw new HttpError(400, "Invalid checksum.", "invalid_checksum");
  const fileSize = integerField(body, "fileSize", 0, 1, Number.MAX_SAFE_INTEGER);
  const { data, error } = await context.client.rpc("complete_file_sync", {
    p_gateway_id: context.gatewayId,
    p_cloud_location_id: locationId,
    p_relative_path: relativePath,
    p_mime_type: mimeType,
    p_file_size: fileSize,
    p_checksum: checksum,
  });
  if (error) throw friendlyDatabaseError(error);
  return { networkLocationId: data };
};

const failed = async (context: GatewayContext, body: JsonRecord) => {
  const locationId = uuidField(body, "locationId");
  const errorCode = textField(body, "errorCode", 64).toLowerCase();
  if (!errorCodePattern.test(errorCode)) throw new HttpError(400, "Invalid error code.", "invalid_error_code");
  const retryAfterSeconds = integerField(body, "retryAfterSeconds", 60, 5, 86400);
  const { error } = await context.client.rpc("fail_file_sync", {
    p_gateway_id: context.gatewayId,
    p_cloud_location_id: locationId,
    p_error_code: errorCode,
    p_retry_after_seconds: retryAfterSeconds,
  });
  if (error) throw friendlyDatabaseError(error);
  return { failed: true };
};

const claimRemote = async (context: GatewayContext, body: JsonRecord) => {
  const limit = integerField(body, "limit", 20, 1, maximumBatchSize);
  const leaseSeconds = integerField(body, "leaseSeconds", 300, 30, 3600);
  const maxAttempts = integerField(body, "maxAttempts", 10, 1, 100);
  const { data, error } = await context.client.rpc("claim_remote_copy_jobs", {
    p_gateway_id: context.gatewayId,
    p_limit: limit,
    p_lease_seconds: leaseSeconds,
    p_max_attempts: maxAttempts,
  });
  if (error) throw friendlyDatabaseError(error);
  return { candidates: data ?? [] };
};

const readRemoteMetadata = (body: JsonRecord) => {
  const mimeType = textField(body, "mimeType", 255).toLowerCase();
  const checksum = textField(body, "checksum", 64).toLowerCase();
  const fileSize = integerField(body, "fileSize", 0, 1, 20 * 1024 * 1024);
  if (!allowedMimeTypes.has(mimeType)) throw new HttpError(415, "File type is not allowed.", "mime_not_allowed");
  if (!checksumPattern.test(checksum)) throw new HttpError(400, "Invalid checksum.", "invalid_checksum");
  return { mimeType, checksum, fileSize };
};

const completePreparedRemoteUpload = async (context: GatewayContext, jobId: string, prepared: PreparedRemoteUpload) => {
  const { error } = await context.client.rpc("complete_remote_copy_upload", {
    p_gateway_id: context.gatewayId,
    p_job_id: jobId,
    p_cloud_location_id: prepared.cloud_location_id,
    p_mime_type: prepared.mime_type,
    p_file_size: Number(prepared.file_size),
    p_checksum: prepared.checksum,
  });
  if (error) throw friendlyDatabaseError(error);
};

const prepareRemoteUpload = async (context: GatewayContext, body: JsonRecord) => {
  const jobId = uuidField(body, "jobId");
  const metadata = readRemoteMetadata(body);
  const { data, error } = await context.client.rpc("prepare_remote_copy_upload", {
    p_gateway_id: context.gatewayId,
    p_job_id: jobId,
    p_mime_type: metadata.mimeType,
    p_file_size: metadata.fileSize,
    p_checksum: metadata.checksum,
  });
  const prepared = (Array.isArray(data) ? data[0] : data) as PreparedRemoteUpload | undefined;
  if (error || !prepared) throw friendlyDatabaseError(error);
  if (prepared.job_status === "completed") return { status: "completed", locationId: prepared.cloud_location_id };
  if (prepared.bucket_id !== "rural-documents" || !prepared.object_key.startsWith(`${context.organizationId}/`)) {
    throw new HttpError(400, "Cloud destination is inconsistent.", "invalid_metadata");
  }

  const stored = await inspectStoredObject(prepared.bucket_id, prepared.object_key);
  if (prepared.job_status === "existing" && !stored) {
    throw new HttpError(409, "Existing Cloud metadata has no corresponding object.", "cloud_object_conflict");
  }
  if (stored) {
    if (stored.checksum !== prepared.checksum || stored.size !== Number(prepared.file_size) || stored.mimeType !== prepared.mime_type) {
      throw new HttpError(409, "An existing Cloud object has different content.", "cloud_object_conflict");
    }
    await completePreparedRemoteUpload(context, jobId, prepared);
    return { status: "completed", locationId: prepared.cloud_location_id };
  }

  const { data: signedUpload, error: signedUploadError } = await context.client.storage
    .from(prepared.bucket_id)
    .createSignedUploadUrl(prepared.object_key, { upsert: false });
  if (signedUploadError || !signedUpload?.signedUrl) throw new HttpError(502, "Cloud upload could not be authorized.", "upload_authorization_failed");
  return {
    status: "uploading",
    locationId: prepared.cloud_location_id,
    signedUploadUrl: externalizeStorageUrl(signedUpload.signedUrl),
  };
};

const loadRemoteJobAndLocation = async (context: GatewayContext, jobId: string, locationId: string) => {
  const { data: jobData, error: jobError } = await context.client
    .from("remote_copy_jobs")
    .select("id,organization_id,attachment_id,source_location_id,target_location_id,status,claimed_by,lease_until")
    .eq("id", jobId)
    .eq("organization_id", context.organizationId)
    .eq("status", "processing")
    .eq("claimed_by", context.gatewayId)
    .eq("target_location_id", locationId)
    .maybeSingle();
  const job = jobData as RemoteJobRow | null;
  if (jobError || !job || !job.lease_until || new Date(job.lease_until).getTime() < Date.now()) {
    throw new HttpError(403, "Remote-copy job is not claimed by this gateway.", "invalid_claim");
  }
  const { data: location, error: locationError } = await context.client
    .from("attachment_locations")
    .select("id,organization_id,attachment_id,storage_type,bucket_id,object_key,status,mime_type,file_size,checksum")
    .eq("id", locationId)
    .eq("organization_id", context.organizationId)
    .eq("attachment_id", job.attachment_id)
    .eq("source_location_id", job.source_location_id)
    .eq("storage_type", "supabase_storage")
    .in("status", ["uploading", "active"])
    .maybeSingle();
  if (locationError || !location?.bucket_id || !location.object_key) throw new HttpError(403, "Cloud destination is outside the gateway scope.", "invalid_claim");
  return location as { bucket_id: string; object_key: string; mime_type: string; file_size: number | string; checksum: string };
};

const completeRemoteUpload = async (context: GatewayContext, body: JsonRecord) => {
  const jobId = uuidField(body, "jobId");
  const locationId = uuidField(body, "locationId");
  const metadata = readRemoteMetadata(body);
  const location = await loadRemoteJobAndLocation(context, jobId, locationId);
  if (location.bucket_id !== "rural-documents" || !location.object_key.startsWith(`${context.organizationId}/`)
    || location.checksum.toLowerCase() !== metadata.checksum || Number(location.file_size) !== metadata.fileSize
    || location.mime_type.toLowerCase() !== metadata.mimeType) {
    throw new HttpError(400, "Cloud destination metadata is inconsistent.", "invalid_metadata");
  }
  const stored = await inspectStoredObject(location.bucket_id, location.object_key);
  if (!stored) throw new HttpError(404, "Uploaded Cloud object is unavailable.", "object_unavailable");
  if (stored.checksum !== metadata.checksum || stored.size !== metadata.fileSize || stored.mimeType !== metadata.mimeType) {
    throw new HttpError(409, "Uploaded Cloud object has different content.", "cloud_object_conflict");
  }
  const prepared: PreparedRemoteUpload = {
    job_status: "processing",
    cloud_location_id: locationId,
    bucket_id: location.bucket_id,
    object_key: location.object_key,
    mime_type: metadata.mimeType,
    file_size: metadata.fileSize,
    checksum: metadata.checksum,
  };
  await completePreparedRemoteUpload(context, jobId, prepared);
  return { status: "completed", locationId };
};

const failRemote = async (context: GatewayContext, body: JsonRecord) => {
  const jobId = uuidField(body, "jobId");
  const errorCode = textField(body, "errorCode", 64).toLowerCase();
  if (!errorCodePattern.test(errorCode)) throw new HttpError(400, "Invalid error code.", "invalid_error_code");
  const retryAfterSeconds = integerField(body, "retryAfterSeconds", 60, 5, 86400);
  const { error } = await context.client.rpc("fail_remote_copy_job", {
    p_gateway_id: context.gatewayId,
    p_job_id: jobId,
    p_error_code: errorCode,
    p_retry_after_seconds: retryAfterSeconds,
  });
  if (error) throw friendlyDatabaseError(error);
  return { failed: true };
};

Deno.serve(async (request) => {
  try {
    if (request.method !== "POST") throw new HttpError(405, "Method not allowed.", "method_not_allowed");
    const body = await readBody(request);
    const action = actionField(body);
    const context = await authenticate(request);
    checkRateLimit(context.gatewayId);
    const result = action === "health" ? await health(context)
      : action === "claim" ? await claim(context, body)
      : action === "download" ? await download(context, body)
      : action === "complete" ? await complete(context, body)
      : action === "failed" ? await failed(context, body)
      : action === "claim-remote" ? await claimRemote(context, body)
      : action === "prepare-remote-upload" ? await prepareRemoteUpload(context, body)
      : action === "complete-remote-upload" ? await completeRemoteUpload(context, body)
      : await failRemote(context, body);
    return json(result);
  } catch (error) {
    if (error instanceof HttpError) return json({ error: error.message, code: error.code }, error.status);
    return json({ error: "Gateway request failed.", code: "internal_error" }, 500);
  }
});
