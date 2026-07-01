import type { Role } from "@/lib/current-user";

export type MainNavKey = "dashboard" | "projects" | "my-work" | "reports" | "time-tracking" | "settings";
export type ProjectNavKey = "overview" | "tickets" | "notes" | "team" | "reports";

// Order matters: the sidebar renders each role's main nav in this exact
// sequence (a JS Set preserves insertion order), so reordering a role's
// array here reorders its sidebar links too.
const MAIN_NAV_BY_ROLE: Record<Role, MainNavKey[]> = {
  ADMIN: ["dashboard", "projects", "my-work", "reports", "time-tracking", "settings"],
  PROJECT_LEAD: ["dashboard", "projects", "my-work", "reports", "time-tracking"],
  MEMBER: ["dashboard", "my-work", "projects", "time-tracking"],
};

const PROJECT_NAV_BY_ROLE: Record<Role, ProjectNavKey[]> = {
  ADMIN: ["overview", "tickets", "notes", "team", "reports"],
  PROJECT_LEAD: ["overview", "tickets", "notes", "team", "reports"],
  MEMBER: ["overview", "tickets", "notes"],
};

export function mainNavForRole(role: Role): Set<MainNavKey> {
  return new Set(MAIN_NAV_BY_ROLE[role]);
}

export function projectNavForRole(role: Role): Set<ProjectNavKey> {
  return new Set(PROJECT_NAV_BY_ROLE[role]);
}
