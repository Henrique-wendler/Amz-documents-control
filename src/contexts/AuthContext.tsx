import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import type {
  AuthActionResult,
  AuthProfile,
  AuthStage,
  MfaEnrollment,
  SignInResult,
} from "../types/auth";

interface AuthContextValue {
  user: User | null;
  profile: AuthProfile | null;
  session: Session | null;
  permissions: string[];
  stage: AuthStage;
  mfaEnrollment?: MfaEnrollment;
  loading: boolean;
  error?: string;
  signIn: (email: string, password: string) => Promise<SignInResult>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<boolean>;
  startMfaEnrollment: () => Promise<AuthActionResult>;
  verifyMfaEnrollment: (code: string) => Promise<AuthActionResult>;
  verifyMfaChallenge: (code: string) => Promise<AuthActionResult>;
  cancelMfa: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<AuthActionResult>;
  updatePassword: (password: string) => Promise<AuthActionResult>;
  finishPasswordRecovery: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const invalidProfileMessage = "Seu usuário não possui um perfil ativo para acessar o sistema.";
const invalidSessionMessage = "Sua sessão não pôde ser validada. Entre novamente.";
const invalidMfaCodeMessage = "Código inválido ou expirado. Verifique o autenticador e tente novamente.";
const recoveryStorageKey = "auth.password-recovery-active";

// V1 requires enrollment for every active profile. This single policy boundary can
// later be replaced by an organization setting without changing the MFA screens.
const requiresMfaEnrollment = (_profile: AuthProfile) => true;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [stage, setStage] = useState<AuthStage>("initializing");
  const [mfaEnrollment, setMfaEnrollment] = useState<MfaEnrollment>();
  const [mfaFactorId, setMfaFactorId] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const requestId = useRef(0);

  const clearIdentity = useCallback(() => {
    setSession(null);
    setUser(null);
    setProfile(null);
    setPermissions([]);
    setMfaEnrollment(undefined);
    setMfaFactorId(undefined);
  }, []);

  const reconcileSession = useCallback(async (nextSession: Session | null, event?: AuthChangeEvent) => {
    const currentRequest = ++requestId.current;
    setLoading(true);

    if (!nextSession) {
      clearIdentity();
      setStage("signed_out");
      setLoading(false);
      return false;
    }

    setSession(nextSession);
    setUser(nextSession.user);
    setProfile(null);
    setPermissions([]);

    const recoveryFromUrl = window.location.pathname === "/redefinir-senha"
      && (window.location.hash.includes("type=recovery") || window.location.search.includes("code="));
    const recoveringPassword = event === "PASSWORD_RECOVERY"
      || recoveryFromUrl
      || window.sessionStorage.getItem(recoveryStorageKey) === "1";

    if (recoveringPassword) {
      window.sessionStorage.setItem(recoveryStorageKey, "1");
      setStage("password_recovery");
      setError(undefined);
      setLoading(false);
      return true;
    }

    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .select("id, full_name, organization_id, role_key, status")
      .eq("id", nextSession.user.id)
      .maybeSingle();

    if (currentRequest !== requestId.current) return false;

    const loadedProfile = profileData as AuthProfile | null;
    if (profileError || !loadedProfile || loadedProfile.status !== "active") {
      setError(invalidProfileMessage);
      clearIdentity();
      setStage("signed_out");
      setLoading(false);
      void supabase.auth.signOut({ scope: "local" });
      return false;
    }

    const [{ data: factors, error: factorsError }, { data: assurance, error: assuranceError }] = await Promise.all([
      supabase.auth.mfa.listFactors(),
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    ]);

    if (currentRequest !== requestId.current) return false;

    if (factorsError || assuranceError) {
      setError(invalidSessionMessage);
      clearIdentity();
      setStage("signed_out");
      setLoading(false);
      void supabase.auth.signOut({ scope: "local" });
      return false;
    }

    const verifiedFactor = factors.totp[0];
    if (!verifiedFactor && requiresMfaEnrollment(loadedProfile)) {
      setMfaEnrollment(undefined);
      setMfaFactorId(undefined);
      setStage("mfa_enrollment");
      setError(undefined);
      setLoading(false);
      return true;
    }

    if (verifiedFactor && assurance.currentLevel !== "aal2") {
      setMfaFactorId(verifiedFactor.id);
      setStage("mfa_challenge");
      setError(undefined);
      setLoading(false);
      return true;
    }

    if (assurance.currentLevel !== "aal2") {
      setError(invalidSessionMessage);
      clearIdentity();
      setStage("signed_out");
      setLoading(false);
      void supabase.auth.signOut({ scope: "local" });
      return false;
    }

    const { data: permissionData, error: permissionError } = await supabase.rpc("current_user_permissions");
    if (currentRequest !== requestId.current) return false;

    if (permissionError) {
      setError(invalidSessionMessage);
      clearIdentity();
      setStage("signed_out");
      setLoading(false);
      void supabase.auth.signOut({ scope: "local" });
      return false;
    }

    setProfile(loadedProfile);
    setPermissions(
      ((permissionData ?? []) as Array<{ permission_key: string }>).map((item) => item.permission_key),
    );
    setMfaEnrollment(undefined);
    setMfaFactorId(undefined);
    setStage("authenticated");
    setError(undefined);
    setLoading(false);
    return true;
  }, [clearIdentity]);

  useEffect(() => {
    let mounted = true;

    void supabase.auth.getSession().then(({ data }) => {
      if (mounted) void reconcileSession(data.session);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      window.setTimeout(() => {
        if (mounted) void reconcileSession(nextSession, event);
      }, 0);
    });

    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
    };
  }, [reconcileSession]);

  const signIn = useCallback(async (email: string, password: string): Promise<SignInResult> => {
    setError(undefined);
    setLoading(true);
    const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    if (signInError || !data.session) {
      const message = "E-mail ou senha inválidos.";
      setError(message);
      setLoading(false);
      return { success: false, error: message };
    }

    await reconcileSession(data.session);
    return { success: true };
  }, [reconcileSession]);

  const signOut = useCallback(async () => {
    setError(undefined);
    setLoading(true);
    if (mfaEnrollment?.factorId) {
      await supabase.auth.mfa.unenroll({ factorId: mfaEnrollment.factorId });
    }
    await supabase.auth.signOut({ scope: "local" });
    window.sessionStorage.removeItem(recoveryStorageKey);
    clearIdentity();
    setStage("signed_out");
    setLoading(false);
  }, [clearIdentity, mfaEnrollment?.factorId]);

  const refreshProfile = useCallback(async () => {
    if (!session) return false;
    return reconcileSession(session);
  }, [reconcileSession, session]);

  const startMfaEnrollment = useCallback(async (): Promise<AuthActionResult> => {
    if (!session || stage !== "mfa_enrollment") return { success: false, error: invalidSessionMessage };
    setLoading(true);
    setError(undefined);

    const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
    if (listError) {
      setLoading(false);
      return { success: false, error: "Não foi possível iniciar a configuração do autenticador." };
    }

    const staleFactors = factors.all.filter((factor) => factor.factor_type === "totp" && factor.status === "unverified");
    await Promise.all(staleFactors.map((factor) => supabase.auth.mfa.unenroll({ factorId: factor.id })));

    const { data, error: enrollError } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: "Aplicativo autenticador",
      issuer: "Sistema de Gestão de Imóveis Rurais",
    });

    if (enrollError) {
      setLoading(false);
      return { success: false, error: "Não foi possível iniciar a configuração do autenticador." };
    }

    const qrCode = data.totp.qr_code.startsWith("data:")
      ? data.totp.qr_code
      : `data:image/svg+xml;utf-8,${encodeURIComponent(data.totp.qr_code)}`;
    const secret = data.totp.secret || new URL(data.totp.uri).searchParams.get("secret") || "";
    if (!secret) {
      await supabase.auth.mfa.unenroll({ factorId: data.id });
      setLoading(false);
      return { success: false, error: "O autenticador não forneceu uma chave válida para configuração." };
    }
    setMfaEnrollment({ factorId: data.id, qrCode, secret });
    setLoading(false);
    return { success: true };
  }, [session, stage]);

  const verifyFactor = useCallback(async (factorId: string, code: string): Promise<AuthActionResult> => {
    setLoading(true);
    setError(undefined);
    const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
    if (verifyError) {
      setLoading(false);
      return { success: false, error: invalidMfaCodeMessage };
    }

    setMfaEnrollment(undefined);
    const { data } = await supabase.auth.getSession();
    await reconcileSession(data.session);
    return { success: true };
  }, [reconcileSession]);

  const verifyMfaEnrollment = useCallback(async (code: string) => {
    if (!mfaEnrollment) return { success: false, error: "Inicie a configuração do autenticador primeiro." };
    return verifyFactor(mfaEnrollment.factorId, code);
  }, [mfaEnrollment, verifyFactor]);

  const verifyMfaChallenge = useCallback(async (code: string) => {
    if (!mfaFactorId) return { success: false, error: invalidSessionMessage };
    return verifyFactor(mfaFactorId, code);
  }, [mfaFactorId, verifyFactor]);

  const cancelMfa = useCallback(async () => {
    await signOut();
  }, [signOut]);

  const requestPasswordReset = useCallback(async (email: string): Promise<AuthActionResult> => {
    const redirectTo = `${window.location.origin}/redefinir-senha`;
    await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
    return { success: true };
  }, []);

  const updatePassword = useCallback(async (password: string): Promise<AuthActionResult> => {
    if (stage !== "password_recovery" || !session) return { success: false, error: "O link de redefinição não é mais válido." };
    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (updateError) return { success: false, error: "Não foi possível redefinir a senha. Solicite um novo link." };
    return { success: true };
  }, [session, stage]);

  const finishPasswordRecovery = useCallback(async () => {
    await signOut();
  }, [signOut]);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    profile,
    session,
    permissions,
    stage,
    mfaEnrollment,
    loading,
    error,
    signIn,
    signOut,
    refreshProfile,
    startMfaEnrollment,
    verifyMfaEnrollment,
    verifyMfaChallenge,
    cancelMfa,
    requestPasswordReset,
    updatePassword,
    finishPasswordRecovery,
  }), [cancelMfa, error, finishPasswordRecovery, loading, mfaEnrollment, permissions, profile, refreshProfile, requestPasswordReset, session, signIn, signOut, stage, startMfaEnrollment, updatePassword, user, verifyMfaChallenge, verifyMfaEnrollment]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider.");
  return context;
}
