import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { setAuthTokenGetter } from "@workspace/api-client-react";
import { isSupabaseConfigured, supabase } from "./supabase";

type AuthContextValue = {
  ready: boolean;
  session: Session | null;
  user: User | null;
  configured: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

/** Keep the latest access token in memory so API calls don't wait on getSession(). */
let cachedAccessToken: string | null = null;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(!isSupabaseConfigured);
  const [session, setSession] = useState<Session | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!supabase) {
      cachedAccessToken = null;
      setAuthTokenGetter(null);
      setReady(true);
      return;
    }

    let cancelled = false;

    const applySession = (next: Session | null, opts?: { refetch?: boolean }) => {
      cachedAccessToken = next?.access_token ?? null;
      setSession(next);
      setReady(true);
      if (opts?.refetch && next) {
        void queryClient.invalidateQueries();
      }
    };

    setAuthTokenGetter(async () => {
      if (cachedAccessToken) return cachedAccessToken;
      const { data } = await supabase!.auth.getSession();
      cachedAccessToken = data.session?.access_token ?? null;
      return cachedAccessToken;
    });

    // Prefer onAuthStateChange (includes INITIAL_SESSION) to avoid race with getSession().
    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      if (cancelled) return;
      applySession(next, { refetch: event === "SIGNED_IN" || event === "TOKEN_REFRESHED" });
    });

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      // Only seed if onAuthStateChange hasn't already set ready with a session.
      applySession(data.session);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
      cachedAccessToken = null;
      setAuthTokenGetter(null);
    };
  }, [queryClient]);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) return { error: "ログイン設定がありません" };
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (!error && data.session) {
      cachedAccessToken = data.session.access_token;
      setSession(data.session);
      await queryClient.invalidateQueries();
    }
    return { error: error?.message ?? null };
  }, [queryClient]);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    cachedAccessToken = null;
    await supabase.auth.signOut();
    queryClient.clear();
  }, [queryClient]);

  const value = useMemo<AuthContextValue>(
    () => ({
      ready,
      session,
      user: session?.user ?? null,
      configured: isSupabaseConfigured,
      signIn,
      signOut,
    }),
    [ready, session, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
