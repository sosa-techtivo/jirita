import type { SupabaseClient } from "@supabase/supabase-js";
import type { UserReference } from "../types/models";
import type { AuthorResolutionEntry, AuthorResolutionResult } from "../types/notes-recovery";
import { resolveUserMap } from "../preflight/resolve-user-map";

interface OrphanProfileRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
}

/**
 * Resolves every Unfuddle author id needed by the 158 candidate Notes
 * (created_by + updated_by) to exactly one JIRITA profile.
 *
 * Reuses the established backup Person -> normalized email -> exactly one
 * `profiles` row resolver (preflight/resolve-user-map.ts) verbatim for
 * every author who has a Person record in the backup — same as Phase 3's
 * ticket import. That resolver returns `orphan_no_backup_record` (never
 * blocking on its own) for an id with no Person record at all — the known
 * case here is author 122 (no <person id="122"> anywhere in backup.xml,
 * confirmed).
 *
 * For that orphan case only, a narrowly-scoped, strict fallback: look up
 * `profiles.unfuddle_id = <id>` directly, requiring EXACTLY one match. This
 * is generic (any orphan id, not hardcoded to 122's known profile) and
 * strict (0 or >1 matches is a blocking failure, never silently resolved to
 * an arbitrary row and never falls back to name/title/content matching).
 *
 * A *known* backup Person who still fails to resolve uniquely against
 * `profiles` (not_found_in_profiles / multiple_matches) is never given the
 * orphan fallback — that would hide a real, nameable person's broken
 * mapping behind the same bucket as a truly untraceable reference, exactly
 * the distinction resolveUserMap's own docstring already establishes.
 *
 * No profile is ever modified here — this module only reads `profiles`.
 */
export async function resolveNoteAuthors(
  admin: SupabaseClient,
  backupUsers: UserReference[],
  referencedUnfuddleIds: number[],
): Promise<AuthorResolutionResult> {
  const base = await resolveUserMap(admin, backupUsers, referencedUnfuddleIds);

  const map = new Map<number, string>();
  const entries: AuthorResolutionEntry[] = [];
  const blockingReasons: string[] = [...base.blockingReasons];

  for (const baseEntry of base.entries) {
    if (baseEntry.status === "resolved" && baseEntry.profileId) {
      map.set(baseEntry.unfuddleId, baseEntry.profileId);
      entries.push({
        unfuddleId: baseEntry.unfuddleId,
        status: "resolved_via_backup_person",
        profileId: baseEntry.profileId,
        email: baseEntry.email,
        fullName: baseEntry.fullName,
        detail: null,
      });
      continue;
    }

    if (baseEntry.status !== "orphan_no_backup_record") {
      // not_found_in_profiles / multiple_matches — a known backup Person
      // whose own resolution already failed; never eligible for the
      // orphan fallback below (that fallback exists only for ids with no
      // Person record at all).
      entries.push({
        unfuddleId: baseEntry.unfuddleId,
        status: "unresolved",
        profileId: null,
        email: baseEntry.email,
        fullName: baseEntry.fullName,
        detail: baseEntry.detail,
      });
      continue;
    }

    // orphan_no_backup_record — the strict profiles.unfuddle_id fallback.
    const { data, error } = await admin
      .from("profiles")
      .select("id, first_name, last_name, email")
      .eq("unfuddle_id", String(baseEntry.unfuddleId))
      .returns<OrphanProfileRow[]>();

    if (error) {
      const detail = `profiles.unfuddle_id lookup failed: ${error.message}`;
      blockingReasons.push(`Author ${baseEntry.unfuddleId}: ${detail}`);
      entries.push({ unfuddleId: baseEntry.unfuddleId, status: "unresolved", profileId: null, email: null, fullName: null, detail });
      continue;
    }

    const rows = data ?? [];
    if (rows.length !== 1) {
      const detail = `${rows.length} profile(s) matched profiles.unfuddle_id = '${baseEntry.unfuddleId}' — expected exactly 1.`;
      blockingReasons.push(`Author ${baseEntry.unfuddleId}: ${detail}`);
      entries.push({ unfuddleId: baseEntry.unfuddleId, status: "unresolved", profileId: null, email: null, fullName: null, detail });
      continue;
    }

    const row = rows[0];
    map.set(baseEntry.unfuddleId, row.id);
    entries.push({
      unfuddleId: baseEntry.unfuddleId,
      status: "resolved_via_orphan_profile_fallback",
      profileId: row.id,
      email: row.email,
      fullName: [row.first_name, row.last_name].filter(Boolean).join(" ") || null,
      detail: `No Unfuddle Person record in the backup — resolved via profiles.unfuddle_id = '${baseEntry.unfuddleId}' (exactly one match required).`,
    });
  }

  return { map, entries, ok: blockingReasons.length === 0, blockingReasons };
}
