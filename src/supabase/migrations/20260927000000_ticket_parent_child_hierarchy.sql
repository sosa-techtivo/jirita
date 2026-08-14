-- Simple, exactly-one-level Parent -> Children ticket hierarchy.
--
-- Storage: a single nullable self-FK (`tickets.parent_ticket_id`) — no new
-- table, same "derive, don't store" spirit as ticket_relations' own
-- symmetric-kind canonicalization. "Parent"/"child" are never stored as a
-- role: a ticket is a parent purely because some other ticket's
-- parent_ticket_id points at it (exactly like Siblings, which the product
-- spec explicitly says must never be stored either). No RLS changes are
-- needed — tickets_select/_update (20260829000000) are already row-level,
-- and parent_ticket_id is just one more column on the same row they
-- already govern.
--
-- Two more nullable columns, `last_open_status_id`/`auto_closed`, exist
-- solely to make the auto-close/auto-reopen automation below correct:
-- `last_open_status_id` remembers the most recent status a ticket held
-- while open (tracked for every ticket, not just parents — cheap, and
-- avoids a parent/child branch in the one trigger that maintains it), and
-- `auto_closed` distinguishes "the automation closed this parent because
-- every child closed" from any real, human-initiated close (including
-- Ticket Detail/Preview/Kanban's own "Close anyway" override) — only the
-- former is ever allowed to auto-reopen later. src/lib/tickets.ts's
-- updateTicket() sets `auto_closed = false` on every manual status write
-- it performs; recompute_parent_ticket_status() below is the only place
-- that ever sets it back to true, and it does so with a direct UPDATE
-- that never goes through updateTicket() at all — so the two can never be
-- confused with each other regardless of which UI surface (Ticket
-- Detail's status selector, the Preview/Quick Edit panel, or Kanban
-- drag-and-drop) initiated the change. That's also what "centralizes" the
-- evaluation: every one of those surfaces already funnels a real status
-- change through this exact same updateTicket() → `tickets` UPDATE path,
-- so the automation below runs identically no matter which one fired it.

alter table public.tickets
  add column parent_ticket_id uuid references public.tickets (id) on delete set null,
  add column last_open_status_id uuid references public.ticket_statuses (id) on delete set null,
  add column auto_closed boolean not null default false,
  add constraint tickets_no_self_parent check (parent_ticket_id is distinct from id);

create index tickets_parent_ticket_id_idx on public.tickets (parent_ticket_id);

-- ── Guard: exactly one level, same project, no self-parent ─────────────────
-- Self-parent is already impossible (the check constraint above), but this
-- also gives it the same friendly error message as the other two guards
-- instead of a raw constraint-violation string. Fires only when
-- parent_ticket_id itself is part of the write (INSERT, or an UPDATE that
-- actually touches this column) — a plain status/assignee/etc. edit on an
-- existing child never re-validates its already-established parent link.

create or replace function public.tickets_guard_parent_hierarchy()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  parent_project_id uuid;
  parent_has_parent uuid;
  already_has_children boolean;
begin
  if new.parent_ticket_id is null then
    return new;
  end if;

  if new.parent_ticket_id = new.id then
    raise exception 'A ticket cannot be its own parent.';
  end if;

  select project_id, parent_ticket_id into parent_project_id, parent_has_parent
  from public.tickets
  where id = new.parent_ticket_id;

  if parent_project_id is null then
    raise exception 'Parent ticket not found.';
  end if;

  if parent_project_id <> new.project_id then
    raise exception 'Parent ticket must belong to the same project.';
  end if;

  -- The prospective parent is itself already a child — would create a
  -- third level.
  if parent_has_parent is not null then
    raise exception 'Cannot set parent: the selected ticket is itself a child ticket. Only one level of hierarchy is allowed.';
  end if;

  -- This ticket already has children of its own — would also create a
  -- third level, from the other direction.
  select exists(select 1 from public.tickets where parent_ticket_id = new.id) into already_has_children;
  if already_has_children then
    raise exception 'Cannot set parent: this ticket already has child tickets of its own. Only one level of hierarchy is allowed.';
  end if;

  return new;
end;
$$;

create trigger tickets_guard_parent_hierarchy
  before insert or update of parent_ticket_id on public.tickets
  for each row execute function public.tickets_guard_parent_hierarchy();

-- ── Bookkeeping: remember the last OPEN status every ticket held ───────────
-- Generic (every ticket, not just parents) so this never needs to branch on
-- "is this a parent" at write time — recompute_parent_ticket_status below
-- is the only place that ever reads it, and only for a ticket that turns
-- out to be a parent.

create or replace function public.tickets_track_last_open_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_group text;
begin
  if tg_op = 'INSERT' or old.status_id is distinct from new.status_id then
    select group_type into new_group from public.ticket_statuses where id = new.status_id;
    if new_group = 'open' then
      new.last_open_status_id := new.status_id;
    end if;
  end if;
  return new;
end;
$$;

create trigger tickets_track_last_open_status
  before insert or update on public.tickets
  for each row execute function public.tickets_track_last_open_status();

-- ── Automation: auto-close a parent once every child is closed, and
-- auto-reopen it (to its own last open status) if a child reopens — only
-- ever undoes its own prior auto-close, never a manual one ────────────────
--
-- A parent with zero children is not evaluated at all (returns immediately)
-- — it behaves exactly like a normal ticket until it actually has a first
-- child, matching "parent-ness" being purely derived, never stored.
--
-- The "which closed status" a project has more than one of is resolved
-- deterministically (lowest sort_order) since there is no per-project
-- "default closed status" concept (only a default *open* one — see
-- ticket_statuses_default_must_be_open, 20260918000000); every project
-- seeded so far only ever has exactly one closed status ("Done") anyway.

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
    select id into target_closed_status
    from public.ticket_statuses
    where project_id = parent_row.project_id and group_type = 'closed'
    order by sort_order asc
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

-- Fires on any child's status change, and on a child being linked/unlinked
-- (parent_ticket_id itself changing) — recomputing the *old* parent on
-- unlink/reparent and the *new*/current parent otherwise. Terminates in at
-- most one hop: the row recompute_parent_ticket_status updates is always a
-- parent, and a parent can never itself have a parent_ticket_id (enforced
-- above), so this trigger firing again for that update is always a no-op.

create or replace function public.tickets_sync_parent_from_child()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and old.parent_ticket_id is not null
     and new.parent_ticket_id is distinct from old.parent_ticket_id then
    perform public.recompute_parent_ticket_status(old.parent_ticket_id);
  end if;

  if new.parent_ticket_id is not null then
    perform public.recompute_parent_ticket_status(new.parent_ticket_id);
  end if;

  return null;
end;
$$;

create trigger tickets_sync_parent_from_child
  after insert or update of status_id, parent_ticket_id on public.tickets
  for each row execute function public.tickets_sync_parent_from_child();

-- ── Hours: a parent's Estimated/Logged/Remaining are derived from its
-- children (src/lib/tickets.ts) — never stored/entered directly ──────────
-- A brand new ticket can never already have children (nothing can
-- reference it as a parent before it exists), so this only needs to guard
-- `UPDATE OF hours`, never insert.

create or replace function public.tickets_block_hours_on_parent()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.hours is distinct from old.hours
     and exists (select 1 from public.tickets where parent_ticket_id = new.id) then
    raise exception 'Cannot set Estimated hours directly on a parent ticket — it is derived from its child tickets.';
  end if;
  return new;
end;
$$;

create trigger tickets_block_hours_on_parent
  before update of hours on public.tickets
  for each row execute function public.tickets_block_hours_on_parent();

create or replace function public.ticket_time_entries_block_on_parent()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.tickets where parent_ticket_id = new.ticket_id) then
    raise exception 'Cannot log time directly on a parent ticket — log time on its child tickets instead.';
  end if;
  return new;
end;
$$;

create trigger ticket_time_entries_block_on_parent
  before insert on public.ticket_time_entries
  for each row execute function public.ticket_time_entries_block_on_parent();
