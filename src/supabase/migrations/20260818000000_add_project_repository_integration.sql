-- Repository Integration — Project Settings' new per-project section.
-- Integrations belong to each project, not the whole organization (see the
-- removal of Settings → Integrations, the old org-wide mock section). No
-- OAuth, no sync, no commit reads, no webhooks — this migration only adds
-- the two plain fields the UI reads/writes: which provider (if any) this
-- project links to, and its repository URL. Same enum-column convention
-- `projects.status`/`priority`/`health`/`category` already use for a closed
-- set of values, rather than a free-text + CHECK constraint.

create type public.repository_provider as enum ('none', 'github', 'gitlab');

alter table public.projects
  add column repository_provider public.repository_provider not null default 'none',
  add column repository_url      text;
