// Real replacement data source for src/lib/mock-users.ts on the Users
// module (/users, Admin only). Reads organization_memberships (role,
// status, weekly_capacity) + profiles (identity), and counts
// project_memberships per person for the Projects column — the same three
// existing tables already used elsewhere (projects.ts's
// loadOrganizationMembers, membership.ts's loadMembership). No new table,
// no new migration: everything here already has real RLS from
// 20260708000000_mvp_schema.sql (organization_memberships_select/_update
// are admin-or-same-org scoped, which is what gates this whole screen).
//
// lastLogin is real — see loadLastSignInTimesAction (Supabase Auth's own
// last_sign_in_at, via the Admin API, since a client can only ever read its
// own). Not sourced here (no real backing yet, left to the caller to render
// honestly rather than invent): browser, os, device — see mock-users.ts's
// User type, all left undefined below.

import { getSupabaseBrowserClient } from "./supabase-client";
import { resolveAvatarUrl } from "./membership";
import { FALLBACK_AVATAR } from "./current-user";
import type { Role } from "./current-user";
import type { User, UserStatus } from "./mock-users";
import {
  inviteUserAction,
  generateInviteLinkAction,
  generatePasswordResetLinkAction,
  type InviteUserResult,
  type GenerateInviteLinkResult,
  type GeneratePasswordResetLinkResult,
} from "./server/invite-user-action";
import { disableUserAction, enableUserAction } from "./server/disable-user-action";
import { editUserAction } from "./server/edit-user-action";
import { loadLastSignInTimesAction } from "./server/last-sign-in-action";

export type { InviteUserResult, GenerateInviteLinkResult, GeneratePasswordResetLinkResult };

export type OrgUsersResult =
  | { status: "ready"; users: User[] }
  | { status: "error"; message: string };

export type WriteResult = { status: "success" } | { status: "error"; message: string };

const ROLE_FROM_DB: Record<string, Role> = {
  admin: "ADMIN",
  project_lead: "PROJECT_LEAD",
  member: "MEMBER",
};

const ROLE_TO_DB: Record<Role, string> = {
  ADMIN: "admin",
  PROJECT_LEAD: "project_lead",
  MEMBER: "member",
};

const STATUS_FROM_DB: Record<string, UserStatus> = {
  active: "Active",
  invited: "Invited",
  disabled: "Disabled",
};

const STATUS_TO_DB: Record<UserStatus, string> = {
  Active: "active",
  Invited: "invited",
  Disabled: "disabled",
};

interface MembershipRow {
  profile_id: string;
  role: string;
  status: string;
  weekly_capacity: number | null;
  created_at: string;
}

interface ProfileRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  avatar_url: string | null;
  updated_at: string;
}

interface ProjectRow {
  id: string;
  slug: string;
}

interface ProjectMembershipRow {
  profile_id: string;
  project_id: string;
}

function logDev(...args: unknown[]): void {
  if (process.env.NODE_ENV !== "production") console.warn("[users]", ...args);
}

// Same format for every date shown on this screen — joinedAt originally,
// now also lastLogin below.
function formatMemberDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// Three flat queries rather than embedded selects — same reasoning as
// projects.ts's loadOrganizationMembers: avoids depending on PostgREST's FK
// relationship cache, which can lag a hand-applied migration.
export async function loadOrganizationUsers(organizationId: string): Promise<OrgUsersResult> {
  const supabase = getSupabaseBrowserClient();

  const { data: membershipRows, error: membershipError } = await supabase
    .from("organization_memberships")
    .select("profile_id, role, status, weekly_capacity, created_at")
    .eq("organization_id", organizationId)
    .returns<MembershipRow[]>();

  if (membershipError) {
    logDev("organization_memberships query failed", membershipError);
    return { status: "error", message: membershipError.message };
  }
  if (!membershipRows || membershipRows.length === 0) return { status: "ready", users: [] };

  const profileIds = membershipRows.map((row) => row.profile_id);

  const { data: profileRows, error: profileError } = await supabase
    .from("profiles")
    .select("id, first_name, last_name, email, avatar_url, updated_at")
    .in("id", profileIds)
    .returns<ProfileRow[]>();

  if (profileError) {
    logDev("profiles query failed", profileError);
    return { status: "error", message: profileError.message };
  }

  const { data: projectRows, error: projectsError } = await supabase
    .from("projects")
    .select("id, slug")
    .eq("organization_id", organizationId)
    .returns<ProjectRow[]>();

  if (projectsError) {
    logDev("projects query failed", projectsError);
    return { status: "error", message: projectsError.message };
  }

  const projectIds = (projectRows ?? []).map((p) => p.id);
  const slugByProjectId = new Map((projectRows ?? []).map((p) => [p.id, p.slug]));

  let projectMembershipRows: ProjectMembershipRow[] = [];
  if (projectIds.length > 0) {
    const { data, error: pmError } = await supabase
      .from("project_memberships")
      .select("profile_id, project_id")
      .in("profile_id", profileIds)
      .in("project_id", projectIds)
      .returns<ProjectMembershipRow[]>();

    if (pmError) {
      logDev("project_memberships query failed", pmError);
      return { status: "error", message: pmError.message };
    }
    projectMembershipRows = data ?? [];
  }

  const projectSlugsByProfile = new Map<string, string[]>();
  for (const row of projectMembershipRows) {
    const slug = slugByProjectId.get(row.project_id);
    if (!slug) continue;
    const list = projectSlugsByProfile.get(row.profile_id) ?? [];
    list.push(slug);
    projectSlugsByProfile.set(row.profile_id, list);
  }

  const profileById = new Map((profileRows ?? []).map((p) => [p.id, p]));

  // Supplementary — a real last_sign_in_at per profile, from Supabase Auth's
  // own Admin API (see last-sign-in-action.ts's header comment for why this
  // needs a Server Action at all). Failing this never fails the whole
  // member list: on error it just leaves lastLogin null below (renders
  // "Never", same honest fallback as before this existed), same resilience
  // as any other supplementary-only fetch in this app.
  let lastSignInByProfileId: Record<string, string | null> = {};
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session) {
    const lastSignInResult = await loadLastSignInTimesAction({
      accessToken: session.access_token,
      organizationId,
    });
    if (lastSignInResult.status === "success") {
      lastSignInByProfileId = lastSignInResult.lastSignInByProfileId;
    } else {
      logDev("last sign-in lookup failed", lastSignInResult.message);
    }
  }

  const users: User[] = membershipRows
    .map((membership): User | null => {
      const profile = profileById.get(membership.profile_id);
      if (!profile) return null; // orphaned membership row, no matching profile
      const role = ROLE_FROM_DB[membership.role];
      const status = STATUS_FROM_DB[membership.status];
      if (!role || !status) {
        logDev("unrecognized role/status value", membership.role, membership.status);
        return null;
      }
      const lastSignInAt = lastSignInByProfileId[profile.id];
      return {
        id: profile.id,
        firstName: profile.first_name ?? "",
        lastName: profile.last_name ?? "",
        email: profile.email ?? "",
        avatar: resolveAvatarUrl(profile.avatar_url, profile.updated_at) ?? FALLBACK_AVATAR,
        role,
        status,
        weeklyCapacity: membership.weekly_capacity ?? 0,
        projectSlugs: projectSlugsByProfile.get(profile.id) ?? [],
        // Real — see the lastSignInByProfileId lookup above. Only ever
        // null when Supabase Auth itself has no last_sign_in_at for this
        // account (a genuine "never signed in") or the lookup failed —
        // never a fabricated relative time.
        lastLogin: lastSignInAt ? formatMemberDate(lastSignInAt) : null,
        joinedAt: formatMemberDate(membership.created_at),
      };
    })
    .filter((u): u is User => u !== null)
    .sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`));

  return { status: "ready", users };
}

export interface OrgMemberUpdate {
  role?: Role;
  status?: UserStatus;
  weeklyCapacity?: number;
}

// Direct update on organization_memberships — organization_memberships_update
// RLS already scopes this to org admins only (is_org_admin(organization_id)),
// which is exactly who reaches this screen (UsersScreen gates on
// currentUser.role === "ADMIN"). No RPC needed here, unlike
// membership.ts's updateOwnWeeklyCapacity, which exists only because a
// non-admin needs to touch their own row.
export async function updateOrganizationMember(
  organizationId: string,
  profileId: string,
  updates: OrgMemberUpdate
): Promise<WriteResult> {
  const supabase = getSupabaseBrowserClient();
  const payload: Record<string, unknown> = {};
  if (updates.role !== undefined) payload.role = ROLE_TO_DB[updates.role];
  if (updates.status !== undefined) payload.status = STATUS_TO_DB[updates.status];
  if (updates.weeklyCapacity !== undefined) payload.weekly_capacity = updates.weeklyCapacity;

  const { data, error } = await supabase
    .from("organization_memberships")
    .update(payload)
    .eq("organization_id", organizationId)
    .eq("profile_id", profileId)
    .select("profile_id")
    .maybeSingle();

  if (error) {
    logDev("organization_memberships update failed", error);
    return { status: "error", message: error.message };
  }
  if (!data) {
    logDev("organization_memberships update matched no row for", profileId);
    return { status: "error", message: "Could not save — this member couldn't be found." };
  }
  return { status: "success" };
}

// "Edit User" only — profiles (first/last name) has no self-service grant
// for editing someone *else's* row, and organization_memberships has no
// UPDATE grant at all for the authenticated role (see
// disable-user-action.ts's header comment), so unlike
// updateOrganizationMember above this can't run as a direct client update;
// it goes through a Server Action that verifies the caller is an active
// org admin and re-checks the target's organization server-side before
// writing either table, using the service-role client. Status (Disable/
// Enable) is untouched here — it keeps using disableOrganizationMember/
// enableOrganizationMember, unaffected by this change.
export async function editOrganizationMember(
  organizationId: string,
  profileId: string,
  fields: { firstName: string; lastName: string; role: Role; weeklyCapacity: number }
): Promise<WriteResult> {
  const supabase = getSupabaseBrowserClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return { status: "error", message: "Your session has expired. Please sign in again." };
  }

  return editUserAction({
    accessToken: session.access_token,
    organizationId,
    targetProfileId: profileId,
    ...fields,
  });
}

// "Disable User" and "Enable User" only — organization_memberships has no
// UPDATE grant for the authenticated role (see disable-user-action.ts's
// header comment), so unlike updateOrganizationMember above these can't run
// as a direct client update; both go through the same Server Action (one
// shared implementation, just a different target status) that verifies the
// caller is an active org admin and re-checks the target's organization
// server-side before writing, using the service-role client. Role/capacity
// writes are unaffected and keep using updateOrganizationMember.
export async function disableOrganizationMember(organizationId: string, profileId: string): Promise<WriteResult> {
  const supabase = getSupabaseBrowserClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return { status: "error", message: "Your session has expired. Please sign in again." };
  }

  return disableUserAction({
    accessToken: session.access_token,
    organizationId,
    targetProfileId: profileId,
  });
}

export async function enableOrganizationMember(organizationId: string, profileId: string): Promise<WriteResult> {
  const supabase = getSupabaseBrowserClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return { status: "error", message: "Your session has expired. Please sign in again." };
  }

  return enableUserAction({
    accessToken: session.access_token,
    organizationId,
    targetProfileId: profileId,
  });
}

// Thin client-side wrapper around the inviteUserAction Server Action — the
// actual invite/profile/membership writes all happen there, using
// SUPABASE_SERVICE_ROLE_KEY, which never reaches this (browser) module. The
// caller's own access token is read from the current browser session and
// passed through so the server can independently verify identity + admin
// permission itself, rather than trusting anything from the client.
// redirectOrigin reuses window.location.origin — the same pattern already
// used for the password-reset redirect in auth.ts — so the invite email's
// link works correctly in both local dev and production without a
// hardcoded URL or a new env var.
export async function inviteOrganizationUser(
  organizationId: string,
  fields: { firstName: string; lastName: string; email: string; role: Role; weeklyCapacity: number }
): Promise<InviteUserResult> {
  const supabase = getSupabaseBrowserClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return { status: "error", message: "Your session has expired. Please sign in again." };
  }

  return inviteUserAction({
    accessToken: session.access_token,
    organizationId,
    redirectOrigin: window.location.origin,
    ...fields,
  });
}

// Same shape as inviteOrganizationUser above, but for the "Generate invite
// link" method — no redirectOrigin, since generateInviteLinkAction builds
// the link from NEXT_PUBLIC_APP_URL (a fixed, server-configured domain)
// rather than the admin's own browser origin.
export async function generateOrganizationInviteLink(
  organizationId: string,
  fields: { firstName: string; lastName: string; email: string; role: Role; weeklyCapacity: number }
): Promise<GenerateInviteLinkResult> {
  const supabase = getSupabaseBrowserClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return { status: "error", message: "Your session has expired. Please sign in again." };
  }

  return generateInviteLinkAction({
    accessToken: session.access_token,
    organizationId,
    ...fields,
  });
}

// "Reset Password" (Users row menu, Active users only) — same session/
// access-token wrapping as generateOrganizationInviteLink above, around
// generatePasswordResetLinkAction instead.
export async function generatePasswordResetLink(
  organizationId: string,
  profileId: string
): Promise<GeneratePasswordResetLinkResult> {
  const supabase = getSupabaseBrowserClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return { status: "error", message: "Your session has expired. Please sign in again." };
  }

  return generatePasswordResetLinkAction({
    accessToken: session.access_token,
    organizationId,
    targetProfileId: profileId,
  });
}
