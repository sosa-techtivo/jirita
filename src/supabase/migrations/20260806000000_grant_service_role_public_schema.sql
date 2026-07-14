-- Grants service_role its expected privileges on the public schema.
--
-- Root cause of "Could not check for an existing account." in Invite User,
-- confirmed by direct testing against the live project (curl against
-- PostgREST with the real service_role key, bypassing the app entirely):
-- every service_role query against any public table — profiles,
-- organization_memberships, projects, all tested directly — returned
--   {"code":"42501","message":"permission denied for table <name>",
--    "hint":"Grant the required privileges to the current role with:
--    GRANT SELECT ON public.<name> TO service_role;"}
-- i.e. a real Postgres 42501 (insufficient_privilege), not an RLS
-- rejection and not an application bug. service_role bypasses Row Level
-- Security (BYPASSRLS), but RLS bypass and base table GRANTs are two
-- separate mechanisms — bypassing policies doesn't exempt a role from the
-- privilege check Postgres performs before RLS is ever evaluated.
--
-- On a normally-bootstrapped Supabase project, service_role already has
-- unrestricted access to `public` by default (that's the whole point of
-- the role) — this project's history shows every table needed an explicit
-- GRANT for `authenticated` too (20260708010000 and its many siblings), so
-- it's consistent that service_role's own default grant either never got
-- applied here or was reset at some point. This migration restores the
-- normal, expected state for service_role specifically — it does not
-- change anything about `authenticated`/`anon`'s grants or any RLS policy.

grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant all on all functions in schema public to service_role;

-- So a table/sequence/function added by a future migration also gets this
-- automatically, matching Supabase's normal default-privilege setup.
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant all on functions to service_role;
