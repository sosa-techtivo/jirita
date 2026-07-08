// Browser Supabase client for future backend integration. Nothing imports
// this yet — mock-auth.ts and the mock-*.ts data modules remain the only
// data source until a real call site is wired up (see mock-auth.ts for the
// intended swap point). Importing this module has no side effects; only
// calling getSupabaseBrowserClient() touches env vars, so its absence today
// cannot affect current mock flows.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Fails loudly instead of silently constructing a broken client, so a
// missing/misconfigured env var surfaces immediately during backend
// development rather than as a confusing downstream network error.
function requireSupabaseEnv(): { url: string; anonKey: string } {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error(
      "Missing Supabase environment variables. Set NEXT_PUBLIC_SUPABASE_URL and " +
        "NEXT_PUBLIC_SUPABASE_ANON_KEY (see .env.example)."
    );
  }
  return { url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY };
}

let browserClient: SupabaseClient | null = null;

// Lazily creates a single shared browser client on first use.
export function getSupabaseBrowserClient(): SupabaseClient {
  if (!browserClient) {
    const { url, anonKey } = requireSupabaseEnv();
    browserClient = createClient(url, anonKey);
  }
  return browserClient;
}
