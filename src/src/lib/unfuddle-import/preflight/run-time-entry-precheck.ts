import type { SupabaseClient } from "@supabase/supabase-js";
import type { ParsedBackup } from "../types/parse-result";
import type { Phase3Config as Phase5Config } from "../config";
import { resolveOrganization } from "./resolve-organization";
import { resolveCommentParents } from "./resolve-comment-parents";
import { resolveUserMap } from "./resolve-user-map";
import { auditTimeEntrySchema } from "./audit-time-entry-schema";
import { compareHoursWithTickets } from "./compare-hours-with-tickets";
import { mapTimeEntryRows } from "../import-time-entries/map-time-entry-rows";
import { computeTimeEntryStats } from "../import-time-entries/compute-time-entry-stats";
import { findDuplicateContentGroups } from "../import-time-entries/find-duplicate-content";
import { checkTimeEntryIdempotency } from "../import-time-entries/check-time-entry-idempotency";
import type { Phase5PrecheckResult, UserMapEntryStatus } from "../types/phase5";

/** Confirmed by two independent integer-arithmetic methods (tenths-of-hour and minutes) against the real 221 entries, and independently corroborated by tickets.hours (Phase 3's own import) summing to the same value. Never a float comparison. */
const EXPECTED_TOTAL_MINUTES = 4434;

export async function runTimeEntryPrecheck(admin: SupabaseClient, parsed: ParsedBackup, config: Phase5Config): Promise<Phase5PrecheckResult> {
  const organization = await resolveOrganization(admin, config.organizationSlug);

  const blockingReasons: string[] = [];
  if (organization.error) blockingReasons.push(`Organization: ${organization.error}`);

  let projectId: string | null = null;
  let projectError: string | null = null;
  if (organization.organizationId) {
    const { data, error } = await admin.from("projects").select("id").eq("organization_id", organization.organizationId).eq("unfuddle_id", String(config.targetMilestoneId));
    if (error) projectError = `projects lookup failed: ${error.message}`;
    else if ((data ?? []).length !== 1) projectError = `Expected exactly one project with unfuddle_id "${config.targetMilestoneId}", found ${(data ?? []).length}.`;
    else projectId = data![0].id;
  } else {
    projectError = "Organization was not resolved — cannot look up the project.";
  }
  if (projectError) blockingReasons.push(`Project: ${projectError}`);

  let ticketsTotal = 0;
  let ticketsError: string | null = null;
  if (projectId) {
    const { count, error } = await admin.from("tickets").select("id", { count: "exact", head: true }).eq("project_id", projectId);
    if (error) ticketsError = `tickets count failed: ${error.message}`;
    else {
      ticketsTotal = count ?? 0;
      if (ticketsTotal !== 170) ticketsError = `Expected exactly 170 imported tickets, found ${ticketsTotal}.`;
    }
  } else {
    ticketsError = "Project was not resolved — cannot verify imported tickets.";
  }
  if (ticketsError) blockingReasons.push(`Tickets: ${ticketsError}`);

  const referencedTicketIds = new Set<number>();
  const referencedUserIds = new Set<number>();
  for (const ticket of parsed.tickets) {
    for (const entry of ticket.timeEntries) {
      referencedTicketIds.add(entry.ticketUnfuddleId);
      if (entry.personUnfuddleId !== null) referencedUserIds.add(entry.personUnfuddleId);
    }
  }

  const parents = projectId
    ? await resolveCommentParents(admin, projectId, [...referencedTicketIds])
    : { map: new Map<number, string>(), missingParents: [...referencedTicketIds], totalTicketsInProject: 0, ok: false };
  if (parents.missingParents.length > 0) {
    blockingReasons.push(`${parents.missingParents.length} time entry(ies) reference a ticket not among the imported 170: ${parents.missingParents.join(", ")}.`);
  }

  const userMap = await resolveUserMap(admin, parsed.users, [...referencedUserIds]);
  for (const reason of userMap.blockingReasons) blockingReasons.push(reason);

  const KNOWN_ORPHAN_IDS = new Set([150, 153]);
  const unexpectedOrphans = userMap.entries.filter((e) => e.status === "orphan_no_backup_record" && !KNOWN_ORPHAN_IDS.has(e.unfuddleId));
  for (const entry of unexpectedOrphans) {
    blockingReasons.push(`Time entry person id ${entry.unfuddleId} has no backup Person record and is not one of the documented known orphans (150/153) — stopping rather than treating it as another orphan.`);
  }

  const userStatusById = new Map<number, UserMapEntryStatus>(userMap.entries.map((e) => [e.unfuddleId, e.status]));
  const stats = computeTimeEntryStats(parsed.tickets, parsed.users, userStatusById);
  if (stats.unexpectedUserIds.length > 0) {
    blockingReasons.push(`Unexpected person id(s) referenced by time entries, not covered by the user map: ${stats.unexpectedUserIds.join(", ")}.`);
  }
  if (stats.zeroHoursCount > 0) blockingReasons.push(`${stats.zeroHoursCount} time entry(ies) have zero hours — ticket_time_entries.minutes requires > 0.`);
  if (stats.negativeHoursCount > 0) blockingReasons.push(`${stats.negativeHoursCount} time entry(ies) have negative hours.`);
  if (stats.precisionLossCount > 0) blockingReasons.push(`${stats.precisionLossCount} time entry(ies) would lose precision converting hours to whole minutes.`);

  if (stats.totalMinutes !== EXPECTED_TOTAL_MINUTES) {
    blockingReasons.push(
      `Total minutes mismatch: expected ${EXPECTED_TOTAL_MINUTES} (73.90h, the confirmed real total), got ${stats.totalMinutes} (${(stats.totalMinutes / 60).toFixed(2)}h). Integer-minutes comparison, never float. Not proceeding on an unreconciled total.`,
    );
  }

  const duplicateContentGroups = findDuplicateContentGroups(parsed.tickets);

  const schemaAudit = auditTimeEntrySchema();
  if (schemaAudit.blocksApply) blockingReasons.push(schemaAudit.reason);

  const mapping = mapTimeEntryRows(parsed.tickets, parents.map, userMap.map);
  for (const err of mapping.errors) blockingReasons.push(`Time entry ${err.timeEntryUnfuddleId} (ticket ${err.ticketUnfuddleId}): ${err.reason}`);

  const hoursComparison = projectId ? await compareHoursWithTickets(admin, projectId, parsed.tickets) : null;

  // Only attempt the unfuddle_id-keyed idempotency query once the schema
  // audit confirms the column is actually live — attempting it while
  // `blocksApply` holds would just fail against the real (pre-migration)
  // database with an "undefined column" error.
  const idempotency = schemaAudit.blocksApply || mapping.planned.length === 0 ? null : await checkTimeEntryIdempotency(admin, mapping.planned);
  if (idempotency) {
    if (idempotency.conflicting.length > 0) {
      blockingReasons.push(`${idempotency.conflicting.length} existing time entry(ies) differ from the expected configuration — not updating automatically.`);
    }
    if (idempotency.duplicateUnfuddleIdsInBatch.length > 0) {
      blockingReasons.push(`${idempotency.duplicateUnfuddleIdsInBatch.length} duplicate unfuddle_id(s) within the parsed batch.`);
    }
  }

  const result: Phase5PrecheckResult = {
    organization,
    project: { projectId, ok: projectId !== null, error: projectError },
    ticketsReconciled: { total: ticketsTotal, ok: ticketsTotal === 170, error: ticketsError },
    parents,
    userMap,
    stats,
    duplicateContentGroups,
    mapping,
    schemaAudit,
    hoursComparison,
    idempotency,
    ok: blockingReasons.length === 0,
    blockingReasons,
  };

  return result;
}
