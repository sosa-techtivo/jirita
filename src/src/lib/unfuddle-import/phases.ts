/**
 * The Unfuddle -> Jirita importer's planned phases. Only Phase 1 is
 * implemented — everything else is a documented roadmap slot, not a stub
 * module, so there is nothing half-built to import by mistake.
 *
 * Each later phase writes to Supabase in dependency order, per
 * docs/UNFUDDLE_IMPORT_SPECIFICATION.md §6 Step 6 and §10 (idempotent
 * upsert on `unfuddle_id`): users before projects before tickets before the
 * data that hangs off a ticket.
 */
export interface ImportPhase {
  id: number;
  name: string;
  description: string;
  status: "implemented" | "planned";
}

export const IMPORT_PHASES: readonly ImportPhase[] = [
  {
    id: 1,
    name: "Dry Run",
    description: "Parse backup.xml (streaming), build typed models, validate, print a report. Writes nothing.",
    status: "implemented",
  },
  {
    id: 2,
    name: "Import Project",
    description: "Validate real Supabase preconditions (org/users/project) and insert only the `projects` row for the selected Milestone, matched on unfuddle_id. PREVIEW by default; APPLY only via an explicit flag.",
    status: "implemented",
  },
  {
    id: 3,
    name: "Import Tickets",
    description:
      "Insert only the 170 KTVibe tickets, matched on unfuddle_id. PREVIEW works; APPLY is implemented but currently self-blocks — see preflight/audit-ticket-side-effects.ts — until the tickets_log_created activity-timestamp side effect is resolved as its own decision.",
    status: "implemented",
  },
  {
    id: 4,
    name: "Import Comments",
    description:
      "Insert only the 412 comments on the 170 imported KTVibe tickets, matched on unfuddle_id. PREVIEW works; APPLY self-blocks on ticket_comments_log_activity's same now()-timestamped synthetic activity problem already fixed for tickets_log_created — no bypass built here, by this task's own instruction.",
    status: "implemented",
  },
  {
    id: 5,
    name: "Import Time Entries",
    description:
      "Insert only the 221 KTVibe time entries, matched on unfuddle_id, via insert_ticket_time_entries_bypassing_activity_log (migration 20260824000000, verified live with controlled tests before use). Applied and reconciled: 221/221 inserted, 4,434 minutes exact, 0 synthetic ticket_activity, tickets.hours/updated_at untouched, idempotency confirmed with a second PREVIEW run (0 new / 221 already imported).",
    status: "implemented",
  },
  {
    id: 6,
    name: "Import Attachments",
    description:
      "Insert only the 250 KTVibe attachments (70 ticket-level, 180 comment-level) into ticket_attachments, matched on unfuddle_id, and upload their real bytes to the ticket-attachments bucket at a deterministic <ticket_id>/att-<unfuddle_id>-<filename> path, via insert_ticket_attachments_bypassing_activity_log (migration 20260825000000, verified live with 44 controlled tests before use). Applied and reconciled: 250/250 uploaded, 250/250 inserted, every field preserved (including historical created_at/updated_at and null uploaded_by), 0 synthetic ticket_activity, 0 side effects (tickets/comments/time entries/memberships/notifications all untouched, ticket #651's legitimate drift intact), idempotency confirmed with a second PREVIEW run (0 new / 250 already imported, DB and Storage).",
    status: "implemented",
  },
  {
    id: 7,
    name: "Import Relations",
    description:
      "Create ticket-to-ticket relations for pairs where both sides were imported. Of the 39 raw <relationship> records sourced from the 170 KTVibe tickets (38 both-in-scope, 1 pointing to unfuddle_id 15457, a real ticket outside Milestone 183, permanently excluded as excluded_external — never imported, ticket 15457 was never created), canonicalizing the mirrored A<->B pairs Unfuddle always writes on both sides yields 19 unique relations, keyed by a synthesized ticket_relations.unfuddle_relation_key (migrations 20260826000000-20260828000000: identity column, activity bypass via the shared jirita.import_bypass_activity_log GUC, and an in-function same-project guard — RLS alone doesn't cover the bypass RPC, since service_role has BYPASSRLS; found and fixed live via controlled empirical tests using disposable tickets). Applied and reconciled: 19/19 inserted, 19/19 field-for-field matching the planned mapping, all kind=related_to, all created_by=null, canonical (ticket_id, related_ticket_id) order verified in the live table, 0 synthetic ticket_activity, 0 side effects (tickets/comments/time entries/attachments/memberships/notifications/native relations/ticket #651's drift all untouched — verified against a full pre-APPLY snapshot), 0 duplicate rows for any mirrored pair, the excluded_external relation never created. Idempotency confirmed with a second PREVIEW run (0 new / 19 already imported by unfuddle_relation_key, 2 native relations still correctly unmatched). --apply's gate re-verifies these exact numbers fresh on every invocation before writing anything (see runner/phase7-run.ts's checkExactPreApplyNumbers) — a second run would see 0 new candidates and reject before any RPC call. Semantic note: JIRITA's only symmetric kind is related_to, so Unfuddle's child/parent (direction) and sibling (shared-parent provenance) collapse into it — an approved, reported loss, not silent. Known, separate, out-of-scope issue: ticket_relations_log_removed (pre-existing, migration 20260802000000) can raise a 23503 when a ticket with an active relation is deleted via cascade, because the AFTER DELETE trigger's ticket_activity insert races the same-statement removal of that ticket row — found during this task's own test cleanup, not fixed here.",
    status: "implemented",
  },
] as const;
