-- Extends `ticket_statuses` (20260830000000) into the definitive
-- per-project status model, per explicit product decision: `ticket_statuses`
-- stays the one real table (no separate `project_statuses`) — a second,
-- parallel table would just duplicate the exact same concept under a
-- different name. This migration only adds what that definitive model
-- still needs (`group_type`, `is_default`, `updated_at`) and corrects the
-- seed to the simplified 6-status flow every project should start with;
-- `sort_order` is kept as-is (no rename to `position` — no real benefit).
--
-- Confirmed via a live, read-only probe against the real Supabase project
-- (anon key, `select id from ticket_statuses limit 1`) immediately before
-- writing this migration: `ticket_statuses` and `tickets.status_id` do not
-- exist there yet — PGRST205 / "column tickets.status_id does not exist".
-- 20260830000000 was authored but never actually applied to production, so
-- both migrations will run together in the same future deploy — this one
-- corrects 20260830000000's own seed rows within that same deploy, before
-- anything else can ever read them, rather than patching already-live data.
--
-- Backup/Restore (export-project.ts, execute-project-restore-phase1.ts,
-- etc.) never inserts into `ticket_statuses` directly and is therefore
-- completely unaffected by anything below: a restored project relies
-- entirely on `seed_default_ticket_statuses` firing again on its own fresh
-- `projects` insert, and restored tickets rely entirely on
-- `tickets_sync_status_id` firing again on their own fresh `tickets`
-- insert — both triggers are updated in place below, so restore picks up
-- the exact same definitive model for free, with no restore-path code
-- changed. `export-project.ts`'s own `select("*")` on `ticket_statuses`
-- will start including these new columns in a backup's `statuses.json`
-- going forward — harmless (the import side only ever reads by name, never
-- validates an exact field set), not something this migration needs to
-- touch.

-- ── New columns ──────────────────────────────────────────────────────────────
-- group_type/is_default nullable-then-backfilled-then-constrained, same
-- "add nullable, backfill, enforce" shape 20260830000000's own status_id
-- column already used. updated_at added now (the definitive model should
-- have it) but not yet wired to a set_updated_at trigger — there is no
-- write path that edits an existing status row in this phase (no UI, no
-- Server Action); a later phase that adds real status management is what
-- should wire that trigger, the same way ticket_time_entries.updated_at
-- was added long before its own real edit flow existed (20260824000000 →
-- 20260913000000).

alter table public.ticket_statuses
  add column group_type text,
  add column is_default boolean not null default false,
  add column updated_at timestamptz;

-- ── Backfill the rows 20260830000000 already seeds for every existing
-- project ─────────────────────────────────────────────────────────────────
-- Only the 6 rows carrying a legacy_enum_value are touched (that migration
-- never seeds a project-existed-at-deploy-time row without one) — To Do is
-- the sole open default, Done is the only closed status, everything else
-- open/non-default.
--
-- sort_order is corrected in two steps (bump out of the way, then set final
-- values) rather than one: swapping Blocked and In Review's positions in a
-- single UPDATE risks a transient unique(project_id, sort_order) violation
-- (Postgres checks that constraint per row as the statement executes, and
-- a non-deferred unique index can see two rows momentarily share a value
-- mid-statement) — bumping every row well out of the 1-6 range first, then
-- setting final values in a second pass, guarantees no such collision is
-- ever possible.

update public.ticket_statuses
set sort_order = sort_order + 100
where legacy_enum_value is not null;

update public.ticket_statuses
set
  group_type = case when legacy_enum_value = 'done' then 'closed' else 'open' end,
  is_default = (legacy_enum_value = 'to_do'),
  sort_order = case legacy_enum_value
    when 'backlog'     then 1
    when 'to_do'       then 2
    when 'in_progress' then 3
    when 'blocked'     then 4
    when 'review'      then 5
    when 'done'        then 6
  end
where legacy_enum_value is not null;

-- ── Integrity check — abort if any project ends up without exactly one
-- default open status ────────────────────────────────────────────────────
-- Same "raise exception, whole migration rolls back together" convention
-- 20260830000000 itself established for its own backfill checks.

do $$
declare
  bad_default_count integer;
begin
  select count(*) into bad_default_count
  from (
    select project_id, count(*) filter (where is_default) as default_count
    from public.ticket_statuses
    group by project_id
  ) counts
  where default_count <> 1;

  if bad_default_count > 0 then
    raise exception '% project(s) do not have exactly one default ticket status', bad_default_count;
  end if;
end $$;

-- ── Constraints — enforced only now that every row is known-good ──────────
-- group_type is required and can only ever be 'open'/'closed'; a closed
-- status can never also be the project's default (the default must always
-- be something a ticket starts/reopens into, never a terminal one); at
-- most one default per project, enforced by the database itself, not just
-- by this migration's own one-time backfill.

alter table public.ticket_statuses
  alter column group_type set not null;

alter table public.ticket_statuses
  add constraint ticket_statuses_group_type_check check (group_type in ('open', 'closed'));

alter table public.ticket_statuses
  add constraint ticket_statuses_default_must_be_open check (not is_default or group_type = 'open');

create unique index ticket_statuses_one_default_per_project
  on public.ticket_statuses (project_id)
  where is_default;

-- ── New projects: seed the same definitive 6-status flow, not the old
-- 9/12-row custom one ────────────────────────────────────────────────────
-- Replaces 20260830000000's own seed_default_ticket_statuses (still the
-- same trigger, same firing point — `after insert on projects` — only the
-- rows it inserts change): every project, existing or new, now starts with
-- exactly these 6 statuses, matching the backfill above exactly.

create or replace function public.seed_default_ticket_statuses()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.ticket_statuses (project_id, name, sort_order, legacy_enum_value, group_type, is_default)
  values
    (new.id, 'Backlog',     1, 'backlog',     'open',   false),
    (new.id, 'To Do',       2, 'to_do',       'open',   true),
    (new.id, 'In Progress', 3, 'in_progress', 'open',   false),
    (new.id, 'Blocked',     4, 'blocked',     'open',   false),
    (new.id, 'In Review',   5, 'review',      'open',   false),
    (new.id, 'Done',        6, 'done',        'closed', false);
  return new;
end;
$$;
