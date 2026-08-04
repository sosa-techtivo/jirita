-- Project access requests: lets a Member request to join a project's team
-- they're not currently staffed on ("Other Projects" in the Member's own
-- /projects view), and lets that project's real Lead approve or reject it
-- from their own /projects view. Approving reuses the existing
-- project_memberships insert path (addProjectMember, lib/projects.ts) —
-- this table only ever tracks the request itself, never a second copy of
-- membership state.

create type public.project_access_request_status as enum (
  'pending',
  'approved',
  'rejected',
  'cancelled'
);

create table public.project_access_requests (
  id                      uuid primary key default gen_random_uuid(),
  project_id              uuid not null references public.projects (id) on delete cascade,
  requester_profile_id    uuid not null references public.profiles (id) on delete cascade,
  status                  public.project_access_request_status not null default 'pending',
  created_at              timestamptz not null default now(),
  -- Set only by the trigger below, from auth.uid() — never client-supplied,
  -- so a request can't be forged as resolved by someone who never touched it.
  resolved_at             timestamptz,
  resolved_by_profile_id  uuid references public.profiles (id) on delete set null
);

create index project_access_requests_project_id_idx on public.project_access_requests (project_id);
create index project_access_requests_requester_idx on public.project_access_requests (requester_profile_id);

-- Only one *active* (pending) request per project/requester — a partial
-- index, not a plain unique constraint, so a resolved request (approved/
-- rejected/cancelled) never blocks a genuinely new one afterwards.
create unique index project_access_requests_one_pending_idx
  on public.project_access_requests (project_id, requester_profile_id)
  where (status = 'pending');

-- Authoritative "who resolved this and when" — the same "trigger sets
-- truth, not the client" convention as set_updated_at/log_comment_activity
-- elsewhere in this schema.
create or replace function public.set_project_access_request_resolution()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status = 'pending' and new.status <> 'pending' then
    new.resolved_at := now();
    new.resolved_by_profile_id := auth.uid();
  end if;
  return new;
end;
$$;

create trigger project_access_requests_set_resolution
  before update on public.project_access_requests
  for each row execute function public.set_project_access_request_resolution();

alter table public.project_access_requests enable row level security;

-- Select: the requester sees their own; a project's real Lead (or an org
-- Admin) sees requests for that project — never anyone else's requests
-- for a project they don't lead.
create policy project_access_requests_select on public.project_access_requests
  for select
  using (
    requester_profile_id = auth.uid()
    or exists (
      select 1 from public.projects p
      where p.id = project_id
        and (
          public.is_org_admin(p.organization_id)
          or exists (
            select 1 from public.project_memberships pm
            where pm.project_id = p.id
              and pm.profile_id = auth.uid()
              and pm.project_role = 'lead'
          )
        )
    )
  );

-- Insert: only ever for yourself, only into an active project in your own
-- org, and only when you're not already staffed on it (is_project_member).
create policy project_access_requests_insert on public.project_access_requests
  for insert
  with check (
    requester_profile_id = auth.uid()
    and not public.is_project_member(project_id)
    and exists (
      select 1 from public.projects p
      where p.id = project_id
        and p.status = 'active'
        and public.is_org_member(p.organization_id)
    )
  );

-- Update: a pending request can only ever be touched by the requester
-- (who may only cancel it) or the project's real Lead/an Admin (who may
-- only approve or reject it) — never the other way around, and never a
-- row that isn't still pending (so a second approve/reject attempt on an
-- already-resolved request simply matches zero rows).
create policy project_access_requests_update on public.project_access_requests
  for update
  using (
    status = 'pending'
    and (
      requester_profile_id = auth.uid()
      or exists (
        select 1 from public.projects p
        where p.id = project_id
          and (
            public.is_org_admin(p.organization_id)
            or exists (
              select 1 from public.project_memberships pm
              where pm.project_id = p.id
                and pm.profile_id = auth.uid()
                and pm.project_role = 'lead'
            )
          )
      )
    )
  )
  with check (
    (requester_profile_id = auth.uid() and status = 'cancelled')
    or (
      status in ('approved', 'rejected')
      and exists (
        select 1 from public.projects p
        where p.id = project_id
          and (
            public.is_org_admin(p.organization_id)
            or exists (
              select 1 from public.project_memberships pm
              where pm.project_id = p.id
                and pm.profile_id = auth.uid()
                and pm.project_role = 'lead'
            )
          )
      )
    )
  );

grant select, insert, update on public.project_access_requests to authenticated;

-- ── "Other Projects": basic info for projects a Member isn't staffed on ─────
-- projects_select RLS (can_view_project) intentionally only lets a
-- non-admin/lead see projects they already belong to — this is a narrow,
-- security-definer read of just the fields the "Other Projects" card
-- actually needs, never a loosening of projects_select/can_view_project
-- itself, so every other screen's project visibility is unaffected.

create or replace function public.list_browsable_org_projects(target_org_id uuid)
returns table (
  id uuid,
  slug text,
  name text,
  short_name text,
  category public.project_category,
  description text,
  client_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.slug, p.name, p.short_name, p.category, p.description, p.client_name
  from public.projects p
  where p.organization_id = target_org_id
    and p.status = 'active'
    and public.is_org_member(target_org_id)
    and not public.is_project_member(p.id)
  order by p.name;
$$;

grant execute on function public.list_browsable_org_projects(uuid) to authenticated;

-- ── notifications: two new real event kinds ─────────────────────────────────
-- Requested (to the project's Lead) and rejected (to the requester) —
-- reusing the exact same notifications table/creation path every other
-- real event already goes through (create-notification-action.ts).
-- Approval deliberately reuses the *existing* project_member_added kind
-- (fired by addProjectMember itself once the requester is actually added)
-- rather than a second, redundant "your request was approved" notification
-- for the same real event.

alter table public.notifications drop constraint notifications_type_check;

alter table public.notifications add constraint notifications_type_check
  check (type in (
    'ticket_assigned',
    'comment_mention',
    'ticket_comment',
    'ticket_status_changed',
    'project_member_added',
    'project_access_requested',
    'project_access_rejected'
  ));
