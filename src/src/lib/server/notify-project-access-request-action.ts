"use server";

// Server Action — resolves a project's real Leads and fans out a
// project_access_requested notification to each, right after a real
// access request row has already been inserted client-side
// (lib/projects.ts's requestProjectAccess, the only real caller). The
// request itself is the source of truth and is never rolled back by
// anything that happens here.
//
// Why this needs to be server-side at all: project_memberships_select RLS
// (can_view_project, 20260708000000_mvp_schema.sql) only lets a caller see
// a project's memberships if they're already an org admin or already a
// member of that exact project. The person filing an access request is,
// by definition, neither of those for this project — so a plain
// client-side query for "who leads this project" silently returns nothing
// under RLS (no error, just an empty result), and no notification was
// ever created. This was a real production bug: JIR-47's access-request
// flow created the request but never notified the Lead. Same
// caller-client-for-identity / admin-client-for-the-privileged-read
// pattern as every other Server Action in this directory (e.g.
// create-notification-action.ts, invite-user-action.ts).

import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createNotificationAction } from "./create-notification-action";

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

function logServerError(operation: string, detail?: unknown): void {
  const message = detail instanceof Error ? detail.message : detail;
  console.error(`[notify-project-access-request] ${operation}`, message ?? "");
}

export interface NotifyProjectAccessRequestParams {
  accessToken: string;
  organizationId: string;
  projectId: string;
  projectName: string;
}

export type NotifyProjectAccessRequestResult = { status: "success" } | { status: "error"; message: string };

// lib/projects.ts already treats this as fire-and-forget (never blocks or
// can fail the access-request insert that already succeeded) — but
// everything inside here is fully awaited, so it either genuinely
// completes the fan-out or genuinely fails; it never leaves it half-sent.
export async function notifyProjectAccessRequestAction(
  params: NotifyProjectAccessRequestParams
): Promise<NotifyProjectAccessRequestResult> {
  let caller: SupabaseClient;
  try {
    caller = getCallerClient(params.accessToken);
  } catch (err) {
    logServerError("caller-client-init-failed", err);
    return { status: "error", message: "Could not verify your session." };
  }

  const { data: callerData, error: callerAuthError } = await caller.auth.getUser(params.accessToken);
  if (callerAuthError || !callerData.user) {
    logServerError("no-session", callerAuthError);
    return { status: "error", message: "Your session has expired. Please sign in again." };
  }
  const requesterProfileId = callerData.user.id;

  let admin: SupabaseClient;
  try {
    admin = getAdminClient();
  } catch (err) {
    logServerError("admin-client-init-failed", err);
    return { status: "error", message: "Server configuration error." };
  }

  // The one read this action exists for — bypasses project_memberships_select
  // RLS via the service-role client, since the requester (by definition)
  // fails can_view_project for a project they're not staffed on yet.
  const { data: leadRows, error: leadError } = await admin
    .from("project_memberships")
    .select("profile_id")
    .eq("project_id", params.projectId)
    .eq("project_role", "lead")
    .returns<{ profile_id: string }[]>();

  if (leadError) {
    logServerError("lead-lookup-failed", leadError);
    return { status: "error", message: "Could not resolve this project's Lead." };
  }

  const { data: requesterProfile } = await admin
    .from("profiles")
    .select("first_name, last_name")
    .eq("id", requesterProfileId)
    .maybeSingle<{ first_name: string | null; last_name: string | null }>();
  const requesterName = requesterProfile
    ? [requesterProfile.first_name, requesterProfile.last_name].filter(Boolean).join(" ") || "Unnamed"
    : "Someone";

  // createNotificationAction re-verifies caller identity/org membership
  // itself (using this same accessToken) and already handles the insert +
  // immediate-email dispatch for project_access_requested — reused as-is,
  // once per Lead, rather than re-implemented here.
  for (const lead of leadRows ?? []) {
    const result = await createNotificationAction({
      accessToken: params.accessToken,
      organizationId: params.organizationId,
      recipientProfileId: lead.profile_id,
      actorProfileId: requesterProfileId,
      type: "project_access_requested",
      title: `${requesterName} requested to join ${params.projectName}`,
      message: null,
      projectId: params.projectId,
      ticketId: null,
    });
    if (result.status === "error") logServerError("create-notification-failed", result.message);
  }

  return { status: "success" };
}
