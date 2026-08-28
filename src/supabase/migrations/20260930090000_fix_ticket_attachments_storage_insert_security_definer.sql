-- JIR-89 follow-up: ticket_attachments_storage_insert's WITH CHECK ran a
-- raw, non-security-definer subquery joining public.projects to evaluate
-- is_org_admin_or_lead(...)/is_project_member(...) for the ticket's
-- project:
--
--   exists (
--     select 1 from public.tickets t
--     join public.projects p on p.id = t.project_id
--     where t.id::text = (storage.foldername(objects.name))[1]
--       and (public.is_org_admin_or_lead(p.organization_id) or public.is_project_member(p.id))
--   )
--
-- Per Postgres RLS semantics, a raw subquery runs under the CALLER's own
-- row-level privileges for every table it touches — including this `projects`
-- join, which is itself gated by projects_select's own USING clause:
-- is_org_member(organization_id) AND (is_org_admin(organization_id) OR
-- is_project_member(id)). Note is_org_admin there, not is_org_admin_or_lead:
-- a Project Lead relying solely on their org-wide lead role (no
-- project_memberships row yet for this specific project) satisfies this
-- policy's own explicit is_org_admin_or_lead check in principle, but the
-- `projects` row itself is invisible to them inside the subquery, so the
-- join returns nothing and the whole check evaluates false — an upload
-- rejected by RLS despite the policy's own stated intent to allow it.
--
-- This is the exact same trap already found and fixed for
-- project_access_requests_insert (20260911000000_fix_project_access_
-- requests_insert_rls.sql) — a raw cross-table subquery inside a policy,
-- rather than a SECURITY DEFINER helper. Not reachable today through the
-- app's own navigation (loadLeadProjects only ever surfaces projects a Lead
-- already has a project_memberships row for, and the auto-membership
-- trigger from 20260808000000 grants one immediately after a ticket the
-- Lead successfully created), but it's a live gap for any future entry
-- point that reaches this policy without going through that pre-filtered
-- list first — e.g. the very first ticket a newly assigned Lead creates in
-- a project they haven't been explicitly staffed on yet.
--
-- Fix: same shape as can_view_project/can_request_project_access — do the
-- tickets -> projects lookup inside a SECURITY DEFINER function, which runs
-- as its owner and is not subject to RLS on the tables it queries
-- internally, so it sees the real organization_id/project_id regardless of
-- the caller's own visibility into `projects`. Preserves the exact same
-- text comparison against (storage.foldername(name))[1] the original raw
-- subquery used (no uuid cast, so a malformed path segment still just
-- evaluates to false rather than raising).

create or replace function public.can_write_ticket_attachment(target_ticket_id text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  target_org_id uuid;
  target_project_id uuid;
begin
  select p.organization_id, p.id
    into target_org_id, target_project_id
    from public.tickets t
    join public.projects p on p.id = t.project_id
    where t.id::text = target_ticket_id;

  if target_org_id is null then
    return false;
  end if;

  return public.is_org_admin_or_lead(target_org_id) or public.is_project_member(target_project_id);
end;
$$;

drop policy ticket_attachments_storage_insert on storage.objects;

create policy ticket_attachments_storage_insert on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'ticket-attachments'
    and public.can_write_ticket_attachment((storage.foldername(objects.name))[1])
  );
