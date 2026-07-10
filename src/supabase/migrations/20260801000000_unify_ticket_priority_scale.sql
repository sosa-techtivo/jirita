-- Unifies Ticket Priority onto a single 4-value scale: highest/high/medium/low.
-- ticket_priority was previously ('high', 'normal', 'low') — the app's own
-- Priority filter (filter-bar.tsx) already showed Highest/High/Medium/Low,
-- while tickets themselves stored/displayed "Normal", a functional/visual
-- mismatch. This migrates existing 'normal' rows to 'medium' and removes
-- 'normal' from the type entirely — not just stops using it going forward —
-- per this feature's explicit "no permanent compatibility with Normal"
-- requirement.
--
-- Postgres has no ALTER TYPE ... DROP VALUE, so removing a value requires
-- swapping in a new enum type: create the new type, migrate the column over
-- with a USING clause that maps 'normal' -> 'medium' in the same step (so
-- there's no window where a row could be left as 'normal'), then drop the
-- old type and rename the new one into its place.

create type public.ticket_priority_new as enum ('highest', 'high', 'medium', 'low');

alter table public.tickets
  alter column priority drop default;

alter table public.tickets
  alter column priority type public.ticket_priority_new
  using (
    case priority::text
      when 'normal' then 'medium'
      else priority::text
    end
  )::public.ticket_priority_new;

alter table public.tickets
  alter column priority set default 'medium'::public.ticket_priority_new;

drop type public.ticket_priority;
alter type public.ticket_priority_new rename to ticket_priority;
