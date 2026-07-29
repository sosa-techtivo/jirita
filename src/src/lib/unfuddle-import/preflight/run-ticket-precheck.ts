import type { SupabaseClient } from "@supabase/supabase-js";
import type { ParsedBackup } from "../types/parse-result";
import type { Phase3Config } from "../config";
import { EXPECTED_PROJECT_CODE, EXPECTED_PROJECT_SLUG } from "../config";
import type { Phase3PrecheckResult, UserMapEntryStatus } from "../types/phase3";
import { resolveOrganization } from "./resolve-organization";
import { resolveTargetProjectForTickets } from "./resolve-target-project-for-tickets";
import { resolveUserMap } from "./resolve-user-map";
import { auditTicketSideEffects } from "./audit-ticket-side-effects";
import { mapTicketRows } from "../import-tickets/map-ticket-rows";
import { computeTicketStats } from "../import-tickets/compute-ticket-stats";
import { checkTicketIdempotency } from "../import-tickets/check-ticket-idempotency";
import type { TicketIdempotencyResult } from "../types/phase3";

export interface TicketPrecheckOutcome {
  result: Phase3PrecheckResult;
  idempotency: TicketIdempotencyResult | null;
  executedAt: Date;
}

export async function runTicketPrecheck(admin: SupabaseClient, parsed: ParsedBackup, config: Phase3Config): Promise<TicketPrecheckOutcome> {
  const executedAt = new Date();
  const organization = await resolveOrganization(admin, config.organizationSlug);
  const project = await resolveTargetProjectForTickets(
    admin,
    organization.organizationId,
    String(config.targetMilestoneId),
    EXPECTED_PROJECT_SLUG,
    EXPECTED_PROJECT_CODE,
  );

  const referencedIds = new Set<number>();
  for (const ticket of parsed.tickets) {
    if (ticket.reporterUnfuddleId !== null) referencedIds.add(ticket.reporterUnfuddleId);
    if (ticket.assigneeUnfuddleId !== null) referencedIds.add(ticket.assigneeUnfuddleId);
  }

  const userMap = await resolveUserMap(admin, parsed.users, [...referencedIds]);

  const userStatusById = new Map<number, UserMapEntryStatus>(userMap.entries.map((e) => [e.unfuddleId, e.status]));
  const ticketStats = computeTicketStats(parsed.tickets, userStatusById);

  const sideEffects = auditTicketSideEffects();

  const blockingReasons: string[] = [];
  if (organization.error) blockingReasons.push(`Organization: ${organization.error}`);
  if (project.error) blockingReasons.push(`Project: ${project.error}`);
  for (const reason of userMap.blockingReasons) blockingReasons.push(reason);

  if (!project.projectId) {
    return {
      result: {
        organization,
        project,
        userMap,
        ticketStats,
        mapping: { planned: [], errors: [], ok: false },
        idempotency: { newTickets: [], alreadyImportedMatching: [], conflicting: [], ticketNumberCollisions: [], duplicateTicketNumbersInBatch: [], duplicateUnfuddleIdsInBatch: [], ok: false },
        sideEffects,
        ok: false,
        blockingReasons,
      },
      idempotency: null,
      executedAt,
    };
  }

  const mapping = mapTicketRows(parsed.tickets, project.projectId, userMap.map, executedAt);
  for (const err of mapping.errors) blockingReasons.push(`Ticket #${err.ticketNumber} (${err.ticketUnfuddleId}): ${err.reason}`);

  const idempotency = await checkTicketIdempotency(admin, project.projectId, mapping.planned);
  if (idempotency.conflicting.length > 0) {
    blockingReasons.push(`${idempotency.conflicting.length} existing ticket(s) differ from the expected configuration — not updating automatically.`);
  }
  if (idempotency.ticketNumberCollisions.length > 0) {
    blockingReasons.push(`${idempotency.ticketNumberCollisions.length} ticket_number collision(s) against existing tickets with a different unfuddle_id.`);
  }
  if (idempotency.duplicateUnfuddleIdsInBatch.length > 0) {
    blockingReasons.push(`${idempotency.duplicateUnfuddleIdsInBatch.length} duplicate unfuddle_id(s) within the parsed batch.`);
  }
  if (idempotency.duplicateTicketNumbersInBatch.length > 0) {
    blockingReasons.push(`${idempotency.duplicateTicketNumbersInBatch.length} duplicate ticket_number(s) within the parsed batch.`);
  }

  // Deliberately NOT folded into `blockingReasons`/`ok`: side effects are a
  // separate axis from data validity. PREVIEW must still succeed at
  // *analyzing and showing* the data (this file's whole job) even though
  // the runner will separately refuse to actually APPLY while
  // `sideEffects.blocksApply` holds — see runner/phase3-run.ts.

  const result: Phase3PrecheckResult = {
    organization,
    project,
    userMap,
    ticketStats,
    mapping,
    idempotency,
    sideEffects,
    ok: blockingReasons.length === 0,
    blockingReasons,
  };

  return { result, idempotency, executedAt };
}
