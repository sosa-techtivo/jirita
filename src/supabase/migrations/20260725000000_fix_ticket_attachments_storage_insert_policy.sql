-- Real bug fix, found via a live INSERT test: ticket_attachments_storage_insert
-- (20260724000000) joined public.projects (aliased p) inside its WITH CHECK,
-- and projects also has a `name` column. The policy's
-- `(storage.foldername(name))[1]` reference was unqualified, so Postgres
-- silently resolved it to p.name (the project's own name, e.g. "Jirita")
-- instead of the intended storage.objects.name (the object's own path) —
-- column-shadowing inside the EXISTS subquery, not a logic error in the
-- authorization rule itself. This made every real upload fail RLS, since
-- the check was comparing a ticket id against a project name instead of
-- the actual upload path.
--
-- ticket_attachments_storage_select never had this bug (no projects join,
-- so no shadowing column existed there) — only the insert policy needed
-- fixing. `create policy` has no "or replace" form, so it must be dropped
-- and recreated with the reference explicitly qualified as objects.name.

drop policy ticket_attachments_storage_insert on storage.objects;

create policy ticket_attachments_storage_insert on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'ticket-attachments'
    and exists (
      select 1 from public.tickets t
      join public.projects p on p.id = t.project_id
      where t.id::text = (storage.foldername(objects.name))[1]
        and (public.is_org_admin_or_lead(p.organization_id) or public.is_project_member(p.id))
    )
  );
