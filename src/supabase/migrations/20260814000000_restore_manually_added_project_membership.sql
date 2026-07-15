-- Follow-up to 20260813000000: that migration restored every membership
-- derivable from real, still-intact source data (project creator/owner,
-- ticket contributors), but one real row could not be re-derived that way
-- — profile 579c24e6-45e3-41b0-ad93-c1a2ed6bc4b5 ("Alex Project Lead") on
-- project 39e11c67-912b-48c4-b6d1-34b07969de7e ("jirita") had zero tickets
-- created/assigned, zero comments, zero ticket_activity rows, and the
-- project itself has no created_by/owner_profile_id recorded — meaning
-- this membership could only have come from the direct "+ Add Member" write
-- path (addProjectMember in src/lib/projects.ts), which has no activity
-- log of its own to reconstruct from.
--
-- This is not a fabricated/guessed row: this exact (project_id, profile_id)
-- pair, with project_role = 'member', was directly observed and recorded
-- in this session's own migration-verification query moments before the
-- accidental delete that caused the regression this and 20260813000000
-- repair. title and weekly_capacity were not part of that captured
-- snapshot, so they're set here to the same values the app's own
-- conventions already use for a member with no customized project-level
-- capacity: title 'Member' (addProjectMember always writes this literal
-- value, regardless of org role — see 20260803000000/20260808000000) and
-- weekly_capacity seeded from this same profile's real, current
-- organization_memberships.weekly_capacity (40h), exactly like
-- ensure_project_membership's own trigger does on first insert.
--
-- Guarded by NOT EXISTS + ON CONFLICT DO NOTHING, same as every other
-- backfill in this schema — a no-op if this row already exists.

insert into public.project_memberships (project_id, profile_id, title, project_role, weekly_capacity)
select
  '39e11c67-912b-48c4-b6d1-34b07969de7e',
  '579c24e6-45e3-41b0-ad93-c1a2ed6bc4b5',
  'Member',
  'member',
  om.weekly_capacity
from public.organization_memberships om
where om.profile_id = '579c24e6-45e3-41b0-ad93-c1a2ed6bc4b5'
  and not exists (
    select 1 from public.project_memberships pm
    where pm.project_id = '39e11c67-912b-48c4-b6d1-34b07969de7e'
      and pm.profile_id = '579c24e6-45e3-41b0-ad93-c1a2ed6bc4b5'
  )
on conflict (project_id, profile_id) do nothing;
