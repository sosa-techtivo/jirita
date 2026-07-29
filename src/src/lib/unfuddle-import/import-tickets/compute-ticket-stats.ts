import type { Ticket } from "../types/models";
import { CONFIRMED_PRIORITY_MAP, CONFIRMED_STATUS_MAP } from "../config";
import type { TicketsStats, UserMapEntryStatus } from "../types/phase3";

function isOrphan(status: UserMapEntryStatus | undefined): boolean {
  return status === "orphan_no_backup_record" || status === "not_found_in_profiles" || status === "multiple_matches";
}

export function computeTicketStats(tickets: Ticket[], userStatusById: Map<number, UserMapEntryStatus>): TicketsStats {
  const byOriginalStatus: Record<string, number> = {};
  const byJiritaStatus: Record<string, number> = {};
  const byOriginalPriority: Record<string, number> = {};
  const byJiritaPriority: Record<string, number> = {};

  let withDescription = 0;
  let withDueDate = 0;
  let withEstimate = 0;
  let withAssignee = 0;
  let withOrphanReporter = 0;
  let withOrphanAssignee = 0;

  for (const t of tickets) {
    byOriginalStatus[t.status] = (byOriginalStatus[t.status] ?? 0) + 1;
    byOriginalPriority[String(t.priority)] = (byOriginalPriority[String(t.priority)] ?? 0) + 1;

    if (t.description.trim()) withDescription++;
    if (t.dueOn) withDueDate++;
    if (t.hoursEstimateCurrent !== null) withEstimate++;
    if (t.assigneeUnfuddleId !== null) withAssignee++;

    if (t.reporterUnfuddleId !== null && isOrphan(userStatusById.get(t.reporterUnfuddleId))) withOrphanReporter++;
    if (t.assigneeUnfuddleId !== null && isOrphan(userStatusById.get(t.assigneeUnfuddleId))) withOrphanAssignee++;
  }

  // JIRITA-side distributions are derived from the same confirmed maps used
  // for the actual insert payload — not a second source of truth.
  for (const [original, count] of Object.entries(byOriginalStatus)) {
    const mapped = CONFIRMED_STATUS_MAP[original];
    if (mapped) byJiritaStatus[mapped] = (byJiritaStatus[mapped] ?? 0) + count;
  }
  for (const [original, count] of Object.entries(byOriginalPriority)) {
    const mapped = CONFIRMED_PRIORITY_MAP[Number(original)];
    if (mapped) byJiritaPriority[mapped] = (byJiritaPriority[mapped] ?? 0) + count;
  }

  return {
    total: tickets.length,
    byOriginalStatus,
    byJiritaStatus,
    byOriginalPriority,
    byJiritaPriority,
    withDescription,
    withoutDescription: tickets.length - withDescription,
    withDueDate,
    withoutDueDate: tickets.length - withDueDate,
    withEstimate,
    withoutEstimate: tickets.length - withEstimate,
    withAssignee,
    withoutAssignee: tickets.length - withAssignee,
    withOrphanReporter,
    withOrphanAssignee,
  };
}
