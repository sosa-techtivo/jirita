import type { Ticket } from "../types/models";
import type { MappingError, PlannedTimeEntryFields, TimeEntryMappingResult } from "../types/phase5";

/**
 * Maps the time entries already materialized on the 170 Ticket models
 * (Phase 1's parser — never re-implemented) onto what `ticket_time_entries`
 * would need, per the confirmed schema (preflight/audit-time-entry-schema.ts).
 * `hours` -> `minutes` is an exact `* 60` conversion, never rounded — a
 * result that isn't a whole number of minutes is a per-row mapping error,
 * not silently rounded (task's explicit "no redondear silenciosamente").
 *
 * `unfuddle_id`/`updated_at` map onto the two columns added by migration
 * 20260824000000 — not writable anywhere until that migration is
 * confirmed live (see audit-time-entry-schema.ts).
 */
export function mapTimeEntryRows(tickets: Ticket[], ticketParentMap: Map<number, string>, userMap: Map<number, string | null>): TimeEntryMappingResult {
  const planned: PlannedTimeEntryFields[] = [];
  const errors: MappingError[] = [];

  for (const ticket of tickets) {
    for (const entry of ticket.timeEntries) {
      const fail = (reason: string) => errors.push({ timeEntryUnfuddleId: entry.unfuddleId, ticketUnfuddleId: entry.ticketUnfuddleId, reason });

      const ticketId = ticketParentMap.get(entry.ticketUnfuddleId);
      if (!ticketId) {
        fail(`Time entry ${entry.unfuddleId} references ticket ${entry.ticketUnfuddleId}, which is not among the imported tickets.`);
        continue;
      }
      if (entry.hours === null) {
        fail(`Time entry ${entry.unfuddleId} has no hours value.`);
        continue;
      }
      if (entry.hours <= 0) {
        fail(`Time entry ${entry.unfuddleId} has non-positive hours (${entry.hours}) — ticket_time_entries.minutes requires > 0.`);
        continue;
      }
      if (!entry.date) {
        fail(`Time entry ${entry.unfuddleId} has no date.`);
        continue;
      }
      if (!entry.createdAt) {
        fail(`Time entry ${entry.unfuddleId} has no created_at — refusing to substitute today's date.`);
        continue;
      }

      const rawMinutes = entry.hours * 60;
      const minutes = Math.round(rawMinutes);
      if (Math.abs(rawMinutes - minutes) > 1e-6) {
        fail(`Time entry ${entry.unfuddleId} has ${entry.hours}h, which is ${rawMinutes} minutes — not a whole number. Refusing to round silently.`);
        continue;
      }

      const loggedBy = entry.personUnfuddleId !== null ? userMap.get(entry.personUnfuddleId) ?? null : null;

      planned.push({
        ticketUnfuddleId: entry.ticketUnfuddleId,
        ticket_id: ticketId,
        unfuddle_id: String(entry.unfuddleId),
        minutes,
        work_date: entry.date,
        comment: entry.description || null,
        logged_by: loggedBy,
        created_at: entry.createdAt,
        updated_at: entry.updatedAt,
      });
    }
  }

  return { planned, errors, ok: errors.length === 0 };
}
