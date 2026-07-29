-- Historical-import bypass for tickets_log_created (20260728000000).
--
-- Problem: tickets_log_created is an unconditional `AFTER INSERT` trigger —
-- it always inserts one ticket_activity row per new ticket, with
-- created_at defaulting to now(). That's correct for every ticket created
-- through the app today, but wrong for the Unfuddle importer (Phase 3):
-- inserting a ticket whose real created_at is 2016-2018 would still log a
-- "Ticket Created" activity dated today, contradicting that same ticket's
-- own created_at — a misleading historical record, not a cosmetic detail.
--
-- Mechanism: a transaction-LOCAL custom GUC
-- (`jirita.import_bypass_activity_log`), read via
-- `current_setting(..., missing_ok => true)` so it is NULL — and therefore
-- treated as 'false' — for every insert that never touches it. That is
-- every ordinary `supabase.from('tickets').insert(...)` call in the app
-- today: none of them set this GUC, so `log_ticket_created` behaves
-- exactly as it did before this migration, with no code changes required
-- anywhere else.
--
-- The GUC can only become 'true' via
-- `insert_tickets_bypassing_activity_log(...)` below. Its entire body (the
-- `set_config(..., true)` call and the ticket insert itself) runs inside
-- ONE PostgREST-managed transaction — PostgREST wraps every single API
-- request, including an RPC call, in its own implicit transaction — so the
-- flag and the insert are guaranteed to share a transaction with no
-- separate round trip that could race, leak to a pooled connection reused
-- by an unrelated request, or need to be manually unset. `set_config`'s
-- third argument (`is_local => true`) is what makes Postgres itself revert
-- the value automatically at COMMIT or ROLLBACK — there is no persistent
-- state anywhere, by construction, not by convention.
--
-- Access: EXECUTE is revoked from PUBLIC (so neither `anon` nor
-- `authenticated` — i.e. no browser/client code — can call this) and
-- granted only to `service_role`, which the importer already uses
-- exclusively, server-side only
-- (src/lib/unfuddle-import/supabase-admin-client.ts).
--
-- Explicitly NOT changed: every other trigger on `tickets`
-- (tickets_ensure_membership_on_insert, tickets_ensure_membership_on_update,
-- tickets_log_field_changes, set_updated_at) and everything on
-- ticket_activity itself (no triggers exist on that table). Per Phase 3's
-- own audit, tickets_ensure_membership_on_insert already keys off
-- auth.uid(), not any column on the row — it is already a no-op under the
-- service-role client this importer uses, so no change is needed there.

-- ── tickets_log_created: skip only when the transaction-local flag is set ──
-- Identical signature, security context (security definer, same
-- search_path), and default behavior as the original (20260728000000) —
-- only the new early-return guard is added.

create or replace function public.log_ticket_created()
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
  values (new.id, new.created_by, 'ticket_created');
  return new;
end;
$$;

-- ── insert_tickets_bypassing_activity_log: the only way to set the flag ────
-- Historical-import-only. Accepts one batch of tickets as a JSON array
-- (each element shaped exactly like PlannedTicketFields in
-- src/lib/unfuddle-import/types/phase3.ts), sets the bypass, performs the
-- real insert in the same transaction, and returns the inserted rows so
-- the caller can reconcile them exactly like a normal insert would. Every
-- `tickets` column not listed here (type, labels, milestone, story_points,
-- acceptance_criteria, ...) is untouched and keeps its normal table
-- default — this function does not widen the importer's column scope.
--
-- `security invoker` (the default, stated explicitly): no privilege
-- escalation is needed or wanted — only service_role can call this at all
-- (see grants below), and service_role already has full table access and
-- bypasses RLS on its own.

create or replace function public.insert_tickets_bypassing_activity_log(ticket_rows jsonb)
returns setof public.tickets
language plpgsql
security invoker
set search_path = public
as $$
begin
  perform set_config('jirita.import_bypass_activity_log', 'true', true);

  return query
    insert into public.tickets (
      project_id, unfuddle_id, ticket_number, title, description, status, priority,
      created_by, assignee_profile_id, created_at, updated_at, due_date, hours,
      unfuddle_imported_at
    )
    select
      (r ->> 'project_id')::uuid,
      r ->> 'unfuddle_id',
      (r ->> 'ticket_number')::integer,
      r ->> 'title',
      r ->> 'description',
      (r ->> 'status')::public.ticket_status,
      (r ->> 'priority')::public.ticket_priority,
      nullif(r ->> 'created_by', '')::uuid,
      nullif(r ->> 'assignee_profile_id', '')::uuid,
      (r ->> 'created_at')::timestamptz,
      (r ->> 'updated_at')::timestamptz,
      nullif(r ->> 'due_date', '')::date,
      nullif(r ->> 'hours', '')::numeric,
      (r ->> 'unfuddle_imported_at')::timestamptz
    from jsonb_array_elements(ticket_rows) as r
    returning *;
end;
$$;

comment on function public.insert_tickets_bypassing_activity_log(jsonb) is
  'Historical-import-only. Inserts tickets while suppressing the synthetic '
  'tickets_log_created ticket_activity row, scoped to this transaction only '
  'via a LOCAL custom GUC (jirita.import_bypass_activity_log). Never call '
  'from client code — EXECUTE is restricted to service_role.';

revoke all on function public.insert_tickets_bypassing_activity_log(jsonb) from public;
revoke all on function public.insert_tickets_bypassing_activity_log(jsonb) from anon;
revoke all on function public.insert_tickets_bypassing_activity_log(jsonb) from authenticated;
grant execute on function public.insert_tickets_bypassing_activity_log(jsonb) to service_role;
