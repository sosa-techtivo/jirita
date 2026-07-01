// Mock role-based identity layer for the frontend UX prototype.
// No backend permissions exist yet — this only drives what nav/actions render.

export type Role = "ADMIN" | "PROJECT_LEAD" | "MEMBER";

export type Discipline = "Engineer" | "QA" | "Designer" | "Product" | "DevOps";

export interface CurrentUser {
  name: string;
  email: string;
  role: Role;
  discipline: Discipline;
  avatar: string;
}

const avatar = (id: number) => `https://i.pravatar.cc/64?img=${id}`;

// One mock user per role so switching roles during development also swaps
// name/avatar/discipline to something plausible for that role.
export const MOCK_USERS: Record<Role, CurrentUser> = {
  ADMIN: {
    name: "Priya Patel",
    email: "priya.patel@techtivo.com",
    role: "ADMIN",
    discipline: "Engineer",
    avatar: avatar(33),
  },
  PROJECT_LEAD: {
    name: "Sarah Chen",
    email: "sarah.chen@techtivo.com",
    role: "PROJECT_LEAD",
    discipline: "Product",
    avatar: avatar(47),
  },
  MEMBER: {
    name: "David Kim",
    email: "david.kim@techtivo.com",
    role: "MEMBER",
    discipline: "QA",
    avatar: avatar(22),
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
