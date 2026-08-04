// Shared caller-identity + Admin-role verification for the Restore
// Project upload-authorization and preview Route Handlers
// (restore/upload-url/route.ts, restore/preview/route.ts) — the exact
// same check both need, written once so it can never drift between them.
// Never trusts anything client-sent for identity, role, or organization —
// both are always re-derived from the caller's own verified session and
// their own organization_memberships row.

import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function requireSupabaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL.");
  return url;
}

// Bound to the caller's own access token — used only to verify who is
// really calling (auth.getUser), never for the privileged membership
// lookup below.
function getCallerClient(accessToken: string): SupabaseClient {
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!anonKey) throw new Error("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  return createClient(requireSupabaseUrl(), anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

// Only ever used AFTER the caller's own session has already been
// verified via getCallerClient — never a shortcut around that check.
function getAdminClient(): SupabaseClient {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY.");
  return createClient(requireSupabaseUrl(), serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export interface AdminCaller {
  profileId: string;
  organizationId: string;
  /** service-role client — already available since the membership lookup
   *  needed one; reused by the caller for its own Storage/DB calls rather
   *  than constructing a second one. */
  admin: SupabaseClient;
}

export type RequireAdminCallerResult = { ok: true; caller: AdminCaller } | { ok: false; response: NextResponse };

/**
 * Verifies the request carries a real, active Admin session and returns
 * that Admin's own profileId/organizationId (derived from their own
 * organization_memberships row — never from anything the client sent).
 * Returns a ready-to-return NextResponse (401/403/500, with a safe
 * message) on any failure — callers just do
 * `if (!result.ok) return result.response;`.
 */
export async function requireAdminCaller(request: Request): Promise<RequireAdminCallerResult> {
  const authHeader = request.headers.get("authorization") ?? "";
  const accessToken = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";
  if (!accessToken) {
    return { ok: false, response: NextResponse.json({ error: "Missing session." }, { status: 401 }) };
  }

  let caller: SupabaseClient;
  try {
    caller = getCallerClient(accessToken);
  } catch {
    return { ok: false, response: NextResponse.json({ error: "Server configuration error." }, { status: 500 }) };
  }

  const { data: callerData, error: callerAuthError } = await caller.auth.getUser(accessToken);
  if (callerAuthError || !callerData.user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Your session has expired. Please sign in again." }, { status: 401 }),
    };
  }

  let admin: SupabaseClient;
  try {
    admin = getAdminClient();
  } catch {
    return { ok: false, response: NextResponse.json({ error: "Server configuration error." }, { status: 500 }) };
  }

  const { data: membership, error: membershipError } = await admin
    .from("organization_memberships")
    .select("organization_id")
    .eq("profile_id", callerData.user.id)
    .eq("status", "active")
    .eq("role", "admin")
    .maybeSingle<{ organization_id: string }>();
  if (membershipError) {
    return { ok: false, response: NextResponse.json({ error: "Could not verify your permissions." }, { status: 500 }) };
  }
  if (!membership) {
    return { ok: false, response: NextResponse.json({ error: "Only an Admin can do this." }, { status: 403 }) };
  }

  return { ok: true, caller: { profileId: callerData.user.id, organizationId: membership.organization_id, admin } };
}
