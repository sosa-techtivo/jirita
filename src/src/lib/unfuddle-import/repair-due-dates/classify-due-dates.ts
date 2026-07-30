import type { Ticket as SourceTicket } from "../types/models";

/**
 * Due-date drift repair for the already-completed KTVibe migration (Phases
 * 1-7 in ../phases.ts, all `implemented`). This is a targeted, standalone
 * fix for a defect found *after* that migration: a small number of tickets'
 * `due_date` were silently overwritten post-import by a live-app bug (see
 * runner/repair-due-dates-run.ts's header comment for the full root-cause
 * chain), never by anything in import-tickets/. Kept separate from Phases
 * 1-7 rather than folded into Phase 3 — this repairs live drift, it does
 * not re-run the original import.
 */

export interface LiveTicketRow {
  id: string;
  unfuddle_id: string | null;
  ticket_number: number | null;
  due_date: string | null;
}

export interface DueDateActivityRow {
  ticket_id: string;
  actor_profile_id: string | null;
  old_value: string | null;
  new_value: string | null;
  created_at: string;
}

export type DueDateCategory =
  | "sin_due_date_ambos" // neither side has a due date — not affected
  | "correcto" // both sides agree exactly
  | "incorrecto" // Unfuddle has a due date, JIRITA has a different one — planned fix
  | "sin_correspondencia" // ticket exists on one side only (by unfuddle_id)
  | "no_verificable"; // one side has a value the other lacks, in a direction we must never invent — needs human review, never auto-fixed

export interface ClassifiedTicket {
  category: DueDateCategory;
  unfuddleId: string;
  ticketNumber: number | null;
  ticketKey: string | null; // e.g. "KTV-651" — null only when sin_correspondencia on the JIRITA side
  liveTicketId: string | null;
  sourceDueDate: string | null; // raw Unfuddle <due-on>, YYYY-MM-DD or null
  currentDueDate: string | null; // current tickets.due_date, YYYY-MM-DD or null
  plannedDueDate: string | null; // what APPLY would write — only set for "incorrecto"
  /** True when month+day match but the year differs — the exact signature of the found bug (see repair-due-dates-run.ts). Reported, not used to decide the category: any mismatch is "incorrecto" regardless of shape. */
  yearSubstitutionPattern: boolean;
  /** due_date_changed ticket_activity rows on this ticket, oldest first — "actividad relacionada encontrada" in the PREVIEW report. */
  relatedActivity: DueDateActivityRow[];
}

export interface ClassificationSummary {
  inspected: number;
  withSourceDueDate: number;
  correct: number;
  incorrect: number;
  noCorrespondence: number;
  notVerifiable: number;
  plannedUpdates: number;
}

export interface ClassificationResult {
  tickets: ClassifiedTicket[];
  summary: ClassificationSummary;
}

function sameCalendarDayDifferentYear(a: string, b: string): boolean {
  const am = a.slice(5); // "MM-DD"
  const bm = b.slice(5);
  return a.length === 10 && b.length === 10 && am === bm && a.slice(0, 4) !== b.slice(0, 4);
}

/**
 * Pure, read-only classification — no Supabase/network calls here, so it can
 * be unit-reasoned-about and reused identically by both PREVIEW and the
 * pre-APPLY re-check (the task's explicit "PREVIEW fresco antes de APPLY").
 */
export function classifyDueDates(
  sourceTickets: SourceTicket[],
  liveTickets: LiveTicketRow[],
  ticketCode: string,
  activityByTicketId: Map<string, DueDateActivityRow[]>,
): ClassificationResult {
  const sourceByUnfuddleId = new Map<string, SourceTicket>();
  for (const t of sourceTickets) sourceByUnfuddleId.set(String(t.unfuddleId), t);

  const liveByUnfuddleId = new Map<string, LiveTicketRow>();
  for (const row of liveTickets) {
    if (row.unfuddle_id !== null) liveByUnfuddleId.set(row.unfuddle_id, row);
  }

  const allUnfuddleIds = new Set<string>([...sourceByUnfuddleId.keys(), ...liveByUnfuddleId.keys()]);
  const tickets: ClassifiedTicket[] = [];

  for (const unfuddleId of allUnfuddleIds) {
    const source = sourceByUnfuddleId.get(unfuddleId) ?? null;
    const live = liveByUnfuddleId.get(unfuddleId) ?? null;

    if (!source || !live) {
      tickets.push({
        category: "sin_correspondencia",
        unfuddleId,
        ticketNumber: source?.number ?? live?.ticket_number ?? null,
        ticketKey: live?.ticket_number != null ? `${ticketCode}-${live.ticket_number}` : null,
        liveTicketId: live?.id ?? null,
        sourceDueDate: source?.dueOn ?? null,
        currentDueDate: live?.due_date ?? null,
        plannedDueDate: null,
        yearSubstitutionPattern: false,
        relatedActivity: live ? activityByTicketId.get(live.id) ?? [] : [],
      });
      continue;
    }

    const sourceDue = source.dueOn;
    const currentDue = live.due_date;
    const ticketKey = live.ticket_number != null ? `${ticketCode}-${live.ticket_number}` : null;
    const relatedActivity = activityByTicketId.get(live.id) ?? [];

    let category: DueDateCategory;
    let plannedDueDate: string | null = null;
    let yearSubstitutionPattern = false;

    if (sourceDue === null && currentDue === null) {
      category = "sin_due_date_ambos";
    } else if (sourceDue === null || currentDue === null) {
      // One side has a value the other never had — could be a legitimate
      // post-import edit made by a real user in JIRITA (set or cleared).
      // Never inferred, never auto-fixed.
      category = "no_verificable";
    } else if (sourceDue === currentDue) {
      category = "correcto";
    } else {
      category = "incorrecto";
      plannedDueDate = sourceDue;
      yearSubstitutionPattern = sameCalendarDayDifferentYear(sourceDue, currentDue);
    }

    tickets.push({
      category,
      unfuddleId,
      ticketNumber: source.number,
      ticketKey,
      liveTicketId: live.id,
      sourceDueDate: sourceDue,
      currentDueDate: currentDue,
      plannedDueDate,
      yearSubstitutionPattern,
      relatedActivity,
    });
  }

  tickets.sort((a, b) => (a.ticketNumber ?? 0) - (b.ticketNumber ?? 0));

  const summary: ClassificationSummary = {
    inspected: tickets.length,
    withSourceDueDate: tickets.filter((t) => t.sourceDueDate !== null).length,
    correct: tickets.filter((t) => t.category === "correcto").length,
    incorrect: tickets.filter((t) => t.category === "incorrecto").length,
    noCorrespondence: tickets.filter((t) => t.category === "sin_correspondencia").length,
    notVerifiable: tickets.filter((t) => t.category === "no_verificable").length,
    plannedUpdates: tickets.filter((t) => t.category === "incorrecto").length,
  };

  return { tickets, summary };
}
