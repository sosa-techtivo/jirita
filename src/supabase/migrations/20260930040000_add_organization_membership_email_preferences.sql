-- Per-user email notification preferences — lives on organization_memberships
-- (not profiles), same reasoning already established for financial_access
-- (20260924000000): this is an access/notification-delivery concern scoped
-- to a person's membership in *this* organization, not part of their
-- identity.
--
-- email_immediate_enabled: gates only the immediate-email projection for
-- the 4 existing immediate-email notification types (ticket_assigned,
-- comment_mention, comment_reply, project_access_requested) — never the
-- in-app notification itself, which is always created regardless. See
-- src/lib/server/email-preferences.ts / notification-email.ts.
--
-- email_digest_enabled / email_digest_frequency / email_digest_last_sent_at:
-- infrastructure for a future digest sender (not built yet — no cron, no
-- worker exists). email_digest_last_sent_at starts null and must never be
-- treated by anything as "never sent, send now" until a real digest worker
-- exists; for this phase it's simply unused.
--
-- `not null default true` for both enabled flags — every existing member
-- keeps getting immediate email exactly as before this migration (nothing
-- opts anyone out), and digest doesn't exist yet so that default is inert
-- until Fase 3B. No retroactive digest send is possible from this
-- migration alone (no worker reads these columns yet).
alter table public.organization_memberships
  add column if not exists email_immediate_enabled boolean not null default true,
  add column if not exists email_digest_enabled boolean not null default true,
  add column if not exists email_digest_frequency text not null default 'daily'
    check (email_digest_frequency in ('1h', '4h', '8h', 'daily')),
  add column if not exists email_digest_last_sent_at timestamptz;

-- Self-service update, mirroring update_own_weekly_capacity
-- (20260916000000) exactly: organization_memberships_update RLS
-- (20260708000000) is admin-only by design, so a member changing their own
-- email preferences needs this narrow security-definer function rather
-- than a direct table update or a service-role Server Action. Scoped
-- strictly to the caller's own active membership — profile_id is never a
-- parameter, so a client can never target anyone else's row (and, since
-- JIRITA is single-tenant, there is no separate organization_id parameter
-- to validate either — same as the weekly-capacity precedent). The
-- frequency allowlist is already enforced by the column's own CHECK
-- constraint above; the explicit check here just gives a clearer error
-- message before that constraint would otherwise fire.
create or replace function public.update_own_email_preferences(
  new_immediate_enabled boolean,
  new_digest_enabled boolean,
  new_digest_frequency text
)
returns public.organization_memberships
language plpgsql
security definer
set search_path = public
as $$
declare
  updated public.organization_memberships;
begin
  if new_digest_frequency not in ('1h', '4h', '8h', 'daily') then
    raise exception 'Invalid email_digest_frequency: %', new_digest_frequency;
  end if;

  update public.organization_memberships
  set
    email_immediate_enabled = new_immediate_enabled,
    email_digest_enabled = new_digest_enabled,
    email_digest_frequency = new_digest_frequency
  where profile_id = auth.uid()
    and status = 'active'
  returning * into updated;

  if updated is null then
    raise exception 'No active organization membership for the current user.';
  end if;

  return updated;
end;
$$;
