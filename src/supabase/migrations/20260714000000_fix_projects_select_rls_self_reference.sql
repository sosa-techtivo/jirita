-- Fix: "new row violates row-level security policy for table \"projects\""
-- when creating a project (INSERT ... RETURNING), even for a genuine org
-- admin with a correct, active organization_memberships row.
--
-- Root cause (confirmed by testing directly against the live database):
-- projects_select's USING clause called can_view_project(id), which
-- internally re-queries public.projects itself
-- (`from public.projects p where p.id = target_project_id`) to look up the
-- row's organization_id. That self-reference into the very table the
-- policy protects breaks specifically for INSERT ... RETURNING: Postgres
-- evaluates the SELECT policy against the newly-inserted row as part of
-- the same command, and the helper function's own sub-query into
-- `projects` does not reliably see that row yet — even though
-- is_org_admin()/is_org_member() (which query organization_memberships,
-- not projects) already evaluate correctly for that user, and even though
-- calling can_view_project() again in a later, separate statement returns
-- true for the same row. A plain INSERT with no RETURNING already worked
-- fine, which is what pointed at the RETURNING-time SELECT check rather
-- than the INSERT policy itself.
--
-- Fix: express projects_select directly in terms of the row's own
-- organization_id/id columns (already available to the policy — it's
-- evaluated per-row on `projects` itself), calling only is_org_member /
-- is_org_admin / is_project_member, none of which re-query `projects`.
-- Same security semantics as before ("Admin sees every project org-wide;
-- Project Lead/Member see only projects they're staffed on") — this only
-- removes the redundant, buggy self-reference, it does not change who can
-- see what.
--
-- can_view_project() itself is left untouched and still used as-is by
-- project_memberships_select / tickets_select / ticket_comments_select /
-- ticket_activity_select — those reference the (different, already
-- committed) `projects` table rather than re-querying their own table, so
-- they never hit this bug and don't need to change.

drop policy if exists projects_select on public.projects;

create policy projects_select on public.projects
  for select
  using (
    public.is_org_member(organization_id)
    and (
      public.is_org_admin(organization_id)
      or public.is_project_member(id)
    )
  );
