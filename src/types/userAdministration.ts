export type UserProfileStatus = "active" | "inactive";

export interface UserRoleOption {
  key: string;
  name: string;
}

export interface ManagedUser {
  id: string;
  fullName: string;
  email: string;
  roleKey: string;
  status: UserProfileStatus;
  mfaConfigured: boolean;
  createdAt: string;
  lastSignInAt?: string;
}

export interface UserAdministrationData {
  users: ManagedUser[];
  roles: UserRoleOption[];
}

export interface UserInvitationDraft {
  fullName: string;
  email: string;
  roleKey: string;
  status: UserProfileStatus;
}

export interface UserUpdateDraft {
  fullName: string;
  roleKey: string;
  status: UserProfileStatus;
}

