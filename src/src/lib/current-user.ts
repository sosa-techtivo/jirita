// Mock role-based identity layer for the frontend UX prototype.
// No backend permissions exist yet — this only drives what nav/actions render.

export type Role = "ADMIN" | "PROJECT_LEAD" | "MEMBER";

// Widened to `string`: the real schema (organization_memberships) has no
// discipline/job-title column, so a real membership's discipline is derived
// from its role label instead of one of these fixed mock professions — see
// current-user-provider.tsx.
export type Discipline = "Engineer" | "QA" | "Designer" | "Product" | "DevOps" | "Admin" | (string & {});

export interface CurrentUser {
  firstName: string;
  lastName: string;
  name: string;
  email: string;
  role: Role;
  discipline: Discipline;
  avatar: string;
  /** Total hours/week this person is available for — read-only in the Profile page. */
  weeklyCapacity: number;
  /** Display string, read-only in the Profile page's Account section. */
  memberSince: string;
  /** Display string, read-only in the Profile page's Account section. */
  lastLogin: string;
  /** organization_memberships.financial_access — an optional, Admin-granted
   *  permission for Project Lead users only (see hasFinancialAccess below).
   *  Always false for Admin/Member; irrelevant for Admin since that role
   *  already has financial access unconditionally. */
  financialAccess: boolean;
}

const avatar = (id: number) => `https://i.pravatar.cc/64?img=${id}`;

// Neutral placeholder for real members with no `avatar_url` on their
// profile row — an inline data URI so it never depends on a fake mock photo
// or an extra network request.
const FALLBACK_AVATAR_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
  '<rect width="64" height="64" rx="32" fill="#CBD5E1"/>' +
  '<circle cx="32" cy="25" r="12" fill="#FFFFFF"/>' +
  '<path d="M10 56c0-13 9.8-22 22-22s22 9 22 22" fill="#FFFFFF"/>' +
  "</svg>";
export const FALLBACK_AVATAR = `data:image/svg+xml;utf8,${encodeURIComponent(FALLBACK_AVATAR_SVG)}`;

// One mock user per role so switching roles during development also swaps
// name/avatar/discipline to something plausible for that role.
export const MOCK_USERS: Record<Role, CurrentUser> = {
  ADMIN: {
    firstName: "Alejo",
    lastName: "Cadavid",
    name: "Alejo Cadavid",
    email: "alejo@techtivo.com",
    role: "ADMIN",
    discipline: "Admin",
    avatar: avatar(33),
    weeklyCapacity: 40,
    memberSince: "Jan 8, 2025",
    lastLogin: "Just now",
    financialAccess: false,
  },
  PROJECT_LEAD: {
    firstName: "Sarah",
    lastName: "Chen",
    name: "Sarah Chen",
    email: "sarah.chen@techtivo.com",
    role: "PROJECT_LEAD",
    discipline: "Product",
    avatar: avatar(47),
    weeklyCapacity: 40,
    memberSince: "Mar 3, 2025",
    lastLogin: "2 hours ago",
    financialAccess: false,
  },
  MEMBER: {
    firstName: "David",
    lastName: "Kim",
    name: "David Kim",
    email: "david.kim@techtivo.com",
    role: "MEMBER",
    discipline: "QA",
    avatar: avatar(22),
    weeklyCapacity: 32,
    memberSince: "Jun 2, 2025",
    lastLogin: "3 hours ago",
    financialAccess: false,
  },
};

export const DEFAULT_ROLE: Role = "PROJECT_LEAD";

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Admin",
  PROJECT_LEAD: "Project Lead",
  MEMBER: "Member",
};

// Roles allowed to see project/workspace management actions
// (New Project, New Ticket, Add Member, etc).
export function canManage(role: Role): boolean {
  return role === "ADMIN" || role === "PROJECT_LEAD";
}

// Centralized financial-data authorization — the one place every current
// and future financial screen/query (Hours Report, billing, Time Tracking
// $ values, etc.) should check, rather than each re-deriving its own
// isAdmin-or-flag condition. Admin always has financial access by role;
// a Project Lead only has it when their own organization_memberships.
// financial_access is explicitly true (see the 20260924000000 migration and
// Edit/Invite User's own persistence of that flag); Member never does.
//
// Deliberately says nothing about *which* projects — this only answers
// "can this person see financial numbers at all," never "for which
// projects." Every real caller must still scope the underlying query/UI to
// the projects this person already has access to (their own
// project_memberships, same as every other Project Lead screen already
// enforces) — this permission can never expand project scope on its own.
export function hasFinancialAccess(role: Role, financialAccess: boolean): boolean {
  return role === "ADMIN" || (role === "PROJECT_LEAD" && financialAccess);
}
