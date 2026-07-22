-- Adds four real, functional workspace-wide settings to `organizations`,
-- for Settings → Time Tracking's Estimation/Rounding groups:
-- show_ticket_estimates, require_ticket_estimate, time_rounding_minutes,
-- and round_time_up. Hours per Day, Weekly Capacity, and Default
-- Estimation Unit are deliberately NOT added here — see the app-side
-- removal in settings-section-screen.tsx: expected daily hours already
-- derives from organization_memberships.weekly_capacity ÷
-- organizations.active_days (20260815000000), weekly capacity already
-- belongs to the member (never a second, organization-wide number), and
-- the app only ever supports hour-based estimates today.
--
-- No new RLS policy: `organizations_update` (20260815000000, `using`/
-- `with check (is_org_admin(id))`) already applies to the whole row, so
-- these four new columns are already covered by it — adding a second
-- policy here would just duplicate that same rule.
--
-- Schema/RLS only — no UI wiring in this migration. This migration touches
-- no existing `tickets`/`ticket_time_entries` row — nothing here is a data
-- migration, and no historical time entry or ticket estimate is modified,
-- backfilled, or reinterpreted.

-- ── show_ticket_estimates ────────────────────────────────────────────────────
-- Whether the ticket estimate field/control renders at all on New Ticket,
-- Ticket Detail, and the Ticket Preview panel. Never deletes/hides
-- `tickets.hours` data itself — Reports/Workload keep reading whatever
-- estimates already exist regardless of this flag.
alter table public.organizations
  add column show_ticket_estimates boolean not null default true;

-- ── require_ticket_estimate ──────────────────────────────────────────────────
-- Whether a *new* ticket must be created with a real estimate (> 0) — never
-- retroactively applied to existing tickets (see the app-side validation in
-- lib/tickets.ts's createTicket, which is the only place this is checked).
-- Can never be true while show_ticket_estimates is false — enforced here as
-- the final backstop (the Settings UI and the Server Action both also keep
-- this pair consistent before it ever reaches this constraint).
alter table public.organizations
  add column require_ticket_estimate boolean not null default false
    check (require_ticket_estimate = false or show_ticket_estimates = true);

-- ── time_rounding_minutes ────────────────────────────────────────────────────
-- The increment real time entries are rounded to before being persisted
-- (see lib/time-rounding.ts's roundLoggedMinutes, applied in
-- logTicketTime). Restricted to exactly the four real increments Settings
-- → Time Tracking's own Hour Rounding select offers — 0.1h / 0.25h / 0.5h /
-- 1h — never an arbitrary value.
alter table public.organizations
  add column time_rounding_minutes smallint not null default 30
    check (time_rounding_minutes in (6, 15, 30, 60));

-- ── round_time_up ────────────────────────────────────────────────────────────
-- false = round a logged duration to the *nearest* time_rounding_minutes
-- increment (never down to 0 for a real positive entry — the smallest
-- possible result is always one full increment); true = always round up to
-- the next increment. See lib/time-rounding.ts for the exact real formula
-- applied at write time.
alter table public.organizations
  add column round_time_up boolean not null default false;
