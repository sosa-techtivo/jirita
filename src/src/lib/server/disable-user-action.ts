"use server";

// Server Action for "Disable User" and "Enable User". organization_memberships
// only has a SELECT grant for the `authenticated` role (see
// 20260708010000_grant_authenticated_membership_read.sql) — there is no
// UPDATE grant, so a direct client-side update always fails with
// "permission denied for table organization_memberships" (42501), a table-
// privilege error Postgres raises before RLS is ever evaluated, regardless
// of what organization_memberships_update's RLS policy would itself allow.
// The fix is not a looser grant/policy for `authenticated` — it's moving
// the write server-side, mirroring invite-user-action.ts's pattern exactly:
// a caller-authenticated client (anon key + the caller's own bearer token)
// for identification + authorization, and the service-role client only for
// the privileged write once that authorization has actually passed.
//
// Disable and Enable are the same operation (flip organization_memberships.
// status to a target value) gated by the same authorization rules, so both
// go through one shared implementation (setMembershipStatusAction) rather
// than two near-identical copies of the caller/admin-client setup and the
// same-organization checks.

import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

export type SetMembershipStatusResult = { status: "success" } | { status: "error"; message: string };
export type DisableUserResult = SetMembershipStatusResult;

function logServerError(operation: string, detail?: unknown): void {
  if (!detail) {
    console.error(`[membership-status] ${operation}`);
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
  console.error(`[membership-status] ${operation}`, {
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

// 'active'/'disabled' are the schema's existing membership_status values
// (see 20260708000000_mvp_schema.sql) — no new column or enum value needed
// for either direction.
type TargetMembershipStatus = "active" | "disabled";

async function setMembershipStatusAction(params: {
  accessToken: string;
  organizationId: string;
  targetProfileId: string;
  targetStatus: TargetMembershipStatus;
}): Promise<SetMembershipStatusResult> {
  const verb = params.targetStatus === "disabled" ? "disabled" : "enabled";

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

  // A user can never disable their own account through this action. Not
  // relevant to enabling — reaching this action already required an active
  // session, which a disabled account (correctly) can't have, so a
  // self-enable can't happen in practice; the check stays scoped to
  // disabling only, per its original requirement.
  if (params.targetStatus === "disabled" && params.targetProfileId === callerData.user.id) {
    return { status: "error", message: "You can't disable your own account." };
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
    return { status: "error", message: `Only active organization admins can ${params.targetStatus === "disabled" ? "disable" : "enable"} users.` };
  }

  // Only now — authorization already proven above — escalate to service
  // role for the privileged write an ordinary member could never do on
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
  // organization/role claim from the browser. This is what stops a caller
  // from disabling/enabling a profile that belongs to a different
  // organization. The membership must already exist — this never inserts
  // one, so an inactive membership is always the same row transitioning
  // back to active, never a new/duplicate row.
  const { data: targetMembership, error: targetLookupError } = await admin
    .from("organization_memberships")
    .select("profile_id, status")
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

  // Only the status column, only this org's row for this profile — never
  // touches profiles, auth.users, or any other organization's membership.
  // No Supabase Auth ban/suspension is applied by the disable side of this
  // action, so there's nothing to revert here on enable either — status is
  // the only thing either direction ever changes.
  const { data: updated, error: updateError } = await admin
    .from("organization_memberships")
    .update({ status: params.targetStatus })
    .eq("organization_id", params.organizationId)
    .eq("profile_id", params.targetProfileId)
    .select("profile_id")
    .maybeSingle();

  if (updateError) {
    logServerError("membership-status-update", updateError);
    return { status: "error", message: `This user couldn't be ${verb}: ${updateError.message}` };
  }
  if (!updated) {
    logServerError("membership-status-no-row-matched");
    return { status: "error", message: "This user couldn't be found." };
  }

  return { status: "success" };
}

export async function disableUserAction(params: {
  accessToken: string;
  organizationId: string;
  targetProfileId: string;
}): Promise<SetMembershipStatusResult> {
  return setMembershipStatusAction({ ...params, targetStatus: "disabled" });
}

export async function enableUserAction(params: {
  accessToken: string;
  organizationId: string;
  targetProfileId: string;
}): Promise<SetMembershipStatusResult> {
  return setMembershipStatusAction({ ...params, targetStatus: "active" });
}
