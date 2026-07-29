-- Historical identity, comment association, and edit timestamp for
-- ticket_attachments, plus the matching activity bypass — same pattern
-- already applied to tickets (20260822000000), ticket_comments
-- (20260823000000), and ticket_time_entries (20260824000000).
--
-- Problem 1 (identity): ticket_attachments has never had an `unfuddle_id`.
-- `storage_path` is `unique`, but every value ever written to it
-- (`uploadTicketAttachment` in src/lib/tickets.ts) is
-- `` `${ticketId}/${crypto.randomUUID()}-${safeName}` `` — unique, but not
-- deterministic, so it cannot answer "was this historical attachment
-- already imported?" on a re-run. This migration adds `unfuddle_id`,
-- nullable (the app never sets it — every existing row stays `null`, never
-- backfilled) and unique the same simple way `tickets`/`ticket_comments`/
-- `ticket_time_entries` already do.
--
-- Problem 2 (comment association): ticket_attachments has only `ticket_id`
-- — no way to record that an attachment belongs to a specific *comment*
-- rather than the ticket generally. Confirmed from the real backup: 180 of
-- the 250 KTVibe attachments (72%) are comment-level. This migration adds
-- `comment_id`, nullable — `null` for the 70 ticket-level attachments,
-- the real `ticket_comments.id` for the 180 comment-level ones — without
-- ever silently reparenting a comment attachment to its ticket, and
-- without removing or weakening `ticket_id` (every attachment, comment-
-- level or not, keeps a real `ticket_id`).
--
-- `comment_id` uses `on delete set null`, not `on delete cascade`: unlike
-- `ticket_id` (where the ticket disappearing genuinely means the
-- attachment has nowhere to live), a comment disappearing shouldn't
-- destroy the file/row it's attached to — the attachment still has real
-- standalone value as a ticket-level historical artifact. (The app has no
-- comment-delete flow at all today — confirmed by grepping
-- src/lib/tickets.ts — so this is a correctness choice for the schema, not
-- a currently-exercised code path.)
--
-- Cross-ticket integrity is enforced with a dedicated trigger, not a
-- composite foreign key: a composite FK on (comment_id, ticket_id) would
-- force `ON DELETE SET NULL` to null out *both* columns together when the
-- referenced comment is deleted, which would incorrectly clear
-- `ticket_id` too (a NOT NULL column that must always point at the real
-- ticket, entirely independent of whether a comment_id is set). The
-- trigger below is the minimal mechanism that lets `comment_id` be
-- nullified on its own while still rejecting, at the database level, any
-- row where `comment_id` doesn't actually belong to `ticket_id` — "no
-- confiar solo en TypeScript." `ticket_comments` itself is not modified —
-- no new constraint was needed on it to make this work.
--
-- Problem 3 (edit timestamp): confirmed against the real 250 attachments —
-- 1 has a genuine `<updated-at>` different from its `<created-at>` (id
-- 11987). Real information, so `updated_at timestamptz` is added,
-- nullable, no default — not added "for symmetry" on tables where no real
-- historical value would ever populate it.
--
-- Problem 4 (activity): `ticket_attachments_log_activity` (20260728000000,
-- `AFTER INSERT`, unconditional) inserts one `ticket_activity` row per
-- attachment (`event_type = 'attachment_uploaded'`, `created_at = now()`)
-- — the same misleading-history problem already fixed for
-- tickets/comments/time entries. Fixed here the identical way: a guard
-- reading the same transaction-local GUC
-- (`jirita.import_bypass_activity_log`, no second GUC introduced), and a
-- new, narrowly-scoped `insert_ticket_attachments_bypassing_activity_log`
-- RPC that is the only place that ever sets it. Normal app behavior
-- (`uploadTicketAttachment` in src/lib/tickets.ts) never touches this GUC,
-- so `log_attachment_activity` behaves exactly as it did before this
-- migration for every real upload.
--
-- This RPC coordinates the `ticket_attachments` INSERT only — it never
-- touches Supabase Storage. Uploading the actual file bytes is a separate
-- TypeScript-side step (src/lib/unfuddle-import/import-attachments/), by
-- design: this task prepares that infrastructure but does not upload
-- anything or run it.
--
-- Access: EXECUTE is revoked from PUBLIC (so neither `anon` nor
-- `authenticated` can call the new RPC) and granted only to `service_role`,
-- which the importer already uses exclusively, server-side only.
--
-- Explicitly NOT changed: `ticket_attachments_ensure_membership` (already
-- a no-op under the service-role client), `ticket_attachments_log_renamed`/
-- `_log_deleted` (only fire on UPDATE/DELETE, irrelevant to a future
-- INSERT-only import), the tickets/comments/time-entries bypass mechanisms
-- (untouched), Storage bucket/policies, RLS, grants on the base table, and
-- every application query against ticket_attachments (all use explicit
-- column lists, never `select('*')`).

-- ── ticket_attachments: historical identity, comment association, edit timestamp ──

alter table public.ticket_attachments
  add column unfuddle_id text,
  add column comment_id uuid references public.ticket_comments (id) on delete set null,
  add column updated_at timestamptz,
  add constraint ticket_attachments_unfuddle_id_key unique (unfuddle_id);

create index ticket_attachments_comment_id_idx on public.ticket_attachments (comment_id);

comment on column public.ticket_attachments.unfuddle_id is
  'Historical Unfuddle attachment id (text), set only by the offline importer for idempotent re-imports. Null for every attachment created from the app. Never backfilled retroactively for existing rows.';

comment on column public.ticket_attachments.comment_id is
  'Optional: the ticket_comments row this attachment belongs to, for comment-level Unfuddle attachments. Null for ticket-level attachments (including every attachment created from the app today, which has no comment-attachment upload flow). When set, must belong to the same ticket_id as this row — enforced by the trigger below, not just application code.';

comment on column public.ticket_attachments.updated_at is
  'Historical Unfuddle edit timestamp (only meaningful for imported rows — this table has no edit-content flow in the app; renaming only touches filename via a separate trigger/activity path). Null for every attachment created from the app and for existing pre-migration rows — never defaulted to now()/created_at.';

-- ── Trigger: comment_id, when set, must belong to the same ticket_id ────────
-- Database-enforced, not just TypeScript-enforced. A plain FK can't
-- express this (see header comment for why a composite FK is the wrong
-- tool here) — this is the minimal mechanism that can, without touching
-- ticket_comments at all.

create or replace function public.check_ticket_attachment_comment_consistency()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.comment_id is not null then
    if not exists (
      select 1 from public.ticket_comments c
      where c.id = new.comment_id and c.ticket_id = new.ticket_id
    ) then
      raise exception 'ticket_attachments.comment_id % does not belong to ticket_attachments.ticket_id %', new.comment_id, new.ticket_id
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create trigger ticket_attachments_check_comment_ticket_consistency
  before insert or update on public.ticket_attachments
  for each row execute function public.check_ticket_attachment_comment_consistency();

-- ── ticket_attachments_log_activity: skip only when the transaction-local flag is set ──
-- Identical signature, security context, and default behavior as the
-- original (20260728000000) — only the new early-return guard is added.

create or replace function public.log_attachment_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(current_setting('jirita.import_bypass_activity_log', true), 'false') = 'true' then
    return new;
  end if;

  insert into public.ticket_activity (ticket_id, actor_profile_id, event_type, new_value, payload)
  values (
    new.ticket_id, new.uploaded_by, 'attachment_uploaded', new.filename,
    jsonb_build_object('size_bytes', new.size_bytes, 'mime_type', new.mime_type)
  );
  return new;
end;
$$;

-- ── insert_ticket_attachments_bypassing_activity_log: DB rows only, never Storage ──
-- Historical-import-only. Accepts one batch of attachment rows as a JSON
-- array (each element shaped like PlannedAttachmentFields in
-- src/lib/unfuddle-import/types/phase6.ts), sets the bypass, performs the
-- real insert in the same transaction, and returns the inserted rows.
-- Inserts only — never updates an existing row (idempotency-by-
-- unfuddle_id is decided in TypeScript, before this is ever called) — and
-- never uploads/reads/deletes anything in Supabase Storage; that is a
-- separate, TypeScript-side concern by design.
--
-- `security invoker` (the default, stated explicitly): no privilege
-- escalation needed — only service_role can call this at all (see grants
-- below), and service_role already has full table access and bypasses RLS
-- on its own.

create or replace function public.insert_ticket_attachments_bypassing_activity_log(attachment_rows jsonb)
returns setof public.ticket_attachments
language plpgsql
security invoker
set search_path = public
as $$
begin
  perform set_config('jirita.import_bypass_activity_log', 'true', true);

  return query
    insert into public.ticket_attachments (
      ticket_id, comment_id, filename, storage_path, size_bytes, mime_type, uploaded_by, created_at, updated_at, unfuddle_id
    )
    select
      (r ->> 'ticket_id')::uuid,
      nullif(r ->> 'comment_id', '')::uuid,
      r ->> 'filename',
      r ->> 'storage_path',
      (r ->> 'size_bytes')::bigint,
      nullif(r ->> 'mime_type', ''),
      nullif(r ->> 'uploaded_by', '')::uuid,
      (r ->> 'created_at')::timestamptz,
      nullif(r ->> 'updated_at', '')::timestamptz,
      r ->> 'unfuddle_id'
    from jsonb_array_elements(attachment_rows) as r
    returning *;
end;
$$;

comment on function public.insert_ticket_attachments_bypassing_activity_log(jsonb) is
  'Historical-import-only. Inserts ticket_attachments rows while suppressing '
  'the synthetic ticket_attachments_log_activity ticket_activity row, scoped '
  'to this transaction only via the same LOCAL custom GUC tickets/comments/ '
  'time entries already use (jirita.import_bypass_activity_log). Never '
  'touches Supabase Storage. Never call from client code — EXECUTE is '
  'restricted to service_role.';

revoke all on function public.insert_ticket_attachments_bypassing_activity_log(jsonb) from public;
revoke all on function public.insert_ticket_attachments_bypassing_activity_log(jsonb) from anon;
revoke all on function public.insert_ticket_attachments_bypassing_activity_log(jsonb) from authenticated;
grant execute on function public.insert_ticket_attachments_bypassing_activity_log(jsonb) to service_role;
