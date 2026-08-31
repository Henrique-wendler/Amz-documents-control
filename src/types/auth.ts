export interface AuthProfile {
  id: string;
  full_name: string;
  organization_id: string;
  role_key: string;
  status: "active" | "inactive";
}

export type AuthStage =
  | "initializing"
  | "signed_out"
  | "mfa_enrollment"
  | "mfa_challenge"
  | "password_recovery"
  | "authenticated";

export interface AuthActionResult {
  success: boolean;
  error?: string;
}

export type SignInResult = AuthActionResult;

export interface MfaEnrollment {
  factorId: string;
  qrCode: string;
  secret: string;
}
