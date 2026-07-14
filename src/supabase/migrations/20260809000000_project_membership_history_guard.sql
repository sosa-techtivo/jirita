-- Determines whether a project member has any real, already-recorded
-- participation in that project, and uses it to make removing a
-- project_memberships row impossible once that participation exists — at
-- the database level, not just by hiding the option in the UI.
--
-- "Participation" = created a ticket, is assigned to a ticket, commented,
-- logged time, uploaded an attachment, linked a ticket, or has any
-- ticket_activity row for the project — matching the same contribution
-- list 20260808000000's auto-membership trigger already uses, checked
-- directly against each source table (not solely derived from
-- ticket_activity) since being *assigned* to a ticket is real
-- participation even when the assignee themselves never took an action
-- that would log an activity row.
--
-- security definer + its own is_org_member guard (not just "any
-- authenticated caller") so this can be called as an RPC from the client
-- to decide whether to show "Remove from Project" at all, without leaking
-- even a yes/no answer about a project/profile pair outside the caller's
-- own organization.

create or replace function public.project_membership_has_history(target_project_id uuid, target_profile_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  target_org_id uuid;
begin
  select organization_id into target_org_id from public.projects where id = target_project_id;
  if target_org_id is null or not public.is_org_member(target_org_id) then
    return false;
  end if;

  return
    exists (select 1 from public.tickets where project_id = target_project_id and created_by = target_profile_id)
    or exists (select 1 from public.tickets where project_id = target_project_id and assignee_profile_id = target_profile_id)
    or exists (
      select 1 from public.ticket_comments tc join public.tickets t on t.id = tc.ticket_id
      where t.project_id = target_project_id and tc.author_profile_id = target_profile_id
    )
    or exists (
      select 1 from public.ticket_time_entries te join public.tickets t on t.id = te.ticket_id
      where t.project_id = target_project_id and te.logged_by = target_profile_id
    )
    or exists (
      select 1 from public.ticket_attachments ta join public.tickets t on t.id = ta.ticket_id
      where t.project_id = target_project_id and ta.uploaded_by = target_profile_id
    )
    or exists (
      select 1 from public.ticket_relations tr join public.tickets t on t.id = tr.ticket_id
      where t.project_id = target_project_id and tr.created_by = target_profile_id
    )
    or exists (
      select 1 from public.ticket_activity act join public.tickets t on t.id = act.ticket_id
      where t.project_id = target_project_id and act.actor_profile_id = target_profile_id
    );
end;
$$;

grant execute on function public.project_membership_has_history(uuid, uuid) to authenticated;

-- The actual guarantee: even a direct delete (this app's own
-- removeProjectMember, a future Server Action, or a manual call) is
-- blocked once real history exists — never relies on the caller having
-- checked project_membership_has_history first, or on the UI having hidden
-- the option. auth.uid() inside project_membership_has_history still
-- resolves to the real deleting session even though this trigger function
-- itself runs security definer (function ownership changes execution
-- privileges, not the auth.uid() GUC) — and by the time this fires,
-- project_memberships_delete's own RLS has already confirmed the caller is
-- an org admin/lead, so the is_org_member guard above is never what blocks
-- a legitimate deletion attempt; only real history is.

create or replace function public.project_memberships_block_delete_with_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.project_membership_has_history(old.project_id, old.profile_id) then
    raise exception 'Cannot remove a project member who already has recorded activity in this project.';
  end if;
  return old;
end;
$$;

create trigger project_memberships_prevent_delete_with_history
  before delete on public.project_memberships
  for each row execute function public.project_memberships_block_delete_with_history();
