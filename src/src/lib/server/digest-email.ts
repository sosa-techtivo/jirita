// Server-only. Builds the digest email's subject/text/html for one
// membership from an already-loaded, already-capped list of unread
// notifications (see digest-notifications-query.ts). Reuses the exact
// same header/logo/escaping/CTA chrome as the immediate-email templates
// (email-template.ts) — this is not a second, drifting design.
//
// Links: notifications has no stored `link` column (confirmed against the
// schema before writing this) — every notification's destination is
// derived from its project_id/ticket_id, the same way the in-app bell/
// /notifications page already does it (notificationHref in
// notification-bell.tsx / notifications-screen.tsx): ticket+project ->
// the ticket page; project only -> the project page; neither -> no link,
// plain text. Every href is built from getAppBaseUrl() + a fixed internal
// path shape this file constructs itself — never from any
// caller-supplied/stored URL, so there is no way for notification
// metadata to inject an arbitrary external link.

import type { SupabaseClient } from "@supabase/supabase-js";
import { escapeHtml, wrapEmailHtml, ctaHtml } from "./email-template";
import { formatAbsoluteDateTime } from "../date-format";
import { DIGEST_MAX_NOTIFICATIONS, type DigestNotificationRow } from "./digest-notifications-query";

if (typeof window !== "undefined") {
  throw new Error("digest-email.ts must never be imported by client-side code.");
}

interface ProjectRow {
  id: string;
  name: string;
  slug: string;
  project_code: string;
}

interface TicketRow {
  id: string;
  ticket_number: number;
  title: string;
  project_id: string;
}

interface DigestItem {
  title: string;
  message: string | null;
  createdAt: string;
  href: string | null;
}

interface DigestGroup {
  key: string;
  label: string;
  items: DigestItem[];
}

export interface DigestEmailContent {
  subject: string;
  text: string;
  html: string;
}

const OTHER_ACTIVITY_LABEL = "Other activity";

// Batches project/ticket lookups for the whole notification set — never
// one query per notification, same convention every other real query in
// this codebase already follows (see e.g. lib/notifications.ts's
// hydrateNotifications).
async function resolveProjectAndTicketContext(
  admin: SupabaseClient,
  notifications: DigestNotificationRow[]
): Promise<{ projectsById: Map<string, ProjectRow>; ticketsById: Map<string, TicketRow> }> {
  const ticketIds = Array.from(new Set(notifications.map((n) => n.ticketId).filter((id): id is string => Boolean(id))));

  const ticketsById = new Map<string, TicketRow>();
  if (ticketIds.length > 0) {
    const { data } = await admin
      .from("tickets")
      .select("id, ticket_number, title, project_id")
      .in("id", ticketIds)
      .returns<TicketRow[]>();
    for (const row of data ?? []) ticketsById.set(row.id, row);
  }

  const projectIds = Array.from(
    new Set([
      ...notifications.map((n) => n.projectId).filter((id): id is string => Boolean(id)),
      ...Array.from(ticketsById.values()).map((t) => t.project_id),
    ])
  );

  const projectsById = new Map<string, ProjectRow>();
  if (projectIds.length > 0) {
    const { data } = await admin
      .from("projects")
      .select("id, name, slug, project_code")
      .in("id", projectIds)
      .returns<ProjectRow[]>();
    for (const row of data ?? []) projectsById.set(row.id, row);
  }

  return { projectsById, ticketsById };
}

function itemHtml(item: DigestItem): string {
  const titleHtml = item.href
    ? `<a href="${item.href}" style="color:#0f172a;text-decoration:none;font-weight:600;">${escapeHtml(item.title)}</a>`
    : `<span style="font-weight:600;">${escapeHtml(item.title)}</span>`;
  const messageHtml = item.message
    ? `<div style="color:#475569;font-style:italic;margin-top:2px;">"${escapeHtml(item.message)}"</div>`
    : "";
  return (
    `<li style="margin:0 0 10px;font-size:13.5px;line-height:1.5;">` +
    `${titleHtml}` +
    `<div style="color:#94a3b8;font-size:12px;margin-top:2px;">${escapeHtml(formatAbsoluteDateTime(item.createdAt))}</div>` +
    `${messageHtml}` +
    `</li>`
  );
}

function itemText(item: DigestItem): string {
  const lines = [`- ${item.title} (${formatAbsoluteDateTime(item.createdAt)})`];
  if (item.message) lines.push(`  "${item.message}"`);
  if (item.href) lines.push(`  ${item.href}`);
  return lines.join("\n");
}

export interface BuildDigestEmailInput {
  admin: SupabaseClient;
  notifications: DigestNotificationRow[];
  totalUnreadCount: number;
  appUrl: string | null;
}

// Never throws on its own — any Supabase error from the batched project/
// ticket lookup propagates to the caller (run-email-digest.ts), which
// already treats any failure for a membership as "do not advance
// last_sent_at, try again next cycle" (Fase 3B's own Case D).
export async function buildDigestEmail(input: BuildDigestEmailInput): Promise<DigestEmailContent> {
  const { admin, notifications, totalUnreadCount, appUrl } = input;
  const { projectsById, ticketsById } = await resolveProjectAndTicketContext(admin, notifications);

  const groupsByKey = new Map<string, DigestGroup>();
  const groupOrder: string[] = [];

  for (const notification of notifications) {
    const ticket = notification.ticketId ? ticketsById.get(notification.ticketId) : undefined;
    const project = ticket ? projectsById.get(ticket.project_id) : notification.projectId ? projectsById.get(notification.projectId) : undefined;

    const href =
      appUrl && project && ticket
        ? `${appUrl}/projects/${project.slug}/tickets/${project.project_code}-${ticket.ticket_number}`
        : appUrl && project
          ? `${appUrl}/projects/${project.slug}`
          : null;

    const groupKey = project ? project.id : "__other__";
    const groupLabel = project ? project.name : OTHER_ACTIVITY_LABEL;

    if (!groupsByKey.has(groupKey)) {
      groupsByKey.set(groupKey, { key: groupKey, label: groupLabel, items: [] });
      groupOrder.push(groupKey);
    }
    groupsByKey.get(groupKey)!.items.push({
      title: notification.title,
      message: notification.message,
      createdAt: notification.createdAt,
      href,
    });
  }

  // "Other activity" always last, regardless of when its first item
  // appeared chronologically — every named project group keeps first-
  // appearance order otherwise (matches Fase 3B's own worked example).
  const orderedKeys = [...groupOrder.filter((k) => k !== "__other__"), ...groupOrder.filter((k) => k === "__other__")];
  const groups = orderedKeys.map((k) => groupsByKey.get(k)!);

  const remaining = totalUnreadCount - notifications.length;
  const subject = `JIRITA — You have ${totalUnreadCount} unread notification${totalUnreadCount === 1 ? "" : "s"}`;
  const notificationsUrl = appUrl ? `${appUrl}/notifications` : null;

  const textSections = groups.map((group) => [group.label, ...group.items.map((item) => itemText(item))].join("\n"));
  const text = [
    "Here's what you missed",
    "",
    `You have ${totalUnreadCount} unread notification${totalUnreadCount === 1 ? "" : "s"} in JIRITA.`,
    "",
    ...textSections.flatMap((section) => [section, ""]),
    ...(remaining > 0 ? [`And ${remaining} more unread notification${remaining === 1 ? "" : "s"}.`, ""] : []),
    ...(notificationsUrl ? [`View all notifications: ${notificationsUrl}`] : []),
  ].join("\n");

  const htmlSections = groups
    .map(
      (group) =>
        `<p style="margin:16px 0 6px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;color:#64748b;">${escapeHtml(group.label)}</p>` +
        `<ul style="list-style:none;margin:0;padding:0;">${group.items.map(itemHtml).join("")}</ul>`
    )
    .join("");

  const html = wrapEmailHtml(
    `<p style="margin:0 0 4px;font-size:16px;font-weight:700;">Here's what you missed</p>` +
      `<p style="margin:0 0 4px;font-size:14px;color:#475569;">You have ${totalUnreadCount} unread notification${totalUnreadCount === 1 ? "" : "s"} in JIRITA.</p>` +
      htmlSections +
      (remaining > 0
        ? `<p style="margin:12px 0 0;font-size:12.5px;color:#94a3b8;">And ${remaining} more unread notification${remaining === 1 ? "" : "s"}.</p>`
        : "") +
      ctaHtml(notificationsUrl, "View all notifications")
  );

  return { subject, text, html };
}

// Re-exported purely so callers importing this module for the template
// don't also need a separate import of digest-notifications-query.ts just
// to know the cap value used in its own messaging.
export { DIGEST_MAX_NOTIFICATIONS };
