import path from "node:path";
import type { Attachment, Ticket } from "../types/models";
import type { AttachmentXmlStats } from "../types/phase6";

const DANGEROUS_EXTENSIONS = new Set([".exe", ".bat", ".cmd", ".sh", ".ps1", ".msi", ".scr", ".js", ".vbs", ".jar", ".app", ".html", ".htm", ".svg"]);
const ARCHIVE_EXTENSIONS = new Set([".zip", ".rar", ".7z", ".tar", ".gz"]);

/**
 * Computes every field-level statistic requested for the 250 attachments
 * already materialized by Phase 1's parser — never re-parses the XML.
 * `.svg` is flagged separately from DANGEROUS_EXTENSIONS: the app already
 * previews SVGs inline via a plain `<img>` tag (ticket-detail-screen.tsx's
 * PREVIEWABLE_IMAGE_EXTS), and `<img>` never executes embedded SVG script
 * content in any evergreen browser — a real but already-accepted pattern
 * in the live app, not a new risk this import introduces. Still reported,
 * not silently ignored.
 */
export function computeAttachmentStats(tickets: Ticket[]): AttachmentXmlStats {
  const ticketLevel: Attachment[] = [];
  const commentLevel: Attachment[] = [];
  const unexpectedParentTypes = new Set<string>();

  for (const ticket of tickets) {
    for (const a of ticket.attachments) {
      if (a.parentType === "Ticket") ticketLevel.push(a);
      else if (a.parentType === "Comment") commentLevel.push(a);
      else unexpectedParentTypes.add(a.parentType);
    }
    for (const comment of ticket.comments) {
      for (const a of comment.attachments) {
        if (a.parentType === "Comment") commentLevel.push(a);
        else if (a.parentType === "Ticket") ticketLevel.push(a);
        else unexpectedParentTypes.add(a.parentType);
      }
    }
  }

  const all = [...ticketLevel, ...commentLevel];

  const emptyFilename = all.filter((a) => !a.filename || a.filename.trim() === "").length;
  const emptyMime = all.filter((a) => !a.contentType || a.contentType.trim() === "").length;
  const emptySize = all.filter((a) => a.declaredSize === null).length;
  const zeroSize = all.filter((a) => a.declaredSize === 0).length;
  const emptyCreatedAt = all.filter((a) => !a.createdAt).length;
  const emptyUpdatedAt = all.filter((a) => !a.updatedAt).length;
  const genericMime = all.filter((a) => a.contentType === "application/octet-stream").length;

  const ids = all.map((a) => a.unfuddleId);
  const duplicateAttachmentIds = ids.length - new Set(ids).size;

  const filenameCounts = new Map<string, number>();
  for (const a of all) filenameCounts.set(a.filename, (filenameCounts.get(a.filename) ?? 0) + 1);
  const repeatedFilenames = [...filenameCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([filename, count]) => ({ filename, count }))
    .sort((a, b) => b.count - a.count);

  const extCounts = new Map<string, number>();
  for (const a of all) {
    const ext = path.extname(a.filename).toLowerCase() || "(none)";
    extCounts.set(ext, (extCounts.get(ext) ?? 0) + 1);
  }
  const extensionCounts = [...extCounts.entries()].map(([ext, count]) => ({ ext, count })).sort((a, b) => b.count - a.count);

  const dangerousExtensionFiles = all
    .filter((a) => DANGEROUS_EXTENSIONS.has(path.extname(a.filename).toLowerCase()))
    .map((a) => ({ unfuddleId: a.unfuddleId, filename: a.filename, contentType: a.contentType }));

  const archiveFiles = all.filter((a) => ARCHIVE_EXTENSIONS.has(path.extname(a.filename).toLowerCase())).length;
  const noExtensionFiles = all.filter((a) => !path.extname(a.filename)).length;

  const ticketsWithAttachments = tickets.filter((t) => t.attachments.length > 0).length;
  const commentsWithAttachments = tickets.flatMap((t) => t.comments).filter((c) => c.attachments.length > 0).length;

  return {
    total: all.length,
    ticketLevel: ticketLevel.length,
    commentLevel: commentLevel.length,
    unexpectedParentTypes: [...unexpectedParentTypes],
    emptyFilename,
    emptyMime,
    emptySize,
    zeroSize,
    emptyCreatedAt,
    emptyUpdatedAt,
    genericMime,
    duplicateAttachmentIds,
    uniqueFilenames: filenameCounts.size,
    repeatedFilenames,
    extensionCounts,
    dangerousExtensionFiles,
    archiveFiles,
    noExtensionFiles,
    ticketsWithAttachments,
    commentsWithAttachments,
  };
}
