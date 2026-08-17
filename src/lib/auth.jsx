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

    // Passwordless: email a 6-digit code (Magic Link template must include
    // {{ .Token }} and must not rely on {{ .ConfirmationURL }}).
    sendEmailCode: (email) =>
      supabase.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: true },
      }),

    verifyEmailCode: async (email, token) => {
      // New accounts get a confirmation mail (type signup). Returning users
      // get the magic-link/OTP mail (type email / magiclink). Try all three
      // without burning the token on a wrong type.
      const types = ["email", "signup", "magiclink"];
      let last = null;
      for (const type of types) {
        const result = await supabase.auth.verifyOtp({ email, token, type });
        if (!result.error && result.data?.session) return result;
        last = result;
      }
      return last;
    },

    signInWithGoogle: () =>
      supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: window.location.origin },
      }),

    signOut: () => supabase.auth.signOut(),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
