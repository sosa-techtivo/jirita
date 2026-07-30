import type { Ticket as SourceTicket } from "../types/models";

/**
 * Small, shared classifier for a *confirmed* Unfuddle orphan-id -> existing-
 * profile alias — NOT a generic/automatic identity-resolution engine. The
 * caller (a runner script) must already know, from its own out-of-band
 * evidence (backup archaeology, an explicit product decision, etc.), which
 * orphan Unfuddle person-id maps to which already-existing `profiles` row;
 * this module only finds every live reference to that person-id across
 * KTVibe's comments/tickets/time-entries and reports/applies pointing them
 * at the given profile. It never infers identity itself, never creates a
 * profile, and never touches `profiles.unfuddle_id` (left to the caller to
 * decide — see each runner's own header comment for why).
 *
 * Originally written for Unfuddle person-id 153 (confirmed = Micaela
 * Levinsonas via 850 self-referential audit-trail events — see
 * runner/repair-orphan-user-153-run.ts) and reused as-is for person-id 150
 * ("Luis L." — see runner/repair-orphan-user-150-run.ts) rather than
 * duplicating this file a second time.
 */
export interface LiveCommentRow {
  id: string;
  unfuddle_id: string | null;
  author_profile_id: string | null;
}

export interface LiveTicketRow {
  id: string;
  unfuddle_id: string | null;
  ticket_number: number | null;
  assignee_profile_id: string | null;
  created_by: string | null;
}

export interface LiveTimeEntryRow {
  id: string;
  unfuddle_id: string | null;
  logged_by: string | null;
}

export type AliasReferenceKind = "comment_author" | "ticket_assignee" | "ticket_reporter" | "time_entry_logger";

export interface AliasReference {
  kind: AliasReferenceKind;
  ticketNumber: number | null;
  ticketKey: string | null;
  /** The live row id to update (comment id, ticket id, or time entry id, depending on `kind`). */
  liveRowId: string;
  currentValue: string | null;
  plannedValue: string; // the target profile id — always the same one for this whole repair
}

export interface AliasClassificationSummary {
  totalSourceReferences: number;
  commentsAffected: number;
  ticketsWithNullReporter: number;
  ticketsWithNullAssignee: number;
  timeEntriesAffected: number;
  /** Always 0 — see the runner's header comment: ticket_activity is never
   *  populated for historical/imported tickets, so there is no activity row
   *  to reassociate for any Unfuddle person-id. */
  activitiesAffected: number;
  /** Always 0 — Unfuddle's own <attachment> element has no creator/uploader
   *  field at all (confirmed in import-attachments/map-attachment-rows.ts:
   *  uploaded_by is unconditionally null for every imported attachment,
   *  resolved or not), so there is structurally nothing to reassociate. */
  attachmentsAffected: number;
  plannedUpdates: number;
}

export interface AliasClassificationResult {
  references: AliasReference[];
  /** References already correct (current value already equals the target) or pointing elsewhere (never touched — reported, not planned). */
  alreadyCorrect: AliasReference[];
  conflicting: AliasReference[]; // currentValue is non-null and different from plannedValue — never overwritten
  summary: AliasClassificationSummary;
}

export function classifyAliasReferences(
  sourceTickets: SourceTicket[],
  liveComments: LiveCommentRow[],
  liveTickets: LiveTicketRow[],
  liveTimeEntries: LiveTimeEntryRow[],
  targetProfileId: string,
  ticketCode: string,
  orphanUnfuddlePersonId: number,
): AliasClassificationResult {
  const liveCommentByUnfuddleId = new Map(liveComments.map((c) => [c.unfuddle_id, c]));
  const liveTicketByUnfuddleId = new Map(liveTickets.map((t) => [t.unfuddle_id, t]));
  const liveTimeEntryByUnfuddleId = new Map(liveTimeEntries.map((e) => [e.unfuddle_id, e]));

  const allReferences: AliasReference[] = [];
  let totalSourceReferences = 0;

  for (const ticket of sourceTickets) {
    const liveTicket = liveTicketByUnfuddleId.get(String(ticket.unfuddleId));
    const ticketKey = liveTicket?.ticket_number != null ? `${ticketCode}-${liveTicket.ticket_number}` : null;

    if (ticket.assigneeUnfuddleId === orphanUnfuddlePersonId) {
      totalSourceReferences++;
      if (liveTicket) {
        allReferences.push({
          kind: "ticket_assignee",
          ticketNumber: ticket.number,
          ticketKey,
          liveRowId: liveTicket.id,
          currentValue: liveTicket.assignee_profile_id,
          plannedValue: targetProfileId,
        });
      }
    }

    if (ticket.reporterUnfuddleId === orphanUnfuddlePersonId) {
      totalSourceReferences++;
      if (liveTicket) {
        allReferences.push({
          kind: "ticket_reporter",
          ticketNumber: ticket.number,
          ticketKey,
          liveRowId: liveTicket.id,
          currentValue: liveTicket.created_by,
          plannedValue: targetProfileId,
        });
      }
    }

    for (const comment of ticket.comments) {
      if (comment.authorUnfuddleId !== orphanUnfuddlePersonId) continue;
      totalSourceReferences++;
      const liveComment = liveCommentByUnfuddleId.get(String(comment.unfuddleId));
      if (liveComment) {
        allReferences.push({
          kind: "comment_author",
          ticketNumber: ticket.number,
          ticketKey,
          liveRowId: liveComment.id,
          currentValue: liveComment.author_profile_id,
          plannedValue: targetProfileId,
        });
      }
    }

    for (const entry of ticket.timeEntries) {
      if (entry.personUnfuddleId !== orphanUnfuddlePersonId) continue;
      totalSourceReferences++;
      const liveEntry = liveTimeEntryByUnfuddleId.get(String(entry.unfuddleId));
      if (liveEntry) {
        allReferences.push({
          kind: "time_entry_logger",
          ticketNumber: ticket.number,
          ticketKey,
          liveRowId: liveEntry.id,
          currentValue: liveEntry.logged_by,
          plannedValue: targetProfileId,
        });
      }
    }
  }

  const planned = allReferences.filter((r) => r.currentValue === null);
  const alreadyCorrect = allReferences.filter((r) => r.currentValue === targetProfileId);
  const conflicting = allReferences.filter((r) => r.currentValue !== null && r.currentValue !== targetProfileId);

  const summary: AliasClassificationSummary = {
    totalSourceReferences,
    commentsAffected: allReferences.filter((r) => r.kind === "comment_author").length,
    ticketsWithNullReporter: allReferences.filter((r) => r.kind === "ticket_reporter" && r.currentValue === null).length,
    ticketsWithNullAssignee: allReferences.filter((r) => r.kind === "ticket_assignee" && r.currentValue === null).length,
    timeEntriesAffected: allReferences.filter((r) => r.kind === "time_entry_logger").length,
    activitiesAffected: 0,
    attachmentsAffected: 0,
    plannedUpdates: planned.length,
  };

  return { references: planned, alreadyCorrect, conflicting, summary };
}
