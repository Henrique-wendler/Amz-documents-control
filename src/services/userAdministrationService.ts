import { supabaseUserAdministrationRepository } from "../repositories/supabaseUserAdministrationRepository";
import type { UserInvitationDraft, UserUpdateDraft } from "../types/userAdministration";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const normalizeName = (value: string) => value.trim().replace(/\s+/g, " ");
const normalizeEmail = (value: string) => value.trim().toLocaleLowerCase("en-US");

const validateName = (value: string) => {
  const name = normalizeName(value);
  if (name.length < 3 || name.length > 160) throw new Error("Informe um nome completo válido.");
  return name;
};

const validateRole = (value: string) => {
  if (!/^[a-z][a-z0-9_]*$/.test(value)) throw new Error("Selecione um perfil válido.");
  return value;
};

export const userAdministrationService = {
  list: () => supabaseUserAdministrationRepository.list(),

  invite(draft: UserInvitationDraft) {
    const email = normalizeEmail(draft.email);
    if (!emailPattern.test(email) || email.length > 254) throw new Error("Informe um e-mail válido.");
    return supabaseUserAdministrationRepository.invite({
      ...draft,
      fullName: validateName(draft.fullName),
      email,
      roleKey: validateRole(draft.roleKey),
    });
  },

  update(id: string, draft: UserUpdateDraft) {
    return supabaseUserAdministrationRepository.update(id, {
      ...draft,
      fullName: validateName(draft.fullName),
      roleKey: validateRole(draft.roleKey),
    });
  },

  sendRecovery: (id: string) => supabaseUserAdministrationRepository.sendRecovery(id),
};

