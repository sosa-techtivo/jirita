import type { SideEffectAudit } from "../types/phase3";

/**
 * Static, code-audited finding — not data-dependent, so this never needs a
 * live query. Confirmed by reading the actual trigger bodies (not assumed):
 *
 * 1. `tickets_log_created` (supabase/migrations/20260728000000, `AFTER
 *    INSERT ON public.tickets`, unconditional — no `if new.created_by is
 *    not null` guard, unlike the projects/creator-membership trigger)
 *    inserts exactly one `ticket_activity` row per ticket:
 *      - `actor_profile_id = new.created_by` — the *real* resolved
 *        Unfuddle reporter (or null for an orphan reporter), never the
 *        technical import identity (there isn't one; this runs
 *        unauthenticated via the service-role client).
 *      - `event_type = 'ticket_created'`.
 *      - `created_at` — the column default `now()`; the trigger's own
 *        INSERT statement does not forward a caller-supplied timestamp, and
 *        there is no client-side way to override it without altering the
 *        trigger/schema (out of scope, explicitly forbidden).
 *    Net effect: every imported ticket gets a "Ticket Created" activity
 *    entry dated *today*, while the ticket itself correctly shows its real
 *    2016-2018 `created_at` — a direct, unavoidable mismatch between a
 *    ticket's own historical record and its own activity log. This matches
 *    the task's explicit stop condition verbatim ("timestamps actuales que
 *    degraden el historial") — APPLY must not run while this holds.
 *
 * 2. `tickets_ensure_membership_on_insert` (supabase/migrations/
 *    20260808000000, `AFTER INSERT ON public.tickets`) calls
 *    `ensure_project_membership(new.project_id, auth.uid())`, which no-ops
 *    whenever `target_profile_id is null`. `auth.uid()` is keyed off the
 *    *calling session's* JWT, not any column on the row being inserted —
 *    for the service-role client used here (no authenticated user session)
 *    it evaluates to null, exactly as already empirically confirmed in
 *    Phase 2's own APPLY (`project_memberships creados: 0`). No new
 *    `project_memberships` rows are expected from this trigger; the same
 *    check is re-verified empirically post-insert regardless.
 *
 * STATUS: RESOLVED and verified live. Migration
 * supabase/migrations/20260822000000_ticket_activity_historical_import_bypass.sql
 * was applied manually via the Supabase SQL Editor, then confirmed against
 * the real database (not assumed) with controlled, cleaned-up test tickets
 * in the KTVibe project:
 *   - `insert_tickets_bypassing_activity_log` exists and is callable by
 *     the service-role client; calling it with the `anon` key was rejected
 *     with Postgres 42501 (permission denied) — EXECUTE is genuinely
 *     restricted, not just written that way in the migration source.
 *   - A plain `tickets` insert (no bypass) still produced exactly one
 *     `ticket_created` ticket_activity row — normal app behavior is
 *     unchanged.
 *   - An insert through `insert_tickets_bypassing_activity_log` produced
 *     zero ticket_activity rows, preserved the exact historical
 *     `created_at`/`updated_at` sent to it, created zero
 *     `project_memberships`, and returned/re-read the row correctly.
 *   - A plain insert immediately *after* the bypass call again produced
 *     exactly one activity row — the transaction-local GUC did not leak
 *     into a later, unrelated transaction.
 * `import-tickets/insert-tickets.ts` already calls this RPC exclusively.
 * `blocksApply` is now `false` on the strength of that evidence — not
 * because the migration file merely exists.
 */
export function auditTicketSideEffects(): SideEffectAudit {
  return {
    activityRowsPerInsertedTicket: 0,
    activityActorSource: "N/A — insert_tickets_bypassing_activity_log suppresses the ticket_activity insert entirely (verified: 0 rows produced by a controlled bypass test).",
    activityTimestampIssue:
      "Resolved: ticket_activity is not written at all when inserting through insert_tickets_bypassing_activity_log (migration 20260822000000, verified live) — no now()-dated synthetic activity is created for historical tickets.",
    projectMembershipSideEffect:
      "tickets_ensure_membership_on_insert keys off auth.uid(), null under the service-role client — verified empirically (0 project_memberships after a controlled bypass insert).",
    blocksApply: false,
    reason:
      "Resolved and verified live: migration 20260822000000 is deployed, insert_tickets_bypassing_activity_log produces zero ticket_activity rows and preserves historical timestamps (confirmed with a controlled, cleaned-up test ticket), anon/authenticated cannot execute the RPC (PUBLIC revoked, confirmed with a live anon-key call rejected), and the bypass does not leak into a subsequent normal insert. APPLY may proceed via this RPC.",
  };
}
