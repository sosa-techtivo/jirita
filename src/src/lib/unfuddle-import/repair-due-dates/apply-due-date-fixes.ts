import type { SupabaseClient } from "@supabase/supabase-js";
import type { ClassifiedTicket } from "./classify-due-dates";

export interface DueDateFixResult {
  ticketKey: string | null;
  unfuddleId: string;
  liveTicketId: string;
  fromDueDate: string | null;
  toDueDate: string;
  ok: boolean;
  rowsUpdated: number;
  error: string | null;
}

/**
 * Applies exactly the "incorrecto" tickets a fresh classifyDueDates() call
 * just identified — never a stale list from an earlier PREVIEW. One
 * `.update()` per ticket (never a single bulk statement, since each row
 * gets a different due_date) via the service-role client, same as every
 * other write in this importer — no bypass RPC exists (or is needed) for
 * `due_date`, so this is a plain, ordinary update.
 *
 * `.eq("due_date", fromDueDate)` is an optimistic-concurrency guard: the
 * write only lands if due_date still holds the exact value this ticket was
 * classified against. If anything changed it in between, rowsUpdated comes
 * back 0 and this is reported as a skip, never silently overwritten. This
 * is also what makes a second run naturally idempotent — a ticket already
 * fixed no longer classifies as "incorrecto", so it's never handed to this
 * function again.
 *
 * Being a plain authenticated-as-service-role update (not a bypass insert),
 * the existing `tickets_log_updated` trigger still fires normally and
 * writes one real `due_date_changed` ticket_activity row per ticket — with
 * `actor_profile_id = auth.uid()`, which evaluates to NULL under the
 * service-role client (no user session). That is the correct, honest
 * outcome with the schema as it stands today: an unattributed system
 * correction, never falsely attributed to a human. See
 * runner/repair-due-dates-run.ts for why no schema change was made to do
 * better than that.
 */
export async function applyDueDateFixes(
  admin: SupabaseClient,
  incorrectTickets: ClassifiedTicket[],
): Promise<DueDateFixResult[]> {
  const results: DueDateFixResult[] = [];

  for (const t of incorrectTickets) {
    if (t.category !== "incorrecto" || !t.liveTicketId || !t.plannedDueDate) {
      results.push({
        ticketKey: t.ticketKey,
        unfuddleId: t.unfuddleId,
        liveTicketId: t.liveTicketId ?? "",
        fromDueDate: t.currentDueDate,
        toDueDate: t.plannedDueDate ?? "",
        ok: false,
        rowsUpdated: 0,
        error: "Not an 'incorrecto' ticket with a resolvable target — refusing to write.",
      });
      continue;
    }

    const { data, error } = await admin
      .from("tickets")
      .update({ due_date: t.plannedDueDate })
      .eq("id", t.liveTicketId)
      .eq("due_date", t.currentDueDate)
      .select("id");

    if (error) {
      results.push({
        ticketKey: t.ticketKey,
        unfuddleId: t.unfuddleId,
        liveTicketId: t.liveTicketId,
        fromDueDate: t.currentDueDate,
        toDueDate: t.plannedDueDate,
        ok: false,
        rowsUpdated: 0,
        error: error.message,
      });
      continue;
    }

    const rowsUpdated = data?.length ?? 0;
    results.push({
      ticketKey: t.ticketKey,
      unfuddleId: t.unfuddleId,
      liveTicketId: t.liveTicketId,
      fromDueDate: t.currentDueDate,
      toDueDate: t.plannedDueDate,
      ok: rowsUpdated === 1,
      rowsUpdated,
      error: rowsUpdated === 1 ? null : `Expected to update 1 row, updated ${rowsUpdated} — due_date likely changed since PREVIEW; re-run PREVIEW.`,
    });
  }

  return results;
}
