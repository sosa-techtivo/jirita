-- Fixes a real bug in 20260827000000, found immediately by re-running the
-- same controlled empirical tests right after that migration was applied:
-- the validation loop declared `r jsonb` as a PL/pgSQL variable, which then
-- collided with the unrelated `from jsonb_array_elements(relation_rows) as r`
-- table alias used by the function's final INSERT — Postgres correctly
-- refused to guess which `r` was meant ("column reference \"r\" is
-- ambiguous", 42702), so every call that reached that statement failed,
-- including perfectly valid same-project inserts. The cross-project guard
-- itself was not the problem (it raises its own exception earlier, before
-- ever reaching the ambiguous statement) — confirmed working correctly in
-- that same retest.
--
-- Fix: rename the loop variable to `row_data` so no PL/pgSQL variable named
-- `r` exists anywhere in the function body; the final query's `as r` table
-- alias is now unambiguous again. No other change — same signature,
-- security invoker, search_path, GUC bypass, guard logic, accepted columns,
-- and grants as 20260827000000.

create or replace function public.insert_ticket_relations_bypassing_activity_log(relation_rows jsonb)
returns setof public.ticket_relations
language plpgsql
security invoker
set search_path = public
as $$
declare
  row_data jsonb;
  ticket_project uuid;
  related_project uuid;
begin
  perform set_config('jirita.import_bypass_activity_log', 'true', true);

  for row_data in select * from jsonb_array_elements(relation_rows)
  loop
    select project_id into ticket_project from public.tickets where id = (row_data ->> 'ticket_id')::uuid;
    select project_id into related_project from public.tickets where id = (row_data ->> 'related_ticket_id')::uuid;

    if ticket_project is null or related_project is null then
      raise exception 'insert_ticket_relations_bypassing_activity_log: ticket_id or related_ticket_id does not exist (ticket_id=%, related_ticket_id=%)',
        row_data ->> 'ticket_id', row_data ->> 'related_ticket_id';
    end if;

    if ticket_project <> related_project then
      raise exception 'insert_ticket_relations_bypassing_activity_log: cross-project relation rejected (ticket_id % is in project %, related_ticket_id % is in project %)',
        row_data ->> 'ticket_id', ticket_project, row_data ->> 'related_ticket_id', related_project;
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
  'BYPASSRLS) before inserting anything. Does not accept created_at — '
  'Unfuddle provides no relation-level timestamp, so every row gets the '
  'table''s own default (now()), honestly the import moment, never a '
  'fabricated historical date. Never call from client code — EXECUTE is '
  'restricted to service_role.';

revoke all on function public.insert_ticket_relations_bypassing_activity_log(jsonb) from public;
revoke all on function public.insert_ticket_relations_bypassing_activity_log(jsonb) from anon;
revoke all on function public.insert_ticket_relations_bypassing_activity_log(jsonb) from authenticated;
grant execute on function public.insert_ticket_relations_bypassing_activity_log(jsonb) to service_role;
