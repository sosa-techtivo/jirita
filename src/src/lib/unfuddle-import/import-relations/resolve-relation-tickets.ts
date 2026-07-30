import type { SupabaseClient } from "@supabase/supabase-js";
import type { Ticket } from "../types/models";
import type { JiritaRelationKind, RelationResolutionStatus, ResolvedRelation, ResolvedRelationEnd } from "../types/phase7";

interface TicketIdentityRow {
  id: string;
  unfuddle_id: string | null;
  ticket_number: number;
  project_id: string;
}

export interface ResolveRelationsResult {
  resolved: ResolvedRelation[];
  ticketMapSize: number;
  ok: boolean;
  error: string | null;
}

/**
 * Maps every raw Unfuddle relationship type onto one of the 3 kinds
 * ticket_relations actually stores (spec §4). Only a literal "related" or
 * "duplicate" maps without semantic loss — "child"/"parent" lose their
 * hierarchy direction, "sibling" loses its "derived from a shared parent"
 * provenance, both collapsing onto the same generic 'related_to' JIRITA
 * offers. This is a deliberate, reported approximation, not an invented
 * mapping: JIRITA's schema (supabase/migrations/20260802000000) has no
 * parent/child/sibling kind at all, so 'related_to' is the only non-invented
 * choice available today — see runner/phase7-print-report.ts's SEMÁNTICA
 * section for the loss this causes, and phases.ts for why this task does not
 * silently approve it.
 */
export function mapRelationKind(type: string): JiritaRelationKind {
  if (type === "duplicate") return "duplicates";
  return "related_to";
}

/**
 * Resolves both ends of every KTVibe-sourced relation exclusively via
 * tickets.unfuddle_id — never by ticket number, title, or position (this
 * task's explicit rule). Looks across ALL projects (not just KTVibe) so a
 * genuinely cross-project relation is correctly classified as
 * "target_cross_project" instead of being mistaken for "not imported".
 *
 * Every relation consumed here already comes from `Ticket.relations`, which
 * the existing streaming parser only ever populates for a top-level ticket
 * inside the target Milestone (see parser/backup-xml-parser.ts) — so
 * `source` always resolves; only `target` can miss.
 */
export async function resolveRelationTickets(
  admin: SupabaseClient,
  ktvibeProjectId: string,
  tickets: Ticket[],
): Promise<ResolveRelationsResult> {
  const { data, error } = await admin
    .from("tickets")
    .select("id, unfuddle_id, ticket_number, project_id")
    .not("unfuddle_id", "is", null)
    .returns<TicketIdentityRow[]>();

  if (error) {
    return { resolved: [], ticketMapSize: 0, ok: false, error: error.message };
  }

  const byUnfuddleId = new Map<number, TicketIdentityRow>();
  for (const row of data ?? []) {
    if (row.unfuddle_id === null) continue;
    const n = Number(row.unfuddle_id);
    if (Number.isNaN(n)) continue;
    // tickets.unfuddle_id is unique (Phase 3 migration) — no ambiguity
    // handling needed; a collision here would mean data corruption entirely
    // outside this phase's scope.
    byUnfuddleId.set(n, row);
  }

  const toEnd = (unfuddleId: number): ResolvedRelationEnd => {
    const row = byUnfuddleId.get(unfuddleId);
    return {
      ticketUnfuddleId: unfuddleId,
      ticketId: row?.id ?? null,
      ticketNumber: row?.ticket_number ?? null,
      projectId: row?.project_id ?? null,
    };
  };

  const resolved: ResolvedRelation[] = [];
  for (const ticket of tickets) {
    for (const relation of ticket.relations) {
      const source = toEnd(relation.fromTicketUnfuddleId);
      const target = toEnd(relation.toTicketUnfuddleId);

      let status: RelationResolutionStatus;
      if (target.ticketId === null) {
        status = "target_not_imported";
      } else if (target.projectId !== ktvibeProjectId) {
        status = "target_cross_project";
      } else {
        status = "both_resolved";
      }

      resolved.push({
        raw: relation,
        source,
        target,
        status,
        mappedKind: mapRelationKind(relation.type),
        semanticLossy: relation.type !== "related" && relation.type !== "duplicate",
      });
    }
  }

  return { resolved, ticketMapSize: byUnfuddleId.size, ok: true, error: null };
}
