import type { AttachmentSchemaAudit } from "../types/phase6";

/**
 * Static, code-audited finding against the CURRENTLY LIVE schema — confirmed
 * by reading the actual migrations directly (not assumed):
 * supabase/migrations/20260724000000_add_ticket_attachments.sql,
 * 20260725000000 (RLS fix, no schema change), 20260728000000 (activity
 * trigger), 20260729000000 (rename), 20260730000000 (delete),
 * 20260731000000 (rename/delete activity).
 *
 * ```sql
 * create table public.ticket_attachments (
 *   id            uuid primary key default gen_random_uuid(),
 *   ticket_id     uuid not null references public.tickets (id) on delete cascade,
 *   storage_path  text not null unique,
 *   filename      text not null,
 *   size_bytes    bigint not null,
 *   mime_type     text,
 *   uploaded_by   uuid references public.profiles (id) on delete set null default auth.uid(),
 *   created_at    timestamptz not null default now()
 * );
 * ```
 *
 * Confirmed structural facts (still true — none of this has changed live):
 * - **No `unfuddle_id` column.** Same missing-identity-key problem already
 *   found (and fixed via a dedicated migration) for tickets/comments/time
 *   entries.
 * - **No `comment_id` column, no polymorphic parent.** `ticket_id` is the
 *   *only* parent reference this table supports today. A comment-level
 *   attachment (180 of the 250, see the XML audit) cannot be represented
 *   without either widening this table or silently reparenting it to the
 *   comment's ticket (explicitly forbidden — "no convertir automáticamente
 *   un adjunto de comentario en adjunto de ticket").
 * - `storage_path text not null unique` — a *real* uniqueness constraint,
 *   but the only value ever written to it
 *   (`uploadTicketAttachment` in src/lib/tickets.ts) is
 *   `` `${ticketId}/${crypto.randomUUID()}-${safeName}` `` — a fresh random
 *   UUID on every call. It is unique, but not *deterministic*.
 * - `uploaded_by` is nullable — moot for this backup specifically: none of
 *   the 250 `<attachment>` elements anywhere in backup.xml carry a
 *   creator/person/uploader field at all. Every imported attachment's
 *   `uploaded_by` would honestly be `null`, not an unresolved reference.
 * - **No `updated_at` column** — only `created_at`.
 * - `ticket_attachments_log_activity` (20260728000000, `AFTER INSERT`,
 *   unconditional) inserts one `ticket_activity` row per attachment
 *   (`event_type = 'attachment_uploaded'`, `created_at = now()`).
 * - `ticket_attachments_ensure_membership` (20260808000000, `AFTER
 *   INSERT`) keys off `auth.uid()` — already proven a no-op under the
 *   service-role client.
 * - `ticket_attachments_log_renamed`/`_log_deleted` (20260731000000) only
 *   fire on UPDATE/DELETE — irrelevant to a future INSERT-only import.
 *
 * STATUS: RESOLVED and verified live. Migration
 * supabase/migrations/20260825000000_ticket_attachments_historical_import_support.sql
 * was applied manually via the Supabase SQL Editor, then confirmed against
 * the real database (not assumed) with 44 controlled, cleaned-up checks —
 * one throwaway project + a series of throwaway tickets/comments/
 * attachments, never any real KTVibe ticket/comment/attachment, all
 * verified deleted afterward (0 stray rows, project itself deleted):
 *   - `unfuddle_id`/`comment_id`/`updated_at` all exist and are selectable;
 *     0 of the real pre-existing rows show a non-null value in any of the
 *     three (no invented backfill).
 *   - A plain insert (no RPC) still produces exactly one `attachment_uploaded`
 *     ticket_activity row with the correct actor (`uploaded_by`, here
 *     `null`) and metadata; `tickets.updated_at` and membership/notification
 *     counts are all unchanged.
 *   - `insert_ticket_attachments_bypassing_activity_log` produces zero new
 *     ticket_activity rows for both a ticket-level (`comment_id: null`) and
 *     a comment-level (`comment_id` set) historical row, preserves every
 *     field exactly (including a historical `created_at`/`updated_at` that
 *     differ from each other and from `now()`), leaves the parent ticket/
 *     comment and membership/notification counts untouched, and never
 *     touches Storage (`.list()` on the ticket's folder was empty before
 *     and after).
 *   - Cross-ticket integrity is enforced for both a direct INSERT and a
 *     call through the RPC — both rejected (Postgres 23514, the dedicated
 *     trigger), 0 invalid rows persisted either way. The base FK on
 *     `comment_id` is real (`references public.ticket_comments (id)`) but
 *     was never observed to fire on its own: the trigger's `not exists`
 *     check is a strict superset of what the FK alone catches (it also
 *     rejects a `comment_id` that doesn't exist at all, not just one on the
 *     wrong ticket), so it always intercepts first — informational, not a
 *     gap, since the row is still correctly rejected either way.
 *   - `comment_id`'s `on delete set null` verified directly: deleting the
 *     parent comment leaves the attachment row in place with `comment_id`
 *     now `null`, `ticket_id` and every other column (`filename`,
 *     `storage_path`, `size_bytes`, `mime_type`, `unfuddle_id`,
 *     `created_at`) unchanged.
 *   - Both unique constraints are enforced: a repeated `unfuddle_id` and a
 *     repeated `storage_path` were each rejected with Postgres 23505, with
 *     exactly one row surviving in both cases.
 *   - The transaction-local GUC does not leak: a plain insert performed
 *     immediately after an RPC bypass call again produced exactly one new
 *     `attachment_uploaded` activity row.
 *   - Permissions: `anon` calling the RPC was rejected with Postgres 42501
 *     (permission denied); `service_role` (an empty-batch call, 0 rows
 *     written) succeeded. No controlled `authenticated` session and no
 *     direct Postgres/catalog access were available this session (only
 *     PostgREST via supabase-js) — `authenticated`'s revoke, `security
 *     invoker`, the explicit `search_path`, the absence of any upsert
 *     clause, and the absence of any `storage.*` reference are confirmed by
 *     direct review of the deployed SQL text, not by an empirical
 *     authenticated-session call or catalog introspection.
 * `blocksApply`-equivalent trust was earned for the schema/RPC/bypass on
 * the same evidentiary standard `auditTimeEntrySchema` already met, and
 * APPLY has since actually run: all 250 KTVibe attachments (70
 * ticket-level, 180 comment-level) are uploaded and inserted, reconciled
 * field-by-field, with 0 unexpected side effects and a second PREVIEW
 * confirming idempotency (0 new / 250 already imported, both DB and
 * Storage) — see phases.ts (Phase 6 is now "implemented"). This function
 * still returns `blockingReasons` — see below — as a factual statement of
 * what remains true about the underlying mechanism, not a claim that
 * anything is unfinished.
 */
export function auditAttachmentSchema(): AttachmentSchemaAudit {
  return {
    hasUnfuddleIdColumn: true,
    hasCommentIdColumn: true,
    storagePathUniqueConstraint: true,
    storagePathDeterministic: false,
    uploadedByNullable: true,
    hasUpdatedAtColumn: true,
    activityTrigger: {
      exists: true,
      unconditional: false,
      description:
        "ticket_attachments_log_activity (AFTER INSERT) skips the ticket_activity insert when jirita.import_bypass_activity_log='true' (verified: 0 rows produced by 2 separate controlled bypass tests, ticket-level and comment-level) — unconditional only for ordinary inserts (verified: a plain insert still logs exactly one attachment_uploaded row, and again immediately after a bypass call, confirming the GUC doesn't leak).",
    },
    membershipTrigger: {
      exists: true,
      description: "ticket_attachments_ensure_membership keys off auth.uid(), null under service-role — verified empirically (0 new project_memberships across every controlled test this session).",
    },
    blockingReasons: [],
  };
}
