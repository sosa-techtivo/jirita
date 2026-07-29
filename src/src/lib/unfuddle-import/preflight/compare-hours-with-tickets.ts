import type { SupabaseClient } from "@supabase/supabase-js";
import type { Ticket } from "../types/models";
import type { HoursComparison } from "../types/phase5";

/**
 * Read-only comparison between `tickets.hours` (Phase 3's import of
 * Unfuddle's `hours-estimate-current`) and the real sum of each ticket's
 * own time entries from this backup. Never writes anything — Phase 5 has
 * no destination table to write time entries into yet (see
 * audit-time-entry-schema.ts), so there is nothing to reconcile against
 * `tickets.hours` in code; this is pure reporting.
 */
export async function compareHoursWithTickets(admin: SupabaseClient, projectId: string, tickets: Ticket[]): Promise<HoursComparison> {
  const { data, error } = await admin.from("tickets").select("unfuddle_id, hours").eq("project_id", projectId);
  if (error) throw new Error(`tickets lookup failed: ${error.message}`);

  const hoursByUnfuddleId = new Map<string, number>();
  for (const row of data ?? []) {
    if (row.unfuddle_id !== null) hoursByUnfuddleId.set(row.unfuddle_id, Number(row.hours) || 0);
  }

  const entrySumByTicket = new Map<number, number>();
  for (const ticket of tickets) {
    const sum = ticket.timeEntries.reduce((s, e) => s + (e.hours ?? 0), 0);
    if (sum > 0) entrySumByTicket.set(ticket.unfuddleId, Math.round(sum * 10) / 10);
  }

  let sumTicketsHours = 0;
  let ticketsWithHoursButNoEntries = 0;
  for (const [, hours] of hoursByUnfuddleId) sumTicketsHours += hours;

  for (const [unfuddleId, hours] of hoursByUnfuddleId) {
    if (hours > 0 && !entrySumByTicket.has(Number(unfuddleId))) ticketsWithHoursButNoEntries++;
  }

  let sumTimeEntries = 0;
  let ticketsWithEntrySumDifferentFromHours = 0;
  for (const [unfuddleId, entrySum] of entrySumByTicket) {
    sumTimeEntries += entrySum;
    const ticketHours = hoursByUnfuddleId.get(String(unfuddleId)) ?? 0;
    if (Math.abs(entrySum - ticketHours) > 0.001) ticketsWithEntrySumDifferentFromHours++;
  }

  return {
    sumTicketsHours: Math.round(sumTicketsHours * 100) / 100,
    sumTimeEntries: Math.round(sumTimeEntries * 100) / 100,
    ticketsWithHoursButNoEntries,
    ticketsWithEntrySumDifferentFromHours,
    ticketsWithEntries: entrySumByTicket.size,
  };
}
