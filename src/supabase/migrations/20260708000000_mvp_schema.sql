-- Jirita MVP schema — initial migration.
--
-- Implements exactly what is documented in src/docs/SUPABASE_MVP_SCHEMA.md.
-- No deferred features (time tracking, notes, milestones-as-table, reports,
-- custom fields, automations, integrations, attachments) are included here —
-- see that doc's "Deferred, not modeled yet" section.
--
-- This migration only defines schema/RLS. No UI is connected to it yet and
-- mock auth/data in src/lib/mock-*.ts is untouched.

-- ── Extensions ──────────────────────────────────────────────────────────────

create extension if not exists pgcrypto;

-- ── Enums ───────────────────────────────────────────────────────────────────
-- Fixed MVP value sets, matching the string-union types already hardcoded in
-- src/lib/current-user.ts, src/lib/mock-projects.ts, and src/lib/mock-tickets.ts.
-- See the schema doc's "Statuses / priorities: enums, not lookup tables" for
-- why these are enums rather than editable rows for the MVP.

create type public.org_role as enum ('admin', 'project_lead', 'member');
create type public.membership_status as enum ('active', 'invited', 'disabled');

create type public.project_status as enum ('planning', 'active', 'on_hold', 'completed', 'archived');
create type public.project_priority as enum ('critical', 'high', 'medium', 'low');
create type public.project_health as enum ('healthy', 'needs_attention', 'critical');
create type public.project_category as enum ('client', 'internal');

create type public.ticket_status as enum ('backlog', 'to_do', 'in_progress', 'review', 'blocked', 'done');
create type public.ticket_priority as enum ('high', 'normal', 'low');
create type public.ticket_type as enum ('task', 'bug');

-- ── updated_at trigger helper ───────────────────────────────────────────────
-- Applied only to tables the schema doc lists a created_at/updated_at pair
-- for: profiles, projects, tickets, ticket_comments.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ── organizations ────────────────────────────────────────────────────────────
-- The Workspace — top-level tenant boundary everything else scopes to.

create table public.organizations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  slug       text not null unique,
  created_at timestamptz not null default now()
);

-- ── profiles ─────────────────────────────────────────────────────────────────
-- A person's identity. 1:1 with auth.users. Holds no role — role is
-- per-organization (see organization_memberships below).

create table public.profiles (
  id                 uuid primary key references auth.users (id) on delete cascade,
  first_name         text,
  last_name          text,
  email              text,
  avatar_url         text,
  unfuddle_id        text unique,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create trigger set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create index profiles_unfuddle_id_idx on public.profiles (unfuddle_id);

-- ── organization_memberships ─────────────────────────────────────────────────
-- Org-level role — replaces current-user.ts's Role and mock-users.ts's
-- workspace account record.

create table public.organization_memberships (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  profile_id       uuid not null references public.profiles (id) on delete cascade,
  role             public.org_role not null,
  status           public.membership_status not null default 'active',
  weekly_capacity  numeric,
  created_at       timestamptz not null default now(),
  unique (organization_id, profile_id)
);

create index organization_memberships_profile_id_idx on public.organization_memberships (profile_id);

-- ── projects ─────────────────────────────────────────────────────────────────
-- Matches ProjectSummary in mock-projects.ts. Computed counts (openTickets,
-- progress, etc.) are intentionally not stored — derive them from tickets.

create table public.projects (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null references public.organizations (id) on delete cascade,
  slug                  text not null,
  name                  text not null,
  short_name            text,
  project_code          text not null,
  description           text,
  status                public.project_status not null default 'planning',
  priority              public.project_priority not null default 'medium',
  health                public.project_health not null default 'healthy',
  category              public.project_category not null default 'internal',
  client_name           text,
  default_hourly_rate   numeric,
  owner_profile_id      uuid references public.profiles (id) on delete set null,
  target_date           date,
  unfuddle_id           text unique,
  unfuddle_imported_at  timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (organization_id, slug),
  unique (organization_id, project_code)
);

create trigger set_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

create index projects_organization_id_idx on public.projects (organization_id);
create index projects_owner_profile_id_idx on public.projects (owner_profile_id);

-- ── project_memberships ──────────────────────────────────────────────────────
-- Matches TeamMember in mock-team.ts — one row per person per project.
-- Availability status and assigned-hours totals are intentionally not
-- stored — both are derived from tickets at read time.

create table public.project_memberships (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid not null references public.projects (id) on delete cascade,
  profile_id       uuid not null references public.profiles (id) on delete cascade,
  title            text,
  weekly_capacity  numeric,
  created_at       timestamptz not null default now(),
  unique (project_id, profile_id)
);

create index project_memberships_profile_id_idx on public.project_memberships (profile_id);

-- ── tickets ───────────────────────────────────────────────────────────────────
-- Matches Ticket in mock-tickets.ts. commentCount/attachmentCount are
-- intentionally not stored — derive from ticket_comments (and a future
-- attachments table). ticket_number is per-project, matching
-- pending-tickets.ts's existing counter design and getTicketDisplayKey().

create table public.tickets (
  id                     uuid primary key default gen_random_uuid(),
  project_id             uuid not null references public.projects (id) on delete cascade,
  ticket_number          integer not null,
  title                  text not null,
  description            text,
  status                 public.ticket_status not null default 'backlog',
  priority               public.ticket_priority not null default 'normal',
  type                   public.ticket_type not null default 'task',
  assignee_profile_id    uuid references public.profiles (id) on delete set null,
  milestone              text,
  labels                 text[] not null default '{}',
  acceptance_criteria    text[],
  story_points           integer,
  hours                  numeric,
  due_date               date,
  unfuddle_id            text unique,
  unfuddle_imported_at   timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (project_id, ticket_number)
);

create trigger set_updated_at
  before update on public.tickets
  for each row execute function public.set_updated_at();

create index tickets_project_id_idx on public.tickets (project_id);
create index tickets_assignee_profile_id_idx on public.tickets (assignee_profile_id);
create index tickets_status_idx on public.tickets (status);
create index tickets_due_date_idx on public.tickets (due_date);

-- ── ticket_comments ───────────────────────────────────────────────────────────
-- User-authored discussion — persisted counterpart to MockComment in
-- ticket-ui.tsx. author_profile_id is nullable for unmatched legacy authors
-- imported from Unfuddle (see the schema doc's import notes).

create table public.ticket_comments (
  id                    uuid primary key default gen_random_uuid(),
  ticket_id             uuid not null references public.tickets (id) on delete cascade,
  author_profile_id     uuid references public.profiles (id) on delete set null,
  body                  text not null,
  unfuddle_id           text unique,
  unfuddle_imported_at  timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz
);

create trigger set_updated_at
  before update on public.ticket_comments
  for each row execute function public.set_updated_at();

create index ticket_comments_ticket_id_idx on public.ticket_comments (ticket_id);

-- ── ticket_activity ───────────────────────────────────────────────────────────
-- Append-only system/audit log — persisted counterpart to MockActivity in
-- ticket-ui.tsx. Written by application/service-role logic only (see RLS
-- below) — never directly by an end-user client, and never updated.

create table public.ticket_activity (
  id                 uuid primary key default gen_random_uuid(),
  ticket_id          uuid not null references public.tickets (id) on delete cascade,
  actor_profile_id   uuid references public.profiles (id) on delete set null,
  event_type         text not null,
  payload            jsonb,
  created_at         timestamptz not null default now()
);

create index ticket_activity_ticket_id_idx on public.ticket_activity (ticket_id);

-- ── RLS: helper functions ─────────────────────────────────────────────────────
-- security definer + fixed search_path so these can be safely referenced from
-- policies without re-checking RLS on the tables they query internally.

create or replace function public.is_org_member(target_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_memberships
    where organization_id = target_org_id
      and profile_id = auth.uid()
      and status = 'active'
  );
$$;

create or replace function public.is_org_admin(target_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_memberships
    where organization_id = target_org_id
      and profile_id = auth.uid()
      and status = 'active'
      and role = 'admin'
  );
$$;

create or replace function public.is_org_admin_or_lead(target_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_memberships
    where organization_id = target_org_id
      and profile_id = auth.uid()
      and status = 'active'
      and role in ('admin', 'project_lead')
  );
$$;

create or replace function public.is_project_member(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.project_memberships
    where project_id = target_project_id
      and profile_id = auth.uid()
  );
$$;

-- "Admin sees every project org-wide; Project Lead/Member see only projects
-- they're staffed on" — matches the schema doc's projects read policy.
create or replace function public.can_view_project(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.projects p
    where p.id = target_project_id
      and public.is_org_member(p.organization_id)
      and (
        public.is_org_admin(p.organization_id)
        or public.is_project_member(p.id)
      )
  );
$$;

-- ── RLS: enable ────────────────────────────────────────────────────────────

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.organization_memberships enable row level security;
alter table public.projects enable row level security;
alter table public.project_memberships enable row level security;
alter table public.tickets enable row level security;
alter table public.ticket_comments enable row level security;
alter table public.ticket_activity enable row level security;

-- ── RLS: organizations ─────────────────────────────────────────────────────
-- Read-only from the client for the MVP — workspace creation is an
-- ops/service-role action, not documented as a client-facing flow yet.

create policy organizations_select on public.organizations
  for select
  using (public.is_org_member(id));

-- ── RLS: profiles ──────────────────────────────────────────────────────────
-- Insert/update-self policies are not spelled out in the schema doc's RLS
-- section, but are the minimum needed for a profile row to ever get created
-- and edited by its own owner after Supabase Auth signup — without them the
-- table has no write path at all.

create policy profiles_select on public.profiles
  for select
  using (
    exists (
      select 1
      from public.organization_memberships mine
      join public.organization_memberships theirs
        on theirs.organization_id = mine.organization_id
      where mine.profile_id = auth.uid()
        and theirs.profile_id = profiles.id
    )
  );

create policy profiles_insert_self on public.profiles
  for insert
  with check (id = auth.uid());

create policy profiles_update_self on public.profiles
  for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- ── RLS: organization_memberships ──────────────────────────────────────────
-- Visible to fellow org members; managed (insert/update/delete) by that
-- org's admins — mirrors the Admin-only Users management module.

create policy organization_memberships_select on public.organization_memberships
  for select
  using (public.is_org_member(organization_id));

create policy organization_memberships_insert on public.organization_memberships
  for insert
  with check (public.is_org_admin(organization_id));

create policy organization_memberships_update on public.organization_memberships
  for update
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

create policy organization_memberships_delete on public.organization_memberships
  for delete
  using (public.is_org_admin(organization_id));

-- ── RLS: projects ───────────────────────────────────────────────────────────

create policy projects_select on public.projects
  for select
  using (public.can_view_project(id));

create policy projects_insert on public.projects
  for insert
  with check (public.is_org_admin_or_lead(organization_id));

create policy projects_update on public.projects
  for update
  using (public.is_org_admin_or_lead(organization_id))
  with check (public.is_org_admin_or_lead(organization_id));

create policy projects_delete on public.projects
  for delete
  using (public.is_org_admin_or_lead(organization_id));

-- ── RLS: project_memberships ─────────────────────────────────────────────────

create policy project_memberships_select on public.project_memberships
  for select
  using (public.can_view_project(project_id));

create policy project_memberships_insert on public.project_memberships
  for insert
  with check (
    exists (
      select 1 from public.projects p
      where p.id = project_id
        and public.is_org_admin_or_lead(p.organization_id)
    )
  );

create policy project_memberships_update on public.project_memberships
  for update
  using (
    exists (
      select 1 from public.projects p
      where p.id = project_id
        and public.is_org_admin_or_lead(p.organization_id)
    )
  )
  with check (
    exists (
      select 1 from public.projects p
      where p.id = project_id
        and public.is_org_admin_or_lead(p.organization_id)
    )
  );

create policy project_memberships_delete on public.project_memberships
  for delete
  using (
    exists (
      select 1 from public.projects p
      where p.id = project_id
        and public.is_org_admin_or_lead(p.organization_id)
    )
  );

-- ── RLS: tickets ─────────────────────────────────────────────────────────────
-- No delete policy: ticket deletion isn't documented in the schema doc, so
-- it's left denied-by-default for every client role until that's decided.

create policy tickets_select on public.tickets
  for select
  using (public.can_view_project(project_id));

create policy tickets_insert on public.tickets
  for insert
  with check (public.is_project_member(project_id));

create policy tickets_update on public.tickets
  for update
  using (
    assignee_profile_id = auth.uid()
    or exists (
      select 1 from public.projects p
      where p.id = project_id
        and public.is_org_admin_or_lead(p.organization_id)
    )
  )
  with check (
    assignee_profile_id = auth.uid()
    or exists (
      select 1 from public.projects p
      where p.id = project_id
        and public.is_org_admin_or_lead(p.organization_id)
    )
  );

-- ── RLS: ticket_comments ──────────────────────────────────────────────────────
-- Insert-only beyond select, per the schema doc ("no update/delete in the
-- MVP").

create policy ticket_comments_select on public.ticket_comments
  for select
  using (
    exists (
      select 1 from public.tickets t
      where t.id = ticket_id
        and public.can_view_project(t.project_id)
    )
  );

create policy ticket_comments_insert on public.ticket_comments
  for insert
  with check (
    exists (
      select 1 from public.tickets t
      where t.id = ticket_id
        and public.is_project_member(t.project_id)
    )
  );

-- ── RLS: ticket_activity ──────────────────────────────────────────────────────
-- Select-only for every client role — rows are written by application logic
-- using the service role, which bypasses RLS entirely, so no insert policy
-- is defined here on purpose (see the schema doc's write-policy notes).

create policy ticket_activity_select on public.ticket_activity
  for select
  using (
    exists (
      select 1 from public.tickets t
      where t.id = ticket_id
        and public.can_view_project(t.project_id)
    )
  );
