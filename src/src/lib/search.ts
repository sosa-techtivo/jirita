// Real, Supabase-backed data layer for JIRITA's global search — projects,
// tickets, and users, each capped at 5 results and scoped to exactly what
// the calling role can access. This is the DATA LAYER ONLY: no popover, no
// UI wiring, no change to the existing (currently inert) Search box in
// sidebar.tsx — see that file if/when the UI is built on top of this.
//
// Every "search box" elsewhere in this app today filters an already-loaded
// array in memory (tickets-screen.tsx, notes-screen.tsx, users-screen.tsx,
// etc.) — this is the first real, server-side, permission-scoped search in
// the codebase, so permission scoping is applied as real query filters
// (project_memberships / organization_memberships), never as a client-side
// trim of an unscoped fetch.

import { getSupabaseBrowserClient } from "./supabase-client";
import { resolveAvatarUrl } from "./membership";
import { FALLBACK_AVATAR } from "./current-user";
import type { Role } from "./current-user";
import { registerProjectCode } from "./mock-tickets";
import type { TicketStatus } from "./mock-tickets";
import type { ProjectStatus, ProjectCategory } from "./mock-projects";
import { STATUS_FROM_DB as TICKET_STATUS_FROM_DB } from "./tickets";

function logDev(...args: unknown[]): void {
  if (process.env.NODE_ENV !== "production") console.warn("[search]", ...args);
}

const SEARCH_RESULT_LIMIT = 5;

type SupabaseClient = ReturnType<typeof getSupabaseBrowserClient>;

// ── Result shapes ────────────────────────────────────────────────────────

export interface GlobalSearchProject {
  id: string;
  name: string;
  slug: string;
  /** projects.project_code — always real when present, never fabricated. */
  key?: string;
  status?: ProjectStatus;
  category?: ProjectCategory;
}

export interface GlobalSearchTicket {
  id: string;
  /** e.g. "MBA-12" — real project_code + ticket_number, same formula getTicketDisplayKey uses. */
  key: string;
  title: string;
  projectId: string;
  projectName: string;
  projectSlug: string;
  status: TicketStatus;
}

export interface GlobalSearchUser {
  id: string;
  fullName: string;
  email: string;
  avatarUrl: string;
  /** organization_memberships.role label — omitted, never fabricated, if unresolved. */
  role?: string;
}

export interface GlobalSearchResults {
  projects: GlobalSearchProject[];
  tickets: GlobalSearchTicket[];
  users: GlobalSearchUser[];
}

export type GlobalSearchResult =
  | { status: "ready"; results: GlobalSearchResults }
  | { status: "error"; message: string };

const EMPTY_RESULTS: GlobalSearchResults = { projects: [], tickets: [], users: [] };

// ── Text-matching helpers ────────────────────────────────────────────────
// No existing precedent in this codebase for a real Supabase ILIKE search —
// `%`/`_` are ILIKE's own wildcard characters, escaped here so a literal
// "%"/"_" the user types is matched literally, not treated as a pattern.
function escapeIlike(term: string): string {
  return term.replace(/[%_\\]/g, (c) => `\\${c}`);
}

function likePattern(term: string): string {
  return `%${escapeIlike(term)}%`;
}

// A ticket's "key" (e.g. "MBA-12") is a derived value (project_code + "-" +
// ticket_number), never a stored column, so it can't be ILIKE-matched
// directly — this parses "MBA-12" / "mba12" / "MBA" into a project-code
// (matched against accessible projects' own real project_code) plus an
// optional ticket number, the same two-part shape getTicketDisplayKey
// (mock-tickets.ts) already builds real keys from.
function parseTicketKeyQuery(term: string): { code: string; number: number | null } | null {
  const match = /^([A-Za-z]+)-?(\d+)?$/.exec(term);
  if (!match) return null;
  return { code: match[1].toUpperCase(), number: match[2] ? Number(match[2]) : null };
}

// Same DB→app enum shape as lib/projects.ts's own (module-private)
// STATUS_FROM_DB/CATEGORY_VALUES — duplicated locally rather than exported
// from an unrelated module, same "small local glue" precedent already used
// throughout this codebase (e.g. logDev itself, duplicated per lib/*.ts file).
const PROJECT_STATUS_FROM_DB: Record<string, ProjectStatus> = {
  planning: "planning",
  active: "active",
  on_hold: "on-hold",
  completed: "completed",
  archived: "archived",
};
const PROJECT_CATEGORY_VALUES: ProjectCategory[] = ["client", "internal"];
const ORG_ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  project_lead: "Project Lead",
  member: "Member",
};

// ── Permission scoping ───────────────────────────────────────────────────
// The one real permission boundary every group below is scoped through:
// Admin → every project in the organization (same real boundary
// loadOrganizationProjects/RLS already grant); Project Lead → only projects
// where project_memberships.project_role = 'lead' (same rule
// loadLeadProjects already encodes); Member → any active project_membership
// (same rule loadMemberProjects already encodes). Resolved once per search
// call and reused by all three result groups below — never refetched or
// re-derived per group.

interface AccessibleProject {
  id: string;
  slug: string;
  name: string;
  code: string;
}

interface AccessibleProjectRow {
  id: string;
  slug: string;
  name: string;
  project_code: string;
}

async function resolveAccessibleProjects(
  supabase: SupabaseClient,
  organizationId: string,
  role: Role,
  userId: string
): Promise<{ status: "ready"; projects: AccessibleProject[] } | { status: "error"; message: string }> {
  if (role === "ADMIN") {
    const { data, error } = await supabase
      .from("projects")
      .select("id, slug, name, project_code")
      .eq("organization_id", organizationId)
      .returns<AccessibleProjectRow[]>();
    if (error) {
      logDev("organization projects lookup failed", error);
      return { status: "error", message: error.message };
    }
    return { status: "ready", projects: (data ?? []).map(toAccessibleProject) };
  }

  let membershipQuery = supabase.from("project_memberships").select("project_id").eq("profile_id", userId);
  if (role === "PROJECT_LEAD") membershipQuery = membershipQuery.eq("project_role", "lead");

  const { data: membershipRows, error: membershipError } = await membershipQuery.returns<{ project_id: string }[]>();
  if (membershipError) {
    logDev("project membership lookup failed", membershipError);
    return { status: "error", message: membershipError.message };
  }
  const ids = Array.from(new Set((membershipRows ?? []).map((row) => row.project_id)));
  if (ids.length === 0) return { status: "ready", projects: [] };

  const { data, error } = await supabase
    .from("projects")
    .select("id, slug, name, project_code")
    .eq("organization_id", organizationId)
    .in("id", ids)
    .returns<AccessibleProjectRow[]>();
  if (error) {
    logDev("accessible projects lookup failed", error);
    return { status: "error", message: error.message };
  }
  return { status: "ready", projects: (data ?? []).map(toAccessibleProject) };
}

function toAccessibleProject(row: AccessibleProjectRow): AccessibleProject {
  return { id: row.id, slug: row.slug, name: row.name, code: row.project_code };
}

// ── Projects group ───────────────────────────────────────────────────────

interface ProjectSearchRow {
  id: string;
  name: string;
  slug: string;
  project_code: string;
  status: string;
  category: string;
}

async function searchProjects(
  supabase: SupabaseClient,
  organizationId: string,
  accessibleIds: string[],
  pattern: string
): Promise<{ status: "ready"; projects: GlobalSearchProject[] } | { status: "error"; message: string }> {
  if (accessibleIds.length === 0) return { status: "ready", projects: [] };

  const columns = "id, name, slug, project_code, status, category";
  const base = () =>
    supabase.from("projects").select(columns).eq("organization_id", organizationId).in("id", accessibleIds);

  const [nameResult, codeResult, descriptionResult] = await Promise.all([
    base().ilike("name", pattern).limit(SEARCH_RESULT_LIMIT).returns<ProjectSearchRow[]>(),
    base().ilike("project_code", pattern).limit(SEARCH_RESULT_LIMIT).returns<ProjectSearchRow[]>(),
    base().ilike("description", pattern).limit(SEARCH_RESULT_LIMIT).returns<ProjectSearchRow[]>(),
  ]);

  for (const result of [nameResult, codeResult, descriptionResult]) {
    if (result.error) {
      logDev("project search query failed", result.error);
      return { status: "error", message: result.error.message };
    }
  }

  const byId = new Map<string, GlobalSearchProject>();
  for (const result of [nameResult, codeResult, descriptionResult]) {
    for (const row of result.data ?? []) {
      if (byId.has(row.id)) continue;
      byId.set(row.id, {
        id: row.id,
        name: row.name,
        slug: row.slug,
        key: row.project_code || undefined,
        status: PROJECT_STATUS_FROM_DB[row.status] ?? undefined,
        category: PROJECT_CATEGORY_VALUES.includes(row.category as ProjectCategory)
          ? (row.category as ProjectCategory)
          : undefined,
      });
    }
  }

  return { status: "ready", projects: Array.from(byId.values()).slice(0, SEARCH_RESULT_LIMIT) };
}

// ── Tickets group ────────────────────────────────────────────────────────

interface TicketSearchRow {
  id: string;
  ticket_number: number;
  title: string;
  status: string;
  project_id: string;
}

async function searchTickets(
  supabase: SupabaseClient,
  accessibleProjects: AccessibleProject[],
  pattern: string,
  term: string
): Promise<{ status: "ready"; tickets: GlobalSearchTicket[] } | { status: "error"; message: string }> {
  const accessibleIds = accessibleProjects.map((p) => p.id);
  if (accessibleIds.length === 0) return { status: "ready", tickets: [] };

  const columns = "id, ticket_number, title, status, project_id";
  const base = () => supabase.from("tickets").select(columns).in("project_id", accessibleIds);

  const queries = [
    base().ilike("title", pattern).limit(SEARCH_RESULT_LIMIT).returns<TicketSearchRow[]>(),
    base().ilike("description", pattern).limit(SEARCH_RESULT_LIMIT).returns<TicketSearchRow[]>(),
  ];

  const parsedKey = parseTicketKeyQuery(term);
  const matchedProject = parsedKey
    ? accessibleProjects.find((p) => p.code.toUpperCase() === parsedKey.code)
    : undefined;
  if (parsedKey && matchedProject) {
    let keyQuery = supabase.from("tickets").select(columns).eq("project_id", matchedProject.id);
    if (parsedKey.number !== null) keyQuery = keyQuery.eq("ticket_number", parsedKey.number);
    queries.push(keyQuery.limit(SEARCH_RESULT_LIMIT).returns<TicketSearchRow[]>());
  }

  const results = await Promise.all(queries);
  for (const result of results) {
    if (result.error) {
      logDev("ticket search query failed", result.error);
      return { status: "error", message: result.error.message };
    }
  }

  const projectsById = new Map(accessibleProjects.map((p) => [p.id, p]));
  for (const project of accessibleProjects) registerProjectCode(project.slug, project.code);

  const byId = new Map<string, GlobalSearchTicket>();
  for (const result of results) {
    for (const row of result.data ?? []) {
      if (byId.has(row.id)) continue;
      const project = projectsById.get(row.project_id);
      if (!project) continue;
      byId.set(row.id, {
        id: row.id,
        key: `${project.code}-${row.ticket_number}`,
        title: row.title,
        projectId: project.id,
        projectName: project.name,
        projectSlug: project.slug,
        status: TICKET_STATUS_FROM_DB[row.status] ?? "backlog",
      });
    }
  }

  return { status: "ready", tickets: Array.from(byId.values()).slice(0, SEARCH_RESULT_LIMIT) };
}

// ── Users group ──────────────────────────────────────────────────────────

interface ProfileSearchRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  avatar_url: string | null;
  updated_at: string;
}

async function searchUsers(
  supabase: SupabaseClient,
  organizationId: string,
  role: Role,
  accessibleProjectIds: string[],
  pattern: string
): Promise<{ status: "ready"; users: GlobalSearchUser[] } | { status: "error"; message: string }> {
  // Same "active organization member" definition loadOrganizationMembers
  // already uses — real org role (for the result's own `role` label) comes
  // along for free from the same query.
  const { data: activeOrgRows, error: activeOrgError } = await supabase
    .from("organization_memberships")
    .select("profile_id, role")
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .returns<{ profile_id: string; role: string }[]>();
  if (activeOrgError) {
    logDev("active organization members lookup failed", activeOrgError);
    return { status: "error", message: activeOrgError.message };
  }
  const roleByProfileId = new Map(
    (activeOrgRows ?? []).map((row) => [row.profile_id, ORG_ROLE_LABEL[row.role] ?? row.role])
  );

  let accessibleProfileIds = new Set(roleByProfileId.keys());

  // Project Lead/Member: further restrict to profiles with a real
  // project_membership on one of this role's own accessible projects (Lead
  // vs Member is already baked into accessibleProjectIds by the caller).
  if (role !== "ADMIN") {
    if (accessibleProjectIds.length === 0) return { status: "ready", users: [] };
    const { data: projectMemberRows, error: projectMemberError } = await supabase
      .from("project_memberships")
      .select("profile_id")
      .in("project_id", accessibleProjectIds)
      .returns<{ profile_id: string }[]>();
    if (projectMemberError) {
      logDev("project members lookup failed", projectMemberError);
      return { status: "error", message: projectMemberError.message };
    }
    const projectProfileIds = new Set((projectMemberRows ?? []).map((row) => row.profile_id));
    accessibleProfileIds = new Set([...accessibleProfileIds].filter((id) => projectProfileIds.has(id)));
  }

  const ids = Array.from(accessibleProfileIds);
  if (ids.length === 0) return { status: "ready", users: [] };

  const columns = "id, first_name, last_name, email, avatar_url, updated_at";
  const base = () => supabase.from("profiles").select(columns).in("id", ids);

  const [firstNameResult, lastNameResult, emailResult] = await Promise.all([
    base().ilike("first_name", pattern).limit(SEARCH_RESULT_LIMIT).returns<ProfileSearchRow[]>(),
    base().ilike("last_name", pattern).limit(SEARCH_RESULT_LIMIT).returns<ProfileSearchRow[]>(),
    base().ilike("email", pattern).limit(SEARCH_RESULT_LIMIT).returns<ProfileSearchRow[]>(),
  ]);

  for (const result of [firstNameResult, lastNameResult, emailResult]) {
    if (result.error) {
      logDev("user search query failed", result.error);
      return { status: "error", message: result.error.message };
    }
  }

  // Deduplicated by profile id — a user staffed on more than one accessible
  // project (or matching more than one of name/last name/email) is still
  // only ever one result.
  const byId = new Map<string, GlobalSearchUser>();
  for (const result of [firstNameResult, lastNameResult, emailResult]) {
    for (const row of result.data ?? []) {
      if (byId.has(row.id)) continue;
      byId.set(row.id, {
        id: row.id,
        fullName: [row.first_name, row.last_name].filter(Boolean).join(" ") || "Unnamed",
        email: row.email ?? "",
        avatarUrl: resolveAvatarUrl(row.avatar_url, row.updated_at) ?? FALLBACK_AVATAR,
        role: roleByProfileId.get(row.id),
      });
    }
  }

  return { status: "ready", users: Array.from(byId.values()).slice(0, SEARCH_RESULT_LIMIT) };
}

// ── Entry point ──────────────────────────────────────────────────────────

// Real, permission-scoped global search — never runs against Supabase for
// an empty (post-trim) query. `role`/`userId`/`organizationId` are exactly
// what useCurrentUser() already exposes, so a caller needs no extra lookup
// before calling this.
export async function searchGlobal(
  organizationId: string,
  role: Role,
  userId: string,
  rawQuery: string
): Promise<GlobalSearchResult> {
  const term = rawQuery.trim();
  if (!term) return { status: "ready", results: EMPTY_RESULTS };

  const supabase = getSupabaseBrowserClient();
  const pattern = likePattern(term);

  const accessibleResult = await resolveAccessibleProjects(supabase, organizationId, role, userId);
  if (accessibleResult.status === "error") return { status: "error", message: accessibleResult.message };
  const accessibleProjects = accessibleResult.projects;
  const accessibleProjectIds = accessibleProjects.map((p) => p.id);

  const [projectsResult, ticketsResult, usersResult] = await Promise.all([
    searchProjects(supabase, organizationId, accessibleProjectIds, pattern),
    searchTickets(supabase, accessibleProjects, pattern, term),
    searchUsers(supabase, organizationId, role, accessibleProjectIds, pattern),
  ]);

  if (projectsResult.status === "error") return { status: "error", message: projectsResult.message };
  if (ticketsResult.status === "error") return { status: "error", message: ticketsResult.message };
  if (usersResult.status === "error") return { status: "error", message: usersResult.message };

  return {
    status: "ready",
    results: {
      projects: projectsResult.projects,
      tickets: ticketsResult.tickets,
      users: usersResult.users,
    },
  };
}
