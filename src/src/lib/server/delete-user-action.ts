"use server";

// Server Action for "Delete User" (Users → row menu, any status). Permanent
// removal, never soft-delete. Same two-client pattern as every other
// privileged write in this app (disable-user-action.ts, invite-user-action.ts):
// a caller-authenticated client (anon key + the caller's own bearer token)
// for identification + authorization, and the service-role client only for
// the privileged reads/writes once that authorization has actually passed.
//
// Eligibility is re-verified here against real, current Supabase data —
// never trusted from the browser, which may be looking at a stale list.
// Two conditions get a specific, counted message (assigned tickets, project
// team memberships — the two things this app models as "current work"), per
// the exact wording requested. Beyond those, this also checks every other
// column in the schema that references profiles(id) (ticket_comments,
// ticket_time_entries, ticket_attachments, ticket_relations, ticket_activity,
// tickets.created_by, project_notes, project_note_activity,
// projects.created_by/owner_profile_id, project_repository_connections,
// notifications.actor_profile_id) — most of these are `on delete set null`
// in the schema, which would silently null out attribution on records that
// can belong to *other* users' tickets/projects/notes if this profile were
// deleted while any such row exists. Rather than let that happen silently,
// deletion is refused with a clear error and nothing is touched.
//
// Deletion order matters: organization_memberships, then profiles, and only
// last — once both of those app-side deletes have actually succeeded —
// the Supabase Auth identity itself. profiles.id references auth.users(id)
// on delete cascade, so deleting the Auth user would eventually remove the
// profiles/organization_memberships rows anyway, but doing the app-side
// deletes explicitly first (rather than relying on that cascade) means a
// failure at either step stops before Auth is ever touched — Auth deletion
// only happens once there's nothing left in this app's own tables to
// corrupt. If the Auth deletion itself fails, this returns an explicit error
// and never reports success, even though the app-side rows are already gone
// (the clearest state this architecture can guarantee without a
// cross-service transaction).

import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

export type DeleteUserResult = { status: "success" } | { status: "error"; message: string };

function logServerError(operation: string, detail?: unknown): void {
  if (!detail) {
    console.error(`[delete-user] ${operation}`);
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
  console.error(`[delete-user] ${operation}`, {
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

// Single-column equality count — used for every "does any row in this table
// reference this profile" check below where the table has no other useful
// scoping column.
async function countWhereEqual(
  admin: SupabaseClient,
  table: string,
  column: string,
  value: string
): Promise<number> {
  const { count, error } = await admin.from(table).select("id", { count: "exact", head: true }).eq(column, value);
  if (error) {
    logServerError(`count:${table}.${column}`, error);
    throw new Error(`Could not check ${table}.`);
  }
  return count ?? 0;
}

async function countWhereIn(
  admin: SupabaseClient,
  table: string,
  column: string,
  value: string,
  inColumn: string,
  inValues: string[]
): Promise<number> {
  if (inValues.length === 0) return 0;
  const { count, error } = await admin
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq(column, value)
    .in(inColumn, inValues);
  if (error) {
    logServerError(`count:${table}.${column}`, error);
    throw new Error(`Could not check ${table}.`);
  }
  return count ?? 0;
}

export async function deleteUserAction(params: {
  accessToken: string;
  organizationId: string;
  targetProfileId: string;
}): Promise<DeleteUserResult> {
  const { organizationId, targetProfileId } = params;

  if (!organizationId || !targetProfileId) {
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

  // A user can never delete their own account through this action.
  if (targetProfileId === callerData.user.id) {
    return { status: "error", message: "You can't delete your own account." };
  }

  // Authorization: queried *as the caller*, so organization_memberships_select's
  // real RLS (is_org_member) decides what's visible — never the service-role
  // client. Only an active admin of this exact organization may proceed.
  const { data: callerMembership, error: callerMembershipError } = await caller
    .from("organization_memberships")
    .select("role, status")
    .eq("organization_id", organizationId)
    .eq("profile_id", callerData.user.id)
    .maybeSingle();

  if (callerMembershipError) {
    logServerError("caller-membership-lookup", callerMembershipError);
    return { status: "error", message: "Could not verify your permissions." };
  }
  if (!callerMembership || callerMembership.role !== "admin" || callerMembership.status !== "active") {
    logServerError("role-not-authorized");
    return { status: "error", message: "Only active organization admins can delete users." };
  }

  // Only now — authorization already proven above — escalate to service
  // role for the privileged reads/writes an ordinary member could never do
  // on someone else's behalf.
  let admin: SupabaseClient;
  try {
    admin = getAdminClient();
  } catch (err) {
    logServerError("admin-client-init-failed", err);
    return { status: "error", message: "Server configuration error." };
  }

  // Confirm the target actually belongs to *this* organization using the
  // service-role client (which bypasses RLS) — never trust an organization
  // claim from the browser.
  const { data: targetMembership, error: targetLookupError } = await admin
    .from("organization_memberships")
    .select("profile_id")
    .eq("organization_id", organizationId)
    .eq("profile_id", targetProfileId)
    .maybeSingle();

  if (targetLookupError) {
    logServerError("target-membership-lookup", targetLookupError);
    return { status: "error", message: "Could not verify this user's membership." };
  }
  if (!targetMembership) {
    logServerError("target-not-in-org");
    return { status: "error", message: "This user does not belong to your organization." };
  }

  // This org's project ids — scopes the two counted eligibility checks below
  // to projects that actually belong to this organization, rather than a
  // bare profile-id match that would (in a future multi-org world) also
  // count another organization's tickets/teams.
  const { data: orgProjectRows, error: orgProjectsError } = await admin
    .from("projects")
    .select("id")
    .eq("organization_id", organizationId);

  if (orgProjectsError) {
    logServerError("org-projects-lookup", orgProjectsError);
    return { status: "error", message: "Could not verify this user's eligibility for deletion. Please try again." };
  }
  const orgProjectIds = (orgProjectRows ?? []).map((p) => p.id as string);

  try {
    // ── The two named eligibility conditions, each with its own counted,
    // user-facing reason — reported together if both apply. ────────────────
    const [assignedTicketsCount, projectMembershipsCount] = await Promise.all([
      countWhereIn(admin, "tickets", "assignee_profile_id", targetProfileId, "project_id", orgProjectIds),
      countWhereIn(admin, "project_memberships", "profile_id", targetProfileId, "project_id", orgProjectIds),
    ]);

    const reasons: string[] = [];
    if (assignedTicketsCount > 0) {
      reasons.push(
        `This user cannot be deleted because they have ${assignedTicketsCount} assigned ticket${assignedTicketsCount === 1 ? "" : "s"}.`
      );
    }
    if (projectMembershipsCount > 0) {
      reasons.push(
        `This user cannot be deleted because they belong to ${projectMembershipsCount} project team${projectMembershipsCount === 1 ? "" : "s"}.`
      );
    }
    if (reasons.length > 0) {
      return { status: "error", message: reasons.join(" ") };
    }

    // ── Everything else in the schema that references profiles(id) and
    // isn't already covered above. Single-tenant today (see PROJECT_STATUS.md),
    // so a bare profile-id match is equivalent to organization-scoping for
    // these; organization_id is still applied wherever the column exists
    // directly, as defense in depth. Any single row found here means
    // deleting this profile would silently corrupt (null out the author/
    // actor/creator of) an operational record via the schema's own
    // `on delete set null`/`on delete restrict` — so it blocks deletion
    // entirely rather than letting that happen. ────────────────────────────
    const otherRecordCounts = await Promise.all([
      countWhereEqual(admin, "tickets", "created_by", targetProfileId),
      countWhereEqual(admin, "ticket_comments", "author_profile_id", targetProfileId),
      countWhereEqual(admin, "ticket_time_entries", "logged_by", targetProfileId),
      countWhereEqual(admin, "ticket_attachments", "uploaded_by", targetProfileId),
      countWhereEqual(admin, "ticket_relations", "created_by", targetProfileId),
      countWhereEqual(admin, "ticket_activity", "actor_profile_id", targetProfileId),
      countWhereEqual(admin, "project_notes", "created_by", targetProfileId),
      countWhereEqual(admin, "project_notes", "updated_by", targetProfileId),
      countWhereEqual(admin, "project_note_activity", "actor_profile_id", targetProfileId),
      countWhereIn(admin, "projects", "created_by", targetProfileId, "organization_id", [organizationId]),
      countWhereIn(admin, "projects", "owner_profile_id", targetProfileId, "organization_id", [organizationId]),
      countWhereIn(
        admin,
        "project_repository_connections",
        "connected_by_profile_id",
        targetProfileId,
        "organization_id",
        [organizationId]
      ),
      countWhereIn(admin, "notifications", "actor_profile_id", targetProfileId, "organization_id", [organizationId]),
    ]);

    if (otherRecordCounts.some((count) => count > 0)) {
      logServerError("blocked-by-other-operational-records");
      return {
        status: "error",
        message:
          "This user cannot be deleted because they have other operational records (comments, time entries, attachments, activity history, or notes) linked to their account.",
      };
    }
  } catch (err) {
    logServerError("eligibility-check-failed", err);
    return { status: "error", message: "Could not verify this user's eligibility for deletion. Please try again." };
  }

  // ── Eligible. Application records first, Auth identity last. ─────────────

  const { error: membershipDeleteError } = await admin
    .from("organization_memberships")
    .delete()
    .eq("organization_id", organizationId)
    .eq("profile_id", targetProfileId);

  if (membershipDeleteError) {
    logServerError("membership-delete", membershipDeleteError);
    return { status: "error", message: `This user couldn't be deleted: ${membershipDeleteError.message}` };
  }

  const { error: profileDeleteError } = await admin.from("profiles").delete().eq("id", targetProfileId);

  if (profileDeleteError) {
    logServerError("profile-delete", profileDeleteError);
    return { status: "error", message: `This user couldn't be deleted: ${profileDeleteError.message}` };
  }

  // Last step, on purpose (see header comment) — only reached once both
  // app-side deletes above have actually succeeded.
  const { error: authDeleteError } = await admin.auth.admin.deleteUser(targetProfileId);

  if (authDeleteError) {
    logServerError("auth-user-delete", authDeleteError);
    return {
      status: "error",
      message: "This user's records were removed, but their account couldn't be fully deleted. Please contact support.",
    };
  }

  return { status: "success" };
}
