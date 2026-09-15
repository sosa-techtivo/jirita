import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveNoteAuthors } from "./resolve-note-authors";
import type { UserReference } from "../types/models";

interface ProfileFakeRow {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
}

/**
 * A minimal fake satisfying both call shapes this module's dependencies use
 * against `profiles`: preflight/resolve-user-map.ts's `await
 * admin.from("profiles").select("id, email").eq("email", email)` (awaited
 * directly, no `.returns()`), and this module's own orphan fallback
 * `.eq("unfuddle_id", id).returns<...>()`.
 */
function fakeAdmin(byEmail: Map<string, ProfileFakeRow[]>, byUnfuddleId: Map<string, ProfileFakeRow[]>): SupabaseClient {
  function thenable(rows: ProfileFakeRow[]) {
    const payload = { data: rows, error: null };
    return {
      then: (resolve: (v: typeof payload) => void) => resolve(payload),
      returns: () => Promise.resolve(payload),
    };
  }
  return {
    from: () => ({
      select: () => ({
        eq: (col: string, val: string) => {
          if (col === "email") return thenable(byEmail.get(val) ?? []);
          if (col === "unfuddle_id") return thenable(byUnfuddleId.get(val) ?? []);
          return thenable([]);
        },
      }),
    }),
  } as unknown as SupabaseClient;
}

function backupUser(overrides: Partial<UserReference>): UserReference {
  return {
    unfuddleId: 1,
    email: "person@techtivo.com",
    firstName: "First",
    lastName: "Last",
    username: null,
    isAdministrator: false,
    isRemoved: false,
    createdAt: null,
    updatedAt: null,
    ...overrides,
  };
}

describe("resolveNoteAuthors", () => {
  it("resolves a normal author via backup Person -> normalized email -> exactly one profile", async () => {
    const backupUsers = [backupUser({ unfuddleId: 1, email: "alejo@techtivo.com" })];
    const admin = fakeAdmin(new Map([["alejo@techtivo.com", [{ id: "p1", email: "alejo@techtivo.com", first_name: "Alejandro", last_name: "Cadavid" }]]]), new Map());

    const result = await resolveNoteAuthors(admin, backupUsers, [1]);
    expect(result.ok).toBe(true);
    expect(result.map.get(1)).toBe("p1");
    expect(result.entries[0].status).toBe("resolved_via_backup_person");
  });

  it("resolves the orphan case (no backup Person record) via the strict profiles.unfuddle_id fallback, requiring exactly one match", async () => {
    const backupUsers: UserReference[] = []; // no Person record for 122, matching the real backup
    const admin = fakeAdmin(new Map(), new Map([["122", [{ id: "rebecca-profile", email: "rebecca@techtivo.com", first_name: "Rebecca", last_name: "R." }]]]));

    const result = await resolveNoteAuthors(admin, backupUsers, [122]);
    expect(result.ok).toBe(true);
    expect(result.map.get(122)).toBe("rebecca-profile");
    expect(result.entries[0].status).toBe("resolved_via_orphan_profile_fallback");
    expect(result.entries[0].email).toBe("rebecca@techtivo.com");
  });

  it("never guesses a UUID — an orphan with zero profiles.unfuddle_id matches is unresolved and blocking", async () => {
    const admin = fakeAdmin(new Map(), new Map());
    const result = await resolveNoteAuthors(admin, [], [999]);
    expect(result.ok).toBe(false);
    expect(result.map.has(999)).toBe(false);
    expect(result.entries[0].status).toBe("unresolved");
    expect(result.blockingReasons.length).toBe(1);
  });

  it("never guesses among ambiguous matches — an orphan with two profiles.unfuddle_id matches is unresolved and blocking", async () => {
    const admin = fakeAdmin(
      new Map(),
      new Map([
        ["122", [
          { id: "p1", email: "a@techtivo.com", first_name: "A", last_name: null },
          { id: "p2", email: "b@techtivo.com", first_name: "B", last_name: null },
        ]],
      ]),
    );
    const result = await resolveNoteAuthors(admin, [], [122]);
    expect(result.ok).toBe(false);
    expect(result.map.has(122)).toBe(false);
    expect(result.entries[0].status).toBe("unresolved");
  });

  it("never applies the orphan fallback to a KNOWN backup Person whose own email resolution failed", async () => {
    // Person exists in the backup (email known-but-unmatched), and even
    // though profiles.unfuddle_id happens to have a row for this id, the
    // fallback must NOT be used for a non-orphan (has-a-backup-record) id —
    // that would hide a real, nameable mapping failure.
    const backupUsers = [backupUser({ unfuddleId: 5, email: "nomatch@techtivo.com" })];
    const admin = fakeAdmin(new Map(), new Map([["5", [{ id: "should-not-be-used", email: "x@techtivo.com", first_name: null, last_name: null }]]]));

    const result = await resolveNoteAuthors(admin, backupUsers, [5]);
    expect(result.ok).toBe(false);
    expect(result.map.has(5)).toBe(false);
    expect(result.entries[0].status).toBe("unresolved");
  });
});
