-- Final adjustment to close out the configurable-ticket-statuses feature:
-- new projects were still being seeded with the old 6-status legacy flow
-- (Backlog/To Do/In Progress/Blocked/In Review/Done, 20260918000000). By
-- explicit product decision, every NEW project should instead start with
-- this 8-status flow:
--
--   OPEN:   1. Backlog (default)  2. In Progress        3. Resolved in Dev
--           4. Approved to Staging  5. Resolved in Staging
--           6. Approved to Go Live
--   CLOSED: 7. Resolved Live      8. Closed
--
-- This migration only replaces `seed_default_ticket_statuses()` — the
-- single function `projects_seed_default_ticket_statuses`
-- (`after insert on projects`, 20260830000000) already calls. Nothing else
-- changes: the trigger itself, its firing point, and every existing
-- project's own already-seeded `ticket_statuses` rows (including any
-- project whose statuses were since hand-edited via Project Settings →
-- Statuses, Fase 3) are completely untouched — this function only ever
-- runs once, at `INSERT on projects`, for a project that doesn't exist
-- yet. Same "replace only the seed function, never touch historical rows
-- or migrations" approach 20260918000000 itself used to correct
-- 20260830000000's own original seed.
--
-- `Backlog` and `In Progress` keep the same `legacy_enum_value` mapping
-- the old flow already used for those exact names (`backlog`/`in_progress`)
-- — real, literal matches, not a fabricated equivalence. The other six
-- names have no legacy `ticket_status` enum equivalent at all (that enum
-- only ever had backlog/to_do/in_progress/blocked/review/done), so their
-- `legacy_enum_value` is left null, the same "never force a fabricated
-- legacy value onto a custom status" convention Fase 2.5
-- (20260919000000) already established — `status` (the legacy mirror
-- column) simply stays at its own table default for a ticket created
-- directly into one of those, exactly like any other custom status today.

create or replace function public.seed_default_ticket_statuses()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.ticket_statuses (project_id, name, sort_order, legacy_enum_value, group_type, is_default)
  values
    (new.id, 'Backlog',              1, 'backlog',     'open',   true),
    (new.id, 'In Progress',          2, 'in_progress', 'open',   false),
    (new.id, 'Resolved in Dev',      3, null,          'open',   false),
    (new.id, 'Approved to Staging',  4, null,          'open',   false),
    (new.id, 'Resolved in Staging',  5, null,          'open',   false),
    (new.id, 'Approved to Go Live',  6, null,          'open',   false),
    (new.id, 'Resolved Live',        7, null,          'closed', false),
    (new.id, 'Closed',               8, null,          'closed', false);
  return new;
end;
$$;
