import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import type { AuthProfile, SignInResult } from "../types/auth";

interface AuthContextValue {
  user: User | null;
  profile: AuthProfile | null;
  session: Session | null;
  permissions: string[];
  loading: boolean;
  error?: string;
  signIn: (email: string, password: string) => Promise<SignInResult>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const invalidProfileMessage = "Seu usuário não possui um perfil ativo para acessar o sistema.";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const requestId = useRef(0);

  const clearIdentity = useCallback(() => {
    setSession(null);
    setUser(null);
    setProfile(null);
    setPermissions([]);
  }, []);

  const loadIdentity = useCallback(async (nextSession: Session | null) => {
    const currentRequest = ++requestId.current;
    setLoading(true);

    if (!nextSession) {
      clearIdentity();
      setLoading(false);
      return false;
    }

    setSession(nextSession);
    setUser(nextSession.user);

    const [{ data: profileData, error: profileError }, { data: permissionData, error: permissionError }] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, full_name, organization_id, role_key, status")
        .eq("id", nextSession.user.id)
        .maybeSingle(),
      supabase.rpc("current_user_permissions"),
    ]);

    if (currentRequest !== requestId.current) return false;

    const loadedProfile = profileData as AuthProfile | null;
    if (profileError || permissionError || !loadedProfile || loadedProfile.status !== "active") {
      setError(invalidProfileMessage);
      clearIdentity();
      await supabase.auth.signOut({ scope: "local" });
      setLoading(false);
      return false;
    }

    setProfile(loadedProfile);
    setPermissions(
      ((permissionData ?? []) as Array<{ permission_key: string }>).map((item) => item.permission_key),
    );
    setError(undefined);
    setLoading(false);
    return true;
  }, [clearIdentity]);

  useEffect(() => {
    let mounted = true;

    void supabase.auth.getSession().then(({ data }) => {
      if (mounted) void loadIdentity(data.session);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      window.setTimeout(() => {
        if (mounted) void loadIdentity(nextSession);
      }, 0);
    });

    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
    };
  }, [loadIdentity]);

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

    const validProfile = await loadIdentity(data.session);
    return validProfile ? { success: true } : { success: false, error: invalidProfileMessage };
  }, [loadIdentity]);

  const signOut = useCallback(async () => {
    setError(undefined);
    setLoading(true);
    await supabase.auth.signOut({ scope: "local" });
    clearIdentity();
    setLoading(false);
  }, [clearIdentity]);

  const refreshProfile = useCallback(async () => {
    if (!session) return false;
    return loadIdentity(session);
  }, [loadIdentity, session]);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    profile,
    session,
    permissions,
    loading,
    error,
    signIn,
    signOut,
    refreshProfile,
  }), [error, loading, permissions, profile, refreshProfile, session, signIn, signOut, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider.");
  return context;
}
