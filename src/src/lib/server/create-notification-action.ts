"use server";

// Server Action for creating a single in-app notification. `notifications`
// has no INSERT grant/policy for `authenticated` (see
// 20260817000000_add_notifications.sql) — the only way a row is ever
// created is through here, using the service-role client, so a client can
// never fabricate a notification for another profile or attribute one to a
// fake actor. Same caller-client-for-identity / admin-client-for-the-write
// pattern as disable-user-action.ts / invite-user-action.ts.
//
// This intentionally does not re-verify the specific business event (e.g.
// "was this ticket really just assigned") — same scope boundary every other
// Server Action in this app already draws (they re-check identity/org
// membership, not the full calling code path). What it does enforce,
// server-side, unspoofably:
//   - the attributed actor must be whoever is actually calling this
//   - caller and recipient must both be real, active members of the exact
//     organization claimed
//   - a referenced project/ticket must really belong to that organization

import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

const NOTIFICATION_TYPES = [
  "ticket_assigned",
  "comment_mention",
  "ticket_comment",
  "ticket_status_changed",
  "project_member_added",
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export type CreateNotificationActionResult = { status: "success" } | { status: "error"; message: string };

function logServerError(operation: string, detail?: unknown): void {
  if (!detail) {
    console.error(`[create-notification] ${operation}`);
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
  console.error(`[create-notification] ${operation}`, {
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

export interface CreateNotificationActionParams {
  accessToken: string;
  organizationId: string;
  recipientProfileId: string;
  /** Whoever performed the action this notification is about — must match the caller. */
  actorProfileId: string | null;
  type: NotificationType;
  title: string;
  message: string | null;
  projectId: string | null;
  ticketId: string | null;
}

export async function createNotificationAction(
  params: CreateNotificationActionParams
): Promise<CreateNotificationActionResult> {
  if (!NOTIFICATION_TYPES.includes(params.type)) {
    return { status: "error", message: "Invalid notification type." };
  }
  if (!params.organizationId || !params.recipientProfileId || !params.title.trim()) {
    logServerError("missing-params");
    return { status: "error", message: "Missing required notification fields." };
  }

  // The central "don't notify yourself" rule already lives in
  // lib/notifications.ts's createNotification (the only real caller of this
  // action) — repeated here as a harmless no-op, never an error, so this
  // action stays safe even if called directly.
  if (params.actorProfileId && params.actorProfileId === params.recipientProfileId) {
    return { status: "success" };
  }

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

  // Never let the client attribute a notification to an actor other than
  // whoever is actually, verifiably calling this action right now.
  if (params.actorProfileId && params.actorProfileId !== callerData.user.id) {
    logServerError("actor-mismatch");
    return { status: "error", message: "Could not verify the actor for this notification." };
  }

  let admin: SupabaseClient;
  try {
    admin = getAdminClient();
  } catch (err) {
    logServerError("admin-client-init-failed", err);
    return { status: "error", message: "Server configuration error." };
  }

  // Both caller and recipient must be real, active members of the exact
  // organization claimed — checked with the service-role client (bypasses
  // RLS) so it can't be spoofed by a client-controlled organizationId. This
  // is what stops one organization's member from notifying, or fabricating
  // a notification pointed at, a profile in a different organization.
  const { data: memberships, error: membershipError } = await admin
    .from("organization_memberships")
    .select("profile_id")
    .eq("organization_id", params.organizationId)
    .eq("status", "active")
    .in("profile_id", [callerData.user.id, params.recipientProfileId]);

  if (membershipError) {
    logServerError("membership-lookup-failed", membershipError);
    return { status: "error", message: "Could not verify organization membership." };
  }

  const memberIds = new Set((memberships ?? []).map((m) => m.profile_id as string));
  if (!memberIds.has(callerData.user.id) || !memberIds.has(params.recipientProfileId)) {
    logServerError("cross-org-notification-blocked");
    return { status: "error", message: "Recipient is not part of this organization." };
  }

  // A referenced project must really belong to this organization.
  if (params.projectId) {
    const { data: projectRow, error: projectError } = await admin
      .from("projects")
      .select("id")
      .eq("id", params.projectId)
      .eq("organization_id", params.organizationId)
      .maybeSingle<{ id: string }>();
    if (projectError) {
      logServerError("project-lookup-failed", projectError);
      return { status: "error", message: "Could not verify the referenced project." };
    }
    if (!projectRow) return { status: "error", message: "Referenced project not found in this organization." };
  }

  // A referenced ticket must belong to the referenced project (or, if no
  // project was given, to some project of this same organization) — a flat
  // follow-up query rather than an embedded select, same convention
  // lib/tickets.ts already uses to avoid depending on PostgREST's FK
  // relationship cache.
  if (params.ticketId) {
    const { data: ticketRow, error: ticketError } = await admin
      .from("tickets")
      .select("id, project_id")
      .eq("id", params.ticketId)
      .maybeSingle<{ id: string; project_id: string }>();
    if (ticketError) {
      logServerError("ticket-lookup-failed", ticketError);
      return { status: "error", message: "Could not verify the referenced ticket." };
    }
    if (!ticketRow) return { status: "error", message: "Referenced ticket not found." };

    if (params.projectId) {
      if (ticketRow.project_id !== params.projectId) {
        logServerError("ticket-project-mismatch");
        return { status: "error", message: "Referenced ticket does not match the referenced project." };
      }
    } else {
      const { data: ticketProjectRow, error: ticketProjectError } = await admin
        .from("projects")
        .select("id")
        .eq("id", ticketRow.project_id)
        .eq("organization_id", params.organizationId)
        .maybeSingle<{ id: string }>();
      if (ticketProjectError) {
        logServerError("ticket-project-lookup-failed", ticketProjectError);
        return { status: "error", message: "Could not verify the referenced ticket's project." };
      }
      if (!ticketProjectRow) {
        return { status: "error", message: "Referenced ticket's project is not in this organization." };
      }
    }
  }

  const { error: insertError } = await admin.from("notifications").insert({
    organization_id: params.organizationId,
    recipient_profile_id: params.recipientProfileId,
    actor_profile_id: params.actorProfileId,
    type: params.type,
    title: params.title.trim(),
    message: params.message,
    project_id: params.projectId,
    ticket_id: params.ticketId,
  });

  if (insertError) {
    logServerError("notification-insert-failed", insertError);
    return { status: "error", message: insertError.message };
  }

  return { status: "success" };
}
