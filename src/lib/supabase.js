import { createClient } from "@supabase/supabase-js";

// These two values are public by design. The publishable key is compiled into
// the JS bundle and readable by anyone who opens devtools — it grants nothing
// on its own, because every table is behind RLS and what a session may touch is
// decided by Postgres against auth.uid(). Committing them means a deploy works
// without dashboard configuration; the env vars still win when set, which is
// what a staging project would use.
//
// The service_role key is a different animal entirely and must never appear
// here: it bypasses RLS, and anything prefixed VITE_ is inlined into the build.
const DEFAULT_URL = "https://uhqpljteohitvytwfadp.supabase.co";
const DEFAULT_ANON_KEY = "sb_publishable_0ZlQhc0Gn_bD5-AFIgPOrw_xKVHv8hJ";

const url = import.meta.env.VITE_SUPABASE_URL || DEFAULT_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || DEFAULT_ANON_KEY;

export const isConfigured = Boolean(url && anonKey);

export const supabase = isConfigured
  ? createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;
