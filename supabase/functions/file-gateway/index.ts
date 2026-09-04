import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.112.4";

type JsonRecord = Record<string, unknown>;
type GatewayAction = "claim" | "download" | "complete" | "failed";

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
  if (value !== "claim" && value !== "download" && value !== "complete" && value !== "failed") {
    throw new HttpError(400, "Invalid action.", "invalid_action");
  }
  return value;
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
  const signedUrl = storagePublicUrl
    ? new URL(`${internalUrl.pathname}${internalUrl.search}`, `${storagePublicUrl}/`).toString()
    : data.signedUrl;
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

Deno.serve(async (request) => {
  try {
    if (request.method !== "POST") throw new HttpError(405, "Method not allowed.", "method_not_allowed");
    const body = await readBody(request);
    const action = actionField(body);
    const context = await authenticate(request);
    checkRateLimit(context.gatewayId);
    const result = action === "claim" ? await claim(context, body)
      : action === "download" ? await download(context, body)
      : action === "complete" ? await complete(context, body)
      : await failed(context, body);
    return json(result);
  } catch (error) {
    if (error instanceof HttpError) return json({ error: error.message, code: error.code }, error.status);
    return json({ error: "Gateway request failed.", code: "internal_error" }, 500);
  }
});
