import type { Ticket } from "../types/models";
import type { AttachmentMappingResult, PlannedAttachmentFields } from "../types/phase6";
import { generateAttachmentObjectPath } from "./generate-object-path";

/**
 * Maps every one of the 250 attachments Phase 1 already parsed into the
 * exact row shape `insert_ticket_attachments_bypassing_activity_log` would
 * receive — never inserted here, this only builds the plan.
 *
 * - Ticket-level attachments (`parentType === "Ticket"`, 70 expected):
 *   `comment_id: null`, `ticket_id` = the attachment's own parent ticket.
 * - Comment-level attachments (`parentType === "Comment"`, 180 expected):
 *   `comment_id` = the real `ticket_comments.id` the comment resolved to;
 *   `ticket_id` = the *comment's own ticket* (known directly from the
 *   parse tree we're already iterating — `for (const comment of
 *   ticket.comments)` — never re-derived from the comment's own parent-id,
 *   which would require an extra, redundant lookup). A comment attachment
 *   is never silently degraded to a ticket-level one just because its
 *   comment failed to resolve — an unresolved comment is a mapping error,
 *   full stop.
 * - `uploaded_by` is always `null` — the XML has no creator/person/uploader
 *   field on any of the 250 `<attachment>` elements (confirmed by the
 *   schema audit), and no substitute (service_role, ticket author, comment
 *   author, project creator) is ever used in its place.
 * - `updated_at` is preserved as-is from the XML when present (only 1 of
 *   250 actually differs from `created_at` — id 11987 — but every real
 *   value is kept, not just the one that happens to differ).
 */
export function mapAttachmentRows(tickets: Ticket[], ticketParents: Map<number, string>, commentParents: Map<number, string>): AttachmentMappingResult {
  const planned: PlannedAttachmentFields[] = [];
  const errors: AttachmentMappingResult["errors"] = [];

  for (const ticket of tickets) {
    const ticketId = ticketParents.get(ticket.unfuddleId) ?? null;

    for (const a of ticket.attachments) {
      if (a.parentType !== "Ticket") {
        errors.push({ attachmentUnfuddleId: a.unfuddleId, parentType: a.parentType, parentUnfuddleId: a.parentUnfuddleId, reason: `Unexpected parentType "${a.parentType}" on a ticket-level attachment slot.` });
        continue;
      }
      if (!ticketId) {
        errors.push({ attachmentUnfuddleId: a.unfuddleId, parentType: "Ticket", parentUnfuddleId: a.parentUnfuddleId, reason: `Parent ticket unfuddle_id ${ticket.unfuddleId} did not resolve to a real ticket id.` });
        continue;
      }
      if (!a.createdAt) {
        errors.push({ attachmentUnfuddleId: a.unfuddleId, parentType: "Ticket", parentUnfuddleId: a.parentUnfuddleId, reason: "Missing created_at in the source XML — never defaulted to now()." });
        continue;
      }

      planned.push({
        ticketUnfuddleId: ticket.unfuddleId,
        attachmentUnfuddleId: a.unfuddleId,
        ticket_id: ticketId,
        comment_id: null,
        unfuddle_id: String(a.unfuddleId),
        filename: a.filename,
        storage_path: generateAttachmentObjectPath(ticketId, a.unfuddleId, a.filename),
        size_bytes: a.declaredSize ?? 0,
        mime_type: a.contentType || null,
        uploaded_by: null,
        created_at: a.createdAt,
        updated_at: a.updatedAt,
      });
    }

    for (const comment of ticket.comments) {
      for (const a of comment.attachments) {
        if (a.parentType !== "Comment") {
          errors.push({ attachmentUnfuddleId: a.unfuddleId, parentType: a.parentType, parentUnfuddleId: a.parentUnfuddleId, reason: `Unexpected parentType "${a.parentType}" on a comment-level attachment slot.` });
          continue;
        }
        if (!ticketId) {
          errors.push({ attachmentUnfuddleId: a.unfuddleId, parentType: "Comment", parentUnfuddleId: a.parentUnfuddleId, reason: `Comment's own ticket (unfuddle_id ${ticket.unfuddleId}) did not resolve to a real ticket id.` });
          continue;
        }
        const commentId = commentParents.get(a.parentUnfuddleId) ?? null;
        if (!commentId) {
          errors.push({ attachmentUnfuddleId: a.unfuddleId, parentType: "Comment", parentUnfuddleId: a.parentUnfuddleId, reason: `Parent comment unfuddle_id ${a.parentUnfuddleId} did not resolve to a real ticket_comments id — not degraded to a ticket-level attachment.` });
          continue;
        }
        if (!a.createdAt) {
          errors.push({ attachmentUnfuddleId: a.unfuddleId, parentType: "Comment", parentUnfuddleId: a.parentUnfuddleId, reason: "Missing created_at in the source XML — never defaulted to now()." });
          continue;
        }

        planned.push({
          ticketUnfuddleId: ticket.unfuddleId,
          attachmentUnfuddleId: a.unfuddleId,
          ticket_id: ticketId,
          comment_id: commentId,
          unfuddle_id: String(a.unfuddleId),
          filename: a.filename,
          storage_path: generateAttachmentObjectPath(ticketId, a.unfuddleId, a.filename),
          size_bytes: a.declaredSize ?? 0,
          mime_type: a.contentType || null,
          uploaded_by: null,
          created_at: a.createdAt,
          updated_at: a.updatedAt,
        });
      }
    }
  }

  return { planned, errors, ok: errors.length === 0 };
}
