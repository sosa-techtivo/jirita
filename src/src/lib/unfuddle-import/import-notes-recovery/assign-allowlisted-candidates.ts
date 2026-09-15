import type { AllowlistAssignmentResult, AllowlistedBucket, LogicalNoteCandidate } from "../types/notes-recovery";
import { APPROVED_NOTEBOOK_PROJECT_ALLOWLIST } from "./notebook-project-allowlist";

/**
 * Pure fail-closed filter: a candidate is included ONLY if its
 * notebookUnfuddleId is one of the 6 explicitly approved entries in
 * APPROVED_NOTEBOOK_PROJECT_ALLOWLIST. No fuzzy/name matching, no
 * inference — a candidate not found in the allowlist by exact notebook id
 * is always excluded, with no other path to inclusion.
 */
export function assignAllowlistedCandidates(candidates: LogicalNoteCandidate[]): AllowlistAssignmentResult {
  const allowlisted: AllowlistedBucket[] = APPROVED_NOTEBOOK_PROJECT_ALLOWLIST.map((mapping) => ({ mapping, candidates: [] }));
  const bucketByNotebookId = new Map(allowlisted.map((b) => [b.mapping.notebookUnfuddleId, b]));
  const excluded: LogicalNoteCandidate[] = [];

  for (const c of candidates) {
    const bucket = bucketByNotebookId.get(c.notebookUnfuddleId);
    if (bucket) bucket.candidates.push(c);
    else excluded.push(c);
  }

  const countMismatches = allowlisted
    .filter((b) => b.candidates.length !== b.mapping.expectedLogicalNotes)
    .map((b) => ({ mapping: b.mapping, expected: b.mapping.expectedLogicalNotes, actual: b.candidates.length }));

  const unmappedAllowlistEntries = allowlisted.filter((b) => b.candidates.length === 0).map((b) => b.mapping);

  return { allowlisted, excluded, countMismatches, unmappedAllowlistEntries };
}
