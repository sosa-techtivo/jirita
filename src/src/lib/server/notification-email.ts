// Server-only composition + delivery for JIRITA's "immediate email"
// notifications — a small, explicit subset of in-app notification types
// that also get a transactional email the moment they're created. Never
// import this from a "use client" file — same window guard as every other
// server-only module in this directory (e.g. github-token-crypto.ts).
//
// Deliberately narrow, matching the current phase's scope: this is not a
// general notification -> email pipeline. Digest, per-user email
// preferences, and email for the other 7 notification types
// (ticket_comment, ticket_status_changed, project_member_added,
// project_access_rejected, ticket_field_changed, ticket_attachment_added,
// ticket_time_logged) are all explicitly out of scope here.
//
// The one, and only, caller is create-notification-action.ts — right after
// the notification row it just inserted (the source of truth) commits
// successfully. A failure anywhere in sendImmediateNotificationEmail below
// (missing recipient email, SendGrid error, missing project/ticket
// context) is caught, logged, and swallowed: the in-app notification that
// was already created is never rolled back by an email problem.

import type { SupabaseClient } from "@supabase/supabase-js";
import { sendTransactionalEmail } from "../email-sender";
import type { NotificationType } from "./create-notification-action";
import { getAppBaseUrl } from "./app-base-url";

if (typeof window !== "undefined") {
  throw new Error("notification-email.ts must never be imported by client-side code.");
}

// The one centralized classification of which notification types get an
// immediate email — every caller checks this, nobody re-lists the 4 types
// themselves.
const IMMEDIATE_EMAIL_NOTIFICATION_TYPES: ReadonlySet<NotificationType> = new Set([
  "ticket_assigned",
  "comment_mention",
  "comment_reply",
  "project_access_requested",
]);

export function isImmediateEmailNotificationType(type: NotificationType): boolean {
  return IMMEDIATE_EMAIL_NOTIFICATION_TYPES.has(type);
}

// Never logs a raw error object or SendGrid response body — only a plain
// message, same convention as create-notification-action.ts's own
// logServerError, kept separate here since this module's failures are
// deliberately non-fatal warnings, not action-level errors.
function logEmailWarning(operation: string, detail?: unknown): void {
  const message = detail instanceof Error ? detail.message : detail;
  console.warn(`[notification-email] ${operation}`, message ?? "");
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export interface NotificationEmailProject {
  name: string;
  slug: string;
}

export interface NotificationEmailTicket {
  code: string;
  title: string;
}

export interface SendImmediateNotificationEmailInput {
  /** Reused from the caller — avoids constructing a second service-role client for this one follow-up. */
  admin: SupabaseClient;
  notificationId: string;
  recipientProfileId: string;
  actorProfileId: string | null;
  type: NotificationType;
  /** Already-sanitized plain-text excerpt (comment_mention/comment_reply only) or null. */
  message: string | null;
  project: NotificationEmailProject | null;
  ticket: NotificationEmailTicket | null;
}

interface EmailContent {
  subject: string;
  text: string;
  html: string;
}

// Fixed absolute URL, not built from NEXT_PUBLIC_APP_URL (which is
// currently "http://localhost:3000" in this environment — not publicly
// reachable, so an email client could never load it). jirita.techtivo.com
// is the same domain already authenticated for SendGrid sending (SPF/DKIM/
// DMARC, see Fase 1), so it's a real, stable, publicly-resolvable host for
// this static asset regardless of where the app itself is deployed.
const LOGO_URL = "https://jirita.techtivo.com/img/jirita-logo.png";

// ~110px wide, height held to the source PNG's own aspect ratio
// (217x47 -> 24px) so it never stretches; explicit width/height attributes
// (not just CSS) are what keeps email clients — Outlook in particular —
// from reserving the wrong box before the image loads.
const LOGO_HEADER_HTML = `<img src="${LOGO_URL}" width="110" height="24" alt="JIRITA" style="display:block;width:110px;height:24px;border:0;outline:none;text-decoration:none;">`;

function wrapHtml(bodyHtml: string): string {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" style="max-width:480px;" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding-bottom:20px;">
                ${LOGO_HEADER_HTML}
              </td>
            </tr>
            <tr>
              <td style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:24px;">
                ${bodyHtml}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function ctaHtml(href: string | null, label: string): string {
  if (!href) return "";
  return `<p style="margin:20px 0 0;"><a href="${href}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:14px;font-weight:600;">${escapeHtml(label)}</a></p>`;
}

function buildEmailContent(input: {
  type: NotificationType;
  actorName: string;
  project: NotificationEmailProject | null;
  ticket: NotificationEmailTicket | null;
  excerpt: string | null;
  appUrl: string | null;
}): EmailContent | null {
  const { type, actorName, project, ticket, excerpt, appUrl } = input;
  const ticketUrl = appUrl && project && ticket ? `${appUrl}/projects/${project.slug}/tickets/${ticket.code}` : null;
  // The Lead-side approve/reject widget for pending access requests lives
  // on the /projects list screen (projects-list-screen.tsx), not on the
  // individual /projects/[slug] overview page — so that, not the project
  // page, is the real destination where this CTA's action is possible.
  const projectsUrl = appUrl ? `${appUrl}/projects` : null;

  switch (type) {
    case "ticket_assigned": {
      if (!ticket || !project) return null;
      const subject = `You've been assigned ${ticket.code}: ${ticket.title}`;
      const text = [
        `${actorName} assigned you a ticket.`,
        "",
        `${ticket.code}: ${ticket.title}`,
        "",
        `Project: ${project.name}`,
        ...(ticketUrl ? ["", `View ticket: ${ticketUrl}`] : []),
      ].join("\n");
      const html = wrapHtml(
        `<p style="margin:0 0 12px;font-size:15px;">${escapeHtml(actorName)} assigned you a ticket.</p>` +
          `<p style="margin:0 0 12px;font-size:15px;font-weight:600;">${escapeHtml(ticket.code)}: ${escapeHtml(ticket.title)}</p>` +
          `<p style="margin:0;font-size:14px;color:#475569;">Project: ${escapeHtml(project.name)}</p>` +
          ctaHtml(ticketUrl, "View ticket")
      );
      return { subject, text, html };
    }
    case "comment_mention": {
      if (!ticket || !project) return null;
      const safeExcerpt = excerpt ?? "";
      const subject = `${actorName} mentioned you on ${ticket.code}`;
      const text = [
        `${actorName} mentioned you in a comment on:`,
        "",
        `${ticket.code}: ${ticket.title}`,
        "",
        `"${safeExcerpt}"`,
        ...(ticketUrl ? ["", `View ticket: ${ticketUrl}`] : []),
      ].join("\n");
      const html = wrapHtml(
        `<p style="margin:0 0 12px;font-size:15px;">${escapeHtml(actorName)} mentioned you in a comment on:</p>` +
          `<p style="margin:0 0 12px;font-size:15px;font-weight:600;">${escapeHtml(ticket.code)}: ${escapeHtml(ticket.title)}</p>` +
          `<p style="margin:0;font-size:14px;color:#475569;font-style:italic;">"${escapeHtml(safeExcerpt)}"</p>` +
          ctaHtml(ticketUrl, "View ticket")
      );
      return { subject, text, html };
    }
    case "comment_reply": {
      if (!ticket || !project) return null;
      const safeExcerpt = excerpt ?? "";
      const subject = `${actorName} replied to your comment on ${ticket.code}`;
      const text = [
        `${actorName} replied to your comment on:`,
        "",
        `${ticket.code}: ${ticket.title}`,
        "",
        `"${safeExcerpt}"`,
        ...(ticketUrl ? ["", `View reply: ${ticketUrl}`] : []),
      ].join("\n");
      const html = wrapHtml(
        `<p style="margin:0 0 12px;font-size:15px;">${escapeHtml(actorName)} replied to your comment on:</p>` +
          `<p style="margin:0 0 12px;font-size:15px;font-weight:600;">${escapeHtml(ticket.code)}: ${escapeHtml(ticket.title)}</p>` +
          `<p style="margin:0;font-size:14px;color:#475569;font-style:italic;">"${escapeHtml(safeExcerpt)}"</p>` +
          ctaHtml(ticketUrl, "View reply")
      );
      return { subject, text, html };
    }
    case "project_access_requested": {
      if (!project) return null;
      const subject = `${actorName} requested access to ${project.name}`;
      const text = [
        `${actorName} requested access to:`,
        "",
        project.name,
        ...(projectsUrl ? ["", `Review request: ${projectsUrl}`] : []),
      ].join("\n");
      const html = wrapHtml(
        `<p style="margin:0 0 12px;font-size:15px;">${escapeHtml(actorName)} requested access to:</p>` +
          `<p style="margin:0;font-size:15px;font-weight:600;">${escapeHtml(project.name)}</p>` +
          ctaHtml(projectsUrl, "Review request")
      );
      return { subject, text, html };
    }
    default:
      return null;
  }
}

// Orchestrates: skip-check -> self-notification guard -> idempotency
// pre-check -> resolve recipient/actor -> compose -> send -> mark
// emailed_at. Never throws — every failure path logs a warning and
// returns, so the business action and the in-app notification that
// already succeeded are never affected by anything that happens here.
export async function sendImmediateNotificationEmail(input: SendImmediateNotificationEmailInput): Promise<void> {
  if (!IMMEDIATE_EMAIL_NOTIFICATION_TYPES.has(input.type)) return;

  // Defense in depth — lib/notifications.ts's createNotification and
  // create-notification-action.ts's own actor-mismatch check already
  // guarantee this never happens for a real caller, but a future direct
  // caller of this module must never be able to email someone about their
  // own action.
  if (input.actorProfileId && input.actorProfileId === input.recipientProfileId) return;

  try {
    // Idempotency pre-check: only proceed while this notification hasn't
    // already produced an email. Real protection is the conditional
    // `.is("emailed_at", null)` update at the end of this function — this
    // early check just avoids doing avoidable work (a profile lookup, a
    // SendGrid call) when we already know the answer.
    const { data: notificationRow, error: notificationFetchError } = await input.admin
      .from("notifications")
      .select("emailed_at")
      .eq("id", input.notificationId)
      .maybeSingle<{ emailed_at: string | null }>();

    if (notificationFetchError) {
      logEmailWarning("notification-lookup-failed", notificationFetchError);
      return;
    }
    if (notificationRow?.emailed_at) {
      logEmailWarning("already-emailed-skipped");
      return;
    }

    const idsToFetch = Array.from(
      new Set([input.recipientProfileId, ...(input.actorProfileId ? [input.actorProfileId] : [])])
    );
    const { data: profileRows, error: profilesError } = await input.admin
      .from("profiles")
      .select("id, email, first_name, last_name")
      .in("id", idsToFetch)
      .returns<{ id: string; email: string | null; first_name: string | null; last_name: string | null }[]>();

    if (profilesError) {
      logEmailWarning("profiles-lookup-failed", profilesError);
      return;
    }

    const profilesById = new Map((profileRows ?? []).map((row) => [row.id, row]));

    // The recipient's email, resolved exclusively from JIRITA's own
    // canonical profiles table — never trusted from a caller/client. A
    // missing/blank email is a normal, non-blocking case (e.g. an
    // imported historical profile with no email on file): the in-app
    // notification stands regardless.
    const recipientEmail = profilesById.get(input.recipientProfileId)?.email?.trim();
    if (!recipientEmail) {
      logEmailWarning("recipient-has-no-email");
      return;
    }

    const actorProfile = input.actorProfileId ? profilesById.get(input.actorProfileId) : undefined;
    const actorName = actorProfile
      ? [actorProfile.first_name, actorProfile.last_name].filter(Boolean).join(" ") || "Someone"
      : "Someone";

    const content = buildEmailContent({
      type: input.type,
      actorName,
      project: input.project,
      ticket: input.ticket,
      excerpt: input.message,
      appUrl: getAppBaseUrl(),
    });

    if (!content) {
      logEmailWarning("missing-project-or-ticket-context");
      return;
    }

    await sendTransactionalEmail({
      to: recipientEmail,
      subject: content.subject,
      text: content.text,
      html: content.html,
    });

    // Only ever set after SendGrid has accepted the send above. The
    // `.is("emailed_at", null)` guard makes this the actual idempotency
    // enforcement (not just the pre-check above) — a second concurrent
    // call for the same notification id can still race into sending twice
    // in principle, but can never both successfully mark the row, and can
    // never re-mark an already-emailed row.
    const { error: markError } = await input.admin
      .from("notifications")
      .update({ emailed_at: new Date().toISOString() })
      .eq("id", input.notificationId)
      .is("emailed_at", null);

    if (markError) logEmailWarning("mark-emailed-at-failed", markError);
  } catch (error) {
    logEmailWarning("send-failed", error);
  }
}
