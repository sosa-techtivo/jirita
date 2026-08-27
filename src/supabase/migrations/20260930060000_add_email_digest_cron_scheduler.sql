-- Fase 3B follow-up: moves the email-digest worker's hourly trigger from
-- Vercel Cron to Supabase's own pg_cron + pg_net. Reason: Vercel Cron on
-- the Hobby plan only allows once-a-day schedules, which would make the
-- 1h/4h/8h digest frequencies meaningless (only "daily" could ever
-- actually fire). Supabase only ever *triggers* the existing endpoint
-- over plain HTTP, exactly like Vercel Cron did before it — none of the
-- digest logic moves into Postgres. The worker itself
-- (src/lib/server/run-email-digest.ts) and everything it guarantees
-- (baseline init, due-check, CAS claim/revert, the 50-item cap, project
-- grouping, emailed_at never excluding a notification) is completely
-- unchanged by this migration.
--
-- Extensions: neither pg_cron nor pg_net was previously enabled on this
-- project (confirmed via `supabase db query --linked "select extname
-- from pg_extension"` before writing this migration — only
-- pg_stat_statements/pgcrypto/plpgsql/supabase_vault/uuid-ossp existed).
-- Both are available to install. Created in the `extensions` schema,
-- matching this project's own existing convention for
-- pgcrypto/uuid-ossp/pg_stat_statements (20260708000000_mvp_schema.sql).
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- The Authorization secret is read from Supabase Vault BY NAME at cron
-- run time — the real value is never written into this migration, Git,
-- or any log. supabase_vault is already enabled on this project. This
-- migration does NOT create the secret itself: that is a one-time manual
-- step (see this migration's own deployment report) using the exact name
-- below, 'jirita_cron_secret'. Until that secret is created,
-- vault.decrypted_secrets returns no matching row, the Authorization
-- header the job sends comes out as "Bearer " (an empty token), and
-- /api/cron/email-digest's own CRON_SECRET check correctly rejects it
-- with 401 — a safe, inert failure mode while unconfigured, never an
-- open/unauthenticated call to the digest worker.
--
-- Idempotent: safe to re-run this migration, or to have a job of this
-- name already exist from a prior attempt — the existing job (if any) is
-- unscheduled first, then rescheduled fresh, so this can never produce
-- two competing jobs for the same schedule.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'jirita-email-digest-hourly') then
    perform cron.unschedule('jirita-email-digest-hourly');
  end if;
end
$$;

select cron.schedule(
  'jirita-email-digest-hourly',
  '0 * * * *',
  $cron$
  select net.http_get(
    url := 'https://jirita.techtivo.com/api/cron/email-digest',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || coalesce(
        (select decrypted_secret from vault.decrypted_secrets where name = 'jirita_cron_secret' limit 1),
        ''
      )
    ),
    timeout_milliseconds := 25000
  );
  $cron$
);
