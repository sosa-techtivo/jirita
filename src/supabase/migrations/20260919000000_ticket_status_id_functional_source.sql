-- Fase 2.5 of the configurable-ticket-statuses feature: flips
-- `sync_ticket_status_id` (20260830000000) from "status (the legacy enum)
-- is the source of truth, status_id is derived from it" to "status_id is
-- the source of truth, status is a best-effort compatibility mirror kept
-- in sync only when the target status actually has a legacy equivalent."
--
-- This is the one schema change a real per-project custom status (a
-- future ticket_statuses row with legacy_enum_value = null — not created
-- by anything yet, no CRUD UI exists) needs before it could ever be
-- assigned to a real ticket: the previous trigger unconditionally called
-- resolve_ticket_status_id(project_id, status) and raised if it returned
-- null, which is exactly what happens for any status without a legacy
-- value — every write would have failed outright.
--
-- resolve_ticket_status_id() itself is unchanged (still correct for its
-- one remaining real use below: deriving status_id from status for a
-- caller that only ever writes the legacy enum, e.g. any import/bypass
-- path not yet migrated to status_id).

create or replace function public.sync_ticket_status_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_project_id uuid;
  target_legacy_value public.ticket_status;
begin
  -- ── A caller set (INSERT) or changed (UPDATE) status_id ──────────────────
  -- This is now the primary, expected path — createTicket/updateTicket
  -- (lib/tickets.ts) always write status_id going forward.
  if tg_op = 'INSERT' or old.status_id is distinct from new.status_id then
    if new.status_id is not null then
      select project_id, legacy_enum_value
        into target_project_id, target_legacy_value
      from public.ticket_statuses
      where id = new.status_id;

      if target_project_id is null then
        raise exception 'status_id % does not exist in ticket_statuses', new.status_id;
      end if;

      -- Project/status_id integrity — a status_id can never be assigned to
      -- a ticket outside its own project, custom status or not.
      if target_project_id <> new.project_id then
        raise exception
          'status_id % belongs to project % but this ticket belongs to project %',
          new.status_id, target_project_id, new.project_id;
      end if;

      -- Keep the legacy enum mirrored only when this status actually has
      -- an equivalent. A custom status (legacy_enum_value null) leaves
      -- `status` exactly as it already was (its NOT NULL default on
      -- INSERT, or whatever it already held on UPDATE) — never blocked,
      -- never forced to a fabricated/incorrect enum value.
      if target_legacy_value is not null then
        new.status := target_legacy_value;
      end if;

      return new;
    end if;

    -- No explicit status_id given at all (a caller that still only writes
    -- the legacy `status` column — the one remaining legacy write path,
    -- kept working exactly as before this migration).
    new.status_id := public.resolve_ticket_status_id(new.project_id, new.status);
    if new.status_id is null then
      raise exception 'No ticket_statuses row found for project % and status % — the per-project status seed is incomplete', new.project_id, new.status;
    end if;
    return new;
  end if;

  -- ── status_id untouched, but the legacy `status` column changed ─────────
  -- Same legacy-caller compatibility as above, for an UPDATE instead of an
  -- INSERT — re-derives status_id from the newly-written status so the two
  -- columns can never drift apart for any code path still only writing
  -- `status`.
  if old.status is distinct from new.status then
    new.status_id := public.resolve_ticket_status_id(new.project_id, new.status);
    if new.status_id is null then
      raise exception 'No ticket_statuses row found for project % and status % — the per-project status seed is incomplete', new.project_id, new.status;
    end if;
    return new;
  end if;

  -- Neither changed — nothing to do.
  return new;
end;
$$;
