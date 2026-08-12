-- Manual unsubscribe (Ticket Detail's subscribe/unsubscribe icon,
-- lib/tickets.ts: setTicketSubscription) — 20260925000000 shipped
-- ticket_subscribers with select/insert only ("no unsubscribe UI yet"),
-- so removing a subscription needs its own delete grant + policy on top of
-- that already-applied migration, never an edit to it.
--
-- A caller may remove *their own* subscription only — this is a personal
-- notification preference, not project moderation: removing a row here
-- never touches ticket/project access, and can never remove anyone else's
-- row. No update grant — a subscription is either present or absent,
-- nothing about an existing row is ever edited.
create policy ticket_subscribers_delete on public.ticket_subscribers
  for delete
  using (profile_id = auth.uid());

grant delete on public.ticket_subscribers to authenticated;
