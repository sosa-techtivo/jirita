// Loads the signed-in user's identity + active organization membership from
// Supabase — the real replacement for current-user.ts's mock role fallback.
// See docs/SUPABASE_MVP_SCHEMA.md for the `profiles` / `organization_memberships`
// / `organizations` shape this reads.
//
// Read-only: this module never inserts a `profiles` or
// `organization_memberships` row. Provisioning a person's identity/access is
// an admin/import concern (see docs/UNFUDDLE_IMPORT_SPECIFICATION.md), not
// something app code does on their behalf when a row is missing.

import { getSupabaseBrowserClient } from "./supabase-client";
import type { Role } from "./current-user";

export interface Profile {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  avatarUrl: string | null;
  createdAt: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  /** organizations.default_role — applied when inviting a new user (not yet
   *  wired to Invite User; see updateOrganizationSettingsAction). */
  defaultRole: Role;
  /** organizations.default_weekly_capacity — the starting value copied onto
   *  a *new* member's own weekly_capacity, never a live multiplier and
   *  never something an existing member's own row reads from. */
  defaultWeeklyCapacity: number;
  /** organizations.active_days — ISO weekday numbers (1 = Monday .. 7 =
   *  Sunday) the organization counts as working days. Always non-empty,
   *  never duplicated, every value 1–7 (enforced in Postgres by
   *  is_valid_active_days, 20260815000000_add_organization_settings_defaults.sql). */
  activeDays: number[];

  // NOT exposed here (deliberately): organizations.show_ticket_estimates,
  // require_ticket_estimate, time_rounding_minutes, and round_time_up.
  // These columns still exist (kept for compatibility, see
  // 20260816000000_add_organization_time_tracking_settings.sql), but
  // ticket estimate visibility/requirement and time-entry rounding are now
  // fixed, non-configurable product rules — see lib/tickets.ts's
  // updateTicket (estimate required before In Progress/In Review/Done) and
  // lib/time-rounding.ts (always round up to 15 minutes). Settings →
  // Time Tracking, the one UI that used to read/write these four fields,
  // was removed outright.
}

export interface Membership {
  profile: Profile;
  organization: Organization;
  role: Role;
  weeklyCapacity: number | null;
}

export type MembershipResult =
  | { status: "ready"; membership: Membership }
  | { status: "no-membership" }
  | { status: "error"; message: string };

const ROLE_FROM_DB: Record<string, Role> = {
  admin: "ADMIN",
  project_lead: "PROJECT_LEAD",
  member: "MEMBER",
};

interface ProfileRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

// profiles.avatar_url stores a Storage *path* ("<uid>/avatar.jpg"), never a
// URL — see avatar-upload.ts. This turns that path into the public object
// URL the <img> tags actually need, with a cache-busting query param so a
// re-upload (same path, upsert) doesn't keep showing a stale cached image.
// profiles.updated_at already bumps on any column change via the
// set_updated_at trigger, so it's a free, always-current cache-bust key.
export function resolveAvatarUrl(path: string | null, updatedAt: string): string | null {
  if (!path) return null;
  const { data } = getSupabaseBrowserClient().storage.from("avatars").getPublicUrl(path);
  return `${data.publicUrl}?v=${encodeURIComponent(updatedAt)}`;
}

interface OrganizationRow {
  id: string;
  name: string;
  slug: string;
  default_role: string;
  default_weekly_capacity: number;
  active_days: number[];
}

interface MembershipRow {
  organization_id: string;
  role: string;
  weekly_capacity: number | null;
}

// Dev-only visibility: an "error" and a genuinely empty "no-membership"
// result currently render the same dev-fallback badge in
// current-user-provider.tsx, so without this the two are indistinguishable
// from the UI alone. Never runs in production.
function logDev(...args: unknown[]): void {
  if (process.env.NODE_ENV !== "production") console.warn("[membership]", ...args);
}

export async function loadMembership(userId: string): Promise<MembershipResult> {
  const supabase = getSupabaseBrowserClient();

  const { data: profileRow, error: profileError } = await supabase
    .from("profiles")
    .select("id, first_name, last_name, email, avatar_url, created_at, updated_at")
    .eq("id", userId)
    .maybeSingle<ProfileRow>();

  if (profileError) {
    logDev("profiles query failed", profileError);
    return { status: "error", message: profileError.message };
  }
  if (!profileRow) {
    logDev("no profiles row for", userId);
    return { status: "no-membership" };
  }

  // Two flat queries instead of one embedded join (`organizations ( ... )`)
  // — the join relies on PostgREST's relationship cache picking up the
  // organization_memberships -> organizations FK, which can lag behind a
  // migration applied by hand (e.g. via the SQL Editor) until the schema
  // cache is reloaded. Flat selects only depend on table/column metadata,
  // which is far less likely to be stale.
  const { data: membershipRow, error: membershipError } = await supabase
    .from("organization_memberships")
    .select("organization_id, role, weekly_capacity")
    .eq("profile_id", userId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle<MembershipRow>();

  if (membershipError) {
    logDev("organization_memberships query failed", membershipError);
    return { status: "error", message: membershipError.message };
  }
  if (!membershipRow) {
    logDev("no active organization_membership row for", userId);
    return { status: "no-membership" };
  }

  const { data: organizationRow, error: organizationError } = await supabase
    .from("organizations")
    .select("id, name, slug, default_role, default_weekly_capacity, active_days")
    .eq("id", membershipRow.organization_id)
    .maybeSingle<OrganizationRow>();

  if (organizationError) {
    logDev("organizations query failed", organizationError);
    return { status: "error", message: organizationError.message };
  }
  if (!organizationRow) {
    logDev("organization_membership points at a missing organization", membershipRow.organization_id);
    return { status: "no-membership" };
  }

  const role = ROLE_FROM_DB[membershipRow.role];
  if (!role) {
    logDev("unrecognized org_role value", membershipRow.role);
    return { status: "error", message: `Unrecognized organization role "${membershipRow.role}".` };
  }

  const defaultRole = ROLE_FROM_DB[organizationRow.default_role];
  if (!defaultRole) {
    logDev("unrecognized organizations.default_role value", organizationRow.default_role);
    return { status: "error", message: `Unrecognized default role "${organizationRow.default_role}".` };
  }

  const organization: Organization = {
    id: organizationRow.id,
    name: organizationRow.name,
    slug: organizationRow.slug,
    defaultRole,
    defaultWeeklyCapacity: organizationRow.default_weekly_capacity,
    activeDays: organizationRow.active_days,
  };

  return {
    status: "ready",
    membership: {
      profile: {
        id: profileRow.id,
        firstName: profileRow.first_name ?? "",
        lastName: profileRow.last_name ?? "",
        email: profileRow.email ?? "",
        avatarUrl: resolveAvatarUrl(profileRow.avatar_url, profileRow.updated_at),
        createdAt: profileRow.created_at,
      },
      organization,
      role,
      weeklyCapacity: membershipRow.weekly_capacity,
    },
  };
}

export type WriteResult = { status: "success" } | { status: "error"; message: string };

// Writes only first_name/last_name — email/unfuddle_id stay off-limits,
// backed by the column-scoped GRANT in
// 20260709000000_profile_self_service_updates.sql, not just by this
// function never sending those columns. avatar_url has its own writer
// below (updateProfileAvatarPath), granted separately.
export async function updateProfileNames(
  userId: string,
  fields: { firstName: string; lastName: string }
): Promise<WriteResult> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("profiles")
    .update({ first_name: fields.firstName, last_name: fields.lastName })
    .eq("id", userId)
    .select("id")
    .maybeSingle();

  if (error) {
    logDev("profiles update failed", error);
    return { status: "error", message: error.message };
  }
  if (!data) {
    logDev("profiles update matched no row for", userId);
    return { status: "error", message: "Could not save — your profile couldn't be found." };
  }
  return { status: "success" };
}

// Goes through the update_own_weekly_capacity RPC rather than a direct
// table update — organization_memberships' own update policy is
// admin-only by design (role/status are org-admin-managed), so this uses
// the narrow security-definer function from the same migration that can
// only ever touch weekly_capacity on the caller's own active membership.
export async function updateOwnWeeklyCapacity(weeklyCapacity: number): Promise<WriteResult> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.rpc("update_own_weekly_capacity", { new_capacity: weeklyCapacity });

  if (error) {
    logDev("update_own_weekly_capacity rpc failed", error);
    return { status: "error", message: error.message };
  }
  return { status: "success" };
}

// Stores the Storage *path* returned by avatar-upload.ts's uploadAvatarBlob
// — never a URL (see resolveAvatarUrl above, which turns it back into one
// on read). Granted separately from names in
// 20260710000000_avatars_storage.sql.
export async function updateProfileAvatarPath(userId: string, path: string): Promise<WriteResult> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("profiles")
    .update({ avatar_url: path })
    .eq("id", userId)
    .select("id")
    .maybeSingle();

  if (error) {
    logDev("profiles avatar_url update failed", error);
    return { status: "error", message: error.message };
  }
  if (!data) {
    logDev("profiles avatar_url update matched no row for", userId);
    return { status: "error", message: "Could not save — your profile couldn't be found." };
  }
  return { status: "success" };
}
