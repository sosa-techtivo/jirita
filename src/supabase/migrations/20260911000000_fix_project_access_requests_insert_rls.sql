-- Fixes a real bug: a genuine Member requesting access to a project they
-- are NOT staffed on (exactly "Other Projects" — the only real use of this
-- insert policy) always got "new row violates row-level security policy
-- for table project_access_requests", even though 20260908000000's
-- with_check logic reads as correct on paper.
--
-- Root cause: that with_check's project/org/active check was a raw
-- `exists (select 1 from public.projects p where ...)` subquery. Subqueries
-- inside a policy expression run with the *caller's own* row-level
-- privileges, not elevated ones — so this subquery was itself subject to
-- projects_select's own RLS (`is_org_member(organization_id) and
-- (is_org_admin(organization_id) or is_project_member(id))`). A Member who
-- isn't an Admin and isn't yet staffed on the project — the exact person
-- this whole feature exists for — fails is_project_member for that row, so
-- projects_select hides it from them, so the subquery always found zero
-- rows and the insert's with_check always evaluated false. A chicken-and-
-- egg trap: you'd need to already be a project member to see the project
-- row that lets you request to become one.
--
-- Every other cross-table check anywhere in this schema already avoids
-- this exact trap by wrapping the check in a `security definer` function
-- (is_org_member, is_org_admin, is_project_member, can_view_project,
-- 20260908000000's own list_browsable_org_projects) — a security definer
-- function runs as its owner and is not subject to RLS on the tables it
-- queries internally. This migration gives the insert policy the same
-- treatment via one new function, rather than leaving it as the one raw,
-- caller-privileged subquery in this table's policies.
--
-- Also tightens the with_check to require status = 'pending' explicitly
-- (previously relied solely on the column default — harmless for this
-- app's own client, which never sets status on insert, but not something
-- the policy itself enforced) — a new request can only ever be created
-- pending, never pre-approved/rejected/cancelled by the inserting client.

create or replace function public.can_request_project_access(target_project_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  target_org_id uuid;
  target_is_active boolean;
begin
  select organization_id, (status = 'active')
    into target_org_id, target_is_active
    from public.projects
    where id = target_project_id;

  if target_org_id is null then
    return false;
  end if;

  return target_is_active and public.is_org_member(target_org_id);
end;
$$;

drop policy if exists project_access_requests_insert on public.project_access_requests;

create policy project_access_requests_insert on public.project_access_requests
  for insert
  with check (
    requester_profile_id = auth.uid()
    and status = 'pending'
    and not public.is_project_member(project_id)
    and public.can_request_project_access(project_id)
  );
