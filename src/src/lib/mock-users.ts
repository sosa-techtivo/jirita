import type { Role } from "@/lib/current-user";

// Shared User type + display helper for the Users management module
// (/users, Admin only). Distinct from mock-team.ts's TeamMember: a
// TeamMember is one row per person *per project* (workload/capacity in
// that project's context — the same person can have several rows), while a
// User here is the single canonical account record for that person across
// the whole workspace (role, login/invite state, which projects they're
// staffed on at all).
//
// The mock account list that used to live in this file is gone — real data
// now comes from src/lib/users.ts's loadOrganizationUsers, same pattern as
// mock-auth.ts keeping only shared types/helpers once its login/session
// logic moved to auth.ts. This file now holds only the type and the one
// pure display helper (fullName) still used by real-data call sites.

export type UserStatus = "Active" | "Invited" | "Disabled";

export interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  avatar: string;
  role: Role;
  status: UserStatus;
  /** Total hours/week this person is available for, across all projects. */
  weeklyCapacity: number;
  /** project slugs this person is staffed on. */
  projectSlugs: string[];
  /** Display string; null means never logged in (e.g. still pending an invite). */
  lastLogin: string | null;
  /** Display string — reads "Invited <date>" for pending accounts rather than
   *  modeling a separate invited-vs-joined timeline, consistent with how the
   *  rest of this prototype uses plain display strings instead of real dates. */
  joinedAt: string;
  /** Session info from their last login — undefined when lastLogin is null. */
  browser?: string;
  os?: string;
  device?: string;
}

export function fullName(user: User): string {
  return `${user.firstName} ${user.lastName}`;
}
