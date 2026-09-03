import type { ManagedUser, UserAdministrationData, UserInvitationDraft, UserUpdateDraft } from "../types/userAdministration";

export interface UserAdministrationRepository {
  list(): Promise<UserAdministrationData>;
  invite(draft: UserInvitationDraft): Promise<ManagedUser>;
  update(id: string, draft: UserUpdateDraft): Promise<ManagedUser>;
  sendRecovery(id: string): Promise<void>;
}

