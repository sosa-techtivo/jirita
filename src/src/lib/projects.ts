// Loads and creates real Projects rows for the signed-in user's active
// organization — the replacement data source for src/lib/mock-projects.ts
// on the Sidebar and the /projects page only (Tickets/Dashboard/Reports/
// Project Overview keep reading mock-projects.ts for now — see
// PROJECT_STATUS.md). See docs/SUPABASE_MVP_SCHEMA.md for the `projects`
// table shape this reads/writes.
//
// RLS on `projects` already scopes rows per role (Admin sees every org
// project; Project Lead/Member see only projects they're staffed on via
// project_memberships), so no client-side role filtering is needed here —
// the query just returns whatever the signed-in user is allowed to see.
// The same RLS also gates insert to org role admin/project_lead — a
// disallowed create attempt surfaces as an error from createProject below,
// not a client-side check.
//
// Not stored on `projects` (by schema design — meant to be derived from
// `tickets` at read time, out of scope here): activeMilestones,
// openTickets, blockedTickets, overdueTickets, awaitingReviewTickets,
// dueThisWeekTickets, progress. These default to 0 until Tickets is wired
// to Supabase.

import { getSupabaseBrowserClient } from "./supabase-client";
import { resolveAvatarUrl } from "./membership";
import { FALLBACK_AVATAR } from "./current-user";
import type { ClientName, ProjectCategory, ProjectHealth, ProjectPriority, ProjectStatus, ProjectSummary } from "./mock-projects";

export type ProjectsResult =
  | { status: "ready"; projects: ProjectSummary[] }
  | { status: "error"; message: string };

export type CreateProjectResult =
  | { status: "success"; project: ProjectSummary }
  | { status: "error"; message: string };

// Superset of ProjectSummary used only by Project Settings — adds the raw
// owner_profile_id (needed to preselect the Project Lead picker), which the
// Sidebar/Projects-list ProjectSummary shape deliberately omits (it only
// ever displays the resolved name/avatar, never the id).
export interface ProjectDetail extends ProjectSummary {
  ownerProfileId: string | null;
}

export type ProjectDetailResult =
  | { status: "ready"; project: ProjectDetail }
  | { status: "not-found" }
  | { status: "error"; message: string };

export interface OrgMember {
  id: string;
  name: string;
  avatar: string;
}

export type OrgMembersResult =
  | { status: "ready"; members: OrgMember[] }
  | { status: "error"; message: string };

const STATUS_FROM_DB: Record<string, ProjectStatus> = {
  planning: "planning",
  active: "active",
  on_hold: "on-hold",
  completed: "completed",
  archived: "archived",
};

// Inverse of STATUS_FROM_DB, deliberately excluding "archived" — that
// transition only ever happens through archiveProject/restoreProject,
// never through updateProjectSettings (see EditableProjectStatus).
export type EditableProjectStatus = Exclude<ProjectStatus, "archived">;
const STATUS_TO_DB: Record<EditableProjectStatus, string> = {
  planning: "planning",
  active: "active",
  "on-hold": "on_hold",
  completed: "completed",
};

const HEALTH_FROM_DB: Record<string, ProjectHealth> = {
  healthy: "healthy",
  needs_attention: "needs-attention",
  critical: "critical",
};

const PRIORITY_VALUES: ProjectPriority[] = ["critical", "high", "medium", "low"];
const CATEGORY_VALUES: ProjectCategory[] = ["client", "internal"];

interface ProjectRow {
  slug: string;
  name: string;
  short_name: string | null;
  project_code: string;
  description: string | null;
  status: string;
  priority: string;
  health: string;
  category: string;
  client_name: string | null;
  default_hourly_rate: number | null;
  owner_profile_id: string | null;
  target_date: string | null;
  updated_at: string;
}

interface OwnerProfileRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  updated_at: string;
}

const PROJECT_COLUMNS =
  "slug, name, short_name, project_code, description, status, priority, health, category, client_name, default_hourly_rate, owner_profile_id, target_date, updated_at";

// Kebab-cases a project name into a URL-safe slug (routes are
// /projects/[slug]). Falls back to a timestamp if the name has no
// alphanumeric characters at all.
export function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || `project-${Date.now()}`;
}

// Auto-derives the short prefix `projects.project_code` requires (used
// elsewhere to build visible ticket IDs, e.g. MBA-12) since the create-form
// only collects a name — two-plus words take initials ("Client Website
// Redesign" → "CWR"), a single word takes its first letters ("Marketing" →
// "MAR"). Never surfaced in this UI; only has to be non-empty and
// reasonably identify the project.
export function generateProjectCode(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const raw =
    words.length >= 2
      ? words.map((word) => word[0]).join("").toUpperCase().slice(0, 4)
      : (words[0] ?? "").replace(/[^a-zA-Z0-9]/g, "").slice(0, 3).toUpperCase();
  return raw || `P${Date.now().toString().slice(-4)}`;
}

function rowToProjectSummary(row: ProjectRow, ownerRow: OwnerProfileRow | undefined): ProjectSummary {
  const ownerName = ownerRow ? [ownerRow.first_name, ownerRow.last_name].filter(Boolean).join(" ") : "Unassigned";

  return {
    slug: row.slug,
    name: row.name,
    shortName: row.short_name ?? row.name.slice(0, 2).toUpperCase(),
    projectCode: row.project_code,
    description: row.description ?? "",
    status: STATUS_FROM_DB[row.status] ?? "planning",
    priority: PRIORITY_VALUES.includes(row.priority as ProjectPriority) ? (row.priority as ProjectPriority) : "medium",
    health: HEALTH_FROM_DB[row.health] ?? "healthy",
    owner: {
      name: ownerName || "Unassigned",
      avatar: (ownerRow ? resolveAvatarUrl(ownerRow.avatar_url, ownerRow.updated_at) : null) ?? FALLBACK_AVATAR,
    },
    updatedAt: formatUpdatedAt(row.updated_at),
    targetDate: formatTargetDate(row.target_date),
    activeMilestones: 0,
    openTickets: 0,
    blockedTickets: 0,
    overdueTickets: 0,
    awaitingReviewTickets: 0,
    dueThisWeekTickets: 0,
    progress: 0,
    category: CATEGORY_VALUES.includes(row.category as ProjectCategory) ? (row.category as ProjectCategory) : "internal",
    // ClientName is a closed union in mock-projects.ts (a placeholder
    // roster, per its own comment, for a future real Clients entity) —
    // client_name in the real schema is free text, so this is a display
    // cast, not a validated membership check.
    client: (row.client_name as ClientName | null) ?? undefined,
    defaultHourlyRate: row.default_hourly_rate ?? undefined,
  };
}

function formatTargetDate(isoDate: string | null): string {
  if (!isoDate) return "—";
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatUpdatedAt(isoTimestamp: string): string {
  const diffHours = (Date.now() - new Date(isoTimestamp).getTime()) / (1000 * 60 * 60);
  if (diffHours < 1) return "Just now";
  if (diffHours < 24) {
    const hours = Math.floor(diffHours);
    return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  }
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  const diffWeeks = Math.floor(diffDays / 7);
  if (diffWeeks < 5) return `${diffWeeks} week${diffWeeks === 1 ? "" : "s"} ago`;
  const diffMonths = Math.floor(diffDays / 30);
  return `${diffMonths} month${diffMonths === 1 ? "" : "s"} ago`;
}

function logDev(...args: unknown[]): void {
  if (process.env.NODE_ENV !== "production") console.warn("[projects]", ...args);
}

export interface LoadProjectsOptions {
  /**
   * Reserved for future pagination — omitted (the default everywhere today)
   * fetches every project for the org, exactly like before this option
   * existed. Passing `limit` (with optional `offset`) applies `.range()`
   * without changing any other behavior, so pagination can be added later
   * by wiring these through from the UI rather than restructuring the query.
   */
  limit?: number;
  offset?: number;
}

export async function loadOrganizationProjects(
  organizationId: string,
  options: LoadProjectsOptions = {}
): Promise<ProjectsResult> {
  const supabase = getSupabaseBrowserClient();

  let query = supabase
    .from("projects")
    .select(PROJECT_COLUMNS)
    .eq("organization_id", organizationId)
    // Secondary tie-break so row order is fully deterministic even when
    // two projects share the same updated_at down to the microsecond —
    // .range()-based pagination later needs a stable sort to avoid
    // skipping/duplicating rows across pages; today it's just a harmless
    // guarantee since ties are otherwise vanishingly rare.
    .order("updated_at", { ascending: false })
    .order("slug", { ascending: true });

  if (options.limit !== undefined) {
    const offset = options.offset ?? 0;
    query = query.range(offset, offset + options.limit - 1);
  }

  const { data: rows, error } = await query.returns<ProjectRow[]>();

  if (error) {
    logDev("projects query failed", error);
    return { status: "error", message: error.message };
  }

  const ownerIds = Array.from(
    new Set((rows ?? []).map((row) => row.owner_profile_id).filter((id): id is string => Boolean(id)))
  );

  // Flat second query instead of an embedded select (`owner:profiles(...)`)
  // — same reasoning as loadMembership in membership.ts: embedded selects
  // rely on PostgREST's FK relationship cache, which can lag behind a
  // migration applied by hand until the schema cache is reloaded.
  const ownersById = new Map<string, OwnerProfileRow>();
  if (ownerIds.length > 0) {
    const { data: ownerRows, error: ownerError } = await supabase
      .from("profiles")
      .select("id, first_name, last_name, avatar_url, updated_at")
      .in("id", ownerIds)
      .returns<OwnerProfileRow[]>();

    if (ownerError) {
      logDev("owner profiles query failed", ownerError);
    } else {
      for (const ownerRow of ownerRows ?? []) ownersById.set(ownerRow.id, ownerRow);
    }
  }

  const projects: ProjectSummary[] = (rows ?? []).map((row) =>
    rowToProjectSummary(row, row.owner_profile_id ? ownersById.get(row.owner_profile_id) : undefined)
  );

  return { status: "ready", projects };
}

// Minimal create flow: name + optional description, status starts "active"
// (the schema's own column default is "planning" — this overrides it per
// product requirement), slug/project_code auto-derived from the name since
// the create form doesn't collect them. Leaves owner_profile_id/category/
// priority/health at their column defaults — not part of this flow.
export async function createProject(params: {
  organizationId: string;
  name: string;
  description: string;
}): Promise<CreateProjectResult> {
  const supabase = getSupabaseBrowserClient();
  const name = params.name.trim();

  const { data, error } = await supabase
    .from("projects")
    .insert({
      organization_id: params.organizationId,
      slug: slugify(name),
      name,
      project_code: generateProjectCode(name),
      description: params.description.trim() || null,
      status: "active",
    })
    .select(PROJECT_COLUMNS)
    .single<ProjectRow>();

  if (error) {
    logDev("projects insert failed", error);
    // 23505 = unique_violation — collides with (organization_id, slug) or
    // (organization_id, project_code), both derived from the same name.
    if (error.code === "23505") {
      return { status: "error", message: "A project with this name already exists in your organization." };
    }
    return { status: "error", message: error.message };
  }

  return { status: "success", project: rowToProjectSummary(data, undefined) };
}

// Minimal edit flow: name + description only. organization_id, slug,
// project_code, status, and every other column are left untouched — the
// WHERE clause matches on (organization_id, slug), the same unique pair
// used to look the project up, so no other column needs to change to
// identify the row.
export async function updateProject(params: {
  organizationId: string;
  slug: string;
  name: string;
  description: string;
}): Promise<CreateProjectResult> {
  const supabase = getSupabaseBrowserClient();
  const name = params.name.trim();

  const { data, error } = await supabase
    .from("projects")
    .update({ name, description: params.description.trim() || null })
    .eq("organization_id", params.organizationId)
    .eq("slug", params.slug)
    .select(PROJECT_COLUMNS)
    .single<ProjectRow>();

  if (error) {
    logDev("projects update failed", error);
    return { status: "error", message: error.message };
  }

  return { status: "success", project: rowToProjectSummary(data, undefined) };
}

// Archive only sets status to "archived" — no other column changes, and
// nothing is deleted. Tickets/comments/activity/time tracking reference
// the project by id, untouched by this update, so they remain exactly as
// they were.
export async function archiveProject(params: { organizationId: string; slug: string }): Promise<CreateProjectResult> {
  const supabase = getSupabaseBrowserClient();

  const { data, error } = await supabase
    .from("projects")
    .update({ status: "archived" })
    .eq("organization_id", params.organizationId)
    .eq("slug", params.slug)
    .select(PROJECT_COLUMNS)
    .single<ProjectRow>();

  if (error) {
    logDev("projects archive failed", error);
    return { status: "error", message: error.message };
  }

  return { status: "success", project: rowToProjectSummary(data, undefined) };
}

// Mirror of archiveProject — sets status back to "active". No confirmation
// step at this layer; the UI decides whether to prompt (restore doesn't).
export async function restoreProject(params: { organizationId: string; slug: string }): Promise<CreateProjectResult> {
  const supabase = getSupabaseBrowserClient();

  const { data, error } = await supabase
    .from("projects")
    .update({ status: "active" })
    .eq("organization_id", params.organizationId)
    .eq("slug", params.slug)
    .select(PROJECT_COLUMNS)
    .single<ProjectRow>();

  if (error) {
    logDev("projects restore failed", error);
    return { status: "error", message: error.message };
  }

  return { status: "success", project: rowToProjectSummary(data, undefined) };
}

// Single-project read for Project Settings — same PROJECT_COLUMNS as the
// list loader, plus owner_profile_id exposed on the result (see
// ProjectDetail) so the Project Lead picker can preselect the right member.
export async function loadProjectDetail(organizationId: string, slug: string): Promise<ProjectDetailResult> {
  const supabase = getSupabaseBrowserClient();

  const { data: row, error } = await supabase
    .from("projects")
    .select(PROJECT_COLUMNS)
    .eq("organization_id", organizationId)
    .eq("slug", slug)
    .maybeSingle<ProjectRow>();

  if (error) {
    logDev("project detail query failed", error);
    return { status: "error", message: error.message };
  }
  if (!row) return { status: "not-found" };

  let ownerRow: OwnerProfileRow | undefined;
  if (row.owner_profile_id) {
    const { data: profileRow, error: ownerError } = await supabase
      .from("profiles")
      .select("id, first_name, last_name, avatar_url, updated_at")
      .eq("id", row.owner_profile_id)
      .maybeSingle<OwnerProfileRow>();
    if (ownerError) logDev("owner profile query failed", ownerError);
    else ownerRow = profileRow ?? undefined;
  }

  return {
    status: "ready",
    project: { ...rowToProjectSummary(row, ownerRow), ownerProfileId: row.owner_profile_id },
  };
}

// Org roster for the Project Lead picker — any active member is a valid
// candidate (the schema doesn't restrict owner_profile_id to a role), same
// scope as the Admin-only Users module's eventual real data source. Two
// flat queries rather than an embedded select, same reasoning as
// loadOrganizationProjects above (avoids depending on PostgREST's FK
// relationship cache).
export async function loadOrganizationMembers(organizationId: string): Promise<OrgMembersResult> {
  const supabase = getSupabaseBrowserClient();

  const { data: membershipRows, error } = await supabase
    .from("organization_memberships")
    .select("profile_id")
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .returns<{ profile_id: string }[]>();

  if (error) {
    logDev("organization members query failed", error);
    return { status: "error", message: error.message };
  }

  const profileIds = (membershipRows ?? []).map((row) => row.profile_id);
  if (profileIds.length === 0) return { status: "ready", members: [] };

  const { data: profileRows, error: profileError } = await supabase
    .from("profiles")
    .select("id, first_name, last_name, avatar_url, updated_at")
    .in("id", profileIds)
    .returns<OwnerProfileRow[]>();

  if (profileError) {
    logDev("member profiles query failed", profileError);
    return { status: "error", message: profileError.message };
  }

  const members: OrgMember[] = (profileRows ?? [])
    .map((row) => ({
      id: row.id,
      name: [row.first_name, row.last_name].filter(Boolean).join(" ") || "Unnamed",
      avatar: resolveAvatarUrl(row.avatar_url, row.updated_at) ?? FALLBACK_AVATAR,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return { status: "ready", members };
}

export interface ProjectSettingsUpdate {
  name?: string;
  description?: string;
  projectCode?: string;
  status?: EditableProjectStatus;
  category?: ProjectCategory;
  client?: string | null;
  defaultHourlyRate?: number | null;
  ownerProfileId?: string | null;
}

// Settings-only write: only the keys present on `updates` are sent to
// Supabase ("persist only the fields that changed"). Archiving/restoring
// (status -> "archived"/"active" specifically) goes through
// archiveProject/restoreProject exclusively — updates.status's type
// (EditableProjectStatus) makes "archived" structurally impossible to pass
// through this function, so there's no parallel path to that transition.
export async function updateProjectSettings(
  organizationId: string,
  slug: string,
  updates: ProjectSettingsUpdate
): Promise<CreateProjectResult> {
  const supabase = getSupabaseBrowserClient();

  const payload: Record<string, string | number | null> = {};
  if (updates.name !== undefined) payload.name = updates.name.trim();
  if (updates.description !== undefined) payload.description = updates.description.trim() || null;
  if (updates.projectCode !== undefined) payload.project_code = updates.projectCode.trim();
  if (updates.status !== undefined) payload.status = STATUS_TO_DB[updates.status];
  if (updates.category !== undefined) payload.category = updates.category;
  if (updates.client !== undefined) payload.client_name = updates.client;
  if (updates.defaultHourlyRate !== undefined) payload.default_hourly_rate = updates.defaultHourlyRate;
  if (updates.ownerProfileId !== undefined) payload.owner_profile_id = updates.ownerProfileId;

  const { data, error } = await supabase
    .from("projects")
    .update(payload)
    .eq("organization_id", organizationId)
    .eq("slug", slug)
    .select(PROJECT_COLUMNS)
    .single<ProjectRow>();

  if (error) {
    logDev("project settings update failed", error);
    // 23505 = unique_violation — only project_code carries a unique
    // constraint among the fields this function ever writes (slug itself
    // is never edited here).
    if (error.code === "23505") {
      return { status: "error", message: "This project code is already used by another project in your organization." };
    }
    return { status: "error", message: error.message };
  }

  return { status: "success", project: rowToProjectSummary(data, undefined) };
}

// ── Clients (Project Settings → Billing → "+ Add new client") ───────────────
// Deliberately not a foreign key on projects — projects.client_name stays
// free text (see updateProjectSettings above). This table exists only so
// the Client dropdown can offer a real, growing, per-organization roster
// instead of the hardcoded CLIENT_NAMES placeholder in mock-projects.ts.

export interface Client {
  id: string;
  name: string;
}

export type ClientsResult =
  | { status: "ready"; clients: Client[] }
  | { status: "error"; message: string };

export async function loadOrganizationClients(organizationId: string): Promise<ClientsResult> {
  const supabase = getSupabaseBrowserClient();

  const { data, error } = await supabase
    .from("clients")
    .select("id, name")
    .eq("organization_id", organizationId)
    .order("name", { ascending: true })
    .returns<Client[]>();

  if (error) {
    logDev("clients query failed", error);
    return { status: "error", message: error.message };
  }

  return { status: "ready", clients: data ?? [] };
}

export type CreateClientResult =
  | { status: "success"; client: Client }
  | { status: "error"; message: string };

// Named createOrganizationClient (not createClient) to avoid any confusion
// with @supabase/supabase-js's own createClient re-exported from
// supabase-client.ts in this same module graph.
export async function createOrganizationClient(organizationId: string, name: string): Promise<CreateClientResult> {
  const supabase = getSupabaseBrowserClient();
  const trimmed = name.trim();

  const { data, error } = await supabase
    .from("clients")
    .insert({ organization_id: organizationId, name: trimmed })
    .select("id, name")
    .single<Client>();

  if (error) {
    logDev("client insert failed", error);
    // 23505 = unique_violation on (organization_id, name) — the basic
    // duplicate-prevention this table's unique constraint provides.
    if (error.code === "23505") {
      return { status: "error", message: "A client with this name already exists in your organization." };
    }
    return { status: "error", message: error.message };
  }

  return { status: "success", client: data };
}
