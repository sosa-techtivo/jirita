-- Grant authenticated-role table privileges for membership loading.
--
-- 20260708000000_mvp_schema.sql defined RLS policies for profiles,
-- organization_memberships, and organizations, but `create table` alone
-- grants nothing to the authenticated/anon roles — Postgres checks base
-- table privileges *before* RLS is ever evaluated. Without an explicit
-- GRANT, every query from the authenticated role fails with "permission
-- denied for table ..." (42501), regardless of what the RLS policy itself
-- would have allowed. This is what src/lib/membership.ts was hitting.
--
-- RLS stays the real access-control layer — these grants only clear the
-- privilege gate Postgres checks first, and are scoped to exactly what
-- membership loading reads: select only, on exactly these three tables.

grant select on public.profiles to authenticated;
grant select on public.organization_memberships to authenticated;
grant select on public.organizations to authenticated;
