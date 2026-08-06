-- Member can no longer change their own Weekly Capacity from Profile — the
-- UI now shows it read-only for that role (profile-screen.tsx), and this
-- backs the same restriction at the database level so it can never be
-- bypassed by calling the RPC directly. Admin/Project Lead keep editing
-- their own Weekly Capacity via this exact same function, unchanged;
-- Admin's separate ability to edit *any* user's capacity from Users
-- management goes through its own, already-admin-gated write path and is
-- untouched by this.
--
-- Same "create or replace, add one guard" shape already used elsewhere in
-- this schema for narrowing an existing security-definer function (e.g.
-- log_attachment_deleted's own cascade-safety fix, 20260904000000) rather
-- than a second, parallel function.

create or replace function public.update_own_weekly_capacity(new_capacity numeric)
returns public.organization_memberships
language plpgsql
security definer
set search_path = public
as $$
declare
  updated public.organization_memberships;
  caller_role text;
begin
  select role into caller_role
  from public.organization_memberships
  where profile_id = auth.uid()
    and status = 'active';

  if caller_role = 'member' then
    raise exception 'Members cannot change their own Weekly Capacity. Contact an admin.';
  end if;

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
