/**
 * Fixed scope for this importer pass, per docs/UNFUDDLE_IMPORT_SPECIFICATION.md
 * and the current migration target: Unfuddle Project 152 ("PG - Soporte y
 * Mantenimiento"), Milestone 183 ("KTVibe").
 *
 * A future pass covering additional Milestones/Projects only needs new
 * values here (or a CLI override) — the parser itself does not hardcode
 * these ids.
 */
export const TARGET_UNFUDDLE_PROJECT_ID = 152;
export const TARGET_UNFUDDLE_MILESTONE_ID = 183;

export interface DryRunConfig {
  backupXmlPath: string;
  mediaDir: string;
  targetProjectId: number;
  targetMilestoneId: number;
}

/**
 * Phase 2 scope — resolved against real Supabase data (see
 * preflight/resolve-organization.ts, preflight/resolve-target-users.ts).
 *
 * The organization is looked up by this slug, never a hardcoded UUID
 * (confirmed live: the single `organizations` row has slug 'techtivo').
 */
export const TARGET_ORGANIZATION_SLUG = "techtivo";

/**
 * The 6 real People (of the backup's 9) this phase resolves against
 * existing `profiles`, by their Unfuddle person id — matched against
 * `ParsedBackup.users` (Phase 1's parser output) to get each one's email,
 * rather than re-hardcoding email strings here.
 *
 *   1   Alejandro Cadavid    (alejo@techtivo.com)
 *   148 Maria Jose Abadia    (majo@techtivo.com)
 *   149 Mex Avila            (mex@techtivo.com)
 *   155 Micaela Levinsonas   (micalev45@gmail.com)
 *   2   Carolina Avila Coral (carolina@pixelgroup.net) — is-removed in Unfuddle
 *   139 Martine              (martine@techtivo.com)     — is-removed in Unfuddle
 */
export const TARGET_USER_UNFUDDLE_IDS = [1, 148, 149, 155, 2, 139] as const;

/**
 * Known-broken person references found by the Phase 1 dry run (referenced
 * by assignee/reporter/comment-author/time-entry-person, but absent from
 * the backup's own People list). Per agreed policy, these must never be
 * auto-resolved to any profile, in this phase or later ones.
 */
export const KNOWN_ORPHAN_UNFUDDLE_IDS = [150, 153] as const;

export interface Phase2Config {
  backupXmlPath: string;
  mediaDir: string;
  targetProjectId: number;
  targetMilestoneId: number;
  organizationSlug: string;
  targetUserUnfuddleIds: readonly number[];
  knownOrphanUnfuddleIds: readonly number[];
  /** PREVIEW (false, default) never writes. APPLY (true) only via an explicit --apply flag. */
  apply: boolean;
}

/** Phase 3 reuses Phase 2's config shape verbatim — same backup/org/user scope, same PREVIEW/APPLY flag. */
export type Phase3Config = Phase2Config;

/** The exact `projects` row Phase 2 reconciled — Phase 3 must find this, not drift from it. */
export const EXPECTED_PROJECT_SLUG = "ktvibe";
export const EXPECTED_PROJECT_CODE = "KTV";

/**
 * Confirmed by direct evidence against the 170 KTVibe tickets (Phase 1
 * parse): these are the only `status`/`priority` raw values that appear.
 * Deliberately not a catch-all/default mapping — an unmapped value found at
 * runtime must stop the import, not be guessed (task's explicit "no
 * inventar mapeos" + STOP RULE).
 */
export const CONFIRMED_STATUS_MAP: Record<string, "backlog" | "to_do" | "in_progress" | "review" | "blocked" | "done"> = {
  closed: "done",
  "In Progress": "in_progress",
  "Resolved in Staging": "review",
};

export const CONFIRMED_PRIORITY_MAP: Record<number, "highest" | "high" | "medium" | "low"> = {
  3: "medium",
  4: "high",
  5: "highest",
};
