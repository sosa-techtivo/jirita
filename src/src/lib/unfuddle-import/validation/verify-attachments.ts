import { readdir, stat } from "node:fs/promises";
import path from "node:path";

import type { Ticket } from "../types/models";
import type { AttachmentVerificationResult } from "../types/report";

/**
 * Verifies every Attachment referenced by an in-scope Ticket (directly, or
 * via one of its Comments) physically exists in `media/`.
 *
 * Unfuddle stores each attachment's binary as a single flat file named
 * after its `<attachment><id>` (confirmed: `media/8413` is the PNG for
 * attachment id 8413, `<size>577026</size>` matches its on-disk size
 * exactly). `media/` has no subdirectories, so one `readdir` is a complete
 * traversal ("recorrer completamente media/") — this never reads file
 * contents, only stats the ones our in-scope attachments reference.
 */
export async function verifyAttachments(tickets: Ticket[], mediaDir: string): Promise<AttachmentVerificationResult> {
  const mediaFiles = new Set(await readdir(mediaDir));

  const referenced = tickets.flatMap((ticket) => [
    ...ticket.attachments,
    ...ticket.comments.flatMap((c) => c.attachments),
  ]);

  let foundCount = 0;
  let totalSizeBytes = 0;
  const missingDetails: string[] = [];
  const sizeMismatchWarnings: string[] = [];

  for (const attachment of referenced) {
    const filename = String(attachment.unfuddleId);
    if (!mediaFiles.has(filename)) {
      missingDetails.push(
        `Attachment ${attachment.unfuddleId} ("${attachment.filename}", parent ${attachment.parentType} ${attachment.parentUnfuddleId}) is missing from ${mediaDir}.`,
      );
      continue;
    }
    foundCount++;
    const stats = await stat(path.join(mediaDir, filename));
    totalSizeBytes += stats.size;
    if (attachment.declaredSize !== null && attachment.declaredSize !== stats.size) {
      sizeMismatchWarnings.push(
        `Attachment ${attachment.unfuddleId} declares size ${attachment.declaredSize} but the file on disk is ${stats.size} bytes.`,
      );
    }
  }

  return {
    totalReferenced: referenced.length,
    foundCount,
    missingCount: missingDetails.length,
    missingDetails,
    totalSizeBytes,
    sizeMismatchWarnings,
    mediaDirFileCount: mediaFiles.size,
  };
}
