import type { Ticket } from "../types/models";
import type { CommentMappingResult, MappingError, PlannedCommentFields } from "../types/phase4";

/**
 * Maps the comments already materialized on the 170 Ticket models (Phase 1's
 * parser — never re-implemented, never re-read from the XML) onto the
 * exact `ticket_comments` insert payload. `body` is copied verbatim — no
 * prefixes, no cleanup, no import notes (task's explicit "no alterar ni
 * limpiar"). `updated_at` is always the backup's own value, even when it
 * equals `created_at` — never conditionally omitted.
 */
export function mapCommentRows(
  tickets: Ticket[],
  ticketParentMap: Map<number, string>,
  userMap: Map<number, string | null>,
): CommentMappingResult {
  const planned: PlannedCommentFields[] = [];
  const errors: MappingError[] = [];

  for (const ticket of tickets) {
    for (const comment of ticket.comments) {
      const fail = (reason: string) => errors.push({ commentUnfuddleId: comment.unfuddleId, ticketUnfuddleId: comment.ticketUnfuddleId, reason });

      const ticketId = ticketParentMap.get(comment.ticketUnfuddleId);
      if (!ticketId) {
        fail(`Comment ${comment.unfuddleId} references ticket ${comment.ticketUnfuddleId}, which is not among the imported tickets.`);
        continue;
      }
      if (!comment.body || comment.body === "") {
        fail(`Comment ${comment.unfuddleId} has an empty body.`);
        continue;
      }
      if (!comment.createdAt) {
        fail(`Comment ${comment.unfuddleId} has no created_at — refusing to substitute today's date.`);
        continue;
      }
      if (!comment.updatedAt) {
        fail(`Comment ${comment.unfuddleId} has no updated_at — refusing to substitute today's date.`);
        continue;
      }

      const authorProfileId = comment.authorUnfuddleId !== null ? userMap.get(comment.authorUnfuddleId) ?? null : null;

      planned.push({
        ticket_id: ticketId,
        unfuddle_id: String(comment.unfuddleId),
        body: comment.body,
        author_profile_id: authorProfileId,
        created_at: comment.createdAt,
        updated_at: comment.updatedAt,
      });
    }
  }

  return { planned, errors, ok: errors.length === 0 };
}
