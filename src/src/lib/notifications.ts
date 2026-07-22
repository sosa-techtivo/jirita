// The single, real data layer for JIRITA's in-app notifications — the
// global bell dropdown and the /notifications page both read exclusively
// through the functions below, and every write path that creates a
// notification (ticket assignment, comment-on-assigned-ticket, status
// change, added-to-project — see lib/tickets.ts / lib/projects.ts) goes
// through createNotification, never a direct insert. No email, push,
// desktop notifications, cron, queues, watchers, or Realtime — this is a
// plain table read on demand and written via a service-role Server Action
// (create-notification-action.ts), per that migration's own RLS: a client
// can only ever read/mark-as-read its own rows.

import { getSupabaseBrowserClient } from "./supabase-client";
import { resolveAvatarUrl } from "./membership";
import { FALLBACK_AVATAR } from "./current-user";
import { createNotificationAction, type NotificationType } from "./server/create-notification-action";

// `createdAt` below is deliberately the raw ISO timestamp, not a
// pre-formatted "3 minutes ago" string — this file has no dependency on
// lib/tickets.ts (which itself imports createNotification from here; a
// reverse import would be a real circular dependency, not just a style
// choice). Callers (notification-bell.tsx, notifications-screen.tsx)
// import tickets.ts's own already-exported `formatRelativeTime` directly —
// reusing the exact same relative-time buckets every other real timestamp
// in this app already uses, just from the component layer instead of here.

export type { NotificationType };

function logDev(...args: unknown[]): void {
  if (process.env.NODE_ENV !== "production") console.warn("[notifications]", ...args);
}

// Dispatched only after a notification is actually, successfully created —
// lets the bell/page refresh immediately when the recipient is the current
// browser session itself, without waiting for the next focus/visibility
// regain. In practice every real event below skips self-notification (see
// createNotification's own guard), so this fires for a different session's
// own action being reflected back to it within the same tab — kept generic
// rather than assuming it can never matter.
const NOTIFICATION_CREATED_EVENT = "jirita:notification-created";

export function onNotificationCreated(handler: (recipientProfileId: string) => void): () => void {
  if (typeof window === "undefined") return () => {};
  function listener(e: Event) {
    const detail = (e as CustomEvent<{ recipientProfileId: string }>).detail;
    if (detail?.recipientProfileId) handler(detail.recipientProfileId);
  }
  window.addEventListener(NOTIFICATION_CREATED_EVENT, listener);
  return () => window.removeEventListener(NOTIFICATION_CREATED_EVENT, listener);
}

// ── Shapes ───────────────────────────────────────────────────────────────

export interface NotificationActor {
  profileId: string;
  name: string;
  avatar: string;
}

export interface NotificationProject {
  id: string;
  slug: string;
  name: string;
}

export interface NotificationTicket {
  id: string;
  code: string;
  title: string;
}

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string | null;
  readAt: string | null;
  createdAt: string;
  actor: NotificationActor | null;
  project: NotificationProject | null;
  ticket: NotificationTicket | null;
}

// ── Create ───────────────────────────────────────────────────────────────

export interface CreateNotificationParams {
  organizationId: string;
  /** The profile this notification is for. Never resolved by name/email/avatar. */
  recipientProfileId: string;
  /** Whoever performed the action — null only for a system-generated event (none exist yet). */
  actorProfileId: string | null;
  type: NotificationType;
  title: string;
  message?: string | null;
  projectId?: string | null;
  ticketId?: string | null;
}

// The one, single place a notification is ever created from the client.
// Central home for the one rule every event type shares: never notify a
// profile about its own action. A failure here (missing session, rejected
// by the server action) is logged and swallowed — it must never revert or
// block the real write (ticket update, comment, membership add) that
// triggered it.
export async function createNotification(params: CreateNotificationParams): Promise<void> {
  if (!params.recipientProfileId) return;
  if (params.actorProfileId && params.actorProfileId === params.recipientProfileId) return;

  const supabase = getSupabaseBrowserClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    logDev("skipped: no active session");
    return;
  }

  const result = await createNotificationAction({
    accessToken: session.access_token,
    organizationId: params.organizationId,
    recipientProfileId: params.recipientProfileId,
    actorProfileId: params.actorProfileId,
    type: params.type,
    title: params.title,
    message: params.message ?? null,
    projectId: params.projectId ?? null,
    ticketId: params.ticketId ?? null,
  });

  if (result.status === "error") {
    logDev("create failed", result.message);
    return;
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(NOTIFICATION_CREATED_EVENT, { detail: { recipientProfileId: params.recipientProfileId } })
    );
  }
}

// ── Read ─────────────────────────────────────────────────────────────────

interface NotificationRow {
  id: string;
  type: string;
  title: string;
  message: string | null;
  read_at: string | null;
  created_at: string;
  actor_profile_id: string | null;
  project_id: string | null;
  ticket_id: string | null;
}

interface ProfileRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  updated_at: string;
}

interface ProjectRow {
  id: string;
  slug: string;
  name: string;
  project_code: string;
}

interface TicketRow {
  id: string;
  ticket_number: number;
  title: string;
  project_id: string;
}

type SupabaseClient = ReturnType<typeof getSupabaseBrowserClient>;

async function loadProfilesByIds(supabase: SupabaseClient, ids: string[]): Promise<Map<string, ProfileRow>> {
  const byId = new Map<string, ProfileRow>();
  if (ids.length === 0) return byId;
  const { data, error } = await supabase
    .from("profiles")
    .select("id, first_name, last_name, avatar_url, updated_at")
    .in("id", ids)
    .returns<ProfileRow[]>();
  if (error) {
    logDev("profiles lookup failed", error);
    return byId;
  }
  for (const row of data ?? []) byId.set(row.id, row);
  return byId;
}

function resolveProfileName(row: ProfileRow | undefined): string {
  if (!row) return "Unknown";
  return [row.first_name, row.last_name].filter(Boolean).join(" ") || "Unnamed";
}

// Batched actor/project/ticket resolution shared by every read function
// below — never one query per notification row.
async function hydrateNotifications(supabase: SupabaseClient, rows: NotificationRow[]): Promise<AppNotification[]> {
  if (rows.length === 0) return [];

  const actorIds = Array.from(new Set(rows.map((r) => r.actor_profile_id).filter((id): id is string => Boolean(id))));
  const ticketIds = Array.from(new Set(rows.map((r) => r.ticket_id).filter((id): id is string => Boolean(id))));

  const [actorsById, ticketRowsResult] = await Promise.all([
    loadProfilesByIds(supabase, actorIds),
    ticketIds.length > 0
      ? supabase.from("tickets").select("id, ticket_number, title, project_id").in("id", ticketIds).returns<TicketRow[]>()
      : Promise.resolve({ data: [] as TicketRow[], error: null }),
  ]);

  if (ticketRowsResult.error) logDev("tickets lookup failed", ticketRowsResult.error);
  const ticketsById = new Map((ticketRowsResult.data ?? []).map((t) => [t.id, t]));

  const projectIds = Array.from(
    new Set([
      ...rows.map((r) => r.project_id).filter((id): id is string => Boolean(id)),
      ...Array.from(ticketsById.values()).map((t) => t.project_id),
    ])
  );

  const projectsById = new Map<string, ProjectRow>();
  if (projectIds.length > 0) {
    const { data: projectRows, error: projectsError } = await supabase
      .from("projects")
      .select("id, slug, name, project_code")
      .in("id", projectIds)
      .returns<ProjectRow[]>();
    if (projectsError) {
      logDev("projects lookup failed", projectsError);
    } else {
      for (const row of projectRows ?? []) projectsById.set(row.id, row);
    }
  }

  return rows.map((row) => {
    const ticket = row.ticket_id ? ticketsById.get(row.ticket_id) : undefined;
    const project = ticket ? projectsById.get(ticket.project_id) : row.project_id ? projectsById.get(row.project_id) : undefined;

    return {
      id: row.id,
      type: row.type as NotificationType,
      title: row.title,
      message: row.message,
      readAt: row.read_at,
      createdAt: row.created_at,
      actor: row.actor_profile_id
        ? {
            profileId: row.actor_profile_id,
            name: resolveProfileName(actorsById.get(row.actor_profile_id)),
            avatar: resolveAvatarUrl(actorsById.get(row.actor_profile_id)?.avatar_url ?? null, actorsById.get(row.actor_profile_id)?.updated_at ?? "") ?? FALLBACK_AVATAR,
          }
        : null,
      project: project ? { id: project.id, slug: project.slug, name: project.name } : null,
      ticket: ticket ? { id: ticket.id, code: `${project?.project_code ?? "TKT"}-${ticket.ticket_number}`, title: ticket.title } : null,
    };
  });
}

const NOTIFICATION_COLUMNS = "id, type, title, message, read_at, created_at, actor_profile_id, project_id, ticket_id";

export type NotificationsResult =
  | { status: "ready"; notifications: AppNotification[] }
  | { status: "error"; message: string };

// The bell dropdown's own 5-most-recent preview.
export async function loadRecentNotifications(profileId: string, limit = 5): Promise<NotificationsResult> {
  const supabase = getSupabaseBrowserClient();

  const { data: rows, error } = await supabase
    .from("notifications")
    .select(NOTIFICATION_COLUMNS)
    .eq("recipient_profile_id", profileId)
    .order("created_at", { ascending: false })
    .limit(limit)
    .returns<NotificationRow[]>();

  if (error) {
    logDev("recent notifications query failed", error);
    return { status: "error", message: error.message };
  }

  return { status: "ready", notifications: await hydrateNotifications(supabase, rows ?? []) };
}

export type NotificationsPageResult =
  | { status: "ready"; notifications: AppNotification[]; totalCount: number }
  | { status: "error"; message: string };

// /notifications' own real, server-side-paginated listing — same
// `.range()` + `count: "exact"` + secondary `id` tie-break shape as
// loadOrganizationActivityPage in lib/tickets.ts.
export async function loadNotificationsPage(
  profileId: string,
  page: number,
  pageSize: number
): Promise<NotificationsPageResult> {
  const supabase = getSupabaseBrowserClient();
  const offset = (page - 1) * pageSize;

  const { data: rows, error, count } = await supabase
    .from("notifications")
    .select(NOTIFICATION_COLUMNS, { count: "exact" })
    .eq("recipient_profile_id", profileId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: true })
    .range(offset, offset + pageSize - 1)
    .returns<NotificationRow[]>();

  if (error) {
    logDev("notifications page query failed", error);
    return { status: "error", message: error.message };
  }

  return { status: "ready", notifications: await hydrateNotifications(supabase, rows ?? []), totalCount: count ?? 0 };
}

export type UnreadCountResult = { status: "ready"; count: number } | { status: "error"; message: string };

export async function loadUnreadNotificationCount(profileId: string): Promise<UnreadCountResult> {
  const supabase = getSupabaseBrowserClient();

  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("recipient_profile_id", profileId)
    .is("read_at", null);

  if (error) {
    logDev("unread count query failed", error);
    return { status: "error", message: error.message };
  }

  return { status: "ready", count: count ?? 0 };
}

// ── Mark as read ─────────────────────────────────────────────────────────

export type MarkReadResult = { status: "success" } | { status: "error"; message: string };

// `.is("read_at", null)` keeps an already-read notification's original
// timestamp instead of bumping it — clicking a notification twice, or
// Mark All after some are already read, is always a no-op for those rows.
export async function markNotificationRead(id: string): Promise<MarkReadResult> {
  const supabase = getSupabaseBrowserClient();

  const { error } = await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id).is("read_at", null);

  if (error) {
    logDev("mark read failed", error);
    return { status: "error", message: error.message };
  }

  return { status: "success" };
}

export async function markAllNotificationsRead(profileId: string): Promise<MarkReadResult> {
  const supabase = getSupabaseBrowserClient();

  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("recipient_profile_id", profileId)
    .is("read_at", null);

  if (error) {
    logDev("mark all read failed", error);
    return { status: "error", message: error.message };
  }

  return { status: "success" };
}
