-- Minimal Clients table — backs the "+ Add new client" flow in Project
-- Settings' Billing section. Previously the Client selector only offered a
-- hardcoded placeholder roster (CLIENT_NAMES in mock-projects.ts); this
-- lets a real org build up its own list.
--
-- Deliberately NOT a foreign key on projects: projects.client_name stays
-- exactly as it is (free text) — this table is only the source of truth
-- for "which names exist" and duplicate-prevention, not a restructuring of
-- the project-client relationship. No edit/delete support (not
-- implemented in the UI), so only select/insert are granted below.

create table public.clients (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  name             text not null,
  created_at       timestamptz not null default now(),
  unique (organization_id, name)
);

create index clients_organization_id_idx on public.clients (organization_id);

alter table public.clients enable row level security;

-- Same visibility/write split as projects: any org member can read the
-- roster (needed to populate the dropdown), only admin/project_lead can
-- create one — Project Settings itself is already Admin/Project Lead only
-- per nav-config.ts, so this mirrors who can reach the "+ Add new client"
-- action at all. No update/delete policy: those actions aren't
-- implemented, so RLS denies them by default.
create policy clients_select on public.clients
  for select
  using (public.is_org_member(organization_id));

create policy clients_insert on public.clients
  for insert
  with check (public.is_org_admin_or_lead(organization_id));

grant select, insert on public.clients to authenticated;
