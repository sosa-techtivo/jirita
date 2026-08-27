// Server-only. The one place that queries which notifications belong in a
// digest — reused by run-email-digest.ts, never re-implemented per caller.
//
// Deliberately does NOT filter on emailed_at: an immediate-email
// notification (ticket_assigned/comment_mention/comment_reply/
// project_access_requested) that already produced an email still belongs
// in the digest if it's still unread — the digest means "still
// unseen/pending in JIRITA," not "never emailed." emailed_at stays
// exclusively an immediate-email concern (see notification-email.ts).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { NotificationType } from "./create-notification-action";

if (typeof window !== "undefined") {
  throw new Error("digest-notifications-query.ts must never be imported by client-side code.");
}

// V1 cap — never send a giant email. When more than this many are unread,
// the digest shows the MOST RECENT `DIGEST_MAX_NOTIFICATIONS`, presented
// oldest-first within that set (see loadUnreadNotificationsForDigest's own
// ordering note below), plus an "and N more" line and a "View all
// notifications" CTA pointing at the real /notifications page for the
// rest. Chosen to keep the email short and scannable, not to hide data —
// nothing here is destructive; every unread notification is still fully
// visible in-app regardless of what a digest email shows.
export const DIGEST_MAX_NOTIFICATIONS = 50;

export interface DigestNotificationRow {
  id: string;
  type: NotificationType;
  title: string;
  message: string | null;
  projectId: string | null;
  ticketId: string | null;
  createdAt: string;
}

export interface DigestNotificationsResult {
  /** Oldest-first (see ordering note), capped at DIGEST_MAX_NOTIFICATIONS. */
  notifications: DigestNotificationRow[];
  /** The real total, independent of the cap — used for "and N more" and the email subject/intro. */
  totalUnreadCount: number;
}

// created_at > sinceIso, read_at IS NULL, for one recipient in one
// organization — the exact rule from Fase 3B's spec, nothing more.
export async function loadUnreadNotificationsForDigest(
  admin: SupabaseClient,
  recipientProfileId: string,
  organizationId: string,
  sinceIso: string
): Promise<DigestNotificationsResult> {
  const { count, error: countError } = await admin
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("recipient_profile_id", recipientProfileId)
    .is("read_at", null)
    .gt("created_at", sinceIso);

  if (countError) throw countError;

  // Fetched most-recent-first (so a capped result is the 50 MOST RECENT
  // unread items, never an arbitrary/oldest-biased slice), then reversed
  // to oldest-first before returning — the digest body reads as a
  // chronological story (per Fase 3B's own requirement), while the cap
  // itself still prioritizes recency.
  const { data, error } = await admin
    .from("notifications")
    .select("id, type, title, message, project_id, ticket_id, created_at")
    .eq("organization_id", organizationId)
    .eq("recipient_profile_id", recipientProfileId)
    .is("read_at", null)
    .gt("created_at", sinceIso)
    .order("created_at", { ascending: false })
    .limit(DIGEST_MAX_NOTIFICATIONS)
    .returns<
      {
        id: string;
        type: string;
        title: string;
        message: string | null;
        project_id: string | null;
        ticket_id: string | null;
        created_at: string;
      }[]
    >();

  if (error) throw error;

  const notifications: DigestNotificationRow[] = (data ?? [])
    .slice()
    .reverse()
    .map((row) => ({
      id: row.id,
      type: row.type as NotificationType,
      title: row.title,
      message: row.message,
      projectId: row.project_id,
      ticketId: row.ticket_id,
      createdAt: row.created_at,
    }));

  return { notifications, totalUnreadCount: count ?? 0 };
}
