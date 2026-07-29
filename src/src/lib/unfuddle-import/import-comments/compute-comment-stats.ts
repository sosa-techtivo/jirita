import type { Ticket, UserReference } from "../types/models";
import type { CommentsStats, UserMapEntryStatus } from "../types/phase4";
import { KNOWN_ORPHAN_UNFUDDLE_IDS } from "../config";

export function computeCommentStats(tickets: Ticket[], backupUsers: UserReference[], userStatusById: Map<number, UserMapEntryStatus>): CommentsStats {
  const removedById = new Map(backupUsers.map((u) => [u.unfuddleId, u.isRemoved]));
  const knownOrphans = new Set<number>(KNOWN_ORPHAN_UNFUDDLE_IDS);

  let total = 0;
  let withBody = 0;
  let emptyBody = 0;
  let withKnownAuthor = 0;
  let withRemovedButKnownAuthor = 0;
  let withOrphanAuthor150 = 0;
  let withOrphanAuthor153 = 0;
  let withEmptyAuthorId = 0;
  const unexpectedAuthorIds = new Set<number>();
  let updatedDiffersFromCreated = 0;
  let withPendingAttachments = 0;

  for (const ticket of tickets) {
    for (const comment of ticket.comments) {
      total++;
      if (comment.body && comment.body.trim() !== "") withBody++;
      else emptyBody++;

      if (comment.authorUnfuddleId === null) {
        withEmptyAuthorId++;
      } else {
        const status = userStatusById.get(comment.authorUnfuddleId);
        if (status === "resolved") {
          withKnownAuthor++;
          if (removedById.get(comment.authorUnfuddleId)) withRemovedButKnownAuthor++;
        } else if (status === "orphan_no_backup_record") {
          if (comment.authorUnfuddleId === 150) withOrphanAuthor150++;
          else if (comment.authorUnfuddleId === 153) withOrphanAuthor153++;
          if (!knownOrphans.has(comment.authorUnfuddleId)) unexpectedAuthorIds.add(comment.authorUnfuddleId);
        } else {
          unexpectedAuthorIds.add(comment.authorUnfuddleId);
        }
      }

      if (comment.createdAt !== comment.updatedAt) updatedDiffersFromCreated++;
      if (comment.attachments.length > 0) withPendingAttachments++;
    }
  }

  const perTicket = tickets.map((t) => t.comments.length);

  return {
    total,
    withBody,
    emptyBody,
    withKnownAuthor,
    withRemovedButKnownAuthor,
    withOrphanAuthor150,
    withOrphanAuthor153,
    withEmptyAuthorId,
    unexpectedAuthorIds: [...unexpectedAuthorIds].sort((a, b) => a - b),
    updatedDiffersFromCreated,
    withPendingAttachments,
    ticketsWithComments: perTicket.filter((n) => n > 0).length,
    maxCommentsPerTicket: perTicket.length > 0 ? Math.max(...perTicket) : 0,
  };
}
