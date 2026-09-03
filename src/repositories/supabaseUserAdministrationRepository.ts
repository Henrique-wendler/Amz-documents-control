import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import type { UserAdministrationRepository } from "./userAdministrationRepository";
import type { ManagedUser, UserAdministrationData, UserInvitationDraft, UserRoleOption, UserUpdateDraft } from "../types/userAdministration";

interface UserDto {
  id: string;
  full_name: string;
  email: string;
  role_key: string;
  status: "active" | "inactive";
  mfa_configured: boolean;
  created_at: string;
  last_sign_in_at: string | null;
}

interface RoleDto {
  role_key: string;
  name: string;
}

interface FunctionErrorBody {
  error?: string;
  code?: string;
}

const mapUser = (user: UserDto): ManagedUser => ({
  id: user.id,
  fullName: user.full_name,
  email: user.email,
  roleKey: user.role_key,
  status: user.status,
  mfaConfigured: user.mfa_configured,
  createdAt: user.created_at,
  lastSignInAt: user.last_sign_in_at ?? undefined,
});

const mapRole = (role: RoleDto): UserRoleOption => ({ key: role.role_key, name: role.name });

const functionError = async (error: unknown) => {
  if (error instanceof FunctionsHttpError) {
    try {
      const body = await error.context.json() as FunctionErrorBody;
      if (body.error) return new Error(body.error);
    } catch {
      // The public fallback below intentionally hides transport and server details.
    }
  }
  return new Error("Não foi possível concluir a ação administrativa no momento.");
};

const invoke = async <T>(body: Record<string, unknown>): Promise<T> => {
  const { data, error } = await supabase.functions.invoke("admin-users", { body });
  if (error) throw await functionError(error);
  return data as T;
};

export const supabaseUserAdministrationRepository: UserAdministrationRepository = {
  async list(): Promise<UserAdministrationData> {
    const data = await invoke<{ users: UserDto[]; roles: RoleDto[] }>({ action: "list" });
    return { users: data.users.map(mapUser), roles: data.roles.map(mapRole) };
  },

  async invite(draft: UserInvitationDraft) {
    const data = await invoke<{ user: UserDto }>({ action: "invite", ...draft });
    return mapUser(data.user);
  },

  async update(id: string, draft: UserUpdateDraft) {
    const data = await invoke<{ user: UserDto }>({ action: "update", targetId: id, ...draft });
    return mapUser(data.user);
  },

  async sendRecovery(id: string) {
    await invoke<{ success: true }>({ action: "send-recovery", targetId: id });
  },
};

