import type { Attachment, Comment, TimeEntry, Ticket } from "../types/models";
import { findDuplicateGroups } from "../utils/duplicates";
import type { DuplicateFinding, DuplicateValidationResult } from "../types/report";

function toFindings(groups: Map<string, unknown[]>): DuplicateFinding[] {
  return Array.from(groups.entries())
    .map(([key, group]) => ({ key, count: group.length }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Detects duplication within the in-scope (Milestone 183) data only.
 *
 * Two different kinds of "duplicate" are checked per entity, because they
 * mean different things:
 * - by `unfuddle_id`: the same source record appears twice in our parsed
 *   result — a parser/backup integrity problem, since `unfuddle_id` is the
 *   idempotent upsert key every import phase relies on (spec §10).
 * - by content signature (comments/time entries only): different
 *   `unfuddle_id`s but identical ticket+author/person+body/description+date
 *   — plausibly a genuine double-entry in Unfuddle itself, surfaced as a
 *   warning rather than a hard integrity failure.
 */
export function validateDuplicates(tickets: Ticket[]): DuplicateValidationResult {
  const comments: Comment[] = [];
  const timeEntries: TimeEntry[] = [];
  const attachments: Attachment[] = [];
  for (const ticket of tickets) {
    comments.push(...ticket.comments);
    timeEntries.push(...ticket.timeEntries);
    attachments.push(...ticket.attachments);
    for (const comment of ticket.comments) attachments.push(...comment.attachments);
  }

  const duplicateTicketNumbers = toFindings(
    findDuplicateGroups(tickets, (t) => `number:${t.number}`),
  );
  const duplicateTicketUnfuddleIds = toFindings(
    findDuplicateGroups(tickets, (t) => `id:${t.unfuddleId}`),
  );
  const duplicateCommentUnfuddleIds = toFindings(
    findDuplicateGroups(comments, (c) => `id:${c.unfuddleId}`),
  );
  const duplicateTimeEntryUnfuddleIds = toFindings(
    findDuplicateGroups(timeEntries, (e) => `id:${e.unfuddleId}`),
  );
  const duplicateAttachmentUnfuddleIds = toFindings(
    findDuplicateGroups(attachments, (a) => `id:${a.unfuddleId}`),
  );
  const duplicateCommentContent = toFindings(
    findDuplicateGroups(
      comments,
      (c) => `${c.ticketUnfuddleId}|${c.authorUnfuddleId}|${c.createdAt}|${c.body}`,
    ),
  );
  const duplicateTimeEntryContent = toFindings(
    findDuplicateGroups(
      timeEntries,
      (e) => `${e.ticketUnfuddleId}|${e.personUnfuddleId}|${e.date}|${e.hours}|${e.description}`,
    ),
  );

  return {
    duplicateTicketNumbers,
    duplicateTicketUnfuddleIds,
    duplicateCommentUnfuddleIds,
    duplicateTimeEntryUnfuddleIds,
    duplicateAttachmentUnfuddleIds,
    duplicateCommentContent,
    duplicateTimeEntryContent,
  };
}
