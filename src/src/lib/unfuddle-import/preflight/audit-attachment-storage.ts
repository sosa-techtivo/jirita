import type { AttachmentStorageAudit } from "../types/phase6";

/**
 * Static, code-audited finding — confirmed from
 * supabase/migrations/20260724000000_add_ticket_attachments.sql (bucket +
 * RLS) and 20260725000000 (insert-policy column-shadowing fix), plus
 * src/lib/tickets.ts's uploadTicketAttachment/downloadTicketAttachment/
 * getTicketAttachmentSignedUrl.
 *
 * - Bucket `ticket-attachments`, created with `public: false` — private,
 *   reads gated by RLS (`ticket_attachments_storage_select`), never a bare
 *   public object URL.
 * - No `file_size_limit`/`allowed_mime_types` set on the bucket row itself
 *   (`insert into storage.buckets (id, name, public) values (...)` — no
 *   other columns supplied) — this project relies on Supabase's
 *   project-wide default limit, which this session has no way to read
 *   (not exposed via any table/RPC this importer's service-role client
 *   can query) — reported as "not independently verified", not assumed to
 *   be any particular number.
 * - Path convention (from `uploadTicketAttachment`): `` `${ticketId}/${crypto.randomUUID()}-${safeName}` ``,
 *   where `safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_")`. The
 *   leading `<ticket_id>/` segment is load-bearing — every Storage RLS
 *   policy extracts it via `(storage.foldername(name))[1]` and joins back
 *   to `tickets`/`projects` to authorize the read/write. There is no
 *   equivalent convention for a comment-level object — this table/bucket
 *   pair was designed for ticket-level attachments only (matches the
 *   schema audit's own finding).
 * - RLS: select/insert/delete all require `can_view_project` (select) or
 *   `is_org_admin_or_lead OR is_project_member` (insert/delete) on the
 *   ticket's project — the service-role client bypasses all of this
 *   anyway, same as every other table in this importer.
 */
export function auditAttachmentStorage(): AttachmentStorageAudit {
  return {
    bucketId: "ticket-attachments",
    isPublic: false,
    pathConvention: "<ticket_id>/<uuid>-<sanitized filename> (app's own convention; uuid is random per upload, not derived from any historical identity)",
    selectPolicy: "authenticated + can_view_project(ticket.project_id) via (storage.foldername(name))[1] = ticket_id — service_role bypasses this entirely.",
    insertPolicy: "authenticated + (is_org_admin_or_lead OR is_project_member) on the ticket's project — service_role bypasses this entirely.",
    deletePolicy: "authenticated + (is_org_admin_or_lead OR is_project_member) on the ticket's project — service_role bypasses this entirely.",
    sizeLimitConfigured: "Not set on the bucket row in the migration (no file_size_limit/allowed_mime_types columns supplied) — Supabase project-wide default applies; not independently verified from this session (no accessible way to read it).",
  };
}
