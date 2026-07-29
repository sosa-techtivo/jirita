import type { SupabaseClient } from "@supabase/supabase-js";
import type { UserReference } from "../types/models";
import type { UserMapEntry, UserMapResult } from "../types/phase3";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

interface ProfileRow {
  id: string;
  email: string | null;
}

/**
 * Builds an explicit Unfuddle person id -> JIRITA profile id map, scoped to
 * exactly the person ids the 170 tickets actually reference (as reporter or
 * assignee) — never resolved by name, only by normalized email against the
 * backup's own People list (task's explicit "no resolver... buscando
 * directamente por nombre").
 *
 * A referenced id with no Person record at all in the backup (e.g. the
 * known orphans 150/153) maps to `null` by construction — there is no email
 * to look up, so it can never be approximated to anyone. A referenced id
 * that DOES have a Person record but fails to resolve to exactly one
 * `profiles` row is a hard error (`ok: false`), never silently nulled —
 * that would hide a real, nameable person's broken mapping behind the same
 * "orphan" bucket as a truly untraceable reference.
 */
export async function resolveUserMap(
  admin: SupabaseClient,
  backupUsers: UserReference[],
  referencedUnfuddleIds: number[],
): Promise<UserMapResult> {
  const map = new Map<number, string | null>();
  const entries: UserMapEntry[] = [];
  const blockingReasons: string[] = [];

  for (const unfuddleId of referencedUnfuddleIds) {
    const backupUser = backupUsers.find((u) => u.unfuddleId === unfuddleId);

    if (!backupUser) {
      map.set(unfuddleId, null);
      entries.push({
        unfuddleId,
        status: "orphan_no_backup_record",
        profileId: null,
        email: null,
        fullName: null,
        detail: `Unfuddle person id ${unfuddleId} has no Person record in the backup — preserved as null, never approximated.`,
      });
      continue;
    }

    const fullName = [backupUser.firstName, backupUser.lastName].filter(Boolean).join(" ") || null;
    const email = normalizeEmail(backupUser.email);

    const { data, error } = await admin.from("profiles").select("id, email").eq("email", email);

    if (error) {
      map.set(unfuddleId, null);
      entries.push({ unfuddleId, status: "not_found_in_profiles", profileId: null, email, fullName, detail: `profiles query failed: ${error.message}` });
      blockingReasons.push(`User ${fullName ?? email} (unfuddle id ${unfuddleId}): profiles query failed: ${error.message}`);
      continue;
    }

    const rows = (data ?? []) as ProfileRow[];

    if (rows.length === 0) {
      map.set(unfuddleId, null);
      const detail = `No profile found with email ${email} — this is a known Person in the backup, not a genuine orphan.`;
      entries.push({ unfuddleId, status: "not_found_in_profiles", profileId: null, email, fullName, detail });
      blockingReasons.push(`User ${fullName ?? email} (unfuddle id ${unfuddleId}): ${detail}`);
      continue;
    }

    if (rows.length > 1) {
      map.set(unfuddleId, null);
      const detail = `${rows.length} profiles matched email ${email} — expected exactly one.`;
      entries.push({ unfuddleId, status: "multiple_matches", profileId: null, email, fullName, detail });
      blockingReasons.push(`User ${fullName ?? email} (unfuddle id ${unfuddleId}): ${detail}`);
      continue;
    }

    map.set(unfuddleId, rows[0].id);
    entries.push({ unfuddleId, status: "resolved", profileId: rows[0].id, email, fullName, detail: null });
  }

  return { map, entries, ok: blockingReasons.length === 0, blockingReasons };
}
