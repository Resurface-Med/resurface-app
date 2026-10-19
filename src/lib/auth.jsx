import { createContext, useContext, useEffect, useState } from "react";
import { supabase, isConfigured } from "./supabase";
import { mark, flag, tokenWasExpired } from "./loadTiming";
import { clearOffline } from "./offlineStore";

/*
 * The session Supabase still has on the device, read directly (2026-10-19,
 * offline).
 *
 * An access token lasts an hour. Past that, opening the app asks the server
 * for a new one, and with no connection getSession() answers "no session" —
 * though it keeps the session stored, because a network failure is not a
 * sign-out (it removes it itself when the server actually refuses it). Taken
 * at its word, the app showed the sign-in page to someone signed in, on a
 * train, who could not sign in there anyway. So when it says none and one is
 * still stored, that one is used: enough to know who you are and open your
 * copy on this device. Data requests still go through Supabase, which
 * refreshes the token as soon as there is a connection.
 */
function storedSession() {
  try {
    const raw = localStorage.getItem(supabase.auth.storageKey);
    const s = raw ? JSON.parse(raw) : null;
    if (!s?.refresh_token || !s?.user?.id) return null;
    return s;
  } catch { return null; }
}

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

    flag("refreshed", tokenWasExpired());
    /* With an expired token and no connection, getSession() keeps retrying
       the refresh for half a minute before it answers. The app does not wait
       for it: after a moment, the stored session opens your copy on this
       device, and getSession's answer, when it comes, replaces it. */
    let settled = false;
    const early = setTimeout(() => {
      if (settled) return;
      const s = storedSession();
      if (s) { setSession(prev => prev ?? s); setLoading(false); }
    }, navigator.onLine === false ? 0 : 2500);
    supabase.auth.getSession().then(({ data }) => {
      settled = true; clearTimeout(early);
      mark("auth");
      setSession(data.session ?? storedSession());
      setLoading(false);
    }, () => {
      settled = true; clearTimeout(early);
      setSession(storedSession());
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      if (event === "PASSWORD_RECOVERY") setRecovering(true);
      /* Only a real sign-out ends the session. "None" at start-up while one
         is still stored is the offline case above. */
      if (!next && event !== "SIGNED_OUT") next = storedSession();
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

    return () => { clearTimeout(early); sub.subscription.unsubscribe(); };
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

    updatePassword: async (password) => {
      const res = await supabase.auth.updateUser({ password });
      if (!res.error) setRecovering(false);   // recovery is over; let the app in
      return res;
    },

    /* Offline, signing out everywhere cannot reach the server and Supabase
       then keeps the session; this device is signed out regardless. The
       device's copy of your work goes with it. Writes still queued stay,
       stamped as yours, and are sent the next time you sign in. */
    signOut: async () => {
      let res;
      try { res = await supabase.auth.signOut(); } catch (e) { res = { error: e }; }
      if (res?.error) res = await supabase.auth.signOut({ scope: "local" });
      await clearOffline();
      setSession(null);
      return res;
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
