-- Persists the checked/unchecked state of each Acceptance Criterion — the
-- checkbox in Ticket Detail previously only toggled local React state (lost
-- on refresh) since tickets.acceptance_criteria (text[]) has no concept of
-- completion.
--
-- Deliberately a parallel boolean[] aligned by index with
-- acceptance_criteria, rather than restructuring that column into
-- jsonb/a join table — reordering, editing, deleting, and creating
-- criteria are all out of scope for this fix (see ticket-detail-screen.tsx),
-- so the two arrays' indices stay in sync by construction. Defaults to an
-- empty array, so existing tickets (and any position beyond the array's
-- current length) read as "not done" — never a fabricated status.

alter table public.tickets
  add column acceptance_criteria_done boolean[] not null default '{}';
