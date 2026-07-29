import type { SupabaseClient } from "@supabase/supabase-js";
import type { UserReference } from "../types/models";
import type { UserPrecheckEntry, UserPrecheckResult } from "../types/phase2";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

interface ProfileRow {
  id: string;
  email: string | null;
  unfuddle_id: string | null;
}

/**
 * Resolves each target Unfuddle person id (per config.ts's
 * TARGET_USER_UNFUDDLE_IDS) to exactly one existing `profiles` row, by
 * normalized email — never by name, never creating/updating anything.
 *
 * A person only counts as `resolved` when: their email matches exactly one
 * profile, AND that profile's `unfuddle_id` is either still null or
 * already equal to the expected id. Any other outcome (0 matches, >1
 * matches, or an unfuddle_id already pointing somewhere else) is a
 * blocking conflict — this phase never decides how to resolve it.
 */
export async function resolveTargetUsers(
  admin: SupabaseClient,
  backupUsers: UserReference[],
  targetUnfuddleIds: readonly number[],
  orphanUnfuddleIds: readonly number[],
): Promise<UserPrecheckResult> {
  const entries: UserPrecheckEntry[] = [];

  for (const unfuddleId of targetUnfuddleIds) {
    const backupUser = backupUsers.find((u) => u.unfuddleId === unfuddleId);
    if (!backupUser) {
      entries.push({
        unfuddleId,
        email: "",
        fullName: "",
        status: "missing_from_backup",
        profileId: null,
        currentUnfuddleId: null,
        matchCount: 0,
        detail: `Unfuddle person id ${unfuddleId} was not found in the backup's People list (expected all 9).`,
      });
      continue;
    }

    const fullName = [backupUser.firstName, backupUser.lastName].filter(Boolean).join(" ") || backupUser.email;
    const email = normalizeEmail(backupUser.email);

    const { data, error } = await admin.from("profiles").select("id, email, unfuddle_id").eq("email", email);

    if (error) {
      entries.push({
        unfuddleId,
        email,
        fullName,
        status: "not_found",
        profileId: null,
        currentUnfuddleId: null,
        matchCount: 0,
        detail: `profiles query failed: ${error.message}`,
      });
      continue;
    }

    const rows = (data ?? []) as ProfileRow[];

    if (rows.length === 0) {
      entries.push({
        unfuddleId,
        email,
        fullName,
        status: "not_found",
        profileId: null,
        currentUnfuddleId: null,
        matchCount: 0,
        detail: `No profile found with email ${email}.`,
      });
      continue;
    }

    if (rows.length > 1) {
      entries.push({
        unfuddleId,
        email,
        fullName,
        status: "multiple_matches",
        profileId: null,
        currentUnfuddleId: null,
        matchCount: rows.length,
        detail: `${rows.length} profiles matched email ${email} — expected exactly one.`,
      });
      continue;
    }

    const profile = rows[0];
    const expected = String(unfuddleId);
    if (profile.unfuddle_id !== null && profile.unfuddle_id !== expected) {
      entries.push({
        unfuddleId,
        email,
        fullName,
        status: "unfuddle_id_conflict",
        profileId: profile.id,
        currentUnfuddleId: profile.unfuddle_id,
        matchCount: 1,
        detail: `Profile ${profile.id} already has unfuddle_id "${profile.unfuddle_id}", expected "${expected}" or null.`,
      });
      continue;
    }

    entries.push({
      unfuddleId,
      email,
      fullName,
      status: "resolved",
      profileId: profile.id,
      currentUnfuddleId: profile.unfuddle_id,
      matchCount: 1,
      detail: null,
    });
  }

  return {
    entries,
    orphanUnfuddleIds,
    ok: entries.length === targetUnfuddleIds.length && entries.every((e) => e.status === "resolved"),
  };
}
