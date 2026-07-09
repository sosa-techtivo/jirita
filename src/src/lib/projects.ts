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

const STATUS_FROM_DB: Record<string, ProjectStatus> = {
  planning: "planning",
  active: "active",
  on_hold: "on-hold",
  completed: "completed",
  archived: "archived",
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

export async function loadOrganizationProjects(organizationId: string): Promise<ProjectsResult> {
  const supabase = getSupabaseBrowserClient();

  const { data: rows, error } = await supabase
    .from("projects")
    .select(PROJECT_COLUMNS)
    .eq("organization_id", organizationId)
    .order("updated_at", { ascending: false })
    .returns<ProjectRow[]>();

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
