-- Closes a real gap found by controlled empirical testing of
-- insert_ticket_relations_bypassing_activity_log (20260826000000, applied
-- and tested live): ticket_relations_insert's same-project guarantee is an
-- RLS `with check` policy, and `service_role` (the only role ever granted
-- EXECUTE on that RPC) has BYPASSRLS — so RLS never evaluates for its
-- INSERT statement regardless of the function's own `security invoker`
-- setting. A live test (temporary tickets in two different real projects,
-- both cleaned up immediately after) confirmed the RPC happily accepted a
-- cross-project relation. This migration adds an explicit, RLS-independent
-- guard directly in the function body — a real DB-level guarantee this
-- task's own instructions require ("no depender únicamente de validación
-- TypeScript"), not a schema change: no new column, no new table, no new
-- trigger — only this one function's body changes.
--
-- The guard validates every row in the batch (both ticket_id and
-- related_ticket_id exist, and share the same project_id) before any
-- insert runs — a `raise exception` aborts the whole call (and, since
-- PostgREST wraps the RPC in one transaction, the whole batch) with zero
-- rows persisted, the same fail-closed behavior already relied on
-- elsewhere in this importer (e.g. ticket_attachments' comment_id-vs-
-- ticket_id validation trigger, 20260825000000).
--
-- Everything else about the function — signature, security invoker,
-- search_path, the GUC bypass, the accepted/omitted columns, grants — is
-- unchanged from 20260826000000.

create or replace function public.insert_ticket_relations_bypassing_activity_log(relation_rows jsonb)
returns setof public.ticket_relations
language plpgsql
security invoker
set search_path = public
as $$
declare
  r jsonb;
  ticket_project uuid;
  related_project uuid;
begin
  perform set_config('jirita.import_bypass_activity_log', 'true', true);

  for r in select * from jsonb_array_elements(relation_rows)
  loop
    select project_id into ticket_project from public.tickets where id = (r ->> 'ticket_id')::uuid;
    select project_id into related_project from public.tickets where id = (r ->> 'related_ticket_id')::uuid;

    if ticket_project is null or related_project is null then
      raise exception 'insert_ticket_relations_bypassing_activity_log: ticket_id or related_ticket_id does not exist (ticket_id=%, related_ticket_id=%)',
        r ->> 'ticket_id', r ->> 'related_ticket_id';
    end if;

    if ticket_project <> related_project then
      raise exception 'insert_ticket_relations_bypassing_activity_log: cross-project relation rejected (ticket_id % is in project %, related_ticket_id % is in project %)',
        r ->> 'ticket_id', ticket_project, r ->> 'related_ticket_id', related_project;
    end if;
  end loop;

  return query
    insert into public.ticket_relations (
      ticket_id, related_ticket_id, kind, created_by, unfuddle_relation_key
    )
    select
      (r ->> 'ticket_id')::uuid,
      (r ->> 'related_ticket_id')::uuid,
      r ->> 'kind',
      nullif(r ->> 'created_by', '')::uuid,
      r ->> 'unfuddle_relation_key'
    from jsonb_array_elements(relation_rows) as r
    returning *;
end;
$$;

comment on function public.insert_ticket_relations_bypassing_activity_log(jsonb) is
  'Historical-import-only. Inserts ticket_relations while suppressing the '
  'synthetic relation_added ticket_activity rows, scoped to this transaction '
  'only via the same LOCAL custom GUC tickets/comments/time entries/'
  'attachments already use (jirita.import_bypass_activity_log). Validates '
  'every row''s ticket_id/related_ticket_id share the same project_id '
  'in-function (RLS alone cannot enforce this for service_role, which has '
  'BYPASSRLS — see 20260827000000) before inserting anything. Does not '
  'accept created_at — Unfuddle provides no relation-level timestamp, so '
  'every row gets the table''s own default (now()), honestly the import '
  'moment, never a fabricated historical date. Never call from client code '
  '— EXECUTE is restricted to service_role.';

-- Grants unchanged from 20260826000000 — restated only so this migration is
-- self-contained if ever read in isolation, not because anything changed.
revoke all on function public.insert_ticket_relations_bypassing_activity_log(jsonb) from public;
revoke all on function public.insert_ticket_relations_bypassing_activity_log(jsonb) from anon;
revoke all on function public.insert_ticket_relations_bypassing_activity_log(jsonb) from authenticated;
grant execute on function public.insert_ticket_relations_bypassing_activity_log(jsonb) to service_role;
