-- Fixes a real bug found while validating organization_activity_page
-- (20260930070000): count(*) over() ties total_count to the *paginated*
-- row set, so requesting an offset past the end of the data (confirmed
-- directly: page_offset=10707 against a 10,707-row org) returns zero rows
-- and therefore total_count is unrecoverable — the client has no row left
-- to read it from. organization-activity-history-screen.tsx explicitly
-- relies on getting an accurate totalCount back on an out-of-range page to
-- redirect to the real last page (`if (requestedPage > totalPages)
-- router.replace(...)`); with the previous version this always redirected
-- to page 1 instead, since an empty result was read back as totalCount: 0.
--
-- Fix: compute total_count as its own single-row CTE, independent of the
-- paginated slice, and LEFT JOIN the (possibly empty) page onto it — this
-- guarantees exactly one output row carrying the real total_count even
-- when the page itself has zero rows (both "offset past the end" and
-- "this organization has no activity at all"). Callers must now treat a
-- row with a null `id` as "no activity row, this is just carrying the
-- count" and exclude it from the displayed entries.
--
-- Same SECURITY INVOKER / RLS reasoning as the original migration —
-- unchanged here, only the count/pagination decoupling changes.
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
  with base as (
    select a.id, a.ticket_id, a.actor_profile_id, a.event_type, a.field_name,
           a.old_value, a.new_value, a.created_at
    from public.ticket_activity a
    join public.tickets t on t.id = a.ticket_id
    join public.projects p on p.id = t.project_id
    where p.organization_id = target_organization_id
  ),
  counted as (
    select count(*)::integer as total_count from base
  ),
  paged as (
    select *
    from base
    order by created_at desc, id asc
    limit greatest(page_size, 0)
    offset greatest(page_offset, 0)
  )
  select
    paged.id,
    paged.ticket_id,
    paged.actor_profile_id,
    paged.event_type,
    paged.field_name,
    paged.old_value,
    paged.new_value,
    paged.created_at,
    counted.total_count
  from counted
  left join paged on true
  order by paged.created_at desc nulls last, paged.id asc;
$$;

grant execute on function public.organization_activity_page(uuid, integer, integer) to authenticated;
