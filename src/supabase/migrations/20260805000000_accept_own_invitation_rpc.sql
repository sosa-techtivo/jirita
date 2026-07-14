-- Lets a freshly-invited user activate their own organization_membership
-- once they've accepted their invite (set a password via /accept-invite).
--
-- organization_memberships_update (20260708000000_mvp_schema.sql) requires
-- is_org_admin(organization_id) — role/status stay admin-managed on
-- purpose, and must stay that way. A direct client-side update from the
-- invited user themselves is correctly denied by RLS. This mirrors
-- update_own_weekly_capacity's existing pattern exactly
-- (20260709000000_profile_self_service_updates.sql): a narrow SECURITY
-- DEFINER function that can only ever touch the caller's own row, and only
-- the one specific transition it exists for.
--
-- No organization_id parameter, unlike a hypothetical broader function —
-- an invited user's own 'invited' row isn't even visible under
-- organization_memberships_select yet either (is_org_member requires
-- status = 'active'), so there's no safe way for the client to look up
-- which org to pass in before this runs. Scoping by profile_id = auth.uid()
-- and status = 'invited' is sufficient on its own: it can only ever affect
-- the caller's own pending invitation(s), never anyone else's, and never a
-- row that isn't currently 'invited' (so it can't be replayed to
-- "reactivate" a disabled account, for example).

create or replace function public.accept_own_invitation()
returns public.organization_memberships
language plpgsql
security definer
set search_path = public
as $$
declare
  updated public.organization_memberships;
begin
  update public.organization_memberships
  set status = 'active'
  where profile_id = auth.uid()
    and status = 'invited'
  returning * into updated;

  if updated is null then
    raise exception 'No pending invitation found for the current user.';
  end if;

  return updated;
end;
$$;

grant execute on function public.accept_own_invitation() to authenticated;
