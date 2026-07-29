import path from "node:path";

/**
 * Real, deterministic implementation of the pattern proposed by
 * propose-object-path.ts: `<ticket_id>/att-<unfuddle_id>-<sanitized filename>`.
 * Never used to actually upload anything in this task — see
 * check-attachment-storage-idempotency.ts and Phase 6's report, both of
 * which only ever read this path, never write to it.
 *
 * Reuses the app's own existing sanitization exactly
 * (`uploadTicketAttachment` in src/lib/tickets.ts: `[^a-zA-Z0-9._-]` -> "_")
 * plus defenses that filename alone doesn't need: `.` and `..` are both
 * valid characters under that allowlist, so a filename that sanitizes down
 * to exactly "." or ".." (e.g. a literal `.` or `..` attachment name) falls
 * back to a safe placeholder instead of ever reaching Storage as a
 * traversal segment. Confirmed against the real 250: none actually trigger
 * this path (0 empty filenames, 0 filenames that are just dots), but the
 * defense exists rather than being assumed unnecessary.
 */
const SANITIZE_PATTERN = /[^a-zA-Z0-9._-]/g;

function sanitizeFilename(filename: string): string {
  const sanitized = filename.replace(SANITIZE_PATTERN, "_");
  if (sanitized !== "" && sanitized !== "." && sanitized !== "..") return sanitized;

  const ext = path.extname(filename).replace(SANITIZE_PATTERN, "_");
  return ext !== "" && ext !== "." && ext !== ".." ? `file${ext}` : "file";
}

export function generateAttachmentObjectPath(ticketId: string, attachmentUnfuddleId: number, filename: string): string {
  return `${ticketId}/att-${attachmentUnfuddleId}-${sanitizeFilename(filename)}`;
}
