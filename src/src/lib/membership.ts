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
}

interface OrganizationRow {
  id: string;
  name: string;
  slug: string;
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
    .select("id, first_name, last_name, email, avatar_url, created_at")
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

  const { data: organization, error: organizationError } = await supabase
    .from("organizations")
    .select("id, name, slug")
    .eq("id", membershipRow.organization_id)
    .maybeSingle<OrganizationRow>();

  if (organizationError) {
    logDev("organizations query failed", organizationError);
    return { status: "error", message: organizationError.message };
  }
  if (!organization) {
    logDev("organization_membership points at a missing organization", membershipRow.organization_id);
    return { status: "no-membership" };
  }

  const role = ROLE_FROM_DB[membershipRow.role];
  if (!role) {
    logDev("unrecognized org_role value", membershipRow.role);
    return { status: "error", message: `Unrecognized organization role "${membershipRow.role}".` };
  }

  return {
    status: "ready",
    membership: {
      profile: {
        id: profileRow.id,
        firstName: profileRow.first_name ?? "",
        lastName: profileRow.last_name ?? "",
        email: profileRow.email ?? "",
        avatarUrl: profileRow.avatar_url,
        createdAt: profileRow.created_at,
      },
      organization,
      role,
      weeklyCapacity: membershipRow.weekly_capacity,
    },
  };
}
