import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import type {
  AuthActionResult,
  AuthProfile,
  AuthStage,
  MfaEnrollment,
  PasswordRecoveryStatus,
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
  passwordRecoveryStatus: PasswordRecoveryStatus;
  passwordRecoveryError?: string;
  passwordRecoveryMfaRequired: boolean;
  signIn: (email: string, password: string) => Promise<SignInResult>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<boolean>;
  startMfaEnrollment: () => Promise<AuthActionResult>;
  verifyMfaEnrollment: (code: string) => Promise<AuthActionResult>;
  verifyMfaChallenge: (code: string) => Promise<AuthActionResult>;
  cancelMfa: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<AuthActionResult>;
  updatePassword: (password: string) => Promise<AuthActionResult>;
  verifyPasswordRecoveryMfa: (code: string) => Promise<AuthActionResult>;
  finishPasswordRecovery: (requestNewLink?: boolean) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const invalidProfileMessage = "Seu usuário não possui um perfil ativo para acessar o sistema.";
const invalidSessionMessage = "Sua sessão não pôde ser validada. Entre novamente.";
const invalidMfaCodeMessage = "Código inválido ou expirado. Verifique o autenticador e tente novamente.";
const recoveryStorageKey = "auth.password-recovery-active";
const invalidRecoveryMessage = "Este link de redefinição expirou ou já foi utilizado. Solicite um novo link para continuar.";

const getRecoveryUrlState = () => {
  const isRecoveryRoute = window.location.pathname.replace(/\/+$/, "") === "/redefinir-senha";
  const search = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  return {
    isRecoveryRoute,
    code: search.get("code"),
    accessToken: hash.get("access_token"),
    refreshToken: hash.get("refresh_token"),
    hasCallback: search.has("code") || (hash.has("access_token") && hash.get("type") === "recovery"),
    hasError: search.has("error") || hash.has("error") || search.has("error_code") || hash.has("error_code"),
  };
};

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
  const [passwordRecoveryStatus, setPasswordRecoveryStatus] = useState<PasswordRecoveryStatus>("idle");
  const [passwordRecoveryError, setPasswordRecoveryError] = useState<string>();
  const [passwordRecoveryMfaRequired, setPasswordRecoveryMfaRequired] = useState(false);
  const [passwordRecoveryMfaFactorId, setPasswordRecoveryMfaFactorId] = useState<string>();
  const requestId = useRef(0);
  const recoveryStatusRef = useRef<PasswordRecoveryStatus>("idle");
  const recoveryTimeoutRef = useRef<number | undefined>(undefined);
  const suppressSessionEventsRef = useRef(false);
  const callbackProcessingRef = useRef(false);
  const recoveryInitializedRef = useRef(false);

  const clearIdentity = useCallback(() => {
    setSession(null);
    setUser(null);
    setProfile(null);
    setPermissions([]);
    setMfaEnrollment(undefined);
    setMfaFactorId(undefined);
    setPasswordRecoveryMfaRequired(false);
    setPasswordRecoveryMfaFactorId(undefined);
  }, []);

  const clearRecoveryTimeout = useCallback(() => {
    if (recoveryTimeoutRef.current !== undefined) {
      window.clearTimeout(recoveryTimeoutRef.current);
      recoveryTimeoutRef.current = undefined;
    }
  }, []);

  const setRecoveryState = useCallback((status: PasswordRecoveryStatus, recoveryError?: string) => {
    recoveryStatusRef.current = status;
    setPasswordRecoveryStatus(status);
    setPasswordRecoveryError(recoveryError);
  }, []);

  const invalidatePasswordRecovery = useCallback(() => {
    clearRecoveryTimeout();
    requestId.current += 1;
    window.sessionStorage.removeItem(recoveryStorageKey);
    callbackProcessingRef.current = false;
    recoveryInitializedRef.current = false;
    clearIdentity();
    setRecoveryState("invalid", invalidRecoveryMessage);
    setError(undefined);
    setStage("password_recovery");
    setLoading(false);
    void supabase.auth.signOut({ scope: "local" });
  }, [clearIdentity, clearRecoveryTimeout, setRecoveryState]);

  const beginPasswordRecovery = useCallback((nextSession: Session | null) => {
    if (!nextSession) {
      invalidatePasswordRecovery();
      return false;
    }

    clearRecoveryTimeout();
    window.sessionStorage.setItem(recoveryStorageKey, "1");
    window.history.replaceState({}, "", "/redefinir-senha");
    setSession(nextSession);
    setUser(nextSession.user);
    setProfile(null);
    setPermissions([]);
    setMfaEnrollment(undefined);
    setMfaFactorId(undefined);
    setError(undefined);
    setStage("password_recovery");

    if (recoveryInitializedRef.current) {
      setLoading(false);
      return true;
    }

    recoveryInitializedRef.current = true;
    const currentRequest = ++requestId.current;
    setRecoveryState("processing");
    setLoading(true);
    void Promise.all([
      supabase.auth.mfa.listFactors(),
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    ]).then(([factorsResult, assuranceResult]) => {
      if (currentRequest !== requestId.current || recoveryStatusRef.current !== "processing") return;
      if (factorsResult.error || assuranceResult.error) {
        invalidatePasswordRecovery();
        return;
      }

      const verifiedFactor = factorsResult.data.totp.find((factor) => factor.status === "verified");
      const requiresRecoveryMfa = Boolean(verifiedFactor) && assuranceResult.data.currentLevel !== "aal2";
      setPasswordRecoveryMfaFactorId(verifiedFactor?.id);
      setPasswordRecoveryMfaRequired(requiresRecoveryMfa);
      setRecoveryState("ready");
      setLoading(false);
    }).catch(() => invalidatePasswordRecovery());
    return true;
  }, [clearRecoveryTimeout, invalidatePasswordRecovery, setRecoveryState]);

  const reconcileSession = useCallback(async (nextSession: Session | null) => {
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
    const initialRecoveryUrl = getRecoveryUrlState();
    const shouldProcessCallback = initialRecoveryUrl.isRecoveryRoute && initialRecoveryUrl.hasCallback;
    const shouldStartCallback = shouldProcessCallback && !callbackProcessingRef.current;

    if (initialRecoveryUrl.isRecoveryRoute) {
      setRecoveryState("processing");
      setStage("password_recovery");
      setLoading(true);
    }
    if (shouldStartCallback) callbackProcessingRef.current = true;

    const { data: authListener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      window.setTimeout(() => {
        if (!mounted) return;

        if (suppressSessionEventsRef.current) {
          if (event === "SIGNED_OUT") suppressSessionEventsRef.current = false;
          return;
        }

        if (callbackProcessingRef.current) return;

        if (event === "PASSWORD_RECOVERY") {
          beginPasswordRecovery(nextSession);
          return;
        }

        const recoveryUrl = getRecoveryUrlState();
        const storedRecovery = window.sessionStorage.getItem(recoveryStorageKey) === "1";

        if (recoveryStatusRef.current === "invalid") return;

        if (recoveryStatusRef.current === "ready" || storedRecovery) {
          if (event === "SIGNED_OUT" || !nextSession) {
            invalidatePasswordRecovery();
            return;
          }
          beginPasswordRecovery(nextSession);
          return;
        }

        if (recoveryUrl.isRecoveryRoute) {
          invalidatePasswordRecovery();
          return;
        }

        void reconcileSession(nextSession);
      }, 0);
    });

    if (initialRecoveryUrl.isRecoveryRoute && initialRecoveryUrl.hasError) {
      invalidatePasswordRecovery();
    } else if (shouldStartCallback) {
      void (async () => {
        let callbackSession: Session | null = null;
        let callbackError = false;

        try {
          if (initialRecoveryUrl.code) {
            const result = await supabase.auth.exchangeCodeForSession(initialRecoveryUrl.code);
            callbackSession = result.data.session;
            callbackError = Boolean(result.error);
          } else if (initialRecoveryUrl.accessToken && initialRecoveryUrl.refreshToken) {
            const result = await supabase.auth.setSession({
              access_token: initialRecoveryUrl.accessToken,
              refresh_token: initialRecoveryUrl.refreshToken,
            });
            callbackSession = result.data.session;
            callbackError = Boolean(result.error);
          } else {
            callbackError = true;
          }
        } catch {
          callbackError = true;
        }

        callbackProcessingRef.current = false;
        if (callbackError || !callbackSession) {
          invalidatePasswordRecovery();
          return;
        }
        beginPasswordRecovery(callbackSession);
      })();
    }

    return () => {
      mounted = false;
      clearRecoveryTimeout();
      authListener.subscription.unsubscribe();
    };
  }, [beginPasswordRecovery, clearRecoveryTimeout, invalidatePasswordRecovery, reconcileSession, setRecoveryState]);

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

    // SIGNED_IN is reconciled once by the centralized auth-state listener.
    return { success: true };
  }, []);

  const signOut = useCallback(async () => {
    setError(undefined);
    setLoading(true);
    if (mfaEnrollment?.factorId) {
      await supabase.auth.mfa.unenroll({ factorId: mfaEnrollment.factorId });
    }
    await supabase.auth.signOut({ scope: "local" });
    window.sessionStorage.removeItem(recoveryStorageKey);
    recoveryInitializedRef.current = false;
    setRecoveryState("idle");
    clearIdentity();
    setStage("signed_out");
    setLoading(false);
  }, [clearIdentity, mfaEnrollment?.factorId, setRecoveryState]);

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
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
      if (resetError) return { success: false, error: "Não foi possível enviar o link agora. Tente novamente em instantes." };
      return { success: true };
    } catch {
      return { success: false, error: "Não foi possível enviar o link agora. Tente novamente em instantes." };
    }
  }, []);

  const updatePassword = useCallback(async (password: string): Promise<AuthActionResult> => {
    if (stage !== "password_recovery" || passwordRecoveryStatus !== "ready" || !session) {
      return { success: false, error: invalidRecoveryMessage };
    }
    setLoading(true);
    setError(undefined);
    let updateError: { code?: string; message: string } | null = null;
    try {
      const result = await supabase.auth.updateUser({ password });
      updateError = result.error;
    } catch {
      setLoading(false);
      return { success: false, error: "Não foi possível redefinir a senha. Solicite um novo link e tente novamente." };
    }
    setLoading(false);
    if (updateError) {
      const normalizedMessage = updateError.message.toLocaleLowerCase();
      if (updateError.code === "insufficient_aal") {
        return { success: false, error: "Confirme o código do aplicativo autenticador antes de redefinir a senha." };
      }
      if (normalizedMessage.includes("same password")) {
        return { success: false, error: "A nova senha deve ser diferente da senha atual." };
      }
      if (normalizedMessage.includes("weak") || normalizedMessage.includes("password should")) {
        return { success: false, error: "A nova senha não atende aos requisitos de segurança." };
      }
      if (normalizedMessage.includes("expired") || normalizedMessage.includes("session")) {
        invalidatePasswordRecovery();
        return { success: false, error: invalidRecoveryMessage };
      }
      return { success: false, error: "Não foi possível redefinir a senha. Solicite um novo link e tente novamente." };
    }
    return { success: true };
  }, [invalidatePasswordRecovery, passwordRecoveryStatus, session, stage]);

  const verifyPasswordRecoveryMfa = useCallback(async (code: string): Promise<AuthActionResult> => {
    if (
      stage !== "password_recovery"
      || passwordRecoveryStatus !== "ready"
      || !session
      || !passwordRecoveryMfaRequired
      || !passwordRecoveryMfaFactorId
    ) {
      return { success: false, error: invalidSessionMessage };
    }

    setLoading(true);
    const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
      factorId: passwordRecoveryMfaFactorId,
      code,
    });
    setLoading(false);
    if (verifyError) return { success: false, error: invalidMfaCodeMessage };

    const { data: refreshedSession } = await supabase.auth.getSession();
    if (refreshedSession.session) {
      setSession(refreshedSession.session);
      setUser(refreshedSession.session.user);
    }
    setPasswordRecoveryMfaRequired(false);
    return { success: true };
  }, [passwordRecoveryMfaFactorId, passwordRecoveryMfaRequired, passwordRecoveryStatus, session, stage]);

  const finishPasswordRecovery = useCallback(async (requestNewLink = false) => {
    if (suppressSessionEventsRef.current) return;
    suppressSessionEventsRef.current = true;
    const target = requestNewLink ? "/login?recovery=1" : "/login";
    window.history.replaceState({}, "", target);
    clearRecoveryTimeout();
    requestId.current += 1;
    window.sessionStorage.removeItem(recoveryStorageKey);
    recoveryInitializedRef.current = false;
    setRecoveryState("idle");
    setError(undefined);
    clearIdentity();
    setStage("signed_out");
    setLoading(false);

    // Recovery sessions are temporary. Logout/navigation failures must never
    // be reported as a failed password update.
    try {
      await supabase.auth.signOut({ scope: "local" });
    } catch {
      // Local recovery state is still cleared below.
    } finally {
      suppressSessionEventsRef.current = false;
      window.dispatchEvent(new PopStateEvent("popstate"));
    }
  }, [clearIdentity, clearRecoveryTimeout, setRecoveryState]);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    profile,
    session,
    permissions,
    stage,
    mfaEnrollment,
    loading,
    error,
    passwordRecoveryStatus,
    passwordRecoveryError,
    passwordRecoveryMfaRequired,
    signIn,
    signOut,
    refreshProfile,
    startMfaEnrollment,
    verifyMfaEnrollment,
    verifyMfaChallenge,
    cancelMfa,
    requestPasswordReset,
    updatePassword,
    verifyPasswordRecoveryMfa,
    finishPasswordRecovery,
  }), [cancelMfa, error, finishPasswordRecovery, loading, mfaEnrollment, passwordRecoveryError, passwordRecoveryMfaRequired, passwordRecoveryStatus, permissions, profile, refreshProfile, requestPasswordReset, session, signIn, signOut, stage, startMfaEnrollment, updatePassword, user, verifyMfaChallenge, verifyMfaEnrollment, verifyPasswordRecoveryMfa]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider.");
  return context;
}
