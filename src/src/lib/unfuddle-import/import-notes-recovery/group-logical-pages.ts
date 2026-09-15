import crypto from "node:crypto";
import type { GroupingResult, LogicalNoteCandidate, NotebookPageRevision, VersionContinuityIssue } from "../types/notes-recovery";
import { buildNoteHistoricalKey } from "./build-note-key";

function logicalKey(notebookUnfuddleId: number, pageNumber: number): string {
  return `${notebookUnfuddleId}:${pageNumber}`;
}

/**
 * Canonicalizes raw <page> revisions into one logical Note per
 * (notebook_id, page_number): v1 for creation metadata (created_at,
 * created_by), highest version for current state (title, content,
 * updated_at, updated_by) — per the task's explicit mapping. A pure
 * function, independently testable from the streaming parser (see
 * group-logical-pages.test.ts).
 *
 * Every revision's <page><created-at> equals its own <updated-at> (each
 * edit gets a fresh timestamp pair, confirmed against the source) — so the
 * highest version's own updated_at/created_at (both equal) IS the correct
 * historical "current state as of" timestamp; this function never derives
 * updated_at from anything else.
 */
export function groupLogicalPages(revisions: NotebookPageRevision[]): GroupingResult {
  const byLogical = new Map<string, NotebookPageRevision[]>();
  for (const r of revisions) {
    const key = logicalKey(r.notebookUnfuddleId, r.pageNumber);
    const arr = byLogical.get(key);
    if (arr) arr.push(r);
    else byLogical.set(key, [r]);
  }

  const candidates: LogicalNoteCandidate[] = [];
  const continuityIssues: VersionContinuityIssue[] = [];

  for (const [, group] of byLogical) {
    const notebookUnfuddleId = group[0].notebookUnfuddleId;
    const notebookTitle = group[0].notebookTitle;
    const pageNumber = group[0].pageNumber;

    const versions = group.map((r) => r.version);
    const uniqueVersions = new Set(versions);
    if (uniqueVersions.size !== versions.length) {
      continuityIssues.push({ notebookUnfuddleId, pageNumber, versionsPresent: [...versions].sort((a, b) => a - b), reason: "duplicate_version" });
    }

    const sortedUnique = [...uniqueVersions].sort((a, b) => a - b);
    const isConsecutiveFrom1 = sortedUnique.every((v, i) => v === i + 1);
    if (!isConsecutiveFrom1) {
      continuityIssues.push({ notebookUnfuddleId, pageNumber, versionsPresent: sortedUnique, reason: "non_consecutive" });
    }

    const v1 = group.find((r) => r.version === 1) ?? null;
    if (!v1) {
      continuityIssues.push({ notebookUnfuddleId, pageNumber, versionsPresent: sortedUnique, reason: "missing_v1" });
      // No safe creation metadata to fall back to — skip building a
      // candidate for this logical page rather than guessing. Reported via
      // continuityIssues, never silently dropped.
      continue;
    }

    const latest = group.reduce((best, r) => (r.version > best.version ? r : best), group[0]);

    const title = `${notebookTitle} — ${latest.pageTitle}`;
    const content = latest.body;
    const contentSha256 = crypto.createHash("sha256").update(content, "utf8").digest("hex");

    if (!latest.createdAt) {
      continuityIssues.push({ notebookUnfuddleId, pageNumber, versionsPresent: sortedUnique, reason: "missing_v1" });
      continue;
    }
    if (!v1.createdAt) {
      continuityIssues.push({ notebookUnfuddleId, pageNumber, versionsPresent: sortedUnique, reason: "missing_v1" });
      continue;
    }

    candidates.push({
      notebookUnfuddleId,
      notebookTitle,
      pageNumber,
      unfuddleNoteKey: buildNoteHistoricalKey(notebookUnfuddleId, pageNumber),
      title,
      content,
      contentLength: content.length,
      contentSha256,
      versionCount: group.length,
      latestVersion: latest.version,
      createdAt: v1.createdAt,
      createdByUnfuddleId: v1.authorUnfuddleId,
      updatedAt: latest.createdAt,
      updatedByUnfuddleId: latest.authorUnfuddleId,
    });
  }

  const titleCounts = new Map<string, number>();
  for (const c of candidates) titleCounts.set(c.title, (titleCounts.get(c.title) ?? 0) + 1);
  const duplicateTitles = [...titleCounts.entries()].filter(([, count]) => count > 1).map(([title, count]) => ({ title, count }));

  return { candidates, continuityIssues, duplicateTitles };
}
