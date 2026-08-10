import { createClient } from "@supabase/supabase-js";

// The anon key is meant to ship in the browser — it grants nothing on its own.
// Every table is behind RLS, so what a session can read or write is decided by
// Postgres against auth.uid(), not by this key.
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isConfigured = Boolean(url && anonKey);

if (!isConfigured && import.meta.env.DEV) {
  console.warn(
    "[resurface] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are unset — " +
    "sign-in is disabled. Copy .env.example to .env.local.",
  );
}

export const supabase = isConfigured
  ? createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;
