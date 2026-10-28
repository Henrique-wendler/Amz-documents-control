import { verifiedJwtHasAal2 } from "./verifiedJwtAal.ts";

export class FunctionHttpError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export interface ActiveProfile {
  id: string;
  organization_id: string;
  role_key: string;
  status: string;
}

export interface AuthContextBackend {
  verifyUser(token: string): Promise<{ id: string } | null>;
  profileFor(id: string): Promise<ActiveProfile | null>;
  organizationActive(id: string): Promise<boolean>;
  roleActive(key: string): Promise<boolean>;
  hasPermission(role: string, permission: string): Promise<boolean>;
}

/** Same semantics as the existing Edge guards; only the exact Auth-verified token supplies AAL. */
export async function requireAuthenticatedContext(request: Request, backend: AuthContextBackend, permission: string) {
  const token = request.headers.get("Authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token || token.length > 8192) throw new FunctionHttpError(401, "authentication_required", "Entre novamente na sua conta.");
  const user = await backend.verifyUser(token);
  if (!user) throw new FunctionHttpError(401, "authentication_required", "Sessão inválida ou expirada.");
  // A verified server/admin token is not an end-user session, even if it has a subject/AAL claim.
  let userSession = false;
  try {
    const encoded = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const claims = JSON.parse(atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, "=")));
    userSession = claims.role === "authenticated";
  } catch { /* Invalid claims fail closed after Auth verification. */ }
  if (!userSession) throw new FunctionHttpError(401, "authentication_required", "Utilize uma sessão de usuário válida.");
  if (!verifiedJwtHasAal2(token)) throw new FunctionHttpError(403, "mfa_required", "Confirme sua autenticação em duas etapas.");
  const profile = await backend.profileFor(user.id);
  if (!profile || profile.id !== user.id || profile.status !== "active") {
    throw new FunctionHttpError(403, "permission_denied", "Perfil sem autorização para sincronizar.");
  }
  const checks = await Promise.all([
    backend.organizationActive(profile.organization_id), backend.roleActive(profile.role_key),
    backend.hasPermission(profile.role_key, permission),
  ]);
  if (!checks.every(Boolean)) throw new FunctionHttpError(403, "permission_denied", "Sem autorização para sincronizar propostas.");
  return { actorId: user.id, organizationId: profile.organization_id };
}
