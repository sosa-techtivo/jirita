-- Real GitHub OAuth connection for Repository Integration. Separate table
-- from `projects.repository_provider`/`repository_url` (untouched here) —
-- those two columns keep representing the plain repository *link* a user
-- configures; this table represents a *verified* OAuth authorization proving
-- real read access to that same repository. No GitLab OAuth in this pass —
-- `provider` is constrained to 'github' only.
--
-- Every column here except the six safe display fields
-- (provider_username, repository_full_name, repository_html_url,
-- repository_default_branch, repository_is_private, connected_at/
-- last_verified_at) is either the encrypted token itself or something that
-- should never reach a browser. No column-level grant is used to carve out
-- the safe subset — instead, `authenticated` gets **no grant at all** on
-- this table. Every real read/write goes through a service-role Server
-- Action (src/lib/server/github-repository-connection*.ts), which is the
-- only place that ever decrypts a token, and only ever returns a small,
-- explicit, hand-picked DTO to the UI — never a raw row.

create table public.project_repository_connections (
  id                          uuid primary key default gen_random_uuid(),
  organization_id             uuid not null references public.organizations (id) on delete cascade,
  project_id                  uuid not null references public.projects (id) on delete cascade,
  provider                    text not null check (provider = 'github'),
  -- AES-256-GCM output (see lib/server/github-token-crypto.ts) — three
  -- separate base64 fields rather than one packed blob, so each part's
  -- purpose (ciphertext / IV / authentication tag) is unambiguous in the
  -- schema itself.
  access_token_ciphertext     text not null,
  access_token_iv             text not null,
  access_token_auth_tag       text not null,
  token_type                  text,
  granted_scopes              text[] not null default '{}',
  provider_user_id            bigint,
  provider_username           text,
  repository_id               bigint,
  repository_full_name        text,
  repository_html_url         text,
  repository_default_branch   text,
  repository_is_private       boolean,
  connected_by_profile_id     uuid not null references public.profiles (id) on delete restrict,
  connected_at                timestamptz not null default now(),
  last_verified_at            timestamptz,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  -- One GitHub connection per project — a second real Connect GitHub
  -- always upserts this same row (onConflict: project_id,provider) rather
  -- than creating a second one.
  unique (project_id, provider)
);

create trigger set_updated_at
  before update on public.project_repository_connections
  for each row execute function public.set_updated_at();

create index project_repository_connections_organization_id_idx on public.project_repository_connections (organization_id);
create index project_repository_connections_project_id_idx on public.project_repository_connections (project_id);

alter table public.project_repository_connections enable row level security;

-- Real RLS floor, matching projects_update's own authorization exactly
-- (is_org_admin_or_lead — the same "Admin or Project Lead" rule every
-- other Project Settings write already uses) — kept here as a genuine
-- access-control guarantee, not just documentation, even though no
-- `authenticated` grant exists below to make it reachable today. If a
-- future safe read view is ever built on top of this table, it inherits
-- this row-level floor for free.
create policy project_repository_connections_select on public.project_repository_connections
  for select
  using (public.is_org_admin_or_lead(organization_id));

-- Deliberately no insert/update/delete policy, and no grant of any kind to
-- `authenticated` below — every write (connect callback, disconnect) goes
-- through a service-role Server Action that independently re-verifies the
-- caller/organization/project/role server-side first. service_role already
-- has full access via 20260806000000's default privileges.

-- ── Auto-invalidate on repository reconfiguration ───────────────────────────
-- A saved GitHub OAuth authorization is only ever valid for the exact
-- repository it was verified against. If Project Settings' own Save
-- Changes changes repository_provider or repository_url in any way
-- (including clearing to "None"), the old connection can never be reused
-- for whatever the project now points at — it's deleted outright, and
-- Connect GitHub has to be run again. security definer so this fires
-- regardless of the caller's own (`authenticated`-role, no-grant) privileges
-- on this table — the same reasoning is_org_admin_or_lead already uses.
create or replace function public.invalidate_github_repository_connection()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.repository_provider is distinct from old.repository_provider)
     or (new.repository_url is distinct from old.repository_url) then
    delete from public.project_repository_connections
    where project_id = new.id and provider = 'github';
  end if;
  return new;
end;
$$;

create trigger projects_invalidate_github_connection
  after update of repository_provider, repository_url on public.projects
  for each row execute function public.invalidate_github_repository_connection();
