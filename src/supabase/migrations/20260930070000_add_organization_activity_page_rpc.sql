-- Server-side pagination for Organization Activity History (/activity,
-- organization-activity-history-screen.tsx via loadOrganizationActivityPage
-- in src/lib/tickets.ts) — replaces a client-built `.in("ticket_id", ...)`
-- filter over every ticket in the organization (1,492 in production as of
-- this migration), which serializes into a ~55KB GET query string and 400s
-- at the gateway before the request ever reaches PostgREST (reproduced
-- directly against production). The relational filter
-- (ticket_activity -> tickets -> projects -> organization_id), the
-- `created_at desc, id asc` order, the LIMIT/OFFSET, and the exact total
-- count now all run inside a single Postgres query instead.
--
-- SECURITY INVOKER, not DEFINER: this function adds no authorization logic
-- of its own on top of what already exists. It runs as the calling user, so
-- the existing ticket_activity_select/tickets_select/projects_select RLS
-- policies (all ultimately keyed off can_view_project — Admin sees every
-- project in the organization, Project Lead/Member only projects they're
-- staffed on) apply exactly as they would for a direct client-side query.
-- A caller who is not a member of `target_organization_id` at all — or who
-- is a Project Lead/Member of it but not staffed on any of its projects —
-- simply matches zero rows via the tickets/projects join and RLS together;
-- there is no way for an arbitrary organization id argument to expose
-- another organization's (or another role's inaccessible) activity, and no
-- separate authorization check here to drift out of sync with the table
-- RLS over time. This mirrors exactly what today's unbatched client query
-- already does (its own first `projects` fetch is RLS-scoped the same way),
-- just without ever materializing/serializing the intermediate ticket id
-- list.
--
-- No new index: at current scale (~1,492 tickets, ~10,707 ticket_activity
-- rows), a full-match scan + in-memory sort for one page is well under
-- production-acceptable latency, and `count(*) over()` already requires
-- visiting every matching row regardless of any index on created_at, so an
-- index would not avoid that cost. Revisit if this table's row count grows
-- an order of magnitude and a real query plan shows it's warranted — not
-- added speculatively here.
create or replace function public.organization_activity_page(
  target_organization_id uuid,
  page_size integer,
  page_offset integer
)
returns table (
  id                uuid,
  ticket_id         uuid,
  actor_profile_id  uuid,
  event_type        text,
  field_name        text,
  old_value         text,
  new_value         text,
  created_at        timestamptz,
  total_count       integer
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    a.id,
    a.ticket_id,
    a.actor_profile_id,
    a.event_type,
    a.field_name,
    a.old_value,
    a.new_value,
    a.created_at,
    -- Cast from the window function's bigint to a plain integer — the
    -- exact same "count: exact" shape the previous unbatched query already
    -- returned as a plain JS number, never a bigint the client would have
    -- to special-case for precision.
    count(*) over()::integer as total_count
  from public.ticket_activity a
  join public.tickets t on t.id = a.ticket_id
  join public.projects p on p.id = t.project_id
  where p.organization_id = target_organization_id
  order by a.created_at desc, a.id asc
  limit greatest(page_size, 0)
  offset greatest(page_offset, 0);
$$;

grant execute on function public.organization_activity_page(uuid, integer, integer) to authenticated;
