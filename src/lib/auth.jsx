import { createContext, useContext, useEffect, useState } from "react";
import { supabase, isConfigured } from "./supabase";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  // Starts true so nothing renders against a wrong assumption: without this the
  // app flashes the login page for a moment on every reload before Supabase
  // restores the stored session.
  const [loading, setLoading] = useState(isConfigured);

  useEffect(() => {
    if (!isConfigured) return;

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setLoading(false);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const value = {
    session,
    user: session?.user ?? null,
    loading,
    configured: isConfigured,

    signUp: (email, password) =>
      supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: window.location.origin },
      }),

    signIn: (email, password) =>
      supabase.auth.signInWithPassword({ email, password }),

    signInWithGoogle: () =>
      supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: window.location.origin },
      }),

    // Recovery template must use {{ .Token }} (no ConfirmationURL) so the
    // student gets a code instead of a link that mail apps burn.
    resetPassword: (email) =>
      supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin,
      }),

    resendSignupCode: (email) =>
      supabase.auth.resend({ type: "signup", email }),

    verifySignupCode: (email, token) =>
      supabase.auth.verifyOtp({ email, token, type: "signup" }),

    verifyRecoveryCode: (email, token) =>
      supabase.auth.verifyOtp({ email, token, type: "recovery" }),

    updatePassword: (password) =>
      supabase.auth.updateUser({ password }),

    signOut: () => supabase.auth.signOut(),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
