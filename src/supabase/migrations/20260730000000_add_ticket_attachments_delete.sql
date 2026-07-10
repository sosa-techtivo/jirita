-- Real Delete for Ticket Attachments — the Attachments section's Delete
-- menu item previously only removed the row from local React state (see
-- AttachmentRow/AttachmentsSection in ticket-detail-screen.tsx), so a
-- deleted attachment reappeared on refresh. This adds the missing DELETE
-- policies for both the metadata row and the underlying Storage object;
-- deleteTicketAttachment in src/lib/tickets.ts removes the row first (what
-- the Attachments list actually depends on), then best-effort removes the
-- Storage object.
--
-- Mirrors ticket_attachments_insert/_update's own check: is_org_admin_or_lead
-- OR is_project_member on the ticket's project.

create policy ticket_attachments_delete on public.ticket_attachments
  for delete
  using (
    exists (
      select 1 from public.tickets t
      join public.projects p on p.id = t.project_id
      where t.id = ticket_id
        and (public.is_org_admin_or_lead(p.organization_id) or public.is_project_member(p.id))
    )
  );

grant delete on public.ticket_attachments to authenticated;

-- ── storage: ticket-attachments bucket ──────────────────────────────────────
-- Same check as ticket_attachments_storage_insert (20260724000000), mirrored
-- for delete so removing the object at its "<ticket_id>/..." path is allowed
-- for the same set of users.

create policy ticket_attachments_storage_delete on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'ticket-attachments'
    and exists (
      select 1 from public.tickets t
      join public.projects p on p.id = t.project_id
      where t.id::text = (storage.foldername(name))[1]
        and (public.is_org_admin_or_lead(p.organization_id) or public.is_project_member(p.id))
    )
  );
