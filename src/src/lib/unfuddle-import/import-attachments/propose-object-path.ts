import type { ObjectPathProposal } from "../types/phase6";

/**
 * PROPOSAL ONLY — nothing in this file uploads, creates a bucket, or
 * generates a signed URL. For a future Phase 6 APPLY (its own task, after
 * the schema/comment-parent blockers are resolved), the historical
 * attachment's own Unfuddle id is what guarantees a collision-free,
 * deterministic path — not the original filename, which the audit found
 * repeated 5 times (e.g. "image.png" used by 167 different attachments).
 *
 * Pattern: `<ticket_id>/att-<unfuddle_id>-<sanitized filename>`
 * - Keeps the existing app convention's load-bearing prefix
 *   (`<ticket_id>/...`) intact — every Storage RLS policy already extracts
 *   `(storage.foldername(name))[1]` and expects it to be the ticket id, so
 *   changing that would require a Storage policy change (out of scope).
 * - `att-<unfuddle_id>-` replaces the app's own `crypto.randomUUID()-`
 *   segment with the one thing that's actually stable across re-imports:
 *   the historical Unfuddle attachment id itself. Two different
 *   attachments can never collide (unfuddle_id is unique by construction —
 *   confirmed 0 duplicates among the 250), and re-running the importer
 *   against the same backup always recomputes the exact same path for the
 *   exact same historical attachment — the actual property idempotency
 *   needs, which a random UUID structurally cannot provide.
 * - The sanitized filename suffix is kept (same `[^a-zA-Z0-9._-]` allowlist
 *   the app's own `uploadTicketAttachment` already uses) purely for
 *   humans skimming the bucket — the `att-<unfuddle_id>-` prefix is what
 *   Storage/the importer actually key off.
 * - Comment-level attachments use the *ticket's* id as the folder prefix
 *   too (there is no other option while `ticket_attachments` has no
 *   `comment_id` column — see the schema audit) — flagged there as a
 *   blocker for what the metadata row itself should record, not a
 *   statement that this path pattern is sufufficient on its own to solve
 *   comment-level attachments.
 */
export function proposeObjectPathStrategy(): ObjectPathProposal {
  return {
    pattern: "<ticket_id>/att-<unfuddle_id>-<sanitized filename>",
    example: "51f2fa13-a2f8-490d-83d7-f6c1d46c8d29/att-8413-image001.png",
    ticketLevelExample: "<ticket_id>/att-<ticket attachment's own unfuddle_id>-<filename>",
    commentLevelExample: "<parent ticket_id>/att-<comment attachment's own unfuddle_id>-<filename> (folder is still the ticket, per the current Storage RLS convention — see schema audit for why the row itself can't record the comment relationship yet)",
    rationale: [
      "Deterministic: the same historical attachment always maps to the same path across repeated import runs — a prerequisite for idempotency that a random UUID (the app's own current convention) cannot provide.",
      "Collision-free: keyed on unfuddle_id, which is unique across all 250 attachments (confirmed: 0 duplicates) — never on filename, which repeats (5 filenames reused, one 167 times).",
      "Compatible with existing Storage RLS as-is: the leading <ticket_id>/ segment every policy already expects is unchanged.",
      "Sanitization reuses the app's own existing allowlist ([^a-zA-Z0-9._-] -> \"_\") rather than inventing a new one — no path separators, no control characters, no leading '/', no '..' segment ever reaches Storage (confirmed 0 of the 250 real filenames contain a path separator; 35 contain cosmetic double-dots from date abbreviations like \"a.m..\", which the existing sanitizer already leaves harmless since it only blocks separator characters, not dots).",
    ],
  };
}
