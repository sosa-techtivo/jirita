"use server";

// Server Action that resolves real "Last Login" data for an organization's
// members. A user's own last_sign_in_at is visible to them via
// supabase.auth.getUser(), but there's no client-side way to read *someone
// else's* — it only exists on the Auth Admin API (admin.auth.admin.listUsers/
// getUserById), which requires SUPABASE_SERVICE_ROLE_KEY. No new table: this
// reads the value Supabase Auth already tracks for every sign-in, exactly
// as CLAUDE.md's "no real source yet" gap for Users' lastLogin describes.
//
// Same two-client pattern as every other Server Action in this family
// (Disable/Enable, Edit, Invite, Reset Password link): a caller-
// authenticated client for identity + "is this caller an active admin of
// this org", and the service-role client only afterward, only for the
// privileged Admin API read.

import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

export type LoadLastSignInResult =
  | { status: "success"; lastSignInByProfileId: Record<string, string | null> }
  | { status: "error"; message: string };

function logServerError(operation: string, detail?: unknown): void {
  if (!detail) {
    console.error(`[last-sign-in] ${operation}`);
    return;
  }
  const err = detail instanceof Error
    ? { message: detail.message }
    : (detail as {
        message?: string;
        code?: string | number;
        status?: number;
        details?: string | null;
        hint?: string | null;
      });
  console.error(`[last-sign-in] ${operation}`, {
    code: "code" in err ? err.code : undefined,
    status: "status" in err ? err.status : undefined,
    message: err.message,
    details: "details" in err ? err.details : undefined,
    hint: "hint" in err ? err.hint : undefined,
  });
}

function requireSupabaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL.");
  return url;
}

function getCallerClient(accessToken: string): SupabaseClient {
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!anonKey) throw new Error("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  return createClient(requireSupabaseUrl(), anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

function getAdminClient(): SupabaseClient {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error(
      "Missing Supabase server environment variables. Set SUPABASE_SERVICE_ROLE_KEY (see .env.example)."
    );
  }
  return createClient(requireSupabaseUrl(), serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function loadLastSignInTimesAction(params: {
  accessToken: string;
  organizationId: string;
}): Promise<LoadLastSignInResult> {
  if (!params.organizationId) {
    logServerError("missing-params");
    return { status: "error", message: "Could not verify your permissions." };
  }

  let caller: SupabaseClient;
  try {
    caller = getCallerClient(params.accessToken);
  } catch (err) {
    logServerError("caller-client-init-failed", err);
    return { status: "error", message: "Could not verify your permissions." };
  }

  const { data: callerData, error: callerAuthError } = await caller.auth.getUser(params.accessToken);
  if (callerAuthError || !callerData.user) {
    logServerError("no-session", callerAuthError);
    return { status: "error", message: "Your session has expired. Please sign in again." };
  }

  // Authorization: queried *as the caller*, so organization_memberships_select's
  // real RLS (is_org_member) decides what's visible — never the service-role
  // client. Only an active admin of this exact organization may proceed.
  const { data: callerMembership, error: callerMembershipError } = await caller
    .from("organization_memberships")
    .select("role, status")
    .eq("organization_id", params.organizationId)
    .eq("profile_id", callerData.user.id)
    .maybeSingle();

  if (callerMembershipError) {
    logServerError("caller-membership-lookup", callerMembershipError);
    return { status: "error", message: "Could not verify your permissions." };
  }
  if (!callerMembership || callerMembership.role !== "admin" || callerMembership.status !== "active") {
    logServerError("role-not-authorized");
    return { status: "error", message: "Only active organization admins can view sign-in activity." };
  }

  // Which profile ids this actually covers — resolved via the caller's own
  // RLS-scoped view of organization_memberships (the same rows
  // loadOrganizationUsers's own client-side query already sees for this
  // org), never a list of ids trusted from the browser.
  const { data: memberRows, error: memberError } = await caller
    .from("organization_memberships")
    .select("profile_id")
    .eq("organization_id", params.organizationId);

  if (memberError) {
    logServerError("member-list-lookup", memberError);
    return { status: "error", message: "Could not load organization members." };
  }

  const profileIds = new Set((memberRows ?? []).map((row) => row.profile_id as string));
  if (profileIds.size === 0) {
    return { status: "success", lastSignInByProfileId: {} };
  }

  let admin: SupabaseClient;
  try {
    admin = getAdminClient();
  } catch (err) {
    logServerError("admin-client-init-failed", err);
    return { status: "error", message: "Server configuration error." };
  }

  // Admin API has no "get users by id list" — page through listUsers and
  // keep only this org's member ids. Fine at this app's scale (a single
  // internal workspace) — same approach invite-user-action.ts's
  // findAuthUserByEmail already uses.
  const lastSignInByProfileId: Record<string, string | null> = {};
  const perPage = 200;
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error || !data) {
      logServerError("list-users", error);
      return { status: "error", message: "Could not load sign-in activity." };
    }
    for (const authUser of data.users) {
      if (profileIds.has(authUser.id)) {
        lastSignInByProfileId[authUser.id] = authUser.last_sign_in_at ?? null;
      }
    }
    if (data.users.length < perPage) break;
  }

  return { status: "success", lastSignInByProfileId };
}
