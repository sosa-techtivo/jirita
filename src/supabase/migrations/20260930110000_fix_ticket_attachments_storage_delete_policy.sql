-- Real bug fix, confirmed against the live pg_policies definition:
-- ticket_attachments_storage_delete (20260730000000) joined public.projects
-- (aliased p) inside its USING clause and referenced
-- `(storage.foldername(name))[1]` unqualified. projects has its own `name`
-- column, so Postgres resolved it to p.name — live qual reads
-- `storage.foldername(p.name)` — i.e. it compared the ticket id against the
-- project's display name instead of the object's own path. The check is
-- therefore always false: every authenticated remove() on this bucket
-- matched zero objects, and Storage reports that as a normal success with an
-- empty result. deleteTicketAttachment (src/lib/tickets.ts) removed the
-- metadata row and then silently left both the original and its thumbnail
-- behind, as did uploadTicketAttachment's own insert-failure cleanup.
-- Exactly the same column-shadowing bug 20260725000000 already fixed for
-- ticket_attachments_storage_insert — never carried over to delete.
--
-- Fix: mirrors the ticket_attachments_storage_insert policy actually
-- deployed in production (20260725000000's shape) as a DELETE USING clause,
-- with the object's own path explicitly qualified as objects.name.
-- Deliberately does NOT use public.can_write_ticket_attachment
-- (20260930090000): that migration is part of a known migration-history
-- drift and the function does not exist in production. Authorization
-- semantics are unchanged — is_org_admin_or_lead on the ticket's
-- organization OR is_project_member on its project, the same rule as
-- insert and as 20260730000000 intended.
--
-- Does not delete any existing object — objects already orphaned by this
-- bug are left for a separate, explicitly approved cleanup.

drop policy ticket_attachments_storage_delete on storage.objects;

create policy ticket_attachments_storage_delete on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'ticket-attachments'
    and exists (
      select 1 from public.tickets t
      join public.projects p on p.id = t.project_id
      where t.id::text = (storage.foldername(objects.name))[1]
        and (public.is_org_admin_or_lead(p.organization_id) or public.is_project_member(p.id))
    )
  );
