import type { SideEffectAudit } from "../types/phase4";

/**
 * Static, code-audited finding — confirmed by reading the actual trigger
 * bodies (not assumed), same methodology as
 * preflight/audit-ticket-side-effects.ts:
 *
 * 1. `ticket_comments_log_activity` (supabase/migrations/20260727000000,
 *    `AFTER INSERT ON public.ticket_comments`, unconditional — no guard of
 *    any kind) inserts exactly one `ticket_activity` row per comment:
 *      - `actor_profile_id = new.author_profile_id` — the real resolved
 *        Unfuddle comment author (or null for an orphan author), never a
 *        technical import identity.
 *      - `event_type = 'added_a_comment'`.
 *      - `created_at` — the column default `now()`; the trigger's own
 *        INSERT does not forward a caller-supplied timestamp.
 *    Net effect: every imported comment gets an "added a comment" activity
 *    entry dated *today*, while the comment itself correctly shows its
 *    real 2016-2026 `created_at` — the exact same mismatch already found
 *    and fixed for `tickets_log_created` (Phase 3), just on a different
 *    table/trigger. Per this task's explicit instruction, this is NOT
 *    fixed here — no schema change in this task, no bypass mechanism
 *    invented here. It is reported so it can be resolved the same way
 *    tickets_log_created was, in its own separate task.
 *
 * 2. `ticket_comments_ensure_membership` (supabase/migrations/
 *    20260808000000, `AFTER INSERT ON public.ticket_comments`) calls
 *    `ensure_project_membership(target_project_id, auth.uid())`, which
 *    no-ops whenever `target_profile_id is null`. Same reasoning already
 *    verified empirically for tickets (Phase 2 and Phase 3's own APPLY,
 *    both showed 0 project_memberships created under the service-role
 *    client, since it has no authenticated session and `auth.uid()`
 *    evaluates to null): expected to be a no-op, re-verified empirically
 *    post-insert regardless.
 *
 * 3. No notification is created at the database level for a comment
 *    insert — notifications are written exclusively by application code
 *    (`createNotificationAction`, called from `notifyTicketComment` in
 *    src/lib/tickets.ts), never by a trigger. Since this importer never
 *    calls that code path, no notification is possible from a raw insert
 *    regardless of role.
 *
 * STATUS: RESOLVED and verified live. Migration
 * supabase/migrations/20260823000000_ticket_comment_activity_historical_import_bypass.sql
 * was applied manually via the Supabase SQL Editor, then confirmed against
 * the real database (not assumed) with controlled, cleaned-up test data —
 * dedicated throwaway tickets, never any real KTVibe ticket/comment:
 *   - `insert_ticket_comments_bypassing_activity_log` exists and is
 *     callable by the service-role client; calling it with the `anon` key
 *     was rejected with Postgres 42501 (permission denied).
 *   - A plain `ticket_comments` insert (no bypass) still produced exactly
 *     one `added_a_comment` ticket_activity row with the correct actor —
 *     normal app behavior is unchanged.
 *   - An insert through `insert_ticket_comments_bypassing_activity_log`
 *     produced zero `added_a_comment` activity rows, preserved the exact
 *     historical `body`/`author_profile_id`/`created_at`/`updated_at` sent
 *     to it, left the parent ticket's own `updated_at` untouched, created
 *     zero new `project_memberships`, and the row was re-readable.
 *   - A plain insert immediately *after* the bypass call again produced
 *     exactly one activity row — the transaction-local GUC did not leak.
 * `import-comments/insert-comments.ts` already calls this RPC exclusively.
 * `blocksApply` is now `false` on the strength of that evidence — not
 * because the migration file merely exists.
 */
export function auditCommentSideEffects(): SideEffectAudit {
  return {
    activityRowsPerInsertedComment: 0,
    activityActorSource: "N/A — insert_ticket_comments_bypassing_activity_log suppresses the ticket_activity insert entirely (verified: 0 rows produced by a controlled bypass test).",
    activityTimestampIssue:
      "Resolved: ticket_activity is not written at all when inserting through insert_ticket_comments_bypassing_activity_log (migration 20260823000000, verified live) — no now()-dated synthetic activity is created for historical comments.",
    projectMembershipSideEffect:
      "ticket_comments_ensure_membership keys off auth.uid(), null under the service-role client — verified empirically (0 new project_memberships after a controlled bypass insert).",
    blocksApply: false,
    reason:
      "Resolved and verified live: migration 20260823000000 is deployed, insert_ticket_comments_bypassing_activity_log produces zero ticket_activity rows and preserves historical body/author/timestamps (confirmed with a controlled, cleaned-up test comment), anon cannot execute the RPC (PUBLIC revoked, confirmed with a live anon-key call rejected), the parent ticket is left untouched, and the bypass does not leak into a subsequent normal insert. APPLY may proceed via this RPC.",
  };
}
