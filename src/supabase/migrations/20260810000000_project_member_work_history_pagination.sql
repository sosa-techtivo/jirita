-- Server-side pagination for the Work History page (Project → Team → member
-- → View Work History), replacing the modal's client-side aggregation from
-- 20260809000000's era with real LIMIT/OFFSET at the database level — a
-- history that can grow into the hundreds or thousands of tickets must
-- never be fetched whole to the client just to slice it locally.
--
-- Same "participation" rule as before (created it, assigned to it, has any
-- real ticket_activity row for it — comments/attachments/time entries/
-- status changes/relations all already log one via the existing triggers,
-- so this reuses that table rather than re-deriving from each source
-- table), same is_org_member authorization guard shape as
-- project_membership_has_history (20260809000000): an unauthorized
-- project_id/profile_id pair returns zero rows, never leaks even a count.
--
-- Three functions, not one, so a page fetch and the full-history summary
-- never interfere with each other: LIMIT/OFFSET on a windowed total would
-- return zero rows (and lose the total) for a page past the end, which is
-- exactly the "does this page even exist" question the summary needs to
-- answer *before* deciding whether to fetch/redirect. All three share one
-- inner table function (project_member_work_history_rows) for the actual
-- participation/aggregation logic, so it exists in exactly one place.

create or replace function public.project_member_work_history_rows(target_project_id uuid, target_profile_id uuid)
returns table (
  ticket_id uuid,
  ticket_number integer,
  title text,
  status text,
  priority text,
  hours numeric,
  activity_count integer,
  last_activity_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with authz as (
    select p.organization_id as org_id
    from public.projects p
    where p.id = target_project_id
      and public.is_org_member(p.organization_id)
  ),
  participation as (
    select t.id as ticket_id
    from public.tickets t
    where t.project_id = target_project_id
      and exists (select 1 from authz)
      and (
        t.created_by = target_profile_id
        or t.assignee_profile_id = target_profile_id
        or exists (
          select 1 from public.ticket_comments tc
          where tc.ticket_id = t.id and tc.author_profile_id = target_profile_id
        )
        or exists (
          select 1 from public.ticket_time_entries te
          where te.ticket_id = t.id and te.logged_by = target_profile_id
        )
        or exists (
          select 1 from public.ticket_attachments ta
          where ta.ticket_id = t.id and ta.uploaded_by = target_profile_id
        )
        or exists (
          select 1 from public.ticket_relations tr
          where tr.ticket_id = t.id and tr.created_by = target_profile_id
        )
        or exists (
          select 1 from public.ticket_activity act
          where act.ticket_id = t.id and act.actor_profile_id = target_profile_id
        )
      )
  ),
  hours_agg as (
    select te.ticket_id, sum(te.minutes) / 60.0 as hours
    from public.ticket_time_entries te
    where te.logged_by = target_profile_id
      and te.ticket_id in (select ticket_id from participation)
    group by te.ticket_id
  ),
  activity_agg as (
    select act.ticket_id, count(*) as activity_count, max(act.created_at) as last_own_activity
    from public.ticket_activity act
    where act.actor_profile_id = target_profile_id
      and act.ticket_id in (select ticket_id from participation)
    group by act.ticket_id
  ),
  -- Being assigned counts as participation even with zero authored
  -- activity — the assignee_changed row (logged by whoever did the
  -- assigning, not this person) still gives a real "since when" date, used
  -- only for last_activity_at, never counted toward activity_count.
  assigned_agg as (
    select act.ticket_id, max(act.created_at) as last_assigned_at
    from public.ticket_activity act
    where act.event_type = 'assignee_changed'
      and act.new_value = target_profile_id::text
      and act.ticket_id in (select ticket_id from participation)
    group by act.ticket_id
  )
  select
    t.id,
    t.ticket_number,
    t.title,
    t.status::text,
    t.priority::text,
    coalesce(h.hours, 0),
    coalesce(a.activity_count, 0)::integer,
    -- Falls back to the ticket's own real created_at only when neither
    -- signal exists (the same "grandfather" gap loadTicketActivity's own
    -- ticket_created backfill exists for) — never a fabricated date.
    coalesce(greatest(a.last_own_activity, ag.last_assigned_at), t.created_at)
  from participation p
  join public.tickets t on t.id = p.ticket_id
  left join hours_agg h on h.ticket_id = p.ticket_id
  left join activity_agg a on a.ticket_id = p.ticket_id
  left join assigned_agg ag on ag.ticket_id = p.ticket_id;
$$;

-- Full-history totals for the page's top summary — Tickets worked on /
-- Hours logged / Last activity — always computed over every matching
-- ticket, never just the current page.
create or replace function public.project_member_work_history_summary(target_project_id uuid, target_profile_id uuid)
returns table (
  ticket_count integer,
  total_hours numeric,
  most_recent_activity_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    count(*)::integer,
    coalesce(sum(hours), 0),
    max(last_activity_at)
  from public.project_member_work_history_rows(target_project_id, target_profile_id);
$$;

-- One page of rows, ordered by this person's last activity on each ticket,
-- most recent first — the actual LIMIT/OFFSET real pagination requires.
create or replace function public.project_member_work_history_page(
  target_project_id uuid,
  target_profile_id uuid,
  page_size integer,
  page_offset integer
)
returns table (
  ticket_id uuid,
  ticket_number integer,
  title text,
  status text,
  priority text,
  hours numeric,
  activity_count integer,
  last_activity_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select *
  from public.project_member_work_history_rows(target_project_id, target_profile_id)
  order by last_activity_at desc
  limit greatest(page_size, 0)
  offset greatest(page_offset, 0);
$$;

grant execute on function public.project_member_work_history_summary(uuid, uuid) to authenticated;
grant execute on function public.project_member_work_history_page(uuid, uuid, integer, integer) to authenticated;
