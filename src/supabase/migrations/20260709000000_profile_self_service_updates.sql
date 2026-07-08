-- Self-service Profile screen writes: first/last name (profiles) and
-- weekly capacity (organization_memberships).

-- ── profiles: first_name / last_name ────────────────────────────────────────
-- profiles_update_self already exists (20260708000000_mvp_schema.sql) but,
-- like the earlier SELECT grant (20260708010000), was never backed by a
-- GRANT — same 42501 "permission denied" class of bug, now for UPDATE.
--
-- Column-scoped on purpose: this only ever lets a user write their own
-- first_name/last_name, never email/avatar_url/unfuddle_id. Email stays
-- read-only and avatar upload isn't implemented — this backs that same
-- boundary in the database, not just the Profile screen UI.

grant update (first_name, last_name) on public.profiles to authenticated;

-- ── organization_memberships: weekly_capacity ───────────────────────────────
-- organization_memberships_update (20260708000000_mvp_schema.sql) requires
-- is_org_admin(organization_id) — role/status stay admin-managed on purpose,
-- and must stay that way. A broad "profile_id = auth.uid()" self-update RLS
-- policy would let a member rewrite their own role/status too, so this is
-- deliberately *not* a new RLS policy on the table. Instead, a narrow
-- security-definer function (same pattern as is_org_member/is_org_admin
-- below it in the base migration) that can only ever touch weekly_capacity
-- on the caller's own active membership row.

create or replace function public.update_own_weekly_capacity(new_capacity numeric)
returns public.organization_memberships
language plpgsql
security definer
set search_path = public
as $$
declare
  updated public.organization_memberships;
begin
  update public.organization_memberships
  set weekly_capacity = new_capacity
  where profile_id = auth.uid()
    and status = 'active'
  returning * into updated;

  if updated is null then
    raise exception 'No active organization membership for the current user.';
  end if;

  return updated;
end;
$$;

grant execute on function public.update_own_weekly_capacity(numeric) to authenticated;
