import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Same service-role client pattern as every privileged server-side write in
 * this app (e.g. src/lib/server/delete-user-action.ts's getAdminClient) —
 * reused here rather than re-derived, since this importer runs as a
 * trusted, manually-invoked CLI (no browser caller to authenticate first),
 * unlike a Server Action.
 *
 * Server-side only. Never logs the key itself — only whether it's present.
 */
export function getSupabaseAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL.");
  if (!serviceRoleKey) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY.");

  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
