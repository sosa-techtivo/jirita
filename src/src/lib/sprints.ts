// Sprint MVP — a minimal per-project `sprints` entity (20260929000000).
// Mirrors the `ticket_statuses` section of lib/tickets.ts exactly: plain
// RLS-gated insert/update for simple fields (name/dates), SECURITY DEFINER
// RPCs for the two operations with a real cross-row invariant (activate,
// close). No burndown/velocity/goal/capacity concepts here — out of scope
// for this MVP.

import { getSupabaseBrowserClient } from "./supabase-client";

export type SprintStatus = "planned" | "active" | "closed";

export interface Sprint {
  id: string;
  projectId: string;
  name: string;
  status: SprintStatus;
  /** ISO date (yyyy-mm-dd), or null — purely informational, never drives
   *  activation/closing automatically. */
  startDate: string | null;
  endDate: string | null;
  createdBy: string | null;
  createdAt: string;
}

interface SprintRow {
  id: string;
  project_id: string;
  name: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
  created_by: string | null;
  created_at: string;
}

const SPRINT_COLUMNS = "id, project_id, name, status, start_date, end_date, created_by, created_at";

function rowToSprint(row: SprintRow): Sprint {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    status: row.status === "active" || row.status === "closed" ? row.status : "planned",
    startDate: row.start_date,
    endDate: row.end_date,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

function logDev(...args: unknown[]): void {
  if (process.env.NODE_ENV !== "production") console.warn("[sprints]", ...args);
}

export type SprintsResult =
  | { status: "ready"; sprints: Sprint[] }
  | { status: "error"; message: string };

export async function loadProjectSprints(projectId: string): Promise<SprintsResult> {
  const supabase = getSupabaseBrowserClient();

  const { data, error } = await supabase
    .from("sprints")
    .select(SPRINT_COLUMNS)
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .returns<SprintRow[]>();

  if (error) {
    logDev("sprints query failed", error);
    return { status: "error", message: error.message };
  }

  return { status: "ready", sprints: (data ?? []).map(rowToSprint) };
}

export type SprintMutationResult =
  | { status: "success"; sprints: Sprint[] }
  | { status: "error"; message: string };

async function reloadSprintsAfterMutation(projectId: string): Promise<SprintMutationResult> {
  const result = await loadProjectSprints(projectId);
  if (result.status === "error") return result;
  return { status: "success", sprints: result.sprints };
}

export interface CreateSprintInput {
  name: string;
  /** ISO date (yyyy-mm-dd). */
  startDate?: string;
  /** ISO date (yyyy-mm-dd). */
  endDate?: string;
}

export async function createSprint(projectId: string, input: CreateSprintInput): Promise<SprintMutationResult> {
  const trimmed = input.name.trim();
  if (trimmed.length === 0) {
    return { status: "error", message: "Sprint name can't be empty." };
  }

  const supabase = getSupabaseBrowserClient();

  const { error } = await supabase.from("sprints").insert({
    project_id: projectId,
    name: trimmed,
    start_date: input.startDate ?? null,
    end_date: input.endDate ?? null,
  });

  if (error) {
    logDev("sprint creation failed", error);
    return { status: "error", message: error.message };
  }

  return reloadSprintsAfterMutation(projectId);
}

export interface UpdateSprintInput {
  name?: string;
  /** ISO date (yyyy-mm-dd), or null to clear. */
  startDate?: string | null;
  /** ISO date (yyyy-mm-dd), or null to clear. */
  endDate?: string | null;
}

export async function updateSprint(
  sprintId: string,
  projectId: string,
  input: UpdateSprintInput
): Promise<SprintMutationResult> {
  const supabase = getSupabaseBrowserClient();

  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) {
    const trimmed = input.name.trim();
    if (trimmed.length === 0) {
      return { status: "error", message: "Sprint name can't be empty." };
    }
    patch.name = trimmed;
  }
  if (input.startDate !== undefined) patch.start_date = input.startDate;
  if (input.endDate !== undefined) patch.end_date = input.endDate;

  const { error } = await supabase.from("sprints").update(patch).eq("id", sprintId);

  if (error) {
    logDev("sprint update failed", error);
    return { status: "error", message: error.message };
  }

  return reloadSprintsAfterMutation(projectId);
}

// Idempotent no-op (server-side) if already active; raises if the sprint is
// closed, or if a different sprint in this project is already active — see
// activate_sprint (20260929000000) for the exact rule.
export async function activateSprint(sprintId: string, projectId: string): Promise<SprintMutationResult> {
  const supabase = getSupabaseBrowserClient();

  const { error } = await supabase.rpc("activate_sprint", { p_sprint_id: sprintId });

  if (error) {
    logDev("activate sprint failed", error);
    return { status: "error", message: error.message };
  }

  return reloadSprintsAfterMutation(projectId);
}

// Closes the sprint and returns every still-open ticket in it to the
// general backlog (sprint_id = null) — closed tickets keep their sprint_id.
// The caller (Manage Sprint modal) computes and shows the "N closed / M
// return to backlog" preview itself from already-loaded tickets before
// calling this; close_sprint (20260929000000) performs the same split
// server-side as the actual source of truth.
export async function closeSprint(sprintId: string, projectId: string): Promise<SprintMutationResult> {
  const supabase = getSupabaseBrowserClient();

  const { error } = await supabase.rpc("close_sprint", { p_sprint_id: sprintId });

  if (error) {
    logDev("close sprint failed", error);
    return { status: "error", message: error.message };
  }

  return reloadSprintsAfterMutation(projectId);
}
