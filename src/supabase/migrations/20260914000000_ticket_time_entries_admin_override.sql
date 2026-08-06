-- Time History needed a real permission tier beyond plain "author-only"
-- (20260913000000): an Admin may edit or delete any time entry in their
-- organization, not just their own — Project Lead and Member stay
-- restricted to their own real entries, same as today. Enforced here, at
-- the database level, exactly like every other privileged action in this
-- schema (never trusted from the UI alone, which only hides the
-- Edit/Delete buttons for whoever RLS would reject anyway).
--
-- Deliberately `is_org_admin`, not `is_org_admin_or_lead` (the broader
-- helper several other policies already use, e.g. this same table's own
-- ticket_time_entries_insert, 20260726000000): Project Lead is explicitly
-- NOT elevated for this action, by product decision — a Project Lead
-- edits/deletes their own logged time the same way a Member does.

drop policy ticket_time_entries_update on public.ticket_time_entries;

create policy ticket_time_entries_update on public.ticket_time_entries
  for update
  using (
    logged_by = auth.uid()
    or exists (
      select 1 from public.tickets t
      join public.projects p on p.id = t.project_id
      where t.id = ticket_id
        and public.is_org_admin(p.organization_id)
    )
  )
  with check (
    logged_by = auth.uid()
    or exists (
      select 1 from public.tickets t
      join public.projects p on p.id = t.project_id
      where t.id = ticket_id
        and public.is_org_admin(p.organization_id)
    )
  );

drop policy ticket_time_entries_delete on public.ticket_time_entries;

create policy ticket_time_entries_delete on public.ticket_time_entries
  for delete
  using (
    logged_by = auth.uid()
    or exists (
      select 1 from public.tickets t
      join public.projects p on p.id = t.project_id
      where t.id = ticket_id
        and public.is_org_admin(p.organization_id)
    )
  );

-- ── logged_by can never be reassigned by an edit, structurally ──────────────
-- Not just "the app doesn't send it in the payload": a column-level GRANT
-- restricts which columns `authenticated` may ever UPDATE at all, the same
-- precedent `notifications_update` already established (`grant update
-- (read_at) on public.notifications`, "RLS alone only gates which rows,
-- not which columns, of an UPDATE"). So when an Admin edits someone else's
-- entry, that entry's original `logged_by` is preserved by construction —
-- there is no UPDATE statement, from any caller, that could ever change it.
-- 20260913000000's own blanket `grant update` must be revoked first (a
-- later column-restricted grant doesn't narrow an earlier broader one).

revoke update on public.ticket_time_entries from authenticated;
grant update (minutes, comment, work_date) on public.ticket_time_entries to authenticated;
