-- Real Rename for Ticket Attachments — the Attachments section's "Rename"
-- menu item previously only updated local React state (see AttachmentRow /
-- AttachmentsSection in ticket-detail-screen.tsx), so a renamed file
-- reverted to its original name on refresh. This persists the new name to
-- the existing ticket_attachments row; storage_path (the actual Storage
-- object key) is never touched, since filename is already tracked
-- separately from it (see 20260724000000_add_ticket_attachments.sql).
--
-- No UPDATE policy existed yet for this table (only select/insert, per
-- 20260724000000's own comment — no edit UI existed at the time). Mirrors
-- ticket_attachments_insert's check: is_org_admin_or_lead OR
-- is_project_member on the ticket's project.

create policy ticket_attachments_update on public.ticket_attachments
  for update
  using (
    exists (
      select 1 from public.tickets t
      join public.projects p on p.id = t.project_id
      where t.id = ticket_id
        and (public.is_org_admin_or_lead(p.organization_id) or public.is_project_member(p.id))
    )
  )
  with check (
    exists (
      select 1 from public.tickets t
      join public.projects p on p.id = t.project_id
      where t.id = ticket_id
        and (public.is_org_admin_or_lead(p.organization_id) or public.is_project_member(p.id))
    )
  );

-- Column-scoped, same pattern as profiles' first_name/last_name
-- (20260709000000) — this can only ever rename a file, never repoint
-- storage_path, size_bytes, mime_type, or uploaded_by.
grant update (filename) on public.ticket_attachments to authenticated;
