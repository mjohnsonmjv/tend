import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";

WebBrowser.maybeCompleteAuthSession();

export type OAuthProvider = "google" | "azure";

export const AUTH_SCHEME = "tendprayer";
export const AUTH_CALLBACK_PATH = "auth/callback";

/** Deep link the OAuth flow returns to, e.g. tendprayer://auth/callback.
 * Add this exact URI to Supabase Auth > URL Configuration > Redirect URLs. */
export function oauthRedirectUri(): string {
  return AuthSession.makeRedirectUri({ scheme: AUTH_SCHEME, path: AUTH_CALLBACK_PATH });
}

interface AuthContextValue {
  session: Session | null;
  loading: boolean;
  signIn: (provider: OAuthProvider) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const signIn = async (provider: OAuthProvider) => {
    const redirectTo = oauthRedirectUri();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo, skipBrowserRedirect: true },
    });
    if (error) throw error;
    if (!data?.url) {
      throw new Error("Sign-in is not available right now. Please try again later.");
    }
    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (result.type !== "success" || !result.url) {
      throw new Error("Sign-in was cancelled.");
    }
    const code = new URL(result.url).searchParams.get("code");
    if (!code) {
      throw new Error("Sign-in did not complete. Please try again.");
    }
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (exchangeError) throw exchangeError;
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  return (
    <AuthContext.Provider value={{ session, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
