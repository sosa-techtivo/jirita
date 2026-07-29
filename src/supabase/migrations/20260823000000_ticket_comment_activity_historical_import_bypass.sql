-- Historical-import bypass for ticket_comments_log_activity (20260727000000).
--
-- Problem: ticket_comments_log_activity is an unconditional `AFTER INSERT`
-- trigger — it always inserts one ticket_activity row per new comment
-- (event_type 'added_a_comment'), with created_at defaulting to now().
-- Correct for every comment created through the app today, wrong for the
-- Unfuddle importer (Phase 4): inserting a comment whose real created_at
-- is 2016-2026 would still log an "added a comment" activity dated today,
-- contradicting that same comment's own created_at — the exact same
-- misleading-history problem already fixed for tickets_log_created
-- (20260822000000_ticket_activity_historical_import_bypass.sql).
--
-- Mechanism: reuses that same migration's transaction-LOCAL custom GUC,
-- `jirita.import_bypass_activity_log` — a general "this INSERT belongs to
-- a historical import" flag, not a per-entity one. No second GUC is
-- introduced here; the guard added below to `log_comment_activity` reads
-- the identical setting `log_ticket_created` already reads, via the same
-- `current_setting(..., missing_ok => true)` pattern, so it is NULL — and
-- therefore treated as 'false' — for every insert that never touches it
-- (i.e. every ordinary `supabase.from('ticket_comments').insert(...)` call
-- in the app today, via createTicketComment in src/lib/tickets.ts, which
-- is entirely unchanged by this migration).
--
-- The GUC can only become 'true' via
-- `insert_ticket_comments_bypassing_activity_log(...)` below — a separate
-- RPC from the tickets one (one function per entity keeps each one's SQL
-- and column list simple and single-purpose), but using the exact same
-- pattern: its entire body (the `set_config(..., true)` call and the
-- comment insert itself) runs inside ONE PostgREST-managed transaction, so
-- the flag and the insert are guaranteed to share a transaction with no
-- separate round trip that could race, leak to a pooled connection reused
-- by an unrelated request, or need to be manually unset. `set_config`'s
-- third argument (`is_local => true`) is what makes Postgres itself revert
-- the value automatically at COMMIT or ROLLBACK — there is no persistent
-- state anywhere, by construction.
--
-- Access: EXECUTE is revoked from PUBLIC (so neither `anon` nor
-- `authenticated` — i.e. no browser/client code — can call this) and
-- granted only to `service_role`, which the importer already uses
-- exclusively, server-side only
-- (src/lib/unfuddle-import/supabase-admin-client.ts). service_role being
-- able to call this RPC is not itself the bypass signal — the bypass only
-- ever happens because this specific function body explicitly sets the
-- GUC; any other service_role write (a plain `.insert()`, or any other
-- RPC) still logs activity normally.
--
-- Explicitly NOT changed: ticket_comments_ensure_membership (already a
-- no-op under the service-role client, same reasoning as
-- tickets_ensure_membership_on_insert — keys off auth.uid(), not any
-- column on the row), set_updated_at (BEFORE UPDATE only, never fires on
-- INSERT), createTicketComment / any UI code, the tickets bypass mechanism
-- from 20260822000000 (untouched), and no tables/columns/enums/RLS.

-- ── ticket_comments_log_activity: skip only when the transaction-local flag is set ──
-- Identical signature, security context (security definer, same
-- search_path), and default behavior as the original (20260727000000) —
-- only the new early-return guard is added.

create or replace function public.log_comment_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(current_setting('jirita.import_bypass_activity_log', true), 'false') = 'true' then
    return new;
  end if;

  insert into public.ticket_activity (ticket_id, actor_profile_id, event_type)
  values (new.ticket_id, new.author_profile_id, 'added_a_comment');
  return new;
end;
$$;

-- ── insert_ticket_comments_bypassing_activity_log: the only way to set the flag for comments ──
-- Historical-import-only. Accepts one batch of comments as a JSON array
-- (each element shaped exactly like PlannedCommentFields in
-- src/lib/unfuddle-import/types/phase4.ts), sets the bypass, performs the
-- real insert in the same transaction, and returns the inserted rows so
-- the caller can reconcile them exactly like a normal insert would.
-- Inserts only — never updates an existing comment (idempotency-by-
-- unfuddle_id is decided in TypeScript, before this is ever called, not
-- here). Touches only `ticket_comments`: no other table, no manual
-- ticket_activity row, no `tickets` row is read or written by this
-- function.
--
-- `security invoker` (the default, stated explicitly): no privilege
-- escalation is needed or wanted — only service_role can call this at all
-- (see grants below), and service_role already has full table access and
-- bypasses RLS on its own.

create or replace function public.insert_ticket_comments_bypassing_activity_log(comment_rows jsonb)
returns setof public.ticket_comments
language plpgsql
security invoker
set search_path = public
as $$
begin
  perform set_config('jirita.import_bypass_activity_log', 'true', true);

  return query
    insert into public.ticket_comments (
      ticket_id, unfuddle_id, body, author_profile_id, created_at, updated_at
    )
    select
      (r ->> 'ticket_id')::uuid,
      r ->> 'unfuddle_id',
      r ->> 'body',
      nullif(r ->> 'author_profile_id', '')::uuid,
      (r ->> 'created_at')::timestamptz,
      (r ->> 'updated_at')::timestamptz
    from jsonb_array_elements(comment_rows) as r
    returning *;
end;
$$;

comment on function public.insert_ticket_comments_bypassing_activity_log(jsonb) is
  'Historical-import-only. Inserts ticket_comments while suppressing the '
  'synthetic ticket_comments_log_activity ticket_activity row, scoped to '
  'this transaction only via the same LOCAL custom GUC tickets already use '
  '(jirita.import_bypass_activity_log). Never call from client code — '
  'EXECUTE is restricted to service_role.';

revoke all on function public.insert_ticket_comments_bypassing_activity_log(jsonb) from public;
revoke all on function public.insert_ticket_comments_bypassing_activity_log(jsonb) from anon;
revoke all on function public.insert_ticket_comments_bypassing_activity_log(jsonb) from authenticated;
grant execute on function public.insert_ticket_comments_bypassing_activity_log(jsonb) to service_role;
