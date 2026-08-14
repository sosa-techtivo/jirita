-- Narrow fix to recompute_parent_ticket_status (20260927000000): a project
-- can have more than one closed status (e.g. "Done" and "Cancelled") — the
-- previous "lowest sort_order" pick was purely positional and could just as
-- easily land the parent on "Cancelled" if an Admin ever reordered/added
-- statuses that way, even though every one of its children finished
-- normally. Auto-close is meant to represent normal completion of the
-- aggregated work, never an exceptional/terminal status a human chose for
-- a specific reason.
--
-- Reuses existing metadata rather than inventing any: `legacy_enum_value`
-- (20260830000000) already marks exactly one closed status per project as
-- the one every project is seeded with for "done" — the real, existing
-- notion of "the normal completion status" this schema has, so it's
-- preferred whenever it still exists (it can technically be deleted once a
-- project has more than one closed status — ticket_statuses_block_unsafe_
-- delete, 20260920000000 — the only case that isn't already covered).
--
-- Fallback (no surviving `legacy_enum_value = 'done'` row — the only way
-- that happens): oldest closed status by `created_at`, not lowest
-- `sort_order`. `sort_order` is freely reorderable by an Admin at any time
-- (reorder_ticket_statuses, 20260920000000) and carries no semantic
-- meaning beyond column position; `created_at` can't be edited by anyone
-- (no update grant exists on that column) and reflects the order a
-- project's statuses were actually established — the closed status that
-- has existed the longest is a far better proxy for "the original/primary
-- one" than whichever one happens to currently sort first. This is a
-- structural signal already present on every row, not a name-based guess:
-- nothing here hardcodes "Cancelled", "Won't Fix", or any other name, so
-- it keeps working for any project's own custom status names.
--
-- Every other part of recompute_parent_ticket_status — when it runs, the
-- open-children count, the auto-reopen branch and its own
-- last_open_status_id/is_default fallback, the auto_closed flag — is
-- reproduced byte-for-byte unchanged below.

create or replace function public.recompute_parent_ticket_status(target_parent_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  parent_row public.tickets%rowtype;
  parent_group text;
  open_children integer;
  total_children integer;
  target_closed_status uuid;
  target_open_status uuid;
begin
  -- Locked for the duration of this recompute so two children changing
  -- status in quick succession can never race each other into an
  -- inconsistent double auto-close/reopen.
  select * into parent_row from public.tickets where id = target_parent_id for update;
  if not found then
    return;
  end if;

  select count(*) filter (where ts.group_type = 'open'), count(*)
    into open_children, total_children
  from public.tickets c
  join public.ticket_statuses ts on ts.id = c.status_id
  where c.parent_ticket_id = target_parent_id;

  if total_children = 0 then
    return;
  end if;

  select group_type into parent_group from public.ticket_statuses where id = parent_row.status_id;

  if open_children = 0 and parent_group = 'open' then
    -- Prefer the project's own "done" status (legacy_enum_value — the
    -- existing normal-completion marker); if it no longer exists, fall
    -- back to the oldest closed status instead of the lowest sort_order,
    -- so a later-added exceptional status (e.g. "Cancelled") is never
    -- picked just because of where it currently sits in the list.
    select id into target_closed_status
    from public.ticket_statuses
    where project_id = parent_row.project_id and group_type = 'closed'
    order by
      coalesce(legacy_enum_value = 'done', false) desc,
      created_at asc,
      sort_order asc
    limit 1;

    if target_closed_status is not null then
      update public.tickets
      set status_id = target_closed_status, auto_closed = true
      where id = target_parent_id;
    end if;

  elsif open_children > 0 and parent_group = 'closed' and parent_row.auto_closed then
    target_open_status := parent_row.last_open_status_id;
    if target_open_status is null then
      select id into target_open_status
      from public.ticket_statuses
      where project_id = parent_row.project_id and is_default
      limit 1;
    end if;

    if target_open_status is not null then
      update public.tickets
      set status_id = target_open_status, auto_closed = false
      where id = target_parent_id;
    end if;
  end if;
end;
$$;
