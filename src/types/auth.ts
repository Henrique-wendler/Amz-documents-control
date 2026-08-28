export interface AuthProfile {
  id: string;
  full_name: string;
  organization_id: string;
  role_key: string;
  status: "active" | "inactive";
}

export interface SignInResult {
  success: boolean;
  error?: string;
}
