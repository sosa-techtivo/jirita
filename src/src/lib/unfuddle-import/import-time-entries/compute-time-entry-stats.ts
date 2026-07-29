import type { Ticket, UserReference } from "../types/models";
import type { TimeEntryStats, UserMapEntryStatus } from "../types/phase5";

export function computeTimeEntryStats(tickets: Ticket[], backupUsers: UserReference[], userStatusById: Map<number, UserMapEntryStatus>): TimeEntryStats {
  const entries = tickets.flatMap((t) => t.timeEntries);
  const removedById = new Map(backupUsers.map((u) => [u.unfuddleId, u.isRemoved]));

  let totalMinutes = 0;
  let withDescription = 0;
  let withKnownUser = 0;
  let withRemovedButKnownUser = 0;
  let withOrphanUser = 0;
  let withoutPersonId = 0;
  const unexpectedUserIds = new Set<number>();
  let updatedDiffersFromCreated = 0;
  let maxHoursSingleEntry = -Infinity;
  let minPositiveHours = Infinity;
  let zeroHoursCount = 0;
  let negativeHoursCount = 0;
  let precisionLossCount = 0;
  const precisionLossExamples: { unfuddleId: number; hours: number; minutes: number }[] = [];

  for (const e of entries) {
    if (e.hours !== null) {
      if (e.hours === 0) zeroHoursCount++;
      if (e.hours < 0) negativeHoursCount++;
      if (e.hours > maxHoursSingleEntry) maxHoursSingleEntry = e.hours;
      if (e.hours > 0 && e.hours < minPositiveHours) minPositiveHours = e.hours;

      const rawMinutes = e.hours * 60;
      const rounded = Math.round(rawMinutes);
      if (Math.abs(rawMinutes - rounded) > 1e-6) {
        precisionLossCount++;
        precisionLossExamples.push({ unfuddleId: e.unfuddleId, hours: e.hours, minutes: rawMinutes });
      } else {
        // Integer-minutes accumulation is the primary source of truth for
        // the total — never float hours (task's explicit "no usar cálculos
        // de punto flotante como fuente primaria de validación"). An entry
        // that lost precision is excluded here too — it's already reported
        // as a mapping error and never becomes a planned row.
        totalMinutes += rounded;
      }
    }

    if (e.description && e.description.trim() !== "") withDescription++;

    if (e.personUnfuddleId === null) {
      withoutPersonId++;
    } else {
      const status = userStatusById.get(e.personUnfuddleId);
      if (status === "resolved") {
        withKnownUser++;
        if (removedById.get(e.personUnfuddleId)) withRemovedButKnownUser++;
      } else if (status === "orphan_no_backup_record") {
        withOrphanUser++;
      } else {
        unexpectedUserIds.add(e.personUnfuddleId);
      }
    }

    if (e.createdAt !== e.updatedAt) updatedDiffersFromCreated++;
  }

  const perTicket = tickets.map((t) => t.timeEntries.length);

  return {
    total: entries.length,
    totalMinutes,
    totalHoursRounded: totalMinutes / 60,
    withDescription,
    withoutDescription: entries.length - withDescription,
    withKnownUser,
    withRemovedButKnownUser,
    withOrphanUser,
    withoutPersonId,
    unexpectedUserIds: [...unexpectedUserIds].sort((a, b) => a - b),
    updatedDiffersFromCreated,
    ticketsWithEntries: perTicket.filter((n) => n > 0).length,
    maxEntriesPerTicket: perTicket.length > 0 ? Math.max(...perTicket) : 0,
    maxHoursSingleEntry: maxHoursSingleEntry === -Infinity ? 0 : maxHoursSingleEntry,
    minPositiveHours: minPositiveHours === Infinity ? 0 : minPositiveHours,
    zeroHoursCount,
    negativeHoursCount,
    precisionLossCount,
    precisionLossExamples,
  };
}
