-- Real bug fix, found while wiring the New Ticket modal to Supabase:
-- tickets_insert only allowed rows where is_project_member(project_id) is
-- true. project_memberships is currently empty for every project (there is
-- no UI yet to staff a project — Team is still mock, see CLAUDE.md's "Still
-- mock" section), so ticket creation was unconditionally blocked for
-- everyone, including org admins/leads.
--
-- can_view_project already treats org admins as able to see every project
-- without a project_memberships row (is_org_admin(...) or
-- is_project_member(...)); tickets_insert needs the same admin/lead
-- exception, mirroring projects_insert's own check (is_org_admin_or_lead),
-- so Admin/Project Lead can create tickets today, while a plain Member
-- still needs an actual project_memberships row once that UI exists.

drop policy tickets_insert on public.tickets;

create policy tickets_insert on public.tickets
  for insert
  with check (
    exists (
      select 1 from public.projects p
      where p.id = project_id
        and (public.is_org_admin_or_lead(p.organization_id) or public.is_project_member(p.id))
    )
  );
