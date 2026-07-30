import type { RelationSchemaAudit } from "../types/phase7";

/**
 * Static, code-audited finding against the CURRENTLY LIVE schema — confirmed
 * by reading supabase/migrations/20260802000000_add_ticket_relations.sql,
 * 20260826000000 (identity + insert bypass), 20260827000000 (in-function
 * cross-project guard), and 20260828000000 (fixes a real ambiguous-column
 * bug found in 20260827000000's own guard) directly, cross-checked against
 * src/lib/tickets.ts's real loadTicketRelations/createTicketRelation/
 * deleteTicketRelation, and against the live table itself.
 *
 * STATUS: All three migrations applied live (via the Supabase SQL Editor)
 * and verified with controlled, cleaned-up tests using temporary tickets —
 * never any real KTVibe ticket/relation:
 *   - unfuddle_relation_key exists, is selectable, nullable, unique; both
 *     pre-existing native rows (unfuddle_relation_key = null) were
 *     confirmed untouched, field-by-field, after every migration.
 *   - A plain INSERT (no RPC) still produces exactly 2 relation_added
 *     ticket_activity rows (one per ticket side) and leaves
 *     tickets.updated_at/project_memberships/notifications unchanged —
 *     normal app behavior (createTicketRelation) is unaffected.
 *   - insert_ticket_relations_bypassing_activity_log produces 0
 *     ticket_activity rows, preserves unfuddle_relation_key/kind/
 *     created_by=null exactly, and touches nothing else.
 *   - unfuddle_relation_key's unique constraint rejected a repeated key
 *     with 23505; the pre-existing (ticket_id, related_ticket_id, kind)
 *     unique constraint independently rejected a repeat with a different
 *     key — both real DB-level guarantees, not just TypeScript-side checks.
 *   - Self-relation rejected (23514) via both a plain INSERT and the RPC.
 *   - Cross-project: a *first* live test (before 20260827000000) found the
 *     RPC accepted a cross-project relation — ticket_relations_insert's
 *     same-project check is an RLS policy, and service_role (the RPC's
 *     only caller) has BYPASSRLS, so RLS never evaluated for it regardless
 *     of the function's own security invoker setting. 20260827000000 added
 *     an explicit in-function guard for this — its first version had a
 *     genuine bug (a PL/pgSQL variable named `r` collided with the final
 *     INSERT's `as r` table alias, "ambiguous column reference", breaking
 *     every call including valid ones), fixed by 20260828000000 and
 *     re-verified: cross-project now rejected (P0001), 0 rows persisted;
 *     self-relation and a valid same-project insert both still behave
 *     exactly as before the fix.
 *   - The bypass GUC does not leak: a plain INSERT run immediately after an
 *     RPC call still produced its own 2 relation_added rows.
 *   - Permissions: service_role succeeded; anon was rejected empirically
 *     (42501, permission denied). No controlled authenticated session was
 *     available this session (only PostgREST via curl/supabase-js) —
 *     authenticated's/PUBLIC's revoke is confirmed by direct review of the
 *     deployed SQL text (which the user applied verbatim), not by an
 *     empirical authenticated-session call.
 *
 * A separate, PRE-EXISTING bug was found (not introduced by, and out of
 * scope for, this task): ticket_relations_log_removed (20260802000000)
 * unconditionally inserts into ticket_activity on DELETE; if a ticket that
 * still has an active relation is deleted, the cascade delete of its
 * ticket_relations row fires that trigger for a ticket_id that is
 * concurrently being removed from `tickets` in the same statement, and the
 * ticket_activity FK rejects the insert (23503) — the whole DELETE fails.
 * Confirmed live during this task's own test cleanup (worked around by
 * deleting the relation row before the ticket, not by touching the
 * trigger — untouched, per this task's own scope). Reported here, not
 * fixed — see the final report's "bloqueos/decisiones" section.
 */
export function auditRelationSchema(): RelationSchemaAudit {
  return {
    hasHistoricalIdentityColumn: true,
    historicalIdentityColumnName: "unfuddle_relation_key",
    storageModel:
      "One row per relation, canonical direction (related_to sorted by ticket UUID; blocks/duplicates directional, stored from the initiator's side). Inverse UI-facing kinds (blocked-by/duplicated-by) are a computed per-perspective view, never a second row.",
    symmetricKindsCanonicalizedByClient: true,
    selfRelationConstraint: true,
    uniqueConstraint: "(ticket_id, related_ticket_id, kind)",
    historicalKeyUniqueConstraint: "unfuddle_relation_key (nullable, unique for non-null values)",
    createdByNullable: true,
    crossProjectGuardedInFunction: true,
    activityTrigger: {
      exists: true,
      unconditional: true,
      rowsPerInsert: 2,
      description:
        "ticket_relations_log_added (AFTER INSERT) skips the ticket_activity insert when jirita.import_bypass_activity_log='true' (verified: 0 rows produced by the bypass RPC) — unconditional only for ordinary inserts (verified: a plain insert still logs exactly 2 relation_added rows, and again immediately after a bypass call, confirming the GUC doesn't leak).",
    },
    bypassRpcExists: true,
    bypassRpcName: "insert_ticket_relations_bypassing_activity_log",
    blockingReasons: [],
  };
}
