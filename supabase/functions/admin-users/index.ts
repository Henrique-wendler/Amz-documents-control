import { createClient, type User } from "npm:@supabase/supabase-js@2.112.4";

type JsonRecord = Record<string, unknown>;
type ProfileStatus = "active" | "inactive";

interface AdminContext {
  actorId: string;
  organizationId: string;
  roleKey: string;
  authorization: string;
}

interface ProfileRow {
  id: string;
  organization_id: string;
  full_name: string;
  role_key: string;
  status: ProfileStatus;
  created_at: string;
  updated_at: string;
}

class HttpError extends Error {
  constructor(public status: number, message: string, public code: string) {
    super(message);
  }
}

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const appPublicUrl = Deno.env.get("APP_PUBLIC_URL")?.replace(/\/+$/, "");
const allowedOrigins = new Set(
  (Deno.env.get("ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter(Boolean),
);

if (!supabaseUrl || !serviceRoleKey) throw new Error("Supabase server environment is unavailable.");

const adminClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const rateWindows = new Map<string, { count: number; resetAt: number }>();
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const rolePattern = /^[a-z][a-z0-9_]*$/;

if (appPublicUrl && !allowedOrigins.has(appPublicUrl)) throw new Error("APP_PUBLIC_URL must be included in ALLOWED_ORIGINS.");
if (Deno.env.get("ENVIRONMENT") === "production" && appPublicUrl && new URL(appPublicUrl).protocol !== "https:") {
  throw new Error("APP_PUBLIC_URL must use HTTPS in production.");
}

const json = (body: unknown, status: number, headers: HeadersInit = {}) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers },
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

const checkRateLimit = (actorId: string, action: string) => {
  const now = Date.now();
  const sensitive = action === "invite" || action === "send-recovery";
  const limit = sensitive ? 5 : 40;
  const key = `${actorId}:${action}`;
  const current = rateWindows.get(key);
  if (!current || current.resetAt <= now) {
    rateWindows.set(key, { count: 1, resetAt: now + 60_000 });
    return;
  }
  if (current.count >= limit) throw new HttpError(429, "Muitas tentativas. Aguarde um minuto.", "rate_limited");
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

const textField = (body: JsonRecord, key: string, min: number, max: number) => {
  const value = body[key];
  if (typeof value !== "string") throw new HttpError(400, "Dados obrigatórios não informados.", "invalid_payload");
  const normalized = value.trim();
  if (normalized.length < min || normalized.length > max) throw new HttpError(400, "Dados informados são inválidos.", "invalid_payload");
  return normalized;
};

const targetIdField = (body: JsonRecord) => {
  const id = textField(body, "targetId", 36, 36);
  if (!uuidPattern.test(id)) throw new HttpError(400, "Usuário inválido.", "invalid_target");
  return id;
};

const statusField = (body: JsonRecord) => {
  const status = body.status;
  if (status !== "active" && status !== "inactive") throw new HttpError(400, "Situação inválida.", "invalid_status");
  return status;
};

const roleField = async (body: JsonRecord) => {
  const roleKey = textField(body, "roleKey", 2, 64);
  if (!rolePattern.test(roleKey)) throw new HttpError(400, "Perfil inválido.", "invalid_role");
  const { data, error } = await adminClient.from("roles").select("role_key").eq("role_key", roleKey).eq("status", "active").maybeSingle();
  if (error || !data) throw new HttpError(400, "Perfil inválido.", "invalid_role");
  return roleKey;
};

const userClientFor = (authorization: string) => createClient(supabaseUrl, serviceRoleKey, {
  global: { headers: { Authorization: authorization } },
  auth: { autoRefreshToken: false, persistSession: false },
});

const requireAdminContext = async (request: Request): Promise<AdminContext> => {
  const authorization = request.headers.get("Authorization") ?? "";
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) throw new HttpError(401, "Sessão não autenticada.", "unauthenticated");

  const { data: userData, error: userError } = await adminClient.auth.getUser(token);
  if (userError || !userData.user) throw new HttpError(401, "Sessão inválida ou expirada.", "invalid_session");

  const { data: profile, error: profileError } = await adminClient
    .from("profiles")
    .select("id, organization_id, role_key, status")
    .eq("id", userData.user.id)
    .eq("status", "active")
    .maybeSingle();
  if (profileError || !profile) throw new HttpError(403, "Perfil sem acesso administrativo.", "inactive_profile");

  const [{ data: organization }, { data: role }, { data: permission }] = await Promise.all([
    adminClient.from("organizations").select("id").eq("id", profile.organization_id).eq("status", "active").is("deleted_at", null).maybeSingle(),
    adminClient.from("roles").select("role_key").eq("role_key", profile.role_key).eq("status", "active").maybeSingle(),
    adminClient.from("role_permissions").select("permission_key").eq("role_key", profile.role_key).eq("permission_key", "users.manage").maybeSingle(),
  ]);
  if (!organization || !role || !permission) throw new HttpError(403, "Você não possui permissão para gerenciar usuários.", "forbidden");

  return {
    actorId: userData.user.id,
    organizationId: profile.organization_id as string,
    roleKey: profile.role_key as string,
    authorization,
  };
};

const listAuthUsers = async () => {
  const users: User[] = [];
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new HttpError(502, "Não foi possível consultar os usuários no momento.", "auth_unavailable");
    users.push(...data.users);
    if (data.users.length < 1000) break;
  }
  return users;
};

const mfaConfigured = async (userId: string) => {
  const { data, error } = await adminClient.auth.admin.mfa.listFactors({ userId });
  if (error) throw new HttpError(502, "Não foi possível consultar a situação do MFA.", "mfa_unavailable");
  return data.factors.some((factor) => factor.factor_type === "totp" && factor.status === "verified");
};

const mapUser = async (profile: ProfileRow, authUser?: User) => ({
  id: profile.id,
  full_name: profile.full_name,
  email: authUser?.email ?? "",
  role_key: profile.role_key,
  status: profile.status,
  mfa_configured: await mfaConfigured(profile.id),
  created_at: authUser?.created_at ?? profile.created_at,
  last_sign_in_at: authUser?.last_sign_in_at ?? null,
});

const getTarget = async (context: AdminContext, targetId: string) => {
  const { data, error } = await adminClient
    .from("profiles")
    .select("id, organization_id, full_name, role_key, status, created_at, updated_at")
    .eq("id", targetId)
    .eq("organization_id", context.organizationId)
    .maybeSingle();
  if (error || !data) throw new HttpError(404, "Usuário não encontrado.", "not_found");
  return data as ProfileRow;
};

const recordEvent = async (context: AdminContext, targetId: string, action: string, changes: JsonRecord = {}) => {
  const actorClient = userClientFor(context.authorization);
  const { error } = await actorClient.rpc("record_user_administration_event", {
    p_target_user_id: targetId,
    p_action: action,
    p_changes: changes,
  });
  if (error) throw new HttpError(500, "A ação foi concluída, mas não pôde ser registrada na auditoria.", "audit_failed");
};

const list = async (context: AdminContext) => {
  const [{ data: profiles, error: profileError }, { data: roles, error: roleError }, authUsers] = await Promise.all([
    adminClient.from("profiles").select("id, organization_id, full_name, role_key, status, created_at, updated_at").eq("organization_id", context.organizationId).order("full_name"),
    adminClient.from("roles").select("role_key, name").eq("status", "active").order("name"),
    listAuthUsers(),
  ]);
  if (profileError || roleError) throw new HttpError(500, "Não foi possível consultar os usuários no momento.", "database_unavailable");
  const authById = new Map(authUsers.map((user) => [user.id, user]));
  return {
    users: await Promise.all(((profiles ?? []) as ProfileRow[]).map((profile) => mapUser(profile, authById.get(profile.id)))),
    roles: roles ?? [],
  };
};

const invite = async (context: AdminContext, body: JsonRecord) => {
  if (!appPublicUrl) throw new HttpError(503, "A URL pública do sistema não está configurada.", "public_url_missing");
  const fullName = textField(body, "fullName", 3, 160);
  const email = textField(body, "email", 5, 254).toLocaleLowerCase("en-US");
  if (!emailPattern.test(email)) throw new HttpError(400, "Informe um e-mail válido.", "invalid_email");
  const roleKey = await roleField(body);
  const status = statusField(body);

  const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${appPublicUrl}/redefinir-senha`,
    data: { full_name: fullName },
  });
  const invitedUser = inviteData.user;
  if (inviteError || !invitedUser) {
    const duplicate = inviteError?.message.toLocaleLowerCase("en-US").includes("already");
    throw new HttpError(duplicate ? 409 : 502, duplicate ? "Já existe um usuário com este e-mail." : "Não foi possível enviar o convite.", duplicate ? "duplicate_email" : "invite_failed");
  }

  const actorClient = userClientFor(context.authorization);
  const { error: profileError } = await actorClient.from("profiles").insert({
    id: invitedUser.id,
    organization_id: context.organizationId,
    full_name: fullName,
    role_key: roleKey,
    status,
  });
  if (profileError) {
    await adminClient.auth.admin.deleteUser(invitedUser.id);
    throw new HttpError(500, "Não foi possível concluir a criação do perfil.", "profile_create_failed");
  }

  if (status === "inactive") {
    const { error: banError } = await adminClient.auth.admin.updateUserById(invitedUser.id, { ban_duration: "876000h" });
    if (banError) {
      await adminClient.from("profiles").delete().eq("id", invitedUser.id);
      await adminClient.auth.admin.deleteUser(invitedUser.id);
      throw new HttpError(500, "Não foi possível aplicar a situação inicial do usuário.", "initial_status_failed");
    }
  }

  await recordEvent(context, invitedUser.id, "USER_INVITED", { role_key: { new: roleKey }, status: { new: status } });
  return mapUser({
    id: invitedUser.id,
    organization_id: context.organizationId,
    full_name: fullName,
    role_key: roleKey,
    status,
    created_at: invitedUser.created_at,
    updated_at: invitedUser.updated_at ?? invitedUser.created_at,
  }, invitedUser);
};

const update = async (context: AdminContext, body: JsonRecord) => {
  const targetId = targetIdField(body);
  const current = await getTarget(context, targetId);
  const fullName = textField(body, "fullName", 3, 160);
  const roleKey = await roleField(body);
  const status = statusField(body);
  const actorClient = userClientFor(context.authorization);

  if (current.status !== status) {
    const authStatus = status === "inactive" ? "876000h" : "none";
    const { error: authError } = await adminClient.auth.admin.updateUserById(targetId, { ban_duration: authStatus });
    if (authError) throw new HttpError(502, "Não foi possível alterar o acesso do usuário.", "auth_update_failed");
  }

  const { data, error } = await actorClient.rpc("admin_update_user_profile", {
    p_target_user_id: targetId,
    p_full_name: fullName,
    p_role_key: roleKey,
    p_status: status,
  });
  if (error) {
    if (current.status !== status) {
      const rollbackStatus = current.status === "inactive" ? "876000h" : "none";
      await adminClient.auth.admin.updateUserById(targetId, { ban_duration: rollbackStatus });
    }
    const lastManager = error.code === "23514";
    throw new HttpError(lastManager ? 409 : error.code === "42501" ? 403 : 400, lastManager ? "A organização deve manter ao menos um gestor de usuários ativo." : "Não foi possível atualizar o usuário.", lastManager ? "last_user_manager" : "profile_update_failed");
  }

  const updated = (Array.isArray(data) ? data[0] : data) as ProfileRow;
  const { data: authData } = await adminClient.auth.admin.getUserById(targetId);
  return mapUser(updated, authData.user ?? undefined);
};

const sendRecovery = async (context: AdminContext, body: JsonRecord) => {
  if (!appPublicUrl) throw new HttpError(503, "A URL pública do sistema não está configurada.", "public_url_missing");
  const targetId = targetIdField(body);
  const target = await getTarget(context, targetId);
  if (target.status !== "active") throw new HttpError(409, "Ative o usuário antes de enviar a recuperação de acesso.", "inactive_target");
  const { data: authData, error: authError } = await adminClient.auth.admin.getUserById(targetId);
  if (authError || !authData.user?.email) throw new HttpError(404, "Usuário não encontrado.", "not_found");

  const mailClient = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error } = await mailClient.auth.resetPasswordForEmail(authData.user.email, { redirectTo: `${appPublicUrl}/redefinir-senha` });
  if (error) throw new HttpError(502, "Não foi possível enviar o e-mail de recuperação agora.", "recovery_failed");
  await recordEvent(context, targetId, "PASSWORD_RECOVERY_SENT");
};

Deno.serve(async (request) => {
  let headers: HeadersInit = {};
  try {
    headers = corsHeaders(request.headers.get("Origin"));
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (request.method !== "POST") throw new HttpError(405, "Método não permitido.", "method_not_allowed");

    const context = await requireAdminContext(request);
    const body = await readBody(request);
    if ("organizationId" in body || "organization_id" in body) throw new HttpError(400, "A organização é definida pela sessão autenticada.", "tenant_from_payload");
    const action = textField(body, "action", 3, 40);
    checkRateLimit(context.actorId, action);

    if (action === "list") return json(await list(context), 200, headers);
    if (action === "invite") return json({ user: await invite(context, body) }, 201, headers);
    if (action === "update") return json({ user: await update(context, body) }, 200, headers);
    if (action === "send-recovery") {
      await sendRecovery(context, body);
      return json({ success: true }, 200, headers);
    }
    throw new HttpError(400, "Ação administrativa inválida.", "invalid_action");
  } catch (reason) {
    if (reason instanceof HttpError) return json({ error: reason.message, code: reason.code }, reason.status, headers);
    return json({ error: "Não foi possível concluir a ação administrativa.", code: "internal_error" }, 500, headers);
  }
});
