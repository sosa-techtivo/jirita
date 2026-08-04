-- Replaces 20260809000000's blanket "any recorded participation blocks
-- removal" guard — which made "Remove from Project" effectively
-- unusable for an Admin (a real team member almost always has *some*
-- history: a comment, a logged hour, a past ticket) — with the actual
-- intended business rule:
--
--   - Never remove the project's only active Project Lead (reassign
--     leadership first).
--   - Never remove a member who still has a ticket assigned to them in
--     this project that isn't Done (reassign those tickets first).
--   - Otherwise — no tickets assigned at all, or every assigned ticket is
--     already Done — removal is allowed, even though the member has real
--     past history. That history (past tickets, comments, time entries,
--     attachments, activity) is never touched by this: project_memberships
--     is the only row deleted, none of those tables reference it at all.
--
-- Enforced here at the database level (not just hidden/shown in the UI),
-- same "the trigger is the real guarantee" shape 20260809000000 already
-- established — a rejected delete simply surfaces this trigger's own
-- exception message, same as before.

drop trigger if exists project_memberships_prevent_delete_with_history on public.project_memberships;
drop function if exists public.project_memberships_block_delete_with_history();
drop function if exists public.project_membership_has_history(uuid, uuid);

-- project_memberships_one_lead_per_project (20260812000000) already
-- guarantees at most one project_role = 'lead' row per project, so "is
-- this the project's only active Lead" is simply "is this row currently
-- the lead" — there is never a second one to fall back on.
create or replace function public.project_membership_is_active_lead(target_project_id uuid, target_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.project_memberships
    where project_id = target_project_id
      and profile_id = target_profile_id
      and project_role = 'lead'
  );
$$;

-- Tickets in this project currently assigned to this profile whose status
-- isn't 'done' yet — a Done ticket never blocks removal, regardless of how
-- many the member has ever touched.
create or replace function public.project_membership_has_open_tickets(target_project_id uuid, target_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.tickets
    where project_id = target_project_id
      and assignee_profile_id = target_profile_id
      and status <> 'done'
  );
$$;

create or replace function public.project_memberships_block_unsafe_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.project_membership_is_active_lead(old.project_id, old.profile_id) then
    raise exception 'Cannot remove the project''s only active Project Lead. Assign a new Project Lead first.';
  end if;

  if public.project_membership_has_open_tickets(old.project_id, old.profile_id) then
    raise exception 'This member still has tickets assigned in this project that aren''t Done. Reassign those tickets before removing them.';
  end if;

  return old;
end;
$$;

create trigger project_memberships_prevent_unsafe_delete
  before delete on public.project_memberships
  for each row execute function public.project_memberships_block_unsafe_delete();
