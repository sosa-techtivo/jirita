-- Real bug fix: a Member could open a ticket (tickets_select allows any
-- can_view_project(project_id), which already covers real project members)
-- but changing its status or assignee failed with PostgREST's
-- "Cannot coerce the result to a single JSON object" — the classic symptom
-- of an UPDATE that RLS silently drops to 0 affected rows, which
-- lib/tickets.ts's updateTicket() then tries to .single() over.
--
-- tickets_update only allowed the row's *current* assignee
-- (assignee_profile_id = auth.uid()) or an org admin/lead — never a plain
-- project member who happens not to already be this specific ticket's
-- assignee (e.g. picking up an unassigned ticket, or changing status on a
-- teammate's ticket). tickets_insert already treats org admin/lead OR
-- is_project_member(project_id) as sufficient (see
-- 20260719000000_fix_tickets_insert_rls_admin_lead.sql); tickets_update
-- needs the same is_project_member(project_id) allowance, additive to the
-- existing checks so nothing already granted is narrowed. Scoped strictly
-- to this ticket's own project via is_project_member — never broadens
-- access to tickets outside a Member's real project_memberships rows.

drop policy tickets_update on public.tickets;

create policy tickets_update on public.tickets
  for update
  using (
    assignee_profile_id = auth.uid()
    or public.is_project_member(project_id)
    or exists (
      select 1 from public.projects p
      where p.id = project_id
        and public.is_org_admin_or_lead(p.organization_id)
    )
  )
  with check (
    assignee_profile_id = auth.uid()
    or public.is_project_member(project_id)
    or exists (
      select 1 from public.projects p
      where p.id = project_id
        and public.is_org_admin_or_lead(p.organization_id)
    )
  );
