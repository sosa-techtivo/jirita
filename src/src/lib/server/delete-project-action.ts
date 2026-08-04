"use server";

// Server Action for "Delete Project" (Project Settings → Danger Zone).
// Permanent removal, never soft-delete — Archive (status="active"/
// "archived", a plain client-side update already governed by RLS) is a
// completely separate, untouched feature. Same two-client pattern as the
// closest existing precedent for a real, permanent, Admin-only deletion,
// deleteUserAction (lib/server/delete-user-action.ts): a caller-
// authenticated client (anon key + the caller's own bearer token) for
// identity + role verification, and the service-role client only for the
// privileged reads/writes once that's actually passed.
//
// Audited beforehand (before writing any of this) against every migration
// referencing projects(id): project_memberships, tickets — and everything
// that in turn references tickets(id): ticket_comments,
// ticket_time_entries, ticket_attachments, ticket_relations,
// ticket_activity — project_notes (and project_note_activity),
// notifications, project_repository_connections, and per-project
// ticket_statuses. Every one of them is `on delete cascade`, with no
// exception. The two real cascade-ordering bugs that used to break a
// multi-level cascade exactly like this one (log_note_deleted inserting
// into project_note_activity after its own parent project was already
// gone; ticket_relations_log_removed inserting into ticket_activity after
// its own parent ticket was already gone — see 20260903000000/
// 20260904000000) were already found and fixed in an earlier task, so a
// single `delete from projects where id = ...` is genuinely sufficient —
// no manual per-table delete is reimplemented here.
//
// GitHub: `project_repository_connections` (the real OAuth token row) has
// its own `project_id ... on delete cascade`, so it disappears with the
// project — confirmed by reading 20260821000000 directly, not assumed.
// `projects.repository_provider`/`repository_url` are plain columns on
// the row being deleted, gone with it. The ticket "Development" section
// (branches/commits/PRs) has no local cache table at all — it's fetched
// live from the GitHub API on every request (ticket-development-
// actions.ts) using project_repository_connections' own token, so once
// that row is gone there is nothing left to query. No GitHub-specific
// cleanup code is needed or added here.
//
// The one real gap cascade cannot close: physical attachment files in the
// private `ticket-attachments` Storage bucket. Their metadata rows
// (ticket_attachments) cascade away with the project, but the actual
// Storage objects do not — Postgres's cascade has no reach into Supabase
// Storage at all. Those storage_path values are collected *before* the
// delete (the metadata that names them won't exist to query afterward)
// and removed from Storage once the delete itself has succeeded,
// best-effort — mirrors deleteTicketAttachment's own established handling
// of a Storage cleanup error once the authoritative row is already gone:
// logged, never allowed to turn an otherwise-successful deletion into a
// reported failure.

import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

export type DeleteProjectResult = { status: "success" } | { status: "error"; message: string };

const ATTACHMENTS_BUCKET = "ticket-attachments";

function logServerError(operation: string, detail?: unknown): void {
  if (!detail) {
    console.error(`[delete-project] ${operation}`);
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
  console.error(`[delete-project] ${operation}`, {
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

export async function deleteProjectAction(params: {
  accessToken: string;
  organizationId: string;
  projectId: string;
}): Promise<DeleteProjectResult> {
  const { organizationId, projectId } = params;

  if (!organizationId || !projectId) {
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
  // real RLS decides what's visible — never the service-role client.
  // Deliberately stricter than projects_delete's own RLS policy (which
  // also allows role='project_lead', is_org_admin_or_lead) — this feature's
  // own requirement is Admin only, enforced here at the application layer
  // without touching that policy.
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
    return { status: "error", message: "Only active organization admins can delete a project." };
  }

  // Only now — authorization already proven above — escalate to service
  // role for the privileged reads/writes an ordinary member could never do.
  let admin: SupabaseClient;
  try {
    admin = getAdminClient();
  } catch (err) {
    logServerError("admin-client-init-failed", err);
    return { status: "error", message: "Server configuration error." };
  }

  // Confirm the project actually exists and belongs to *this* organization
  // using the service-role client (bypasses RLS) — never trust a project
  // id claim from the browser.
  const { data: project, error: projectLookupError } = await admin
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (projectLookupError) {
    logServerError("project-lookup", projectLookupError);
    return { status: "error", message: "Could not verify this project." };
  }
  if (!project) {
    logServerError("project-not-found");
    return { status: "error", message: "This project no longer exists." };
  }

  // Collect physical attachment paths *before* deleting — once the
  // project row is gone, cascade has already removed the metadata rows
  // that would tell us where they were.
  let attachmentPaths: string[] = [];
  try {
    const { data: ticketRows, error: ticketsError } = await admin.from("tickets").select("id").eq("project_id", projectId);
    if (ticketsError) throw ticketsError;
    const ticketIds = (ticketRows ?? []).map((t) => t.id as string);
    if (ticketIds.length > 0) {
      const { data: attachmentRows, error: attachmentsError } = await admin
        .from("ticket_attachments")
        .select("storage_path")
        .in("ticket_id", ticketIds);
      if (attachmentsError) throw attachmentsError;
      attachmentPaths = (attachmentRows ?? []).map((a) => a.storage_path as string);
    }
  } catch (err) {
    logServerError("attachment-paths-lookup", err);
    return { status: "error", message: "Could not verify this project's attachments. Please try again." };
  }

  // ── The only real write: one delete, cascade does the rest ─────────────
  const { error: deleteError } = await admin.from("projects").delete().eq("id", projectId);
  if (deleteError) {
    logServerError("project-delete", deleteError);
    return { status: "error", message: `This project couldn't be deleted: ${deleteError.message}` };
  }

  if (attachmentPaths.length > 0) {
    const { error: storageError } = await admin.storage.from(ATTACHMENTS_BUCKET).remove(attachmentPaths);
    if (storageError) {
      logServerError("storage-cleanup", storageError);
      // The project and every DB row referencing it are already gone —
      // a best-effort Storage cleanup failure is logged, not reported as
      // an overall failure of the deletion itself.
    }
  }

  return { status: "success" };
}
