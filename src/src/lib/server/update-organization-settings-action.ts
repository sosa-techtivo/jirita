"use server";

// Server Action for Settings → General's functional fields (Workspace Name,
// Default Role, Default Weekly Capacity, Active Days) — see
// settings-section-screen.tsx's GeneralContent.
//
// Previously also backed a since-removed Settings → Time Tracking section
// (Show Estimated Hours on Tickets, Require Estimation on New Tickets,
// Hour Rounding, Round Up by Default) — those four fields/params were
// reverted here along with that section: ticket estimate visibility/
// requirement and time-entry rounding are now fixed, non-configurable
// product rules (see lib/tickets.ts's updateTicket and
// lib/time-rounding.ts), not something an Admin sets. The underlying
// `organizations` columns those Settings once wrote
// (show_ticket_estimates/require_ticket_estimate/time_rounding_minutes/
// round_time_up) still exist for compatibility but are no longer read or
// written by this action or anywhere else in the app.
//
// Mirrors edit-user-action.ts's authorization pattern exactly: a caller-
// authenticated client (anon key + the caller's own bearer token) for
// identity + "is this caller an active admin of this exact organization" —
// never the service-role client for that check — and only escalates to
// service role, after that passes, for the write itself. Needed for the
// same reason as every other Server Action in this family: `organizations`
// has no UPDATE grant for the authenticated role (see
// 20260815000000_add_organization_settings_defaults.sql — its own
// `organizations_update` RLS policy exists for completeness/defense in
// depth, same as `organization_memberships_update`, but is unreachable from
// a direct client update without that grant), so a direct client-side
// update always fails with "permission denied for table organizations"
// (42501) — a table-privilege error Postgres raises before RLS is ever
// evaluated.
//
// Scoped to exactly the fields the two migrations above added/reuse —
// never email, slug, id, or any other organizations column.

import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Role } from "@/lib/current-user";

export type UpdateOrganizationSettingsResult =
  | { status: "success" }
  | { status: "error"; message: string };

const ROLE_TO_DB: Record<Role, string> = {
  ADMIN: "admin",
  PROJECT_LEAD: "project_lead",
  MEMBER: "member",
};

const VALID_ROLES: ReadonlySet<string> = new Set<Role>(["ADMIN", "PROJECT_LEAD", "MEMBER"]);

// Same sane ceiling already established for weekly capacity everywhere else
// it's accepted (Invite/Edit User, users-screen.tsx's own MAX_CAPACITY) —
// hours in a week. The floor is stricter here than that existing 0-floor:
// this is a *default*, never meaningfully zero (see the migration's own
// `> 0` CHECK constraint, which this mirrors so a rejection surfaces as a
// friendly message here instead of a raw Postgres constraint-violation
// error from the write below).
const MAX_WEEKLY_CAPACITY = 168;

// ISO weekday numbers this organization's Active Days may be built from —
// 1 = Monday .. 7 = Sunday, same convention the migration's own
// is_valid_active_days enforces in Postgres.
const VALID_WEEKDAYS: ReadonlySet<number> = new Set([1, 2, 3, 4, 5, 6, 7]);

function logServerError(operation: string, detail?: unknown): void {
  if (!detail) {
    console.error(`[update-organization-settings] ${operation}`);
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
  console.error(`[update-organization-settings] ${operation}`, {
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

// Non-empty, no duplicates, every value a real ISO weekday (1–7) — the same
// rule is_valid_active_days enforces in Postgres; validated here first so an
// invalid array is rejected with a friendly message instead of surfacing a
// raw constraint-violation error from the write below.
function isValidActiveDays(days: number[]): boolean {
  if (!Array.isArray(days) || days.length === 0) return false;
  const seen = new Set<number>();
  for (const day of days) {
    if (!Number.isInteger(day) || !VALID_WEEKDAYS.has(day) || seen.has(day)) return false;
    seen.add(day);
  }
  return true;
}

export async function updateOrganizationSettingsAction(params: {
  accessToken: string;
  organizationId: string;
  name: string;
  defaultRole: Role;
  defaultWeeklyCapacity: number;
  activeDays: number[];
}): Promise<UpdateOrganizationSettingsResult> {
  const name = params.name.trim();

  if (!name) {
    return { status: "error", message: "Workspace name is required." };
  }
  // Never trusts the role string the client sent beyond checking it's one
  // of the three real values — no arbitrary role can reach the write below.
  if (!VALID_ROLES.has(params.defaultRole)) {
    logServerError("invalid-default-role", { message: String(params.defaultRole) });
    return { status: "error", message: "Choose a valid default role." };
  }
  if (
    !Number.isFinite(params.defaultWeeklyCapacity) ||
    params.defaultWeeklyCapacity <= 0 ||
    params.defaultWeeklyCapacity > MAX_WEEKLY_CAPACITY
  ) {
    return { status: "error", message: "Default weekly capacity must be greater than 0 and no more than 168." };
  }
  if (!isValidActiveDays(params.activeDays)) {
    return {
      status: "error",
      message: "Active Days must be a non-empty list of unique weekdays (Monday–Sunday, no duplicates).",
    };
  }
  if (!params.organizationId) {
    logServerError("missing-organization-id");
    return { status: "error", message: "Could not verify your permissions." };
  }

  const defaultWeeklyCapacity = Math.round(params.defaultWeeklyCapacity);
  const activeDays = [...params.activeDays].sort((a, b) => a - b);

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
  // client. Only an active admin of *this exact* organization may proceed;
  // this is also what stops a caller from ever reaching the write below for
  // an organizationId they don't belong to (or belong to as a non-admin) —
  // no separate "does this org belong to the caller" check is needed
  // because this query itself is scoped to (organizationId, caller's own
  // profile id).
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
    return { status: "error", message: "Only active organization admins can update workspace settings." };
  }

  // Only now — authorization already proven above — escalate to service
  // role for the write `authenticated` has no table-level UPDATE grant for.
  let admin: SupabaseClient;
  try {
    admin = getAdminClient();
  } catch (err) {
    logServerError("admin-client-init-failed", err);
    return { status: "error", message: "Server configuration error." };
  }

  const { data: updated, error: updateError } = await admin
    .from("organizations")
    .update({
      name,
      default_role: ROLE_TO_DB[params.defaultRole],
      default_weekly_capacity: defaultWeeklyCapacity,
      active_days: activeDays,
    })
    .eq("id", params.organizationId)
    .select("id")
    .maybeSingle();

  if (updateError) {
    logServerError("organizations-update", updateError);
    return { status: "error", message: `Could not save changes: ${updateError.message}` };
  }
  if (!updated) {
    logServerError("organizations-update-no-row-matched");
    return { status: "error", message: "This organization couldn't be found." };
  }

  return { status: "success" };
}
