-- NOTE ON THIS FILENAME'S TIMESTAMP: like every migration in this repo
-- after the first (20260708000000_mvp_schema.sql), the leading timestamp is
-- a monotonic sequence number, not this file's real authoring date —
-- e.g. 20260930010000_fix_project_delete_cascade_guard_conflicts.sql was
-- actually committed 2026-08-18. This file simply continues that same
-- sequence, one slot after the latest existing migration
-- (20260930010000), which is what keeps `supabase db push` applying
-- cleanly against the already-applied history — a real-calendar-date
-- filename here would sort *before* ~40 already-existing migrations.
--
-- Per-user, per-organization "starred project" quick-access list for the
-- Sidebar's new Favorites accordion. Deliberately keyed by
-- (organization_id, project_slug) rather than a raw project_id FK — `slug`
-- is already this app's stable, immutable-after-creation project identifier
-- (routes, Sidebar's own activeSlug, etc. all key off it, and it's never
-- part of any project update path), and projects already carries a real
-- `unique (organization_id, slug)` constraint (20260708000000_mvp_schema.sql)
-- to build a genuine composite FK against — so this still gets real
-- referential integrity and on-delete-cascade cleanup (a real permanent
-- Delete Project, see delete-project-action.ts, correctly removes any
-- favorite rows for it) without requiring ProjectSummary/rowToProjectSummary
-- to start carrying a raw uuid they don't otherwise need.
--
-- A favorite is purely personal — never visible to, or affected by, any
-- other user — and never removes a project from the general Projects list;
-- it's additive-only quick access.

create table public.project_favorites (
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  project_slug     text not null,
  profile_id       uuid not null references public.profiles (id) on delete cascade,
  created_at       timestamptz not null default now(),
  primary key (profile_id, organization_id, project_slug),
  foreign key (organization_id, project_slug)
    references public.projects (organization_id, slug) on delete cascade
);

-- Every real read is `.eq(organization_id).eq(profile_id)` (see
-- loadFavoriteProjectSlugs, lib/projects.ts) — already covered by the
-- primary key's own leading columns, so no extra index is needed.

alter table public.project_favorites enable row level security;

-- `profile_id = auth.uid()` alone is necessary but not sufficient: without
-- more, an authenticated user could insert a favorite row for *any*
-- (organization_id, project_slug) pair they can merely guess/know, even one
-- belonging to an organization/project they have no real access to — the
-- composite FK only guarantees the pair points at a *real* project
-- somewhere, not that this caller may see it. SELECT/INSERT below reuse
-- `public.can_view_project(project_id)` (20260708000000_mvp_schema.sql) —
-- the exact same "Admin sees every org project; Project Lead/Member only
-- projects they're staffed on" gate `projects_select` itself enforces, and
-- the same reuse pattern ticket_subscribers' own RLS already established
-- (20260925000000_add_ticket_subscribers.sql) — resolved here via a plain
-- EXISTS lookup against `projects` (never project_favorites itself, so no
-- recursive RLS). No new permission model, no second source of truth for
-- "can this user see this project."
--
-- DELETE is deliberately left as identity-only (`profile_id = auth.uid()`):
-- removing your own favorite can never leak or grant anything, and a user
-- who has since lost access to a project (removed from its team, or the
-- org) must still be able to clear their own now-stale favorite for it —
-- gating DELETE the same way as SELECT/INSERT would instead strand that
-- row forever, since they could no longer pass the access check that
-- created it to also remove it.
create policy project_favorites_select on public.project_favorites
  for select
  using (
    profile_id = auth.uid()
    and exists (
      select 1
      from public.projects p
      where p.organization_id = project_favorites.organization_id
        and p.slug = project_favorites.project_slug
        and public.can_view_project(p.id)
    )
  );

create policy project_favorites_insert on public.project_favorites
  for insert
  with check (
    profile_id = auth.uid()
    and exists (
      select 1
      from public.projects p
      where p.organization_id = project_favorites.organization_id
        and p.slug = project_favorites.project_slug
        and public.can_view_project(p.id)
    )
  );

create policy project_favorites_delete on public.project_favorites
  for delete
  using (profile_id = auth.uid());

-- No update grant — a favorite is a pure toggle (insert to add, delete to
-- remove), never an editable row.
grant select, insert, delete on public.project_favorites to authenticated;
