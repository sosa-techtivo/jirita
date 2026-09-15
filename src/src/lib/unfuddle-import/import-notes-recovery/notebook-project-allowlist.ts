import type { NotebookProjectMapping } from "../types/notes-recovery";

/**
 * The ONLY approved Notebook -> JIRITA project destinations for the
 * Unfuddle Notes recovery. This is the fix for the first recovery attempt's
 * incorrect premise ("every Notebook's Notes belong to KTVibe") — Unfuddle
 * Project 152's <notebook><project-id> is a container-project id shared by
 * all 53 notebooks and never determines the JIRITA destination; the real
 * destination is per-notebook, reconstructed by Alex from historical
 * tickets (tickets.unfuddle_id -> canonical XML -> milestone-id) and
 * approved explicitly, one notebook at a time.
 *
 * FAIL-CLOSED BY CONSTRUCTION: any notebook not listed here is excluded
 * from the recovery, full stop — see assign-allowlisted-candidates.ts. No
 * fuzzy/name-similarity matching, no inference, nothing added here without
 * Alex's explicit sign-off. In particular:
 *   - Notebook 255 "Addison Smith" is deliberately NOT listed: two live
 *     milestones (289 Residential, 294 Commercial) could plausibly be the
 *     destination and the Notebook alone can't disambiguate safely.
 *   - Notebook 224 "KTDrive your career" (historical milestone 190) is
 *     deliberately NOT listed: it must never be assigned to milestone 284
 *     ("KT Drive your career 2.0") or 287 ("Attorney") without a specific,
 *     separate approval.
 * Every other one of the 53 notebooks (or a notebook with a name that
 * merely looks similar to a current project) is equally excluded, with no
 * exception carved out anywhere in code.
 *
 * `notebookTitle`, `historicalMilestoneId`, and `jiritaProjectName` are
 * informative/audit-trail only — matching and destination assignment use
 * `notebookUnfuddleId` -> `jiritaProjectUuid` exclusively. `jiritaProjectName`
 * IS cross-checked against the live `projects.name` for the resolved
 * `jiritaProjectUuid` (see preflight/resolve-allowlisted-projects.ts) purely
 * as a drift detector, never as a matching mechanism.
 */
export const APPROVED_NOTEBOOK_PROJECT_ALLOWLIST: readonly NotebookProjectMapping[] = [
  {
    notebookUnfuddleId: 168,
    notebookTitle: "CampSunshine",
    historicalMilestoneId: 142,
    jiritaProjectName: "Camp Sunshine",
    jiritaProjectUuid: "11642fdb-ebaa-4ff0-af6f-51d9aefe44cd",
    expectedLogicalNotes: 7,
  },
  {
    notebookUnfuddleId: 162,
    notebookTitle: "IMLAY",
    historicalMilestoneId: 151,
    jiritaProjectName: "IMLAY",
    jiritaProjectUuid: "944128ba-be16-4b1c-8164-c0381699fd5c",
    expectedLogicalNotes: 3,
  },
  {
    notebookUnfuddleId: 222,
    notebookTitle: "KTRecruits",
    historicalMilestoneId: 188,
    jiritaProjectName: "KTRecruits",
    jiritaProjectUuid: "054d185c-70c6-4fac-a430-fc280294e521",
    expectedLogicalNotes: 8,
  },
  {
    notebookUnfuddleId: 216,
    notebookTitle: "KTVibe",
    historicalMilestoneId: 183,
    jiritaProjectName: "KTVibe",
    jiritaProjectUuid: "6d36e4e7-32be-4fe6-a865-f3de2cc544d2",
    expectedLogicalNotes: 1,
  },
  {
    notebookUnfuddleId: 173,
    notebookTitle: "SW&A",
    historicalMilestoneId: 150,
    jiritaProjectName: "SW&A",
    jiritaProjectUuid: "7ffd97e2-ff4c-4e29-88ad-957cb55226f1",
    expectedLogicalNotes: 8,
  },
  {
    notebookUnfuddleId: 251,
    notebookTitle: "Besty Akers",
    historicalMilestoneId: 239,
    jiritaProjectName: "Betsy Akers",
    jiritaProjectUuid: "ffaeba5d-126c-4dc6-84f7-a4a4fb5ffa9c",
    expectedLogicalNotes: 1,
  },
] as const;

/** 7 + 3 + 8 + 1 + 8 + 1 — the exact allowlisted total this recovery's PREVIEW must show. */
export const EXPECTED_ALLOWLISTED_TOTAL = APPROVED_NOTEBOOK_PROJECT_ALLOWLIST.reduce((sum, m) => sum + m.expectedLogicalNotes, 0);
