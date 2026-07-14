"use server";

// Server Action for "Edit User" (Users → row menu → Edit User, an admin
// editing someone *else's* name/role/weekly capacity). Mirrors
// disable-user-action.ts's authorization pattern exactly: a caller-
// authenticated client (anon key + the caller's own bearer token) for
// identity + "is this caller an active admin of this org" — never the
// service-role client — and only escalates to service role, after that
// passes, for the privileged writes an ordinary member could never do on
// someone else's behalf. Existing for the same reason as every other
// Server Action in this family (Disable/Enable, Invite, Reset Password
// link): organization_memberships has no UPDATE grant for the
// authenticated role (see
// 20260708010000_grant_authenticated_membership_read.sql), so a direct
// client-side update always fails with "permission denied for table
// organization_memberships" (42501) — a table-privilege error Postgres
// raises before RLS is ever evaluated. profiles has the same gap for a
// *different* person's row: profiles_update_self (self-service updates)
// only ever grants a user's own row, never an admin editing someone else's.
//
// Two separate writes (profiles, then organization_memberships) — not a
// real DB transaction, since none exists in this project for a multi-table
// write and building one would be new architecture for just this action.
// Same honest-partial-failure pattern already established by
// finalizeInviteRecords in invite-user-action.ts: if the second write fails
// after the first succeeds, this returns an error that says so, never a
// bare "success" that would hide a partial update.

import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Role } from "@/lib/current-user";

export type EditUserResult = { status: "success" } | { status: "error"; message: string };

const ROLE_TO_DB: Record<Role, string> = {
  ADMIN: "admin",
  PROJECT_LEAD: "project_lead",
  MEMBER: "member",
};

const VALID_ROLES: ReadonlySet<string> = new Set<Role>(["ADMIN", "PROJECT_LEAD", "MEMBER"]);

function logServerError(operation: string, detail?: unknown): void {
  if (!detail) {
    console.error(`[edit-user] ${operation}`);
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
  console.error(`[edit-user] ${operation}`, {
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

export async function editUserAction(params: {
  accessToken: string;
  organizationId: string;
  targetProfileId: string;
  firstName: string;
  lastName: string;
  role: Role;
  weeklyCapacity: number;
}): Promise<EditUserResult> {
  const firstName = params.firstName.trim();
  const lastName = params.lastName.trim();
  // Same clamp as invite-user-action.ts/users-screen.tsx's MAX_CAPACITY —
  // 168 is the number of hours in a week, the existing ceiling used
  // everywhere else weekly capacity is accepted.
  const weeklyCapacity = Math.min(168, Math.max(0, Math.round(params.weeklyCapacity)));

  if (!firstName || !lastName) {
    return { status: "error", message: "First name and last name are required." };
  }
  // Never trusts the role string the client sent beyond checking it's one
  // of the three real values — no arbitrary role can reach the write below.
  if (!VALID_ROLES.has(params.role)) {
    logServerError("invalid-role", { message: String(params.role) });
    return { status: "error", message: "Choose a valid role." };
  }
  if (!params.organizationId || !params.targetProfileId) {
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

  // Identity: who is actually calling this, independent of anything the
  // client claims.
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
    return { status: "error", message: "Only active organization admins can edit users." };
  }

  // Only now — authorization already proven above — escalate to service
  // role for the privileged writes an ordinary member could never do on
  // someone else's behalf.
  let admin: SupabaseClient;
  try {
    admin = getAdminClient();
  } catch (err) {
    logServerError("admin-client-init-failed", err);
    return { status: "error", message: "Server configuration error." };
  }

  // Confirm the target actually belongs to *this* organization using the
  // service-role client (which bypasses RLS) — never trust an
  // organization claim from the browser. This is what stops a caller from
  // editing a profile that belongs to a different organization.
  const { data: targetMembership, error: targetLookupError } = await admin
    .from("organization_memberships")
    .select("profile_id")
    .eq("organization_id", params.organizationId)
    .eq("profile_id", params.targetProfileId)
    .maybeSingle();

  if (targetLookupError) {
    logServerError("target-membership-lookup", targetLookupError);
    return { status: "error", message: "Could not verify this user's membership." };
  }
  if (!targetMembership) {
    logServerError("target-not-in-org");
    return { status: "error", message: "This user does not belong to your organization." };
  }

  // profiles: first/last name only — never email, never any other column.
  const { data: profileUpdated, error: profileError } = await admin
    .from("profiles")
    .update({ first_name: firstName, last_name: lastName })
    .eq("id", params.targetProfileId)
    .select("id")
    .maybeSingle();

  if (profileError) {
    logServerError("profile-update", profileError);
    return { status: "error", message: `Could not save changes: ${profileError.message}` };
  }
  if (!profileUpdated) {
    logServerError("profile-update-no-row-matched");
    return { status: "error", message: "This user's profile couldn't be found." };
  }

  // organization_memberships: role + weekly_capacity only, scoped to this
  // exact org + profile — never status (Disable/Enable's own job, untouched
  // here), never a different organization's row.
  const { data: membershipUpdated, error: membershipError } = await admin
    .from("organization_memberships")
    .update({ role: ROLE_TO_DB[params.role], weekly_capacity: weeklyCapacity })
    .eq("organization_id", params.organizationId)
    .eq("profile_id", params.targetProfileId)
    .select("profile_id")
    .maybeSingle();

  if (membershipError) {
    logServerError("membership-update", membershipError);
    return {
      status: "error",
      message: `Name saved, but role and weekly capacity couldn't be saved: ${membershipError.message}`,
    };
  }
  if (!membershipUpdated) {
    logServerError("membership-update-no-row-matched");
    return { status: "error", message: "Name saved, but this user's membership couldn't be found." };
  }

  return { status: "success" };
}
