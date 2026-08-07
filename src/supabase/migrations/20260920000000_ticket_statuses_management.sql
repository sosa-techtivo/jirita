-- Fase 3 of the configurable-ticket-statuses feature: Project Settings →
-- Statuses. Until now `ticket_statuses` only ever changed via triggers/
-- migrations — no insert/update/delete policy existed on purpose
-- (20260830000000). This migration is what actually lets an Admin or
-- Project Lead manage a project's own statuses:
--   * create / rename — plain, RLS-gated inserts/updates from the client.
--   * set default / change open<->closed / reorder — genuinely atomic
--     (they touch more than one row's invariant-bearing column at once),
--     so each gets its own SECURITY DEFINER RPC rather than a bare
--     PostgREST write, the same shape restore_project_phase1/phase2 and
--     update_own_weekly_capacity already use in this schema.
--   * delete — a plain RLS-gated delete, with the actual safety rules
--     (no tickets attached, never the default, never the last status in
--     its own group) enforced by a BEFORE DELETE trigger — the exact same
--     "block unsafe delete via trigger, not app logic" convention
--     project_memberships_block_unsafe_delete (20260910000000) already
--     established for member removal.

-- ── Column-level integrity: block a status changing project after the
-- fact ───────────────────────────────────────────────────────────────────
-- Nothing in the app ever needs this, and allowing it would silently
-- orphan every ticket already pointing at this status_id in its original
-- project (tickets_sync_status_id's own project/status_id integrity check
-- only runs when a *ticket* is written, never retroactively when a status
-- itself moves). Simpler to make it structurally impossible.

create or replace function public.ticket_statuses_block_project_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.project_id is distinct from old.project_id then
    raise exception 'A ticket status cannot be moved to a different project.';
  end if;
  return new;
end;
$$;

create trigger ticket_statuses_prevent_project_change
  before update on public.ticket_statuses
  for each row execute function public.ticket_statuses_block_project_change();

-- ── updated_at — added by 20260918000000, never wired to a trigger since
-- no write path existed yet ─────────────────────────────────────────────

create trigger set_updated_at
  before update on public.ticket_statuses
  for each row execute function public.set_updated_at();

-- ── Name integrity: no blank names, unique per project ignoring case and
-- surrounding whitespace ───────────────────────────────────────────────
-- The existing `unique (project_id, name)` (20260830000000) is exact-match
-- only — "To Do" and "to do " would both pass it. Left in place (harmless,
-- strictly implied by the new index below); this index is what the app's
-- own duplicate-name check actually relies on, same "case-insensitive
-- unique index" shape labels.ts's own catalog already uses.

alter table public.ticket_statuses
  add constraint ticket_statuses_name_not_blank check (length(trim(name)) > 0);

create unique index ticket_statuses_project_id_name_ci_idx
  on public.ticket_statuses (project_id, lower(trim(name)));

-- ── Safe deletion — mirrors project_memberships_block_unsafe_delete's own
-- shape exactly: the real rules live here, at the database level, never
-- just in the UI (which only hides the action where it would fail anyway).

create or replace function public.ticket_statuses_block_unsafe_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket_count integer;
  v_remaining_in_group integer;
begin
  select count(*) into v_ticket_count
  from public.tickets
  where status_id = old.id;

  if v_ticket_count > 0 then
    raise exception 'This status has % ticket(s) assigned. Reassign them to a different status before deleting it.', v_ticket_count;
  end if;

  if old.is_default then
    raise exception 'Cannot delete the default status. Set a different default open status first.';
  end if;

  select count(*) into v_remaining_in_group
  from public.ticket_statuses
  where project_id = old.project_id
    and group_type = old.group_type
    and id <> old.id;

  if v_remaining_in_group = 0 then
    raise exception 'Cannot delete the only % status in this project — every project needs at least one open and one closed status.', old.group_type;
  end if;

  return old;
end;
$$;

create trigger ticket_statuses_prevent_unsafe_delete
  before delete on public.ticket_statuses
  for each row execute function public.ticket_statuses_block_unsafe_delete();

-- ── RLS: insert / update / delete ───────────────────────────────────────
-- Same "any org-wide Admin or Project Lead" trust level this app already
-- grants project-scoped write access at (projects_update/projects_delete,
-- tickets_insert/tickets_update — is_org_admin_or_lead(organization_id),
-- never scoped down to "the lead of this one project" specifically,
-- since no such narrower concept exists anywhere else in this schema).

create policy ticket_statuses_insert on public.ticket_statuses
  for insert
  with check (
    exists (
      select 1 from public.projects p
      where p.id = project_id
        and public.is_org_admin_or_lead(p.organization_id)
    )
  );

create policy ticket_statuses_update on public.ticket_statuses
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

create policy ticket_statuses_delete on public.ticket_statuses
  for delete
  using (
    exists (
      select 1 from public.projects p
      where p.id = project_id
        and public.is_org_admin_or_lead(p.organization_id)
    )
  );

grant insert, delete on public.ticket_statuses to authenticated;

-- Only `name` is ever safely editable through a bare client UPDATE.
-- group_type/is_default/sort_order all carry a cross-row invariant (at
-- most one default per project, at most one legacy_enum_value per project,
-- unique sort_order per project) that a single-row PostgREST update could
-- easily violate or leave transiently broken (e.g. unsetting the only
-- default without atomically setting a new one) — those three only ever
-- change through the three SECURITY DEFINER functions below, which
-- enforce the real invariants themselves. Whatever blanket UPDATE grant
-- Supabase's own project bootstrap already applies must be revoked first
-- (a later column-restricted grant doesn't narrow an earlier broader one
-- — same precedent 20260914000000 already established for
-- ticket_time_entries).
revoke update on public.ticket_statuses from authenticated;
grant update (name) on public.ticket_statuses to authenticated;

-- ── set_default_ticket_status — atomic default swap ─────────────────────
-- Unsets whichever row currently holds the project's default (if any)
-- before setting the new one, so the partial unique index
-- (ticket_statuses_one_default_per_project) never sees two true rows at
-- once, and the project is never left with zero defaults mid-operation
-- (both statements run in the same implicit transaction this function
-- body is — no explicit BEGIN/COMMIT needed inside a function).

create or replace function public.set_default_ticket_status(p_status_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project_id uuid;
  v_org_id uuid;
  v_group_type text;
begin
  select ts.project_id, ts.group_type, p.organization_id
    into v_project_id, v_group_type, v_org_id
  from public.ticket_statuses ts
  join public.projects p on p.id = ts.project_id
  where ts.id = p_status_id;

  if v_project_id is null then
    raise exception 'Status not found.';
  end if;
  if not public.is_org_admin_or_lead(v_org_id) then
    raise exception 'Not authorized to manage statuses for this project.';
  end if;
  if v_group_type <> 'open' then
    raise exception 'Only an open status can be the default.';
  end if;

  update public.ticket_statuses
  set is_default = false
  where project_id = v_project_id
    and is_default = true
    and id <> p_status_id;

  update public.ticket_statuses
  set is_default = true
  where id = p_status_id;
end;
$$;

revoke all on function public.set_default_ticket_status(uuid) from public;
grant execute on function public.set_default_ticket_status(uuid) to authenticated;

-- ── change_ticket_status_group — open <-> closed, handling the default
-- carefully ──────────────────────────────────────────────────────────────
-- The one genuinely tricky case: moving the current default open status
-- to closed. A closed status can never be default (enforced by its own
-- check constraint), so the caller must name a replacement open default
-- in the same call — never left to a follow-up request that could fail
-- independently and leave the project defaultless. Every other
-- open<->closed change is a plain single-column update.

create or replace function public.change_ticket_status_group(
  p_status_id uuid,
  p_new_group_type text,
  p_new_default_status_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project_id uuid;
  v_org_id uuid;
  v_is_default boolean;
  v_new_default_project_id uuid;
  v_new_default_group_type text;
begin
  if p_new_group_type not in ('open', 'closed') then
    raise exception 'Invalid group type: %', p_new_group_type;
  end if;

  select ts.project_id, ts.is_default, p.organization_id
    into v_project_id, v_is_default, v_org_id
  from public.ticket_statuses ts
  join public.projects p on p.id = ts.project_id
  where ts.id = p_status_id;

  if v_project_id is null then
    raise exception 'Status not found.';
  end if;
  if not public.is_org_admin_or_lead(v_org_id) then
    raise exception 'Not authorized to manage statuses for this project.';
  end if;

  if p_new_group_type = 'closed' and v_is_default then
    if p_new_default_status_id is null then
      raise exception 'Choose another default open status before moving the current default to closed.';
    end if;
    if p_new_default_status_id = p_status_id then
      raise exception 'The new default must be a different status.';
    end if;

    select ts.project_id, ts.group_type
      into v_new_default_project_id, v_new_default_group_type
    from public.ticket_statuses ts
    where ts.id = p_new_default_status_id;

    if v_new_default_project_id is null or v_new_default_project_id <> v_project_id then
      raise exception 'The new default status must belong to the same project.';
    end if;
    if v_new_default_group_type <> 'open' then
      raise exception 'The new default status must be open.';
    end if;

    -- Clear the outgoing default (and flip its group) before setting the
    -- incoming one — same "never two true rows at once" ordering
    -- set_default_ticket_status uses.
    update public.ticket_statuses
    set group_type = 'closed', is_default = false
    where id = p_status_id;

    update public.ticket_statuses
    set is_default = true
    where id = p_new_default_status_id;

    return;
  end if;

  update public.ticket_statuses
  set group_type = p_new_group_type
  where id = p_status_id;
end;
$$;

revoke all on function public.change_ticket_status_group(uuid, text, uuid) from public;
grant execute on function public.change_ticket_status_group(uuid, text, uuid) to authenticated;

-- ── reorder_ticket_statuses — atomic within-group reorder ───────────────
-- Bump-then-reassign, the same two-step convention
-- 20260918000000_ticket_statuses_definitive_model.sql's own sort_order
-- backfill already established, for the same reason: a non-deferred
-- unique(project_id, sort_order) index can see two rows momentarily share
-- a value mid-statement, so every affected row is moved to a guaranteed-
-- unused large value first, then reassigned its final value — a pure
-- permutation of the exact value set this subset already held, so it can
-- never collide with any row outside the reordered subset either.

create or replace function public.reorder_ticket_statuses(
  p_project_id uuid,
  p_group_type text,
  p_ordered_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_count integer;
  v_matching_count integer;
  v_sorted_values integer[];
  v_id uuid;
  v_idx integer;
begin
  if p_group_type not in ('open', 'closed') then
    raise exception 'Invalid group type: %', p_group_type;
  end if;

  select organization_id into v_org_id from public.projects where id = p_project_id;
  if v_org_id is null then
    raise exception 'Project not found.';
  end if;
  if not public.is_org_admin_or_lead(v_org_id) then
    raise exception 'Not authorized to manage statuses for this project.';
  end if;

  v_count := coalesce(array_length(p_ordered_ids, 1), 0);
  if v_count = 0 then
    return;
  end if;

  select count(*) into v_matching_count
  from public.ticket_statuses
  where project_id = p_project_id
    and group_type = p_group_type
    and id = any(p_ordered_ids);

  if v_matching_count <> v_count then
    raise exception 'One or more statuses do not belong to this project/group.';
  end if;

  select array_agg(sort_order order by sort_order)
    into v_sorted_values
  from public.ticket_statuses
  where id = any(p_ordered_ids);

  update public.ticket_statuses
  set sort_order = sort_order + 1000000
  where id = any(p_ordered_ids);

  v_idx := 1;
  foreach v_id in array p_ordered_ids
  loop
    update public.ticket_statuses
    set sort_order = v_sorted_values[v_idx]
    where id = v_id;
    v_idx := v_idx + 1;
  end loop;
end;
$$;

revoke all on function public.reorder_ticket_statuses(uuid, text, uuid[]) from public;
grant execute on function public.reorder_ticket_statuses(uuid, text, uuid[]) to authenticated;
