-- Real, pre-existing bug (surfaced by cleaning up an RLS test fixture,
-- unrelated to that fix itself): deleting a project has likely never
-- actually succeeded for any project with real ticket_statuses/
-- project_memberships rows — which is every real project.
--
-- ── Exact cause — same shape 20260903000000 already fixed for two other
-- tables ────────────────────────────────────────────────────────────────
--
-- ON DELETE CASCADE is a system trigger on the *referenced* (projects)
-- row that, once that row is deleted, issues real DELETEs on every
-- dependent table — those DELETEs run their own BEFORE DELETE triggers
-- exactly as if a user had deleted that one row directly, with the
-- `projects` row already gone from the table by that point (see
-- 20260903000000's own doc comment for the full trace of this general
-- Postgres cascade behavior).
--
-- Two BEFORE DELETE guards never anticipated running as part of a larger
-- project teardown — both were written to protect a *standalone* delete
-- of one row inside a still-active project:
--
--   - ticket_statuses_block_unsafe_delete (20260920000000) refuses to
--     delete the last status in its own open/closed group ("every project
--     needs at least one open and one closed status") — a real invariant
--     for a project that keeps existing, meaningless (and blocking) once
--     every status is being removed together because the project itself
--     is being deleted.
--   - project_memberships_block_unsafe_delete (20260910000000) refuses to
--     remove the project's only active Project Lead, or a member with
--     open tickets still assigned — again a real invariant only while the
--     project keeps existing.
--
-- Same fix as 20260903000000's own precedent: add an existence guard for
-- the parent project at the top of each function — skip the safety check
-- entirely (never touch the rest of the function's behavior) when the
-- project this row belongs to no longer exists, since that only happens
-- as a cascade side effect of deleting the project itself, never from a
-- standalone status/membership delete (which always targets a project
-- that's still there). No RLS change, no other behavior change.

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
  if not exists (select 1 from public.projects where id = old.project_id) then
    return old;
  end if;

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

create or replace function public.project_memberships_block_unsafe_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.projects where id = old.project_id) then
    return old;
  end if;

  if public.project_membership_is_active_lead(old.project_id, old.profile_id) then
    raise exception 'Cannot remove the project''s only active Project Lead. Assign a new Project Lead first.';
  end if;

  if public.project_membership_has_open_tickets(old.project_id, old.profile_id) then
    raise exception 'This member still has tickets assigned in this project that aren''t Done. Reassign those tickets before removing them.';
  end if;

  return old;
end;
$$;
