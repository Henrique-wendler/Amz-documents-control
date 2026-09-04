import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.112.4";

type JsonRecord = Record<string, unknown>;
type FileAction = "prepare-upload" | "finalize-upload" | "abort-upload" | "download" | "remove-location";

interface FileContext {
  client: SupabaseClient;
  userId: string;
  organizationId: string;
  permissions: Set<string>;
}

interface LocationRow {
  id: string;
  organization_id: string;
  attachment_id: string;
  storage_type: "network_share" | "supabase_storage" | "external";
  bucket_id: string | null;
  object_key: string | null;
  status: "uploading" | "active" | "removing" | "inactive" | "failed";
  mime_type: string | null;
  file_size: number | string | null;
  checksum: string | null;
  version: number;
  document_attachments: {
    id: string;
    file_name: string;
    status: "active" | "inactive";
    deleted_at: string | null;
  };
}

class HttpError extends Error {
  constructor(public status: number, message: string, public code: string) {
    super(message);
  }
}

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
const storagePublicUrl = Deno.env.get("STORAGE_PUBLIC_URL")?.replace(/\/+$/, "");
const allowedOrigins = new Set(
  (Deno.env.get("ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter(Boolean),
);
const bucketId = "rural-documents";
const bucketMaximumBytes = 20 * 1024 * 1024;
const configuredMaximumBytes = Number(Deno.env.get("DOCUMENT_UPLOAD_MAX_BYTES") ?? bucketMaximumBytes);
const maximumBytes = Number.isSafeInteger(configuredMaximumBytes) && configuredMaximumBytes > 0
  ? Math.min(configuredMaximumBytes, bucketMaximumBytes)
  : bucketMaximumBytes;
const defaultMimeTypes = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "application/msword",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
];
const configuredMimeTypes = (Deno.env.get("DOCUMENT_UPLOAD_ALLOWED_MIME_TYPES") ?? "")
  .split(",")
  .map((value) => value.trim().toLocaleLowerCase("en-US"))
  .filter(Boolean);
const allowedMimeTypes = new Set(configuredMimeTypes.length ? configuredMimeTypes : defaultMimeTypes);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const rateWindows = new Map<string, { count: number; resetAt: number }>();

if (!supabaseUrl || !supabaseAnonKey) throw new Error("Supabase function environment is unavailable.");
if (Deno.env.get("ENVIRONMENT") === "production" && (!storagePublicUrl || new URL(storagePublicUrl).protocol !== "https:")) {
  throw new Error("STORAGE_PUBLIC_URL must use HTTPS in production.");
}

const json = (body: unknown, status: number, headers: HeadersInit = {}) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "private, no-store, max-age=0", ...headers },
});

const corsHeaders = (origin: string | null) => {
  if (!origin) return {};
  const normalized = origin.replace(/\/+$/, "");
  if (!allowedOrigins.has(normalized)) throw new HttpError(403, "Origem não autorizada.", "origin_not_allowed");
  return {
    "Access-Control-Allow-Origin": normalized,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "600",
    "Vary": "Origin",
  };
};

const checkRateLimit = (userId: string, action: FileAction) => {
  const now = Date.now();
  const key = `${userId}:${action}`;
  const current = rateWindows.get(key);
  if (!current || current.resetAt <= now) {
    rateWindows.set(key, { count: 1, resetAt: now + 60_000 });
    return;
  }
  if (current.count >= 40) throw new HttpError(429, "Muitas solicitações de arquivo. Aguarde um minuto.", "rate_limited");
  current.count += 1;
};

const readBody = async (request: Request) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new HttpError(400, "Requisição inválida.", "invalid_json");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new HttpError(400, "Requisição inválida.", "invalid_payload");
  }
  return body as JsonRecord;
};

const textField = (body: JsonRecord, key: string, minimum: number, maximum: number) => {
  const value = body[key];
  if (typeof value !== "string") throw new HttpError(400, "Dados obrigatórios não informados.", "invalid_payload");
  const normalized = value.trim();
  if (normalized.length < minimum || normalized.length > maximum) {
    throw new HttpError(400, "Dados informados são inválidos.", "invalid_payload");
  }
  return normalized;
};

const uuidField = (body: JsonRecord, key: string) => {
  const value = textField(body, key, 36, 36);
  if (!uuidPattern.test(value)) throw new HttpError(400, "Identificador inválido.", "invalid_id");
  return value;
};

const positiveIntegerField = (body: JsonRecord, key: string) => {
  const value = body[key];
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new HttpError(400, "Valor numérico inválido.", "invalid_payload");
  }
  return value;
};

const fileNameField = (body: JsonRecord) => {
  const fileName = textField(body, "fileName", 1, 255);
  if (/[\\/\u0000-\u001f]/.test(fileName) || fileName === "." || fileName === "..") {
    throw new HttpError(400, "Nome de arquivo inválido.", "invalid_file_name");
  }
  return fileName;
};

const mimeTypeField = (body: JsonRecord) => {
  const mimeType = textField(body, "mimeType", 3, 255).toLocaleLowerCase("en-US");
  if (!allowedMimeTypes.has(mimeType)) throw new HttpError(415, "Tipo de arquivo não permitido.", "mime_not_allowed");
  return mimeType;
};

const fileSizeField = (body: JsonRecord) => {
  const fileSize = positiveIntegerField(body, "fileSize");
  if (fileSize > maximumBytes) throw new HttpError(413, "O arquivo excede o limite permitido.", "file_too_large");
  return fileSize;
};

const actionField = (body: JsonRecord) => {
  const action = body.action;
  if (action !== "prepare-upload" && action !== "finalize-upload" && action !== "abort-upload" && action !== "download" && action !== "remove-location") {
    throw new HttpError(400, "Ação de arquivo inválida.", "invalid_action");
  }
  return action;
};

const requireContext = async (request: Request): Promise<FileContext> => {
  const authorization = request.headers.get("Authorization") ?? "";
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) throw new HttpError(401, "Sessão não autenticada.", "unauthenticated");

  const client = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: userData, error: userError } = await client.auth.getUser(token);
  if (userError || !userData.user) throw new HttpError(401, "Sessão inválida ou expirada.", "invalid_session");

  const [{ data: profile, error: profileError }, { data: permissionRows, error: permissionError }] = await Promise.all([
    client.from("profiles").select("id,organization_id,status").eq("id", userData.user.id).eq("status", "active").maybeSingle(),
    client.rpc("current_user_permissions"),
  ]);
  if (profileError || !profile || permissionError) throw new HttpError(403, "Perfil sem acesso aos arquivos.", "inactive_profile");

  return {
    client,
    userId: userData.user.id,
    organizationId: profile.organization_id as string,
    permissions: new Set(((permissionRows ?? []) as Array<{ permission_key: string }>).map((row) => row.permission_key)),
  };
};

const requirePermission = (context: FileContext, permission: "files.read" | "files.manage") => {
  if (!context.permissions.has(permission)) {
    throw new HttpError(403, permission === "files.read" ? "Você não possui permissão para acessar arquivos." : "Você não possui permissão para gerenciar arquivos.", "forbidden");
  }
};

const friendlyDatabaseError = (error: { code?: string; message?: string } | null, fallback: string) => {
  if (!error) return new HttpError(500, fallback, "database_error");
  if (error.code === "42501") return new HttpError(403, "O arquivo não está disponível para esta organização.", "forbidden");
  if (error.code === "40001") return new HttpError(409, "A localização foi alterada por outro usuário. Atualize os dados e tente novamente.", "concurrency_conflict");
  if (error.code === "22023") return new HttpError(400, "Os metadados do arquivo são inválidos.", "invalid_metadata");
  return new HttpError(500, fallback, "database_error");
};

const loadLocation = async (context: FileContext, locationId: string, allowPendingAttachment = false) => {
  const { data, error } = await context.client
    .from("attachment_locations")
    .select("id,organization_id,attachment_id,storage_type,bucket_id,object_key,status,mime_type,file_size,checksum,version,document_attachments!inner(id,file_name,status,deleted_at)")
    .eq("id", locationId)
    .eq("organization_id", context.organizationId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !data) throw new HttpError(404, "Localização de arquivo não encontrada.", "not_found");
  const location = data as unknown as LocationRow;
  if (location.document_attachments.deleted_at || (!allowPendingAttachment && location.document_attachments.status !== "active")) {
    throw new HttpError(404, "Arquivo não disponível.", "not_found");
  }
  return location;
};

const cleanupUpload = async (context: FileContext, attachmentId: string, locationId: string, location?: LocationRow) => {
  if (location?.bucket_id && location.object_key) {
    await context.client.storage.from(location.bucket_id).remove([location.object_key]);
  }
  await context.client.rpc("fail_document_upload", { p_attachment_id: attachmentId, p_location_id: locationId });
};

const prepareUpload = async (context: FileContext, body: JsonRecord) => {
  requirePermission(context, "files.manage");
  const documentId = uuidField(body, "documentId");
  const fileName = fileNameField(body);
  const mimeType = mimeTypeField(body);
  const fileSize = fileSizeField(body);

  const { data, error } = await context.client.rpc("begin_document_upload", {
    p_document_id: documentId,
    p_file_name: fileName,
    p_mime_type: mimeType,
    p_file_size: fileSize,
  });
  const prepared = Array.isArray(data) ? data[0] : data;
  if (error || !prepared) throw friendlyDatabaseError(error, "Não foi possível preparar o envio do arquivo.");

  const attachmentId = prepared.attachment_id as string;
  const locationId = prepared.location_id as string;
  const objectKey = prepared.object_key as string;
  try {
    const { data: signedUpload, error: signedUploadError } = await context.client.storage
      .from(bucketId)
      .createSignedUploadUrl(objectKey, { upsert: false });
    if (signedUploadError || !signedUpload?.token) throw signedUploadError ?? new Error("Signed upload unavailable.");
    return {
      attachmentId,
      locationId,
      bucketId,
      objectKey,
      uploadToken: signedUpload.token,
      maximumBytes,
    };
  } catch {
    await cleanupUpload(context, attachmentId, locationId);
    throw new HttpError(502, "Não foi possível autorizar o envio do arquivo.", "upload_authorization_failed");
  }
};

const finalizeUpload = async (context: FileContext, body: JsonRecord) => {
  requirePermission(context, "files.manage");
  const attachmentId = uuidField(body, "attachmentId");
  const locationId = uuidField(body, "locationId");
  const location = await loadLocation(context, locationId, true);
  if (location.attachment_id !== attachmentId || location.storage_type !== "supabase_storage" || !location.bucket_id || !location.object_key) {
    throw new HttpError(404, "Upload não encontrado.", "not_found");
  }
  if (location.status === "active") return { attachmentId, locationId, checksum: location.checksum };
  if (location.status !== "uploading") throw new HttpError(409, "O upload não está aguardando finalização.", "invalid_upload_state");

  try {
    const objectSegments = location.object_key.split("/");
    const storedObjectName = objectSegments.pop();
    const storedObjectFolder = objectSegments.join("/");
    const { data: listedObjects, error: listError } = await context.client.storage.from(location.bucket_id).list(storedObjectFolder, {
      limit: 10,
      search: storedObjectName,
    });
    const storedObject = listedObjects?.find((item) => item.name === storedObjectName);
    if (listError || !storedObject) throw new HttpError(502, "O objeto enviado não pôde ser validado.", "object_validation_failed");
    const { data: object, error: downloadError } = await context.client.storage.from(location.bucket_id).download(location.object_key);
    if (downloadError || !object) throw new HttpError(502, "O objeto enviado não pôde ser validado.", "object_validation_failed");
    const metadata = (storedObject.metadata ?? {}) as Record<string, unknown>;
    const storedMimeType = String(metadata.mimetype ?? metadata.contentType ?? "").toLocaleLowerCase("en-US");
    const storedSize = Number(metadata.size);
    const expectedSize = Number(location.file_size);
    if (!allowedMimeTypes.has(storedMimeType) || storedMimeType !== location.mime_type || storedSize !== expectedSize || object.size !== expectedSize || object.size > maximumBytes) {
      throw new HttpError(400, "O arquivo armazenado não corresponde aos metadados autorizados.", "object_metadata_mismatch");
    }
    const digest = await crypto.subtle.digest("SHA-256", await object.arrayBuffer());
    const checksum = [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
    const { error } = await context.client.rpc("finalize_document_upload", {
      p_attachment_id: attachmentId,
      p_location_id: locationId,
      p_mime_type: storedMimeType,
      p_file_size: object.size,
      p_checksum: checksum,
    });
    if (error) throw friendlyDatabaseError(error, "Não foi possível finalizar os metadados do arquivo.");
    return { attachmentId, locationId, checksum };
  } catch (error) {
    const currentLocation = await loadLocation(context, locationId, true).catch(() => undefined);
    if (currentLocation?.status === "active") {
      return { attachmentId, locationId, checksum: currentLocation.checksum };
    }
    await cleanupUpload(context, attachmentId, locationId, currentLocation ?? location);
    if (error instanceof HttpError) throw error;
    throw new HttpError(500, "Não foi possível finalizar o envio do arquivo.", "upload_finalize_failed");
  }
};

const abortUpload = async (context: FileContext, body: JsonRecord) => {
  requirePermission(context, "files.manage");
  const attachmentId = uuidField(body, "attachmentId");
  const locationId = uuidField(body, "locationId");
  let location: LocationRow | undefined;
  try {
    location = await loadLocation(context, locationId, true);
  } catch {
    // The database RPC below still validates tenant and identifiers.
  }
  if (location && location.status !== "uploading") {
    throw new HttpError(409, "O upload não está pendente e não pode ser cancelado.", "invalid_upload_state");
  }
  await cleanupUpload(context, attachmentId, locationId, location);
  return { aborted: true };
};

const download = async (context: FileContext, body: JsonRecord) => {
  requirePermission(context, "files.read");
  const locationId = uuidField(body, "locationId");
  const location = await loadLocation(context, locationId);
  if (location.storage_type !== "supabase_storage" || location.status !== "active" || !location.bucket_id || !location.object_key) {
    throw new HttpError(404, "O arquivo não está disponível remotamente.", "cloud_file_unavailable");
  }

  const expiresIn = 60;
  const { data, error } = await context.client.storage
    .from(location.bucket_id)
    .createSignedUrl(location.object_key, expiresIn, { download: location.document_attachments.file_name });
  if (error || !data?.signedUrl) throw new HttpError(502, "Não foi possível autorizar o download agora.", "download_authorization_failed");

  const { error: logError } = await context.client.rpc("log_attachment_location_event", {
    p_location_id: locationId,
    p_action: "download",
  });
  if (logError) throw friendlyDatabaseError(logError, "Não foi possível registrar o acesso ao arquivo.");
  const internalUrl = new URL(data.signedUrl);
  const signedUrl = storagePublicUrl
    ? new URL(`${internalUrl.pathname}${internalUrl.search}`, `${storagePublicUrl}/`).toString()
    : data.signedUrl;
  return {
    signedUrl,
    expiresIn,
    fileName: location.document_attachments.file_name,
    mimeType: location.mime_type,
  };
};

const removeLocation = async (context: FileContext, body: JsonRecord) => {
  requirePermission(context, "files.manage");
  const locationId = uuidField(body, "locationId");
  const expectedVersion = positiveIntegerField(body, "expectedVersion");
  const location = await loadLocation(context, locationId);
  if (location.storage_type !== "supabase_storage" || location.status !== "active" || !location.bucket_id || !location.object_key) {
    throw new HttpError(404, "A localização Cloud não está disponível.", "cloud_file_unavailable");
  }

  const { data: removingVersion, error: beginError } = await context.client.rpc("begin_remove_attachment_location", {
    p_location_id: locationId,
    p_expected_version: expectedVersion,
  });
  if (beginError || typeof removingVersion !== "number") throw friendlyDatabaseError(beginError, "Não foi possível iniciar a remoção da localização.");

  const { error: storageError } = await context.client.storage.from(location.bucket_id).remove([location.object_key]);
  if (storageError) {
    await context.client.rpc("cancel_remove_attachment_location", {
      p_location_id: locationId,
      p_expected_version: removingVersion,
    });
    throw new HttpError(502, "Não foi possível remover o arquivo do armazenamento.", "storage_remove_failed");
  }

  const { error: finalizeError } = await context.client.rpc("finalize_remove_attachment_location", {
    p_location_id: locationId,
    p_expected_version: removingVersion,
  });
  if (finalizeError) {
    await context.client.rpc("fail_remove_attachment_location", {
      p_location_id: locationId,
      p_expected_version: removingVersion,
    });
    throw friendlyDatabaseError(finalizeError, "O arquivo foi removido, mas a localização não pôde ser finalizada.");
  }
  return { removed: true };
};

Deno.serve(async (request) => {
  let headers: HeadersInit = {};
  try {
    headers = corsHeaders(request.headers.get("Origin"));
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (request.method !== "POST") throw new HttpError(405, "Método não permitido.", "method_not_allowed");

    const body = await readBody(request);
    const action = actionField(body);
    const context = await requireContext(request);
    checkRateLimit(context.userId, action);

    const result = action === "prepare-upload" ? await prepareUpload(context, body)
      : action === "finalize-upload" ? await finalizeUpload(context, body)
      : action === "abort-upload" ? await abortUpload(context, body)
      : action === "download" ? await download(context, body)
      : await removeLocation(context, body);
    return json(result, 200, headers);
  } catch (error) {
    if (error instanceof HttpError) return json({ error: error.message, code: error.code }, error.status, headers);
    return json({ error: "Não foi possível processar o arquivo no momento.", code: "internal_error" }, 500, headers);
  }
});
