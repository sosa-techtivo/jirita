-- Phase 1 of per-project configurable ticket statuses (backend architecture
-- only — no UI, no Project Settings, no Board/Reports/Dashboards/filter
-- changes; those are later phases). Purely additive: introduces the final
-- data model for per-project statuses and a new, parallel
-- `tickets.status_id` reference, but never touches, renames, or drops the
-- existing `tickets.status` enum column. Every current read/write path
-- (Board, Reports, Dashboards, filters, Activity Log trigger, RLS,
-- historical-import RPCs) keeps reading/writing `status` exactly as before
-- and is completely unaffected — nothing anywhere in the app queries
-- `status_id` yet.
--
-- CRITICAL correction from the first version of this migration: `status_id`
-- being NOT NULL with nothing keeping it in sync would have broken every
-- ticket insert/update the app still performs (it only ever writes
-- `status`). This version adds a database-level sync mechanism
-- (tickets_sync_status_id, below) so `status` remains the application's
-- only interface during this transition — `status_id` is derived and kept
-- in lockstep automatically, entirely inside Postgres, with no TypeScript
-- change required anywhere.
--
-- Whole migration runs in one implicit transaction (the default for a
-- single .sql file applied via `supabase db push`/the SQL editor): if any
-- step below fails — including the explicit integrity checks and the final
-- NOT NULL constraint — everything in this file rolls back together, so
-- there is no possible partially-migrated state.
--
-- NOT applied to production from this environment — see the response that
-- accompanies this file.

-- ── ticket_statuses ──────────────────────────────────────────────────────────
-- The definitive per-project status model (not a temporary text column to
-- be replaced later): one row per status a project's tickets can be in,
-- ordered by sort_order. `legacy_enum_value` is the explicit, queryable
-- link back to `public.ticket_status` for exactly the rows that are this
-- transition period's authoritative equivalent of an enum value — NULL for
-- any row that has no equivalent in the enum (the new flow's 6 genuinely
-- new statuses). This column (not name-matching) is what
-- tickets_sync_status_id below relies on, and it is also the marker a
-- future migration can use to identify and remove the temporary
-- compatibility rows described further down, once the application no
-- longer needs to read/write the enum at all.

create table public.ticket_statuses (
  id                 uuid primary key default gen_random_uuid(),
  project_id         uuid not null references public.projects (id) on delete cascade,
  name               text not null,
  sort_order         integer not null,
  legacy_enum_value  public.ticket_status,
  created_at         timestamptz not null default now(),
  unique (project_id, sort_order),
  unique (project_id, name),
  unique (project_id, legacy_enum_value)
);

create index ticket_statuses_project_id_idx on public.ticket_statuses (project_id);

alter table public.ticket_statuses enable row level security;

-- Read-only for every client role, same project-visibility rule every other
-- project-scoped table already uses. No insert/update/delete policy is
-- defined on purpose — nothing in this phase writes to this table from the
-- client; every write happens either in this migration or inside
-- security-definer trigger functions below.
create policy ticket_statuses_select on public.ticket_statuses
  for select
  using (public.can_view_project(project_id));

grant select on public.ticket_statuses to authenticated;

-- ── Backfill: every existing project gets its current 6 statuses copied
-- verbatim ─────────────────────────────────────────────────────────────────
-- Exact same names, same order, same enum values as today (public.
-- ticket_status: backlog, to_do, in_progress, review, blocked, done) and the
-- same Title Case labels the app already shows everywhere (ticket-ui.tsx's
-- STATUS_LABEL) — no renaming, no reordering, no new statuses, nothing
-- added or removed. One-time copy for projects that already exist at the
-- moment this migration runs.

insert into public.ticket_statuses (project_id, name, sort_order, legacy_enum_value)
select p.id, v.name, v.sort_order, v.legacy_enum_value
from public.projects p
cross join (values
  ('Backlog',     1, 'backlog'::public.ticket_status),
  ('To Do',       2, 'to_do'::public.ticket_status),
  ('In Progress', 3, 'in_progress'::public.ticket_status),
  ('In Review',   4, 'review'::public.ticket_status),
  ('Blocked',     5, 'blocked'::public.ticket_status),
  ('Done',        6, 'done'::public.ticket_status)
) as v(name, sort_order, legacy_enum_value);

-- ── resolve_ticket_status_id: the one place that maps (project, enum value)
-- -> ticket_statuses.id ──────────────────────────────────────────────────────
-- Used by both the one-time backfill below and the ongoing sync trigger
-- further down, so there is exactly one implementation of "what status_id
-- does this project+status combination resolve to" — never duplicated
-- between the backfill and the trigger. Returns null (never raises) when no
-- match exists — callers decide whether that is an error.

create or replace function public.resolve_ticket_status_id(
  target_project_id uuid,
  target_status public.ticket_status
)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.ticket_statuses
  where project_id = target_project_id
    and legacy_enum_value = target_status;
$$;

-- ── New projects: seed the new default status flow automatically ───────────
-- Fires once per newly-created project, right after the insert. Runs as
-- `security definer` (same pattern as every other trigger function in this
-- schema, e.g. log_ticket_field_changes) so it always happens regardless of
-- which client/role created the project — never dependent on application
-- code remembering to call it.
--
-- Seeds 12 rows, not 9: the 9-status flow requested for new projects
-- (Backlog, In Progress, Blocked, Resolved in Development, Approved to
-- Staging, Resolved in Staging, Approved to go live, Resolved Live, Closed)
-- only has an exact enum equivalent for its first three entries. The
-- application can still only write/read the 6-value enum during this
-- transition (Board, Ticket Detail, Ticket Preview, filters are all
-- untouched), so a ticket in a *new* project can still end up with
-- status = 'to_do' / 'review' / 'done' — values with no row in the
-- 9-status flow. Rather than invent a silent mapping onto one of the 9 new
-- statuses (explicitly disallowed), 3 additional rows (To Do, In Review,
-- Done — sort_order 10-12) are seeded purely as temporary legacy
-- compatibility, marked via legacy_enum_value exactly like the 3 in the
-- main 9 that already double as enum equivalents (Backlog, In Progress,
-- Blocked). This guarantees every one of the 6 enum values always resolves
-- to a real ticket_statuses row for every project, old or new.
--
-- TEMPORARY LIMITATION, to be resolved in a later phase (once Board/
-- Reports/Dashboards/filters/Ticket Detail migrate to reading/writing
-- status_id instead of the enum, and Project Settings exists to let a
-- project curate its own visible flow): rows 10-12 below are not part of
-- the intended 9-status flow and should be hidden/removed once nothing in
-- the application still needs the enum. They are trivially identifiable
-- later via `sort_order > 9` for any project seeded by this trigger, or in
-- general via `legacy_enum_value is not null and name not in ('Backlog',
-- 'In Progress', 'Blocked')`.

create or replace function public.seed_default_ticket_statuses()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.ticket_statuses (project_id, name, sort_order, legacy_enum_value)
  values
    (new.id, 'Backlog',                    1, 'backlog'),
    (new.id, 'In Progress',                2, 'in_progress'),
    (new.id, 'Blocked',                    3, 'blocked'),
    (new.id, 'Resolved in Development',    4, null),
    (new.id, 'Approved to Staging',        5, null),
    (new.id, 'Resolved in Staging',        6, null),
    (new.id, 'Approved to go live',        7, null),
    (new.id, 'Resolved Live',              8, null),
    (new.id, 'Closed',                     9, null),
    (new.id, 'To Do',                     10, 'to_do'),
    (new.id, 'In Review',                 11, 'review'),
    (new.id, 'Done',                      12, 'done');
  return new;
end;
$$;

create trigger projects_seed_default_ticket_statuses
  after insert on public.projects
  for each row execute function public.seed_default_ticket_statuses();

-- ── tickets.status_id: parallel reference to the new model ──────────────────
-- Purely additive column — `tickets.status` (the enum) is untouched and
-- remains the one column every existing read/write path uses. Added
-- nullable first so the backfill below can populate it before the NOT NULL
-- constraint is enforced.

alter table public.tickets
  add column status_id uuid references public.ticket_statuses (id);

-- ── One-time backfill for existing tickets ──────────────────────────────────
-- Direct, untriggered UPDATE (the ongoing sync trigger is only created
-- further below, once this backfill has already produced a fully correct
-- and verified state) — a plain SQL statement is enough here since every
-- existing ticket's project was just seeded with all 6 enum-equivalent
-- rows above.
--
-- set_updated_at (BEFORE UPDATE on tickets) is temporarily disabled around
-- this one statement: it unconditionally sets updated_at = now() on any
-- UPDATE regardless of which column changed, and several real features
-- (e.g. "completed this month" proxies that key off a done ticket's
-- updated_at, "recently updated" sorts/filters) depend on that timestamp
-- reflecting genuine activity. Backfilling status_id must never look like
-- every historical ticket was "just updated" today. No other existing
-- trigger needs disabling: tickets_log_field_changes only reacts to
-- old/new differences on columns other than status_id (none of which
-- change here), and tickets_ensure_membership_on_update no-ops without a
-- real auth.uid() (there is none in a migration).

alter table public.tickets disable trigger set_updated_at;

update public.tickets
set status_id = public.resolve_ticket_status_id(project_id, status);

alter table public.tickets enable trigger set_updated_at;

-- ── Integrity checks — abort the whole migration if any fails ──────────────

do $$
declare
  unmapped_count integer;
begin
  select count(*) into unmapped_count from public.tickets where status_id is null;
  if unmapped_count > 0 then
    raise exception 'ticket_statuses backfill incomplete: % ticket(s) have no matching status_id', unmapped_count;
  end if;
end $$;

do $$
declare
  cross_project_count integer;
begin
  select count(*) into cross_project_count
  from public.tickets t
  join public.ticket_statuses ts on ts.id = t.status_id
  where ts.project_id <> t.project_id;
  if cross_project_count > 0 then
    raise exception 'ticket_statuses backfill produced % ticket(s) whose status_id belongs to a different project', cross_project_count;
  end if;
end $$;

do $$
declare
  mismatched_status_count integer;
begin
  select count(*) into mismatched_status_count
  from public.tickets t
  join public.ticket_statuses ts on ts.id = t.status_id
  where ts.legacy_enum_value is distinct from t.status;
  if mismatched_status_count > 0 then
    raise exception 'ticket_statuses backfill produced % ticket(s) whose status_id does not correspond to their status', mismatched_status_count;
  end if;
end $$;

alter table public.tickets
  alter column status_id set not null;

-- ── Ongoing sync trigger — governs every future insert/update ──────────────
-- status (the enum) is the single source of truth during this transition:
--   * INSERT: status_id is always (re)derived from project_id + status,
--     regardless of what the caller sent (including nothing at all — every
--     real insert path today, createTicket() and
--     insert_tickets_bypassing_activity_log(), never lists status_id).
--   * UPDATE that doesn't touch status_id (every real update path today —
--     updateTicket()'s patch builder never includes it): status_id is
--     re-derived from the (possibly just-changed) status, so the two
--     columns can never drift apart.
--   * UPDATE that DOES explicitly set status_id to something different
--     from what the row already had (not exercised by any application code
--     today): validated against the same resolution used above — accepted
--     only if it is exactly the row this ticket's own project+status
--     combination already resolves to, otherwise rejected outright. This
--     is what keeps a future, deliberate status_id write from ever
--     landing on a different project's row or a status_id that
--     contradicts `status` — never silently overwritten, never silently
--     accepted if inconsistent.
-- No recursion: this only ever mutates NEW inside a single BEFORE trigger,
-- never issues a nested INSERT/UPDATE.

create or replace function public.sync_ticket_status_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  expected_status_id uuid;
begin
  expected_status_id := public.resolve_ticket_status_id(new.project_id, new.status);
  if expected_status_id is null then
    raise exception 'No ticket_statuses row found for project % and status % — the per-project status seed is incomplete', new.project_id, new.status;
  end if;

  if tg_op = 'INSERT' or old.status_id is not distinct from new.status_id then
    new.status_id := expected_status_id;
    return new;
  end if;

  if new.status_id is distinct from expected_status_id then
    raise exception
      'status_id % is inconsistent with project % and status % (expected %)',
      new.status_id, new.project_id, new.status, expected_status_id;
  end if;

  return new;
end;
$$;

create trigger tickets_sync_status_id
  before insert or update on public.tickets
  for each row execute function public.sync_ticket_status_id();
