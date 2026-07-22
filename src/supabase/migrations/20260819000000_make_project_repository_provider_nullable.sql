-- Repository Integration data model correction. The prior migration
-- (20260818000000_add_project_repository_integration.sql, already applied
-- — not modified here) made repository_provider a NOT NULL enum defaulting
-- to 'none'. This feature's real spec instead treats "no provider" as a
-- genuine null, with only 'github'/'gitlab' as storable values, plus a
-- real constraint tying repository_url's presence to it. Additive only —
-- no table drop, no data reset.

-- Every existing 'none' row (the only value application code has written
-- so far — no project has ever had a real github/gitlab config yet)
-- becomes null, the new "no provider" representation.
update public.projects
set repository_provider = null
where repository_provider = 'none';

alter table public.projects
  alter column repository_provider drop default,
  alter column repository_provider drop not null;

-- Postgres can't drop a value from an existing enum type in place, so the
-- 'none' label stays defined on public.repository_provider — this CHECK is
-- what actually keeps it (and anything other than github/gitlab) from ever
-- being stored again; null is the only valid "no provider" value from here on.
alter table public.projects
  add constraint projects_repository_provider_check
    check (repository_provider is null or repository_provider in ('github', 'gitlab'));

-- Provider and URL are always set/cleared together — never one without the
-- other. Application code (lib/projects.ts's updateProjectSettings) already
-- enforces this on every write; this is the backend-level guarantee that
-- holds regardless of how a row is ever written.
alter table public.projects
  add constraint projects_repository_url_requires_provider
    check (
      (repository_provider is null and repository_url is null)
      or (repository_provider is not null and repository_url is not null)
    );
