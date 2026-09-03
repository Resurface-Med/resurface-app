import { createContext, useContext, useEffect, useState } from "react";
import { supabase, isConfigured } from "./supabase";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  // True from the moment a recovery session is created until the password has
  // actually been changed. Verifying a recovery code signs the user in, so
  // without this the app would show the dashboard and the "choose a new
  // password" step would never be reachable.
  const [recovering, setRecovering] = useState(false);
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

    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      if (event === "PASSWORD_RECOVERY") setRecovering(true);
      // Keep the same session object when nothing meaningful changed. A new
      // object on every TOKEN_REFRESHED used to remount the app via effects
      // that depended on `user`, which killed in-progress practice sessions
      // the moment you tabbed away.
      setSession(prev => {
        if (
          prev?.access_token === next?.access_token
          && prev?.user?.id === next?.user?.id
          && Boolean(prev) === Boolean(next)
        ) {
          return prev;
        }
        return next;
      });
      setLoading(false);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const value = {
    session,
    user: session?.user ?? null,
    recovering,
    beginRecovery: () => setRecovering(true),
    endRecovery: () => setRecovering(false),
    loading,
    configured: isConfigured,

    signUp: (email, password, displayName, marketingOptIn = false) =>
      supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: window.location.origin,
          data: {
            display_name: String(displayName || "").trim(),
            marketing_opt_in: marketingOptIn ? "true" : "false",
          },
        },
      }),

    signIn: (email, password) =>
      supabase.auth.signInWithPassword({ email, password }),

    signInWithGoogle: (marketingOptIn = false) => {
      try {
        if (marketingOptIn) sessionStorage.setItem("rs_marketing_opt_in", "1");
        else sessionStorage.removeItem("rs_marketing_opt_in");
      } catch {
        /* private mode */
      }
      return supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: window.location.origin },
      });
    },

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

    updatePassword: async (password) => {
      const res = await supabase.auth.updateUser({ password });
      if (!res.error) setRecovering(false);   // recovery is over; let the app in
      return res;
    },

    signOut: () => supabase.auth.signOut(),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
