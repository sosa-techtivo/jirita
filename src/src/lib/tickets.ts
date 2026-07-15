// Loads real Tickets for a single project — the replacement data source
// for src/lib/mock-tickets.ts on the /projects/[slug]/tickets page's five
// views (List/Board/Calendar/Timeline/Insights) only. Ticket creation,
// editing, comments, attachments, time tracking, and activity are all out
// of scope here and keep working exactly as they do today (mock/local,
// unconnected) — see tickets-screen.tsx and ticket-detail-screen.tsx.
//
// RLS on `tickets` (tickets_select) already scopes rows to whoever can see
// the parent project, so no client-side role filtering is needed — the
// query just returns whatever the signed-in user is allowed to see for
// this one project.

import { getSupabaseBrowserClient } from "./supabase-client";
import { resolveAvatarUrl } from "./membership";
import { FALLBACK_AVATAR } from "./current-user";
import { registerProjectCode } from "./mock-tickets";
import type { Ticket, TicketPriority, TicketStatus, TicketType } from "./mock-tickets";
import { loadOrganizationProjects } from "./projects";
import type { ProjectStatus } from "./mock-projects";

export type TicketsResult =
  | { status: "ready"; tickets: Ticket[] }
  | { status: "not-found" }
  | { status: "error"; message: string };

// Fields the New Ticket modal actually persists — everything else it shows
// under "More Options" (Type/Status/Priority/Labels/Due Date) keeps its
// current, unwired behavior for this sprint and is written with fixed
// defaults below, matching the modal's own current default state. Assignee
// is the one More Options field that IS persisted — real org member id.
export interface CreateTicketInput {
  title: string;
  description?: string;
  acceptanceCriteria?: string[];
  hours?: number;
  assigneeProfileId?: string;
}

export type CreateTicketResult =
  | { status: "success"; ticket: Ticket }
  | { status: "error"; message: string };

// Exported for reuse wherever a raw DB status string (snake_case, e.g. the
// old_value/new_value ticket_activity stores for status_changed) needs to
// become the app's own display-domain TicketStatus (hyphenated) — e.g.
// Admin Reports' Recent Changes.
export const STATUS_FROM_DB: Record<string, TicketStatus> = {
  backlog: "backlog",
  to_do: "to-do",
  in_progress: "in-progress",
  review: "review",
  blocked: "blocked",
  done: "done",
};

const PRIORITY_VALUES: TicketPriority[] = ["highest", "high", "medium", "low"];

const TYPE_FROM_DB: Record<string, TicketType> = {
  task: "TASK",
  bug: "BUG",
};

// Inverse of STATUS_FROM_DB / TYPE_FROM_DB — used when writing an inline
// edit back to Supabase. Priority needs no map: the enum values already
// match the DB exactly (high/normal/low).
const STATUS_TO_DB: Record<TicketStatus, string> = {
  backlog: "backlog",
  "to-do": "to_do",
  "in-progress": "in_progress",
  review: "review",
  blocked: "blocked",
  done: "done",
};

const TYPE_TO_DB: Record<TicketType, string> = {
  TASK: "task",
  BUG: "bug",
};

interface ProjectLookupRow {
  id: string;
  project_code: string;
}

interface TicketRow {
  id: string;
  ticket_number: number;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  type: string;
  assignee_profile_id: string | null;
  milestone: string | null;
  labels: string[] | null;
  acceptance_criteria: string[] | null;
  acceptance_criteria_done: boolean[] | null;
  story_points: number | null;
  // PostgREST/Supabase serializes `numeric` columns as strings (to avoid
  // JS floating-point precision loss) — unlike `integer` columns like
  // ticket_number/story_points above, which come back as real numbers.
  // Coerced with Number(...) in rowToTicket below; left un-coerced here so
  // the type matches what the wire actually sends.
  hours: string | null;
  due_date: string | null;
  updated_at: string;
  created_by: string | null;
  created_at: string;
}

interface AssigneeProfileRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  updated_at: string;
}

const TICKET_COLUMNS =
  "id, ticket_number, title, description, status, priority, type, assignee_profile_id, milestone, labels, acceptance_criteria, acceptance_criteria_done, story_points, hours, due_date, updated_at, created_by, created_at";

// Mirrors formatTargetDate in lib/projects.ts exactly ("MMM D", no year) —
// every date-parsing helper across the ticket views (Calendar/Timeline/
// Insights) assumes this exact shape and a 2026 calendar year.
function formatDueDate(isoDate: string | null): string | undefined {
  if (!isoDate) return undefined;
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// Same shape as lib/projects.ts's formatUpdatedAt, plus the "Updated "
// prefix every mock ticket string already carries — board-column.tsx's
// "last activity" subtitle strips that exact prefix back off
// (`.replace("Updated ", "")`), so the prefix has to be there verbatim.
function formatTicketUpdatedAt(isoTimestamp: string): string {
  const diffMinutes = (Date.now() - new Date(isoTimestamp).getTime()) / (1000 * 60);
  if (diffMinutes < 1) return "Updated just now";
  if (diffMinutes < 60) {
    const minutes = Math.floor(diffMinutes);
    return `Updated ${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  }
  const diffHours = diffMinutes / 60;
  if (diffHours < 24) return `Updated ${Math.floor(diffHours)}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return "Updated yesterday";
  if (diffDays < 7) return `Updated ${diffDays} days ago`;
  const diffWeeks = Math.floor(diffDays / 7);
  if (diffWeeks < 5) return `Updated ${diffWeeks} week${diffWeeks === 1 ? "" : "s"} ago`;
  const diffMonths = Math.floor(diffDays / 30);
  return `Updated ${diffMonths} month${diffMonths === 1 ? "" : "s"} ago`;
}

// Same relative-time buckets as formatTicketUpdatedAt, minus the "Updated "
// prefix — used for Comments/Activity in the Ticket Preview Drawer (and,
// exported, for Admin Reports' Recent Changes) which render their own
// leading text ("· 3 days ago") instead of that prefix.
export function formatRelativeTime(isoTimestamp: string): string {
  return formatTicketUpdatedAt(isoTimestamp).replace(/^Updated /, "");
}

function logDev(...args: unknown[]): void {
  if (process.env.NODE_ENV !== "production") console.warn("[tickets]", ...args);
}

function rowToTicket(row: TicketRow, projectSlug: string, assigneeRow: AssigneeProfileRow | undefined): Ticket {
  const assigneeName = assigneeRow
    ? [assigneeRow.first_name, assigneeRow.last_name].filter(Boolean).join(" ") || "Unnamed"
    : "Unassigned";

  return {
    id: row.id,
    projectSlug,
    ticketNumber: row.ticket_number,
    title: row.title,
    description: row.description ?? "",
    status: STATUS_FROM_DB[row.status] ?? "backlog",
    priority: PRIORITY_VALUES.includes(row.priority as TicketPriority) ? (row.priority as TicketPriority) : "medium",
    type: TYPE_FROM_DB[row.type] ?? "TASK",
    assignee: {
      name: assigneeName,
      avatar: (assigneeRow ? resolveAvatarUrl(assigneeRow.avatar_url, assigneeRow.updated_at) : null) ?? FALLBACK_AVATAR,
    },
    assigneeProfileId: row.assignee_profile_id,
    milestone: row.milestone ?? "No Milestone",
    labels: row.labels ?? [],
    acceptanceCriteria: row.acceptance_criteria && row.acceptance_criteria.length > 0 ? row.acceptance_criteria : undefined,
    acceptanceCriteriaDone: row.acceptance_criteria_done ?? [],
    storyPoints: row.story_points ?? undefined,
    hours: row.hours !== null ? Number(row.hours) : undefined,
    dueDate: formatDueDate(row.due_date),
    updatedAt: formatTicketUpdatedAt(row.updated_at),
    updatedAtISO: row.updated_at,
    createdByProfileId: row.created_by,
    createdAtISO: row.created_at,
  };
}

// Scoped to exactly one project (by slug, within the signed-in user's
// organization) — never the whole workspace, per this feature's scope.
export async function loadProjectTickets(organizationId: string, slug: string): Promise<TicketsResult> {
  const supabase = getSupabaseBrowserClient();

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id, project_code")
    .eq("organization_id", organizationId)
    .eq("slug", slug)
    .maybeSingle<ProjectLookupRow>();

  if (projectError) {
    logDev("project lookup for tickets failed", projectError);
    return { status: "error", message: projectError.message };
  }
  if (!project) return { status: "not-found" };

  registerProjectCode(slug, project.project_code);

  const { data: rows, error } = await supabase
    .from("tickets")
    .select(TICKET_COLUMNS)
    .eq("project_id", project.id)
    .order("ticket_number", { ascending: true })
    .returns<TicketRow[]>();

  if (error) {
    logDev("tickets query failed", error);
    return { status: "error", message: error.message };
  }

  const assigneeIds = Array.from(
    new Set((rows ?? []).map((row) => row.assignee_profile_id).filter((id): id is string => Boolean(id)))
  );

  // Flat second query instead of an embedded select — same reasoning as
  // loadOrganizationProjects in lib/projects.ts: avoids depending on
  // PostgREST's FK relationship cache picking up a hand-applied migration.
  const assigneesById = new Map<string, AssigneeProfileRow>();
  if (assigneeIds.length > 0) {
    const { data: assigneeRows, error: assigneeError } = await supabase
      .from("profiles")
      .select("id, first_name, last_name, avatar_url, updated_at")
      .in("id", assigneeIds)
      .returns<AssigneeProfileRow[]>();

    if (assigneeError) {
      logDev("assignee profiles query failed", assigneeError);
    } else {
      for (const assigneeRow of assigneeRows ?? []) assigneesById.set(assigneeRow.id, assigneeRow);
    }
  }

  const tickets: Ticket[] = (rows ?? []).map((row) =>
    rowToTicket(row, slug, row.assignee_profile_id ? assigneesById.get(row.assignee_profile_id) : undefined)
  );

  return { status: "ready", tickets };
}

export type TicketByCodeResult =
  | { status: "ready"; ticket: Ticket }
  | { status: "not-found" }
  | { status: "error"; message: string };

// Loads a single ticket for the Ticket Detail page, resolved by its visible
// ticket code (e.g. "JIR-1") within one project — never by the internal
// uuid, which stays a database-only identifier and is never exposed in a
// ticket URL. The code is "<project_code>-<ticket_number>" (see
// getTicketDisplayKey in mock-tickets.ts); parsed back into ticket_number
// and matched against this project's own project_code only, so a code from
// another project can never resolve here.
export async function loadTicketByCode(
  organizationId: string,
  slug: string,
  ticketCode: string
): Promise<TicketByCodeResult> {
  const supabase = getSupabaseBrowserClient();

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id, project_code")
    .eq("organization_id", organizationId)
    .eq("slug", slug)
    .maybeSingle<ProjectLookupRow>();

  if (projectError) {
    logDev("project lookup for ticket detail failed", projectError);
    return { status: "error", message: projectError.message };
  }
  if (!project) return { status: "not-found" };

  registerProjectCode(slug, project.project_code);

  const prefix = `${project.project_code}-`;
  if (!ticketCode.startsWith(prefix)) return { status: "not-found" };
  const ticketNumber = Number(ticketCode.slice(prefix.length));
  if (!Number.isInteger(ticketNumber) || ticketNumber <= 0) return { status: "not-found" };

  const { data: row, error } = await supabase
    .from("tickets")
    .select(TICKET_COLUMNS)
    .eq("project_id", project.id)
    .eq("ticket_number", ticketNumber)
    .maybeSingle<TicketRow>();

  if (error) {
    logDev("ticket lookup by code failed", error);
    return { status: "error", message: error.message };
  }
  if (!row) return { status: "not-found" };

  let assigneeRow: AssigneeProfileRow | undefined;
  if (row.assignee_profile_id) {
    const { data: profileRow, error: profileError } = await supabase
      .from("profiles")
      .select("id, first_name, last_name, avatar_url, updated_at")
      .eq("id", row.assignee_profile_id)
      .maybeSingle<AssigneeProfileRow>();
    if (profileError) {
      logDev("assignee profile lookup failed", profileError);
    } else {
      assigneeRow = profileRow ?? undefined;
    }
  }

  return { status: "ready", ticket: rowToTicket(row, slug, assigneeRow) };
}

// Creates a ticket for the currently-open project only. Ticket Number is
// generated here (max existing number for the project + 1) since the
// `tickets` table has no auto-numbering — matches pending-tickets.ts's
// existing per-project counter design, just backed by a real query instead
// of an in-memory Map. Every field the modal doesn't yet expose as
// configurable is written with the same fixed defaults the modal's own
// initial state already uses (to_do / normal / task / unassigned / no due
// date) — see CreateTicketInput above.
export async function createTicket(
  organizationId: string,
  slug: string,
  input: CreateTicketInput
): Promise<CreateTicketResult> {
  const supabase = getSupabaseBrowserClient();

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id, project_code")
    .eq("organization_id", organizationId)
    .eq("slug", slug)
    .maybeSingle<ProjectLookupRow>();

  if (projectError) {
    logDev("project lookup for ticket creation failed", projectError);
    return { status: "error", message: projectError.message };
  }
  if (!project) return { status: "error", message: "Project not found." };

  const { data: lastTicket, error: lastTicketError } = await supabase
    .from("tickets")
    .select("ticket_number")
    .eq("project_id", project.id)
    .order("ticket_number", { ascending: false })
    .limit(1)
    .maybeSingle<{ ticket_number: number }>();

  if (lastTicketError) {
    logDev("ticket number lookup failed", lastTicketError);
    return { status: "error", message: lastTicketError.message };
  }

  const ticketNumber = (lastTicket?.ticket_number ?? 0) + 1;
  const acceptanceCriteria =
    input.acceptanceCriteria && input.acceptanceCriteria.length > 0 ? input.acceptanceCriteria : null;

  const { data: row, error } = await supabase
    .from("tickets")
    .insert({
      project_id: project.id,
      ticket_number: ticketNumber,
      title: input.title,
      description: input.description ?? null,
      status: "to_do",
      priority: "medium",
      type: "task",
      acceptance_criteria: acceptanceCriteria,
      hours: input.hours ?? null,
      assignee_profile_id: input.assigneeProfileId ?? null,
    })
    .select(TICKET_COLUMNS)
    .single<TicketRow>();

  if (error) {
    logDev("ticket creation failed", error);
    return { status: "error", message: error.message };
  }

  registerProjectCode(slug, project.project_code);

  // Resolve the assignee's real name/avatar for the ticket handed back to
  // the UI immediately — same lookup shape loadProjectTickets uses on read.
  let assigneeRow: AssigneeProfileRow | undefined;
  if (row.assignee_profile_id) {
    const { data: profileRow, error: profileError } = await supabase
      .from("profiles")
      .select("id, first_name, last_name, avatar_url, updated_at")
      .eq("id", row.assignee_profile_id)
      .maybeSingle<AssigneeProfileRow>();
    if (profileError) {
      logDev("assignee profile lookup failed", profileError);
    } else {
      assigneeRow = profileRow ?? undefined;
    }
  }

  return {
    status: "success",
    ticket: rowToTicket(row, slug, assigneeRow),
  };
}

// Persists a single Ticket Detail inline edit. Only fields already present
// in the schema are accepted — every field here maps 1:1 to a real column.
// Acceptance criteria TEXT is still not editable anywhere in Ticket Detail
// (no add/remove/rename UI exists), only each criterion's checked state —
// see acceptanceCriteriaDone below.
export interface UpdateTicketInput {
  title?: string;
  description?: string;
  status?: TicketStatus;
  type?: TicketType;
  priority?: TicketPriority;
  /** null clears the assignee (Unassigned). */
  assigneeProfileId?: string | null;
  /** null clears the estimate. */
  hours?: number | null;
  /** ISO date (yyyy-mm-dd), or null to clear. */
  dueDate?: string | null;
  labels?: string[];
  /** Checked/unchecked state, aligned by index with the ticket's acceptanceCriteria. */
  acceptanceCriteriaDone?: boolean[];
}

export type UpdateTicketResult =
  | { status: "success"; ticket: Ticket }
  | { status: "error"; message: string };

export async function updateTicket(
  ticketId: string,
  slug: string,
  input: UpdateTicketInput
): Promise<UpdateTicketResult> {
  const supabase = getSupabaseBrowserClient();

  const patch: Record<string, unknown> = {};
  if (input.title !== undefined) patch.title = input.title;
  if (input.description !== undefined) patch.description = input.description;
  if (input.status !== undefined) patch.status = STATUS_TO_DB[input.status];
  if (input.type !== undefined) patch.type = TYPE_TO_DB[input.type];
  if (input.priority !== undefined) patch.priority = input.priority;
  if (input.assigneeProfileId !== undefined) patch.assignee_profile_id = input.assigneeProfileId;
  if (input.hours !== undefined) patch.hours = input.hours;
  if (input.dueDate !== undefined) patch.due_date = input.dueDate;
  if (input.labels !== undefined) patch.labels = input.labels;
  if (input.acceptanceCriteriaDone !== undefined) patch.acceptance_criteria_done = input.acceptanceCriteriaDone;

  const { data: row, error } = await supabase
    .from("tickets")
    .update(patch)
    .eq("id", ticketId)
    .select(TICKET_COLUMNS)
    .single<TicketRow>();

  if (error) {
    logDev("ticket update failed", error);
    return { status: "error", message: error.message };
  }

  let assigneeRow: AssigneeProfileRow | undefined;
  if (row.assignee_profile_id) {
    const { data: profileRow, error: profileError } = await supabase
      .from("profiles")
      .select("id, first_name, last_name, avatar_url, updated_at")
      .eq("id", row.assignee_profile_id)
      .maybeSingle<AssigneeProfileRow>();
    if (profileError) {
      logDev("assignee profile lookup failed", profileError);
    } else {
      assigneeRow = profileRow ?? undefined;
    }
  }

  return { status: "success", ticket: rowToTicket(row, slug, assigneeRow) };
}

// ── Labels catalog (Ticket Detail's Labels selector "+ Create") ────────────────
// Real, growing, per-organization label catalog — separate from
// tickets.labels itself (a free-text text[] column, unchanged). This table
// only supplies "which names exist" plus case-insensitive duplicate
// prevention, shared across every ticket in the workspace.

export interface Label {
  id: string;
  name: string;
}

export type LabelsResult =
  | { status: "ready"; labels: Label[] }
  | { status: "error"; message: string };

export async function loadOrganizationLabels(organizationId: string): Promise<LabelsResult> {
  const supabase = getSupabaseBrowserClient();

  const { data, error } = await supabase
    .from("labels")
    .select("id, name")
    .eq("organization_id", organizationId)
    .order("name", { ascending: true })
    .returns<Label[]>();

  if (error) {
    logDev("labels query failed", error);
    return { status: "error", message: error.message };
  }

  return { status: "ready", labels: data ?? [] };
}

export type CreateLabelResult =
  | { status: "success"; label: Label }
  | { status: "error"; message: string };

export async function createOrganizationLabel(organizationId: string, name: string): Promise<CreateLabelResult> {
  const supabase = getSupabaseBrowserClient();
  const trimmed = name.trim();

  if (trimmed.length === 0) {
    return { status: "error", message: "Label name can't be empty." };
  }
  if (trimmed.length > 40) {
    return { status: "error", message: "Label name must be 40 characters or fewer." };
  }

  const { data, error } = await supabase
    .from("labels")
    .insert({ organization_id: organizationId, name: trimmed })
    .select("id, name")
    .single<Label>();

  if (error) {
    logDev("label insert failed", error);
    // 23505 = unique_violation on (organization_id, lower(name)) — the
    // case-insensitive duplicate-prevention this table's index provides.
    if (error.code === "23505") {
      return { status: "error", message: "A label with this name already exists." };
    }
    return { status: "error", message: error.message };
  }

  return { status: "success", label: data };
}

// ── Comments / Activity (Ticket Preview Drawer) ────────────────────────────────
// Read-only for this sprint — there is no comment-creation or activity-
// logging UI yet, so both simply return whatever real rows already exist
// for the ticket (today: none, until those write paths are built). Shapes
// match the drawer's existing MockComment/MockActivity fields exactly
// (name/avatar/timeAgo/text and label/timeAgo) so no JSX changes are needed
// there beyond swapping the data source.

export interface TicketComment {
  id: string;
  name: string;
  avatar: string;
  timeAgo: string;
  text: string;
}

export interface TicketActivityEvent {
  label: string;
  timeAgo: string;
}

export type TicketCommentsResult =
  | { status: "ready"; comments: TicketComment[] }
  | { status: "error"; message: string };

export type TicketActivityResult =
  | { status: "ready"; events: TicketActivityEvent[] }
  | { status: "error"; message: string };

interface CommentRow {
  id: string;
  author_profile_id: string | null;
  body: string;
  created_at: string;
}

interface ActivityRow {
  id: string;
  actor_profile_id: string | null;
  event_type: string;
  field_name: string | null;
  old_value: string | null;
  new_value: string | null;
  created_at: string;
}

// Human-readable labels for the Activity feed only — small, deliberate
// duplicates of ticket-ui.tsx's STATUS_LABEL / the app's Type/Priority
// wording, kept local so lib/ doesn't import from components/.
const ACTIVITY_STATUS_LABEL: Record<TicketStatus, string> = {
  backlog: "Backlog",
  "to-do": "To Do",
  "in-progress": "In Progress",
  review: "In Review",
  blocked: "Blocked",
  done: "Done",
};

const ACTIVITY_TYPE_LABEL: Record<TicketType, string> = {
  TASK: "Task",
  BUG: "Bug",
};

const ACTIVITY_PRIORITY_LABEL: Record<TicketPriority, string> = {
  highest: "Highest",
  high: "High",
  medium: "Medium",
  low: "Low",
};

function activityStatusLabel(dbValue: string | null): string {
  if (!dbValue) return "";
  const domain = STATUS_FROM_DB[dbValue];
  return domain ? ACTIVITY_STATUS_LABEL[domain] : dbValue;
}

function activityTypeLabel(dbValue: string | null): string {
  if (!dbValue) return "";
  const domain = TYPE_FROM_DB[dbValue];
  return domain ? ACTIVITY_TYPE_LABEL[domain] : dbValue;
}

function activityPriorityLabel(dbValue: string | null): string {
  if (!dbValue) return "";
  return PRIORITY_VALUES.includes(dbValue as TicketPriority) ? ACTIVITY_PRIORITY_LABEL[dbValue as TicketPriority] : dbValue;
}

// Builds the single display line for one activity row — the only place
// that turns event_type/field_name/old_value/new_value into the text the
// existing Activity UI renders (label + timeAgo), so no JSX changes are
// needed anywhere this is consumed.
function buildActivityLabel(row: ActivityRow, actorName: string | null, resolveName: (id: string | null) => string | null): string {
  const who = actorName ? `${actorName} ` : "";
  switch (row.event_type) {
    case "ticket_created":
      return `${who}created this ticket`.trim();
    case "title_changed":
      return `${who}changed Title from "${row.old_value ?? ""}" to "${row.new_value ?? ""}"`.trim();
    case "description_changed":
      return `${who}updated the description`.trim();
    case "status_changed":
      return `${who}changed Status from ${activityStatusLabel(row.old_value)} to ${activityStatusLabel(row.new_value)}`.trim();
    case "type_changed":
      return `${who}changed Type from ${activityTypeLabel(row.old_value)} to ${activityTypeLabel(row.new_value)}`.trim();
    case "priority_changed":
      return `${who}changed Priority from ${activityPriorityLabel(row.old_value)} to ${activityPriorityLabel(row.new_value)}`.trim();
    case "assignee_changed": {
      const oldName = resolveName(row.old_value);
      const newName = resolveName(row.new_value);
      if (!row.old_value && row.new_value) return `${who}assigned the ticket to ${newName ?? "Unknown"}`.trim();
      if (row.old_value && !row.new_value) return `${who}unassigned the ticket`.trim();
      return `${who}reassigned the ticket from ${oldName ?? "Unknown"} to ${newName ?? "Unknown"}`.trim();
    }
    case "hours_changed":
      if (!row.old_value && row.new_value) return `${who}set Estimate to ${row.new_value} h`.trim();
      if (row.old_value && !row.new_value) return `${who}removed the estimate`.trim();
      return `${who}changed Estimate from ${row.old_value} h to ${row.new_value} h`.trim();
    case "due_date_changed": {
      const oldLabel = formatDueDate(row.old_value) ?? "";
      const newLabel = formatDueDate(row.new_value) ?? "";
      if (!row.old_value && row.new_value) return `${who}set Due Date to ${newLabel}`.trim();
      if (row.old_value && !row.new_value) return `${who}removed the due date`.trim();
      return `${who}changed Due Date from ${oldLabel} to ${newLabel}`.trim();
    }
    case "label_added":
      return `${who}added label "${row.new_value ?? ""}"`.trim();
    case "label_removed":
      return `${who}removed label "${row.old_value ?? ""}"`.trim();
    case "acceptance_criteria_updated":
      return `${who}updated the acceptance criteria`.trim();
    case "acceptance_criterion_completed":
      return `${who}completed acceptance criterion "${row.new_value ?? ""}"`.trim();
    case "acceptance_criterion_unchecked":
      return `${who}unchecked acceptance criterion "${row.new_value ?? ""}"`.trim();
    case "attachment_uploaded":
      return `${who}uploaded "${row.new_value ?? ""}"`.trim();
    case "attachment_renamed":
      return `${who}renamed attachment from "${row.old_value ?? ""}" to "${row.new_value ?? ""}"`.trim();
    case "attachment_deleted":
      return `${who}deleted attachment "${row.old_value ?? ""}"`.trim();
    case "time_logged": {
      const minutes = Number(row.new_value ?? "0");
      const hrs = Math.round((minutes / 60) * 10) / 10;
      return `${who}logged ${hrs} h`.trim();
    }
    case "added_a_comment":
      return `${who}added a comment`.trim();
    case "relation_added":
      return `${who}linked this ticket to ${row.new_value ?? ""} (${row.field_name ?? ""})`.trim();
    case "relation_removed":
      return `${who}removed the link to ${row.old_value ?? ""} (${row.field_name ?? ""})`.trim();
    default:
      return `${who}${row.event_type.replace(/_/g, " ")}`.trim();
  }
}

async function loadProfilesByIds(
  supabase: ReturnType<typeof getSupabaseBrowserClient>,
  ids: string[]
): Promise<Map<string, AssigneeProfileRow>> {
  const byId = new Map<string, AssigneeProfileRow>();
  if (ids.length === 0) return byId;
  const { data, error } = await supabase
    .from("profiles")
    .select("id, first_name, last_name, avatar_url, updated_at")
    .in("id", ids)
    .returns<AssigneeProfileRow[]>();
  if (error) {
    logDev("profiles lookup failed", error);
    return byId;
  }
  for (const row of data ?? []) byId.set(row.id, row);
  return byId;
}

function resolveProfileName(row: AssigneeProfileRow | undefined): string | null {
  if (!row) return null;
  return [row.first_name, row.last_name].filter(Boolean).join(" ") || "Unnamed";
}

// Newest first — the new comment goes to the top of the list immediately
// after posting, without needing a full refetch to reorder it.
export async function loadTicketComments(ticketId: string): Promise<TicketCommentsResult> {
  const supabase = getSupabaseBrowserClient();

  const { data: rows, error } = await supabase
    .from("ticket_comments")
    .select("id, author_profile_id, body, created_at")
    .eq("ticket_id", ticketId)
    .order("created_at", { ascending: false })
    .returns<CommentRow[]>();

  if (error) {
    logDev("ticket comments query failed", error);
    return { status: "error", message: error.message };
  }

  const authorIds = Array.from(
    new Set((rows ?? []).map((row) => row.author_profile_id).filter((id): id is string => Boolean(id)))
  );
  const authorsById = await loadProfilesByIds(supabase, authorIds);

  const comments: TicketComment[] = (rows ?? []).map((row) => {
    const author = row.author_profile_id ? authorsById.get(row.author_profile_id) : undefined;
    return {
      id: row.id,
      name: resolveProfileName(author) ?? "Unknown",
      avatar: (author ? resolveAvatarUrl(author.avatar_url, author.updated_at) : null) ?? FALLBACK_AVATAR,
      timeAgo: formatRelativeTime(row.created_at),
      text: row.body,
    };
  });

  return { status: "ready", comments };
}

export type CreateTicketCommentResult =
  | { status: "success"; comment: TicketComment }
  | { status: "error"; message: string };

// author_profile_id is never sent by the client — it defaults to
// auth.uid() at the database level (same pattern as
// ticket_attachments.uploaded_by / ticket_time_entries.logged_by), so it
// can't be spoofed. A database trigger on this insert also creates the
// matching "<name> added a comment" ticket_activity row — see
// 20260727000000_enable_real_ticket_comments.sql.
export async function createTicketComment(ticketId: string, body: string): Promise<CreateTicketCommentResult> {
  const trimmed = body.trim();
  if (trimmed.length === 0) {
    return { status: "error", message: "Comment can't be empty." };
  }

  const supabase = getSupabaseBrowserClient();

  const { data: row, error } = await supabase
    .from("ticket_comments")
    .insert({ ticket_id: ticketId, body: trimmed })
    .select("id, author_profile_id, body, created_at")
    .single<CommentRow>();

  if (error) {
    logDev("ticket comment insert failed", error);
    return { status: "error", message: error.message };
  }

  let authorRow: AssigneeProfileRow | undefined;
  if (row.author_profile_id) {
    const { data: profileRow, error: profileError } = await supabase
      .from("profiles")
      .select("id, first_name, last_name, avatar_url, updated_at")
      .eq("id", row.author_profile_id)
      .maybeSingle<AssigneeProfileRow>();
    if (profileError) {
      logDev("comment author profile lookup failed", profileError);
    } else {
      authorRow = profileRow ?? undefined;
    }
  }

  return {
    status: "success",
    comment: {
      id: row.id,
      name: resolveProfileName(authorRow) ?? "Unknown",
      avatar: (authorRow ? resolveAvatarUrl(authorRow.avatar_url, authorRow.updated_at) : null) ?? FALLBACK_AVATAR,
      timeAgo: formatRelativeTime(row.created_at),
      text: row.body,
    },
  };
}

// Newest first. Every real action (create, field edits, labels, acceptance
// criteria, attachments, time entries, comments) is logged by a database
// trigger as part of the same transaction as its real write — see
// 20260727000000/20260728000000 — so this is a pure read, nothing here
// ever creates an activity row.
export async function loadTicketActivity(ticketId: string): Promise<TicketActivityResult> {
  const supabase = getSupabaseBrowserClient();

  const { data: rows, error } = await supabase
    .from("ticket_activity")
    .select("id, actor_profile_id, event_type, field_name, old_value, new_value, created_at")
    .eq("ticket_id", ticketId)
    .order("created_at", { ascending: false })
    .returns<ActivityRow[]>();

  if (error) {
    logDev("ticket activity query failed", error);
    return { status: "error", message: error.message };
  }

  let allRows = rows ?? [];

  // Tickets created before this feature existed have no real
  // ticket_created row (the insert trigger only fires for new inserts) —
  // synthesize exactly one, using the ticket's own real created_at /
  // created_by. Never fabricated: if created_by is null (genuinely
  // unknown for a pre-existing ticket), the event simply has no actor,
  // same as any other event with a null actor_profile_id.
  if (!allRows.some((row) => row.event_type === "ticket_created")) {
    const { data: ticketRow } = await supabase
      .from("tickets")
      .select("created_by, created_at")
      .eq("id", ticketId)
      .maybeSingle<{ created_by: string | null; created_at: string }>();
    if (ticketRow) {
      allRows = [
        ...allRows,
        {
          id: `synthetic-created-${ticketId}`,
          actor_profile_id: ticketRow.created_by,
          event_type: "ticket_created",
          field_name: null,
          old_value: null,
          new_value: null,
          created_at: ticketRow.created_at,
        },
      ];
      allRows = [...allRows].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }
  }

  // Every profile this page of activity could reference: each row's actor,
  // plus assignee_changed's old/new profile ids.
  const profileIds = new Set<string>();
  for (const row of allRows) {
    if (row.actor_profile_id) profileIds.add(row.actor_profile_id);
    if (row.event_type === "assignee_changed") {
      if (row.old_value) profileIds.add(row.old_value);
      if (row.new_value) profileIds.add(row.new_value);
    }
  }
  const profilesById = await loadProfilesByIds(supabase, Array.from(profileIds));
  const resolveName = (id: string | null) => (id ? resolveProfileName(profilesById.get(id)) : null);

  const events: TicketActivityEvent[] = allRows.map((row) => ({
    label: buildActivityLabel(row, resolveName(row.actor_profile_id), resolveName),
    timeAgo: formatRelativeTime(row.created_at),
  }));

  return { status: "ready", events };
}

// ── User Activity (Member Profile modal's Activity tab) ─────────────────────────
// A summarized, cross-ticket, cross-project view of one person's real
// ticket_activity rows — reuses the exact same table/triggers
// loadTicketActivity above reads, just filtered by actor instead of by
// ticket. This is deliberately a *summary*, not a detailed log (that's what
// the ticket's own Activity Log is for — see buildActivityLabel above,
// still used there, untouched): every event_type except ticket_created gets
// folded into a single "Working on <ticket>" entry per ticket, counting how
// many raw rows it represents, rather than describing each field change.
// RLS (ticket_activity_select → can_view_project → is_org_member) is what
// actually scopes this to the caller's own organization — a foreign-org
// profile id simply has no visible rows, never a leak, so no separate
// server-side org check is needed for this read (unlike the privileged
// writes elsewhere in this module's Server Actions).

export interface UserActivityEvent {
  id: string;
  timeAgo: string;
  /** Text before the ticket reference (the whole label when ticketKey is null). */
  labelPrefix: string;
  /** Text after the ticket reference — only meaningful when ticketKey is set. */
  labelSuffix: string;
  /** e.g. "JIR-42" — null when the row's ticket/project couldn't be resolved. */
  ticketKey: string | null;
  /** Needed alongside ticketKey to build the ticket's real URL — never set without ticketKey. */
  projectSlug: string | null;
}

export type UserActivityResult =
  | { status: "ready"; events: UserActivityEvent[] }
  | { status: "error"; message: string };

// Final, post-grouping entry count shown in the tab.
const USER_ACTIVITY_LIMIT = 10;
// Raw ticket_activity rows fetched before grouping — larger than the display
// limit on purpose: grouping only ever *reduces* the row count (many raw
// rows on one ticket become one entry), so a single-ticket-heavy actor would
// otherwise never fill out 10 summarized entries. Still one bounded query,
// not pagination.
const USER_ACTIVITY_RAW_FETCH_LIMIT = 100;

interface UserActivityTicketRow {
  id: string;
  ticket_number: number;
  project_id: string;
}

interface UserActivityProjectRow {
  id: string;
  slug: string;
  project_code: string;
}

type UserActivityRawRow = ActivityRow & { ticket_id: string };

// One summarized entry per ticket: either the ticket's own creation (kept
// as its own milestone entry, never folded in) or every other real action
// this actor took on that ticket, collapsed into a single "Working on"
// count — comments, status/priority changes, attachments, time entries,
// relations, and every other field edit all count toward it, never listed
// individually here.
interface SummarizedTicketActivity {
  ticketId: string;
  mostRecentAt: string;
  count: number;
  kind: "created" | "working-on";
}

function summarizeUserActivityRows(rows: UserActivityRawRow[]): SummarizedTicketActivity[] {
  const summaries: SummarizedTicketActivity[] = [];
  const workingOnByTicket = new Map<string, SummarizedTicketActivity>();

  // rows is already newest-first (the query below orders it that way), so
  // the first row seen for a given ticket in this loop is always its most
  // recent — no separate sort needed to find it.
  for (const row of rows) {
    if (row.event_type === "ticket_created") {
      summaries.push({ ticketId: row.ticket_id, mostRecentAt: row.created_at, count: 1, kind: "created" });
      continue;
    }
    const existing = workingOnByTicket.get(row.ticket_id);
    if (existing) {
      existing.count += 1;
    } else {
      const summary: SummarizedTicketActivity = {
        ticketId: row.ticket_id,
        mostRecentAt: row.created_at,
        count: 1,
        kind: "working-on",
      };
      workingOnByTicket.set(row.ticket_id, summary);
      summaries.push(summary);
    }
  }

  return summaries.sort((a, b) => new Date(b.mostRecentAt).getTime() - new Date(a.mostRecentAt).getTime());
}

// Newest first, capped at USER_ACTIVITY_LIMIT *after* grouping — see
// summarizeUserActivityRows above. Never infers anything from current
// ticket state or the person's account status: every entry here is built
// from real, already-logged ticket_activity rows for this exact actor.
export async function loadUserActivity(profileId: string, limit = USER_ACTIVITY_LIMIT): Promise<UserActivityResult> {
  const supabase = getSupabaseBrowserClient();

  const { data: rows, error } = await supabase
    .from("ticket_activity")
    .select("id, actor_profile_id, ticket_id, event_type, field_name, old_value, new_value, created_at")
    .eq("actor_profile_id", profileId)
    .order("created_at", { ascending: false })
    .limit(USER_ACTIVITY_RAW_FETCH_LIMIT)
    .returns<UserActivityRawRow[]>();

  if (error) {
    logDev("user activity query failed", error);
    return { status: "error", message: error.message };
  }

  const activityRows = rows ?? [];
  if (activityRows.length === 0) return { status: "ready", events: [] };

  const summarized = summarizeUserActivityRows(activityRows).slice(0, limit);

  const ticketIds = Array.from(new Set(summarized.map((s) => s.ticketId)));
  const { data: ticketRows, error: ticketsError } = await supabase
    .from("tickets")
    .select("id, ticket_number, project_id")
    .in("id", ticketIds)
    .returns<UserActivityTicketRow[]>();

  if (ticketsError) {
    logDev("user activity tickets lookup failed", ticketsError);
    return { status: "error", message: ticketsError.message };
  }

  const ticketById = new Map((ticketRows ?? []).map((t) => [t.id, t]));
  const projectIds = Array.from(new Set((ticketRows ?? []).map((t) => t.project_id)));

  let projectRows: UserActivityProjectRow[] = [];
  if (projectIds.length > 0) {
    const { data, error: projectsError } = await supabase
      .from("projects")
      .select("id, slug, project_code")
      .in("id", projectIds)
      .returns<UserActivityProjectRow[]>();

    if (projectsError) {
      logDev("user activity projects lookup failed", projectsError);
      return { status: "error", message: projectsError.message };
    }
    projectRows = data ?? [];
  }
  const projectById = new Map(projectRows.map((p) => [p.id, p]));

  const events: UserActivityEvent[] = summarized.map((s) => {
    const ticket = ticketById.get(s.ticketId);
    const project = ticket ? projectById.get(ticket.project_id) : undefined;
    const ticketKey = ticket && project ? `${project.project_code}-${ticket.ticket_number}` : null;
    const relativeTime = formatRelativeTime(s.mostRecentAt);

    if (s.kind === "created") {
      return {
        id: `created-${s.ticketId}`,
        timeAgo: relativeTime,
        labelPrefix: "Created ",
        labelSuffix: "",
        ticketKey,
        projectSlug: ticketKey ? (project?.slug ?? null) : null,
      };
    }

    return {
      id: `working-on-${s.ticketId}`,
      // The count rides in the same subtitle line as the relative time
      // (e.g. "2 hours ago · 5 updates") rather than a third line, so the
      // existing two-line timeline entry (label + subtitle) needs no
      // structural change.
      timeAgo: `${relativeTime} · ${s.count} update${s.count === 1 ? "" : "s"}`,
      labelPrefix: "Working on ",
      labelSuffix: "",
      ticketKey,
      projectSlug: ticketKey ? (project?.slug ?? null) : null,
    };
  });

  return { status: "ready", events };
}

// ── Project member work history (Team → member menu's "View Work History") ──
// A per-ticket summary, not an activity log — "which tickets has this person
// actually worked on in this project, and how much" — never lists
// individual comments/changes/attachments/time entries (that's still the
// ticket's own Activity Log's job, buildActivityLabel above, untouched).
// The actual participation/aggregation logic lives entirely in three
// database functions (20260810000000_project_member_work_history_pagination.sql
// — see that migration's own header comment for why it's a real,
// server-side LIMIT/OFFSET rather than fetching everything and slicing
// here): this module only calls them and reshapes the result into this
// app's existing TicketStatus/TicketPriority/relative-time conventions.

export interface ProjectMemberWorkHistorySummary {
  ticketCount: number;
  totalHours: number;
  /** Pre-formatted relative time, or null when there's no history at all yet. */
  lastActivityLabel: string | null;
}

export type ProjectMemberWorkHistorySummaryResult =
  | { status: "ready"; summary: ProjectMemberWorkHistorySummary }
  | { status: "error"; message: string };

export interface ProjectMemberWorkHistoryEntry {
  ticketId: string;
  ticketKey: string;
  title: string;
  status: TicketStatus;
  priority: TicketPriority;
  /** Hours this person specifically logged on this ticket — never the ticket's total. */
  hours: number;
  /** Count of this person's own ticket_activity rows on this ticket — never includes being assigned by someone else. */
  activityCount: number;
  /** Pre-formatted relative time ("3 days ago") — same convention as TicketComment/TicketActivityEvent/UserActivityEvent. */
  lastActivityLabel: string;
}

export type ProjectMemberWorkHistoryPageResult =
  | { status: "ready"; entries: ProjectMemberWorkHistoryEntry[] }
  | { status: "error"; message: string };

// Resolves the project id once — both RPCs below take it, not the slug —
// same "not found ⇒ ready with nothing" convention as this module's other
// project-scoped loaders (e.g. loadProjectTeam) rather than a hard error,
// since a not-yet-loaded organization/slug pairing during the first render
// isn't itself a failure.
async function resolveWorkHistoryProjectId(
  organizationId: string,
  slug: string
): Promise<{ status: "ready"; projectId: string | null } | { status: "error"; message: string }> {
  const supabase = getSupabaseBrowserClient();
  const { data: projectRow, error } = await supabase
    .from("projects")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("slug", slug)
    .maybeSingle<{ id: string }>();

  if (error) {
    logDev("work history project lookup failed", error);
    return { status: "error", message: error.message };
  }
  return { status: "ready", projectId: projectRow?.id ?? null };
}

// Full-history totals — Tickets worked on / Hours logged / Last activity —
// always computed over every matching ticket, independent of which page
// (if any) is currently being viewed.
export async function loadProjectMemberWorkHistorySummary(
  organizationId: string,
  slug: string,
  profileId: string
): Promise<ProjectMemberWorkHistorySummaryResult> {
  const projectResult = await resolveWorkHistoryProjectId(organizationId, slug);
  if (projectResult.status === "error") return projectResult;
  if (!projectResult.projectId) {
    return { status: "ready", summary: { ticketCount: 0, totalHours: 0, lastActivityLabel: null } };
  }

  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .rpc("project_member_work_history_summary", {
      target_project_id: projectResult.projectId,
      target_profile_id: profileId,
    })
    .maybeSingle<{ ticket_count: number; total_hours: number; most_recent_activity_at: string | null }>();

  if (error) {
    logDev("work history summary rpc failed", error);
    return { status: "error", message: error.message };
  }

  return {
    status: "ready",
    summary: {
      ticketCount: data?.ticket_count ?? 0,
      totalHours: Math.round((data?.total_hours ?? 0) * 10) / 10,
      lastActivityLabel: data?.most_recent_activity_at ? formatRelativeTime(data.most_recent_activity_at) : null,
    },
  };
}

interface WorkHistoryPageRow {
  ticket_id: string;
  ticket_number: number;
  title: string;
  status: string;
  priority: string;
  hours: number;
  activity_count: number;
  last_activity_at: string;
}

// One page of rows (default 20 — see the caller, work-history-screen.tsx),
// ordered by this person's last activity on each ticket, most recent
// first, resolved entirely server-side via LIMIT/OFFSET in
// project_member_work_history_page — this function never fetches more
// than one page's worth of tickets.
export async function loadProjectMemberWorkHistoryPage(
  organizationId: string,
  slug: string,
  profileId: string,
  page: number,
  pageSize: number
): Promise<ProjectMemberWorkHistoryPageResult> {
  const projectResult = await resolveWorkHistoryProjectId(organizationId, slug);
  if (projectResult.status === "error") return projectResult;
  if (!projectResult.projectId) return { status: "ready", entries: [] };

  const supabase = getSupabaseBrowserClient();
  const { data: projectCodeRow, error: projectCodeError } = await supabase
    .from("projects")
    .select("project_code")
    .eq("id", projectResult.projectId)
    .maybeSingle<{ project_code: string }>();

  if (projectCodeError) {
    logDev("work history project code lookup failed", projectCodeError);
    return { status: "error", message: projectCodeError.message };
  }
  const projectCode = projectCodeRow?.project_code ?? "";

  const { data, error } = await supabase.rpc("project_member_work_history_page", {
    target_project_id: projectResult.projectId,
    target_profile_id: profileId,
    page_size: pageSize,
    page_offset: Math.max(0, page - 1) * pageSize,
  });

  if (error) {
    logDev("work history page rpc failed", error);
    return { status: "error", message: error.message };
  }

  const rows = (data ?? []) as WorkHistoryPageRow[];
  const entries: ProjectMemberWorkHistoryEntry[] = rows.map((row) => ({
    ticketId: row.ticket_id,
    ticketKey: `${projectCode}-${row.ticket_number}`,
    title: row.title,
    status: STATUS_FROM_DB[row.status] ?? "backlog",
    priority: row.priority as TicketPriority,
    hours: Math.round(row.hours * 10) / 10,
    activityCount: row.activity_count,
    lastActivityLabel: formatRelativeTime(row.last_activity_at),
  }));

  return { status: "ready", entries };
}

// ── Attachments (Ticket Detail) ─────────────────────────────────────────────────
// Real Supabase Storage + a ticket_attachments metadata row per file — upload,
// rename, and delete are all wired to real writes (see uploadTicketAttachment /
// renameTicketAttachment / deleteTicketAttachment below).

const ATTACHMENTS_BUCKET = "ticket-attachments";

export interface TicketAttachment {
  id: string;
  filename: string;
  storagePath: string;
  sizeBytes: number;
  mimeType: string | null;
  uploadedByName: string;
  uploadedByAvatar: string;
  /** Pre-formatted relative time ("3 days ago") — same convention as TicketComment/TicketActivityEvent. */
  uploadedAt: string;
}

interface AttachmentRow {
  id: string;
  filename: string;
  storage_path: string;
  size_bytes: number;
  mime_type: string | null;
  uploaded_by: string | null;
  created_at: string;
}

function rowToAttachment(row: AttachmentRow, uploaderRow: AssigneeProfileRow | undefined): TicketAttachment {
  return {
    id: row.id,
    filename: row.filename,
    storagePath: row.storage_path,
    sizeBytes: row.size_bytes,
    mimeType: row.mime_type,
    uploadedByName: resolveProfileName(uploaderRow) ?? "Unknown",
    uploadedByAvatar:
      (uploaderRow ? resolveAvatarUrl(uploaderRow.avatar_url, uploaderRow.updated_at) : null) ?? FALLBACK_AVATAR,
    uploadedAt: formatRelativeTime(row.created_at),
  };
}

export type TicketAttachmentsResult =
  | { status: "ready"; attachments: TicketAttachment[] }
  | { status: "error"; message: string };

// Newest first — matches the section's existing "most recent upload on
// top" convention (see AttachmentsSection's setAttachments prepend logic).
export async function loadTicketAttachments(ticketId: string): Promise<TicketAttachmentsResult> {
  const supabase = getSupabaseBrowserClient();

  const { data: rows, error } = await supabase
    .from("ticket_attachments")
    .select("id, filename, storage_path, size_bytes, mime_type, uploaded_by, created_at")
    .eq("ticket_id", ticketId)
    .order("created_at", { ascending: false })
    .returns<AttachmentRow[]>();

  if (error) {
    logDev("ticket attachments query failed", error);
    return { status: "error", message: error.message };
  }

  const uploaderIds = Array.from(
    new Set((rows ?? []).map((row) => row.uploaded_by).filter((id): id is string => Boolean(id)))
  );
  const uploadersById = await loadProfilesByIds(supabase, uploaderIds);

  const attachments = (rows ?? []).map((row) =>
    rowToAttachment(row, row.uploaded_by ? uploadersById.get(row.uploaded_by) : undefined)
  );

  return { status: "ready", attachments };
}

export type UploadTicketAttachmentResult =
  | { status: "success"; attachment: TicketAttachment }
  | { status: "error"; message: string };

// Storage path is "<ticket_id>/<uuid>-<sanitized filename>" — the leading
// ticket_id segment is exactly what the Storage RLS policies check via
// storage.foldername(name), so the path and the policies stay in lockstep.
// uploaded_by is never sent here — the column defaults to auth.uid() at
// the database level, so it can't be spoofed from the client.
export async function uploadTicketAttachment(ticketId: string, file: File): Promise<UploadTicketAttachmentResult> {
  const supabase = getSupabaseBrowserClient();

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagePath = `${ticketId}/${crypto.randomUUID()}-${safeName}`;

  const { error: uploadError } = await supabase.storage.from(ATTACHMENTS_BUCKET).upload(storagePath, file);

  if (uploadError) {
    logDev("attachment storage upload failed", uploadError);
    return { status: "error", message: uploadError.message };
  }

  const { data: row, error: insertError } = await supabase
    .from("ticket_attachments")
    .insert({
      ticket_id: ticketId,
      storage_path: storagePath,
      filename: file.name,
      size_bytes: file.size,
      mime_type: file.type || null,
    })
    .select("id, filename, storage_path, size_bytes, mime_type, uploaded_by, created_at")
    .single<AttachmentRow>();

  if (insertError) {
    logDev("attachment record insert failed", insertError);
    // Best-effort cleanup — don't leave an orphaned Storage object with no
    // corresponding row if the insert failed after the upload succeeded.
    await supabase.storage.from(ATTACHMENTS_BUCKET).remove([storagePath]);
    return { status: "error", message: insertError.message };
  }

  let uploaderRow: AssigneeProfileRow | undefined;
  if (row.uploaded_by) {
    const { data: profileRow, error: profileError } = await supabase
      .from("profiles")
      .select("id, first_name, last_name, avatar_url, updated_at")
      .eq("id", row.uploaded_by)
      .maybeSingle<AssigneeProfileRow>();
    if (profileError) {
      logDev("uploader profile lookup failed", profileError);
    } else {
      uploaderRow = profileRow ?? undefined;
    }
  }

  return { status: "success", attachment: rowToAttachment(row, uploaderRow) };
}

export type DownloadTicketAttachmentResult =
  | { status: "success" }
  | { status: "error"; message: string };

// The bucket is private, so a plain public URL doesn't work — this fetches
// the object through the authenticated client (same ticket_attachments_
// storage_select RLS policy that already gates loadTicketAttachments) and
// saves it via a temporary object URL, so the browser downloads it with its
// original filename regardless of the randomized storage path.
export async function downloadTicketAttachment(
  storagePath: string,
  filename: string
): Promise<DownloadTicketAttachmentResult> {
  const supabase = getSupabaseBrowserClient();

  const { data: blob, error } = await supabase.storage.from(ATTACHMENTS_BUCKET).download(storagePath);

  if (error || !blob) {
    logDev("attachment download failed", error);
    return { status: "error", message: error?.message ?? "Download failed" };
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);

  return { status: "success" };
}

export type TicketAttachmentPreviewUrlResult =
  | { status: "success"; url: string }
  | { status: "error"; message: string };

// The bucket is private, so previewing (embedding in an <img>/<iframe>)
// needs a signed URL rather than getPublicUrl — createSignedUrl is gated by
// the same ticket_attachments_storage_select RLS policy that already
// authorizes loadTicketAttachments/downloadTicketAttachment for this object.
// Short-lived on purpose: only needed for as long as the Preview modal
// is open.
export async function getTicketAttachmentPreviewUrl(storagePath: string): Promise<TicketAttachmentPreviewUrlResult> {
  const supabase = getSupabaseBrowserClient();

  const { data, error } = await supabase.storage.from(ATTACHMENTS_BUCKET).createSignedUrl(storagePath, 300);

  if (error || !data) {
    logDev("attachment preview signed url failed", error);
    return { status: "error", message: error?.message ?? "Preview failed" };
  }

  return { status: "success", url: data.signedUrl };
}

export type RenameTicketAttachmentResult =
  | { status: "success" }
  | { status: "error"; message: string };

// Updates only the ticket_attachments.filename column — storage_path (the
// actual Storage object key) is deliberately never touched, since filename
// is already tracked separately from it (see uploadTicketAttachment above).
export async function renameTicketAttachment(
  attachmentId: string,
  filename: string
): Promise<RenameTicketAttachmentResult> {
  const supabase = getSupabaseBrowserClient();

  // .select() after .update() is required to actually detect a denied
  // write: PostgREST reports an UPDATE that RLS silently matched zero rows
  // on as a normal success with no error, so without this the UI would show
  // the new name and then have it quietly revert on refresh.
  const { data, error } = await supabase
    .from("ticket_attachments")
    .update({ filename })
    .eq("id", attachmentId)
    .select("id");

  if (error) {
    logDev("attachment rename failed", error);
    return { status: "error", message: error.message };
  }
  if (!data || data.length === 0) {
    logDev("attachment rename failed", "update matched no row (RLS denied or attachment no longer exists)");
    return { status: "error", message: "You don't have permission to rename this attachment." };
  }

  return { status: "success" };
}

export type DeleteTicketAttachmentResult =
  | { status: "success" }
  | { status: "error"; message: string };

// Deletes the metadata row first — that row is what the Attachments list
// (and "does it reappear after refresh") actually depends on. The Storage
// object is then removed best-effort: if that second step fails, the row is
// still gone, matching the UI, leaving at worst an orphaned Storage object
// rather than a row that points at a missing file.
export async function deleteTicketAttachment(
  attachmentId: string,
  storagePath: string
): Promise<DeleteTicketAttachmentResult> {
  const supabase = getSupabaseBrowserClient();

  // Same reasoning as renameTicketAttachment above: .select() is required to
  // tell "deleted" apart from "RLS silently matched zero rows."
  const { data, error } = await supabase.from("ticket_attachments").delete().eq("id", attachmentId).select("id");

  if (error) {
    logDev("attachment delete failed", error);
    return { status: "error", message: error.message };
  }
  if (!data || data.length === 0) {
    logDev("attachment delete failed", "delete matched no row (RLS denied or attachment already gone)");
    return { status: "error", message: "You don't have permission to delete this attachment." };
  }

  const { error: storageError } = await supabase.storage.from(ATTACHMENTS_BUCKET).remove([storagePath]);
  if (storageError) {
    // The row is already gone (and the UI already reflects that) — log for
    // visibility but don't surface this as a failure of the delete action.
    logDev("attachment storage cleanup failed", storageError);
  }

  return { status: "success" };
}

// ── Related Tickets (Ticket Detail) ─────────────────────────────────────────────
// Real ticket_relations rows — the "+ Link" control, relation-kind selector,
// and search previously did nothing (search results were hardcoded empty,
// links only lived in local React state). Only 3 canonical kinds are ever
// stored ('related_to' | 'blocks' | 'duplicates'); the 5 UI-facing kinds are
// derived per-perspective (see loadTicketRelations) — this is what keeps the
// inverse relation (Blocks ↔ Is blocked by, Duplicates ↔ Is duplicated by)
// automatically correct, since there's only ever one row per relation to
// get out of sync.

export type TicketRelationKind = "related-to" | "blocks" | "blocked-by" | "duplicates" | "duplicated-by";

export interface RelatedTicket {
  linkId: string;
  kind: TicketRelationKind;
  ticket: Ticket;
}

interface TicketRelationRow {
  id: string;
  ticket_id: string;
  related_ticket_id: string;
  kind: string;
  created_at: string;
}

export type TicketRelationsResult =
  | { status: "ready"; relations: RelatedTicket[] }
  | { status: "error"; message: string };

// Newest first, same convention as the rest of Ticket Detail's lists.
export async function loadTicketRelations(ticketId: string, slug: string): Promise<TicketRelationsResult> {
  const supabase = getSupabaseBrowserClient();

  const { data: rows, error } = await supabase
    .from("ticket_relations")
    .select("id, ticket_id, related_ticket_id, kind, created_at")
    .or(`ticket_id.eq.${ticketId},related_ticket_id.eq.${ticketId}`)
    .order("created_at", { ascending: false })
    .returns<TicketRelationRow[]>();

  if (error) {
    logDev("ticket relations query failed", error);
    return { status: "error", message: error.message };
  }

  if (!rows || rows.length === 0) return { status: "ready", relations: [] };

  const otherIds = Array.from(
    new Set(rows.map((r) => (r.ticket_id === ticketId ? r.related_ticket_id : r.ticket_id)))
  );

  const { data: ticketRows, error: ticketsError } = await supabase
    .from("tickets")
    .select(TICKET_COLUMNS)
    .in("id", otherIds)
    .returns<TicketRow[]>();

  if (ticketsError) {
    logDev("related tickets query failed", ticketsError);
    return { status: "error", message: ticketsError.message };
  }

  const assigneeIds = Array.from(
    new Set((ticketRows ?? []).map((r) => r.assignee_profile_id).filter((id): id is string => Boolean(id)))
  );
  const assigneesById = await loadProfilesByIds(supabase, assigneeIds);

  const ticketsById = new Map(
    (ticketRows ?? []).map((row) => [
      row.id,
      rowToTicket(row, slug, row.assignee_profile_id ? assigneesById.get(row.assignee_profile_id) : undefined),
    ])
  );

  const relations: RelatedTicket[] = rows
    .map((r): RelatedTicket | undefined => {
      const isForward = r.ticket_id === ticketId;
      const otherId = isForward ? r.related_ticket_id : r.ticket_id;
      const ticket = ticketsById.get(otherId);
      if (!ticket) return undefined;

      let kind: TicketRelationKind;
      if (r.kind === "blocks") kind = isForward ? "blocks" : "blocked-by";
      else if (r.kind === "duplicates") kind = isForward ? "duplicates" : "duplicated-by";
      else kind = "related-to";

      return { linkId: r.id, kind, ticket };
    })
    .filter((x): x is RelatedTicket => x !== undefined);

  return { status: "ready", relations };
}

const RELATION_KIND_TO_DB: Record<TicketRelationKind, "related_to" | "blocks" | "duplicates"> = {
  "related-to":    "related_to",
  "blocks":        "blocks",
  "blocked-by":    "blocks",
  "duplicates":    "duplicates",
  "duplicated-by": "duplicates",
};

export type CreateTicketRelationResult =
  | { status: "success" }
  | { status: "error"; message: string };

export async function createTicketRelation(
  ticketId: string,
  otherTicketId: string,
  kind: TicketRelationKind
): Promise<CreateTicketRelationResult> {
  if (ticketId === otherTicketId) {
    return { status: "error", message: "A ticket can't be related to itself." };
  }

  const dbKind = RELATION_KIND_TO_DB[kind];

  // Normalize direction into the one canonical row this relation is stored
  // as: "blocked-by"/"duplicated-by" mean the OTHER ticket is the one doing
  // the blocking/duplicating, so the row is stored from its side instead.
  // "related-to" is symmetric, so it's always stored in a fixed (sorted)
  // order regardless of which ticket initiated it — otherwise requesting
  // the same relation from either ticket would create two different rows
  // instead of colliding on the unique constraint below.
  let fromId = ticketId;
  let toId = otherTicketId;
  if (kind === "blocked-by" || kind === "duplicated-by") {
    fromId = otherTicketId;
    toId = ticketId;
  } else if (kind === "related-to") {
    [fromId, toId] = [ticketId, otherTicketId].sort();
  }

  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase
    .from("ticket_relations")
    .insert({ ticket_id: fromId, related_ticket_id: toId, kind: dbKind });

  if (error) {
    logDev("ticket relation creation failed", error);
    // Postgres unique_violation — ticket_relations_unique already caught this.
    if (error.code === "23505") {
      return { status: "error", message: "These tickets are already related." };
    }
    return { status: "error", message: error.message };
  }

  return { status: "success" };
}

export type DeleteTicketRelationResult =
  | { status: "success" }
  | { status: "error"; message: string };

export async function deleteTicketRelation(linkId: string): Promise<DeleteTicketRelationResult> {
  const supabase = getSupabaseBrowserClient();

  const { data, error } = await supabase.from("ticket_relations").delete().eq("id", linkId).select("id");

  if (error) {
    logDev("ticket relation delete failed", error);
    return { status: "error", message: error.message };
  }
  if (!data || data.length === 0) {
    logDev("ticket relation delete failed", "delete matched no row (RLS denied or link already gone)");
    return { status: "error", message: "You don't have permission to remove this link." };
  }

  return { status: "success" };
}

// ── Time Tracking (Ticket Detail) ───────────────────────────────────────────────
// Real ticket_time_entries rows — the "Log Time" flow previously only
// appended to local React state (nothing persisted, and the modal's Date
// field defaulted to a hardcoded mock date). Minutes are the canonical
// stored unit (not a float "hours" value) to avoid floating-point drift
// when several entries are summed — hours-for-display is derived at the
// UI mapping layer in ticket-detail-screen.tsx.

export interface TimeEntryRecord {
  id: string;
  minutes: number;
  comment: string;
  /** ISO date (yyyy-mm-dd) the work was done on. */
  workDate: string;
  loggedByName: string;
  loggedByAvatar: string;
}

interface TimeEntryRow {
  id: string;
  minutes: number;
  comment: string | null;
  work_date: string;
  logged_by: string | null;
  created_at: string;
}

function rowToTimeEntryRecord(row: TimeEntryRow, loggerRow: AssigneeProfileRow | undefined): TimeEntryRecord {
  return {
    id: row.id,
    minutes: row.minutes,
    comment: row.comment ?? "",
    workDate: row.work_date,
    loggedByName: resolveProfileName(loggerRow) ?? "Unknown",
    loggedByAvatar:
      (loggerRow ? resolveAvatarUrl(loggerRow.avatar_url, loggerRow.updated_at) : null) ?? FALLBACK_AVATAR,
  };
}

export type TicketTimeEntriesResult =
  | { status: "ready"; entries: TimeEntryRecord[] }
  | { status: "error"; message: string };

// Newest-logged first — matches the section's existing "prepend on log"
// convention (see TicketDetailScreen's addEntry).
export async function loadTicketTimeEntries(ticketId: string): Promise<TicketTimeEntriesResult> {
  const supabase = getSupabaseBrowserClient();

  const { data: rows, error } = await supabase
    .from("ticket_time_entries")
    .select("id, minutes, comment, work_date, logged_by, created_at")
    .eq("ticket_id", ticketId)
    .order("created_at", { ascending: false })
    .returns<TimeEntryRow[]>();

  if (error) {
    logDev("ticket time entries query failed", error);
    return { status: "error", message: error.message };
  }

  const loggerIds = Array.from(
    new Set((rows ?? []).map((row) => row.logged_by).filter((id): id is string => Boolean(id)))
  );
  const loggersById = await loadProfilesByIds(supabase, loggerIds);

  const entries = (rows ?? []).map((row) =>
    rowToTimeEntryRecord(row, row.logged_by ? loggersById.get(row.logged_by) : undefined)
  );

  return { status: "ready", entries };
}

export interface LogTimeInput {
  /** Must be > 0 — normalized from the modal's separate hours/minutes fields. */
  minutes: number;
  comment?: string;
  /** ISO date (yyyy-mm-dd) — the user's local "today" by default, never a fixed/mock date. */
  workDate: string;
}

export type LogTimeResult =
  | { status: "success"; entry: TimeEntryRecord }
  | { status: "error"; message: string };

export async function logTicketTime(ticketId: string, input: LogTimeInput): Promise<LogTimeResult> {
  if (!Number.isFinite(input.minutes) || input.minutes <= 0) {
    return { status: "error", message: "Worked time must be greater than 0." };
  }

  const supabase = getSupabaseBrowserClient();

  const { data: row, error } = await supabase
    .from("ticket_time_entries")
    .insert({
      ticket_id: ticketId,
      minutes: Math.round(input.minutes),
      comment: input.comment?.trim() || null,
      work_date: input.workDate,
    })
    .select("id, minutes, comment, work_date, logged_by, created_at")
    .single<TimeEntryRow>();

  if (error) {
    logDev("log time insert failed", error);
    return { status: "error", message: error.message };
  }

  let loggerRow: AssigneeProfileRow | undefined;
  if (row.logged_by) {
    const { data: profileRow, error: profileError } = await supabase
      .from("profiles")
      .select("id, first_name, last_name, avatar_url, updated_at")
      .eq("id", row.logged_by)
      .maybeSingle<AssigneeProfileRow>();
    if (profileError) {
      logDev("time entry logger profile lookup failed", profileError);
    } else {
      loggerRow = profileRow ?? undefined;
    }
  }

  return { status: "success", entry: rowToTimeEntryRecord(row, loggerRow) };
}

// ── Organization-wide reads — backs the real Admin Dashboard only ──────────────
// (src/components/dashboard-screen.tsx). Project Lead's and Member's own
// dashboards are untouched and keep reading their own mock data.

export type OrganizationTicketsResult =
  | { status: "ready"; tickets: Ticket[]; projects: { slug: string; name: string; status: ProjectStatus }[] }
  | { status: "error"; message: string };

// Composes two already-existing loaders (loadOrganizationProjects +
// loadProjectTickets per project) instead of a new direct query, so this
// stays a thin aggregation over data paths that are already real and
// already tested — not a new source of truth for what a "ticket" is. Also
// returns the org's project slug/name/status triples (already fetched here
// anyway) so callers needing a real project display name — e.g. Recent
// Activity's "project" text — or needing to scope to active projects only
// — e.g. Projects at Risk — don't have to issue a second, redundant fetch.
export async function loadOrganizationTickets(organizationId: string): Promise<OrganizationTicketsResult> {
  const projectsResult = await loadOrganizationProjects(organizationId);
  if (projectsResult.status === "error") {
    return { status: "error", message: projectsResult.message };
  }

  const perProject = await Promise.all(
    projectsResult.projects.map((project) => loadProjectTickets(organizationId, project.slug))
  );

  const tickets: Ticket[] = [];
  for (const result of perProject) {
    if (result.status === "error") return { status: "error", message: result.message };
    if (result.status === "ready") tickets.push(...result.tickets);
  }

  return {
    status: "ready",
    tickets,
    projects: projectsResult.projects.map((project) => ({
      slug: project.slug,
      name: project.name,
      status: project.status,
    })),
  };
}

export type OrganizationLoggedHoursResult =
  | { status: "ready"; totalMinutes: number }
  | { status: "error"; message: string };

// Real logged hours (Time Entries) for the Hours Burn KPI — every other
// dashboard KPI is derived client-side from loadOrganizationTickets' own
// result, but estimated hours live on tickets while logged hours live in
// ticket_time_entries, so this is the one genuinely new query.
export async function loadOrganizationLoggedMinutes(ticketIds: string[]): Promise<OrganizationLoggedHoursResult> {
  if (ticketIds.length === 0) return { status: "ready", totalMinutes: 0 };

  const supabase = getSupabaseBrowserClient();

  const { data: rows, error } = await supabase
    .from("ticket_time_entries")
    .select("minutes")
    .in("ticket_id", ticketIds)
    .returns<{ minutes: number }[]>();

  if (error) {
    logDev("organization time entries query failed", error);
    return { status: "error", message: error.message };
  }

  const totalMinutes = (rows ?? []).reduce((sum, row) => sum + row.minutes, 0);
  return { status: "ready", totalMinutes };
}

// The curated subset of real ticket_activity events the Admin Dashboard's
// Recent Activity widget already has a visual category for (see
// ACTIVITY_META in dashboard-shared.tsx: blocked/completed/hours/assigned/
// priority — "note" is Project Notes' own activity, a different table, not
// pulled in here). Every other real event_type (title/description edits,
// attachments, comments, labels, acceptance criteria, relations, logged
// time) is genuinely real too, just not one of the widget's existing
// categories, so it's left out of this feed rather than forced into one
// that doesn't fit. Returns plain data only (no JSX) — dashboard-screen.tsx
// builds the actual verb/detail text, same "lib returns data, component
// shapes presentation" split as the rest of this file.
export type OrganizationActivityEventType = "blocked" | "completed" | "hours" | "assigned" | "priority";

export interface OrganizationActivityEvent {
  id: string;
  type: OrganizationActivityEventType;
  actorName: string | null;
  actorAvatar: string;
  ticketId: string;
  time: string;
  oldHours?: string;
  newHours?: string;
  newAssigneeName?: string;
  oldPriorityLabel?: string;
  newPriorityLabel?: string;
  priorityRaised?: boolean;
}

export type OrganizationActivityResult =
  | { status: "ready"; events: OrganizationActivityEvent[] }
  | { status: "error"; message: string };

interface OrgActivityRawRow {
  id: string;
  ticket_id: string;
  actor_profile_id: string | null;
  event_type: string;
  old_value: string | null;
  new_value: string | null;
  created_at: string;
}

const ORG_ACTIVITY_RAW_FETCH_LIMIT = 200;

function isRelevantOrgActivityRow(row: OrgActivityRawRow): boolean {
  switch (row.event_type) {
    case "status_changed":
      return row.new_value === "blocked" || row.new_value === "done";
    case "hours_changed":
      return Boolean(row.old_value) && Boolean(row.new_value);
    case "assignee_changed":
      return Boolean(row.new_value);
    case "priority_changed":
      return Boolean(row.old_value) && Boolean(row.new_value);
    default:
      return false;
  }
}

export async function loadOrganizationActivity(
  ticketIds: string[],
  limit = 10
): Promise<OrganizationActivityResult> {
  if (ticketIds.length === 0) return { status: "ready", events: [] };

  const supabase = getSupabaseBrowserClient();

  const { data: rows, error } = await supabase
    .from("ticket_activity")
    .select("id, ticket_id, actor_profile_id, event_type, old_value, new_value, created_at")
    .in("ticket_id", ticketIds)
    .order("created_at", { ascending: false })
    .limit(ORG_ACTIVITY_RAW_FETCH_LIMIT)
    .returns<OrgActivityRawRow[]>();

  if (error) {
    logDev("organization activity query failed", error);
    return { status: "error", message: error.message };
  }

  const relevant = (rows ?? []).filter(isRelevantOrgActivityRow).slice(0, limit);

  const profileIds = new Set<string>();
  for (const row of relevant) {
    if (row.actor_profile_id) profileIds.add(row.actor_profile_id);
    if (row.event_type === "assignee_changed" && row.new_value) profileIds.add(row.new_value);
  }
  const profilesById = await loadProfilesByIds(supabase, Array.from(profileIds));

  const events: OrganizationActivityEvent[] = relevant.map((row) => {
    const actor = row.actor_profile_id ? profilesById.get(row.actor_profile_id) : undefined;
    const base = {
      id: row.id,
      actorName: resolveProfileName(actor),
      actorAvatar: (actor ? resolveAvatarUrl(actor.avatar_url, actor.updated_at) : null) ?? FALLBACK_AVATAR,
      ticketId: row.ticket_id,
      time: formatRelativeTime(row.created_at),
    };

    if (row.event_type === "status_changed") {
      return { ...base, type: row.new_value === "blocked" ? "blocked" : "completed" };
    }

    if (row.event_type === "hours_changed") {
      return { ...base, type: "hours", oldHours: row.old_value ?? undefined, newHours: row.new_value ?? undefined };
    }

    if (row.event_type === "assignee_changed") {
      const newAssignee = row.new_value ? profilesById.get(row.new_value) : undefined;
      return { ...base, type: "assigned", newAssigneeName: resolveProfileName(newAssignee) ?? "Unknown" };
    }

    // priority_changed
    const oldIdx = PRIORITY_VALUES.indexOf((row.old_value ?? "") as TicketPriority);
    const newIdx = PRIORITY_VALUES.indexOf((row.new_value ?? "") as TicketPriority);
    return {
      ...base,
      type: "priority",
      oldPriorityLabel: activityPriorityLabel(row.old_value),
      newPriorityLabel: activityPriorityLabel(row.new_value),
      // Lower index in PRIORITY_VALUES ("highest" first) means more urgent.
      priorityRaised: oldIdx !== -1 && newIdx !== -1 && newIdx < oldIdx,
    };
  });

  return { status: "ready", events };
}

// ── Member Dashboard reads ──────────────────────────────────────────────────
// (src/components/member-dashboard.tsx). Admin's and Project Lead's own
// dashboards are untouched.

export interface ProfileTimeEntry {
  ticketId: string;
  minutes: number;
}

export type ProfileLoggedTimeResult =
  | { status: "ready"; entries: ProfileTimeEntry[] }
  | { status: "error"; message: string };

// Real "time logged today" for one profile, across every ticket they have
// access to (not just tickets assigned to them — pairing/helping on someone
// else's ticket still counts). Grouping by project is left to the caller,
// which already has the ticket→project mapping from loadOrganizationTickets.
export async function loadProfileLoggedTimeForDate(
  profileId: string,
  workDate: string
): Promise<ProfileLoggedTimeResult> {
  const supabase = getSupabaseBrowserClient();

  const { data: rows, error } = await supabase
    .from("ticket_time_entries")
    .select("ticket_id, minutes")
    .eq("logged_by", profileId)
    .eq("work_date", workDate)
    .returns<{ ticket_id: string; minutes: number }[]>();

  if (error) {
    logDev("profile logged time query failed", error);
    return { status: "error", message: error.message };
  }

  return {
    status: "ready",
    entries: (rows ?? []).map((row) => ({ ticketId: row.ticket_id, minutes: row.minutes })),
  };
}

export type ProfileLoggedMinutesResult =
  | { status: "ready"; totalMinutes: number }
  | { status: "error"; message: string };

// Real total minutes logged by one profile within an inclusive ISO date
// range (yyyy-mm-dd) — backs the Member Dashboard's "Remaining This Week"
// (Weekly Capacity minus this week's real logged hours). Same "every ticket
// they have access to, not just their own assignments" scope as
// loadProfileLoggedTimeForDate above, just totaled server-side instead of
// returned per-entry since no per-project breakdown is needed here.
export async function loadProfileLoggedMinutesForRange(
  profileId: string,
  startDate: string,
  endDate: string
): Promise<ProfileLoggedMinutesResult> {
  const supabase = getSupabaseBrowserClient();

  const { data: rows, error } = await supabase
    .from("ticket_time_entries")
    .select("minutes")
    .eq("logged_by", profileId)
    .gte("work_date", startDate)
    .lte("work_date", endDate)
    .returns<{ minutes: number }[]>();

  if (error) {
    logDev("profile logged minutes range query failed", error);
    return { status: "error", message: error.message };
  }

  const totalMinutes = (rows ?? []).reduce((sum, row) => sum + row.minutes, 0);
  return { status: "ready", totalMinutes };
}

export interface OrganizationTimeEntry {
  ticketId: string;
  loggedBy: string | null;
  minutes: number;
}

export type OrganizationLoggedTimeResult =
  | { status: "ready"; entries: OrganizationTimeEntry[] }
  | { status: "error"; message: string };

// Real per-ticket, per-logger time entries within an inclusive ISO date
// range — backs Admin Reports' "Hours by Person" table (Completed/Blocked
// need to know not just how many minutes were logged, but by whom and on
// which ticket, not just a single aggregate like loadOrganizationLoggedMinutes
// above). Grouping by person/ticket is left to the caller.
export async function loadOrganizationLoggedTimeForRange(
  ticketIds: string[],
  startDate: string,
  endDate: string
): Promise<OrganizationLoggedTimeResult> {
  if (ticketIds.length === 0) return { status: "ready", entries: [] };

  const supabase = getSupabaseBrowserClient();

  const { data: rows, error } = await supabase
    .from("ticket_time_entries")
    .select("ticket_id, logged_by, minutes")
    .in("ticket_id", ticketIds)
    .gte("work_date", startDate)
    .lte("work_date", endDate)
    .returns<{ ticket_id: string; logged_by: string | null; minutes: number }[]>();

  if (error) {
    logDev("organization logged time range query failed", error);
    return { status: "error", message: error.message };
  }

  return {
    status: "ready",
    entries: (rows ?? []).map((row) => ({ ticketId: row.ticket_id, loggedBy: row.logged_by, minutes: row.minutes })),
  };
}

export type MemberAttentionEventType = "blocked" | "reassigned" | "review" | "estimate";

export interface MemberAttentionEvent {
  id: string;
  type: MemberAttentionEventType;
  actorName: string | null;
  ticketId: string;
  time: string;
  oldHours?: string;
  newHours?: string;
}

export type MemberAttentionResult =
  | { status: "ready"; events: MemberAttentionEvent[] }
  | { status: "error"; message: string };

// The real "Needs Your Attention" feed — the subset of ticket_activity on
// this member's own active tickets that asks them to actually do something:
// one of their tickets got blocked, was reassigned to them, moved into
// review, or had its estimate change. No @mention-detection exists in this
// schema (comments aren't parsed), so that mock category is simply never
// populated here — never fabricated.
export async function loadMemberAttentionEvents(
  ticketIds: string[],
  profileId: string,
  limit = 10
): Promise<MemberAttentionResult> {
  if (ticketIds.length === 0) return { status: "ready", events: [] };

  const supabase = getSupabaseBrowserClient();

  const { data: rows, error } = await supabase
    .from("ticket_activity")
    .select("id, ticket_id, actor_profile_id, event_type, old_value, new_value, created_at")
    .in("ticket_id", ticketIds)
    .order("created_at", { ascending: false })
    .limit(ORG_ACTIVITY_RAW_FETCH_LIMIT)
    .returns<OrgActivityRawRow[]>();

  if (error) {
    logDev("member attention activity query failed", error);
    return { status: "error", message: error.message };
  }

  const relevant: { row: OrgActivityRawRow; type: MemberAttentionEventType }[] = [];
  for (const row of rows ?? []) {
    if (relevant.length >= limit) break;
    if (row.event_type === "status_changed" && row.new_value === "blocked") {
      relevant.push({ row, type: "blocked" });
    } else if (row.event_type === "status_changed" && row.new_value === "review") {
      relevant.push({ row, type: "review" });
    } else if (row.event_type === "assignee_changed" && row.new_value === profileId) {
      relevant.push({ row, type: "reassigned" });
    } else if (row.event_type === "hours_changed" && row.old_value && row.new_value) {
      relevant.push({ row, type: "estimate" });
    }
  }

  const actorIds = Array.from(
    new Set(relevant.map((r) => r.row.actor_profile_id).filter((id): id is string => Boolean(id)))
  );
  const actorsById = await loadProfilesByIds(supabase, actorIds);

  const events: MemberAttentionEvent[] = relevant.map(({ row, type }) => {
    const actor = row.actor_profile_id ? actorsById.get(row.actor_profile_id) : undefined;
    return {
      id: row.id,
      type,
      actorName: resolveProfileName(actor),
      ticketId: row.ticket_id,
      time: formatRelativeTime(row.created_at),
      oldHours: type === "estimate" ? row.old_value ?? undefined : undefined,
      newHours: type === "estimate" ? row.new_value ?? undefined : undefined,
    };
  });

  return { status: "ready", events };
}

export interface HoursOrAssigneeActivityEvent {
  ticketId: string;
  eventType: "hours_changed" | "assignee_changed";
  oldValue: string | null;
  newValue: string | null;
}

export type HoursOrAssigneeActivityResult =
  | { status: "ready"; events: HoursOrAssigneeActivityEvent[] }
  | { status: "error"; message: string };

// Real hours_changed/assignee_changed ticket_activity rows within an
// inclusive-start/exclusive-end timestamp range — backs Admin Reports'
// Workload "variación de esta semana" (the real net change in a person's
// assigned estimated hours during the current calendar week). Unlike
// loadOrganizationActivity above (curated to a handful of event types and
// capped for the Recent Activity widget's small display limit), this
// returns every matching row in the range uncapped, since a weekly sum
// can't silently drop events past a display limit.
export async function loadHoursAndAssigneeActivityForRange(
  ticketIds: string[],
  startISO: string,
  endExclusiveISO: string
): Promise<HoursOrAssigneeActivityResult> {
  if (ticketIds.length === 0) return { status: "ready", events: [] };

  const supabase = getSupabaseBrowserClient();

  const { data: rows, error } = await supabase
    .from("ticket_activity")
    .select("ticket_id, event_type, old_value, new_value")
    .in("ticket_id", ticketIds)
    .in("event_type", ["hours_changed", "assignee_changed"])
    .gte("created_at", startISO)
    .lt("created_at", endExclusiveISO)
    .returns<{ ticket_id: string; event_type: string; old_value: string | null; new_value: string | null }[]>();

  if (error) {
    logDev("hours/assignee activity range query failed", error);
    return { status: "error", message: error.message };
  }

  return {
    status: "ready",
    events: (rows ?? []).map((row) => ({
      ticketId: row.ticket_id,
      eventType: row.event_type as "hours_changed" | "assignee_changed",
      oldValue: row.old_value,
      newValue: row.new_value,
    })),
  };
}

export interface DeliveryActivityEvent {
  id: string;
  ticketId: string;
  actorId: string | null;
  actorName: string | null;
  actorAvatar: string;
  eventType: string;
  fieldName: string | null;
  oldValue: string | null;
  newValue: string | null;
  createdAt: string;
}

export type DeliveryActivityResult =
  | { status: "ready"; events: DeliveryActivityEvent[] }
  | { status: "error"; message: string };

// The subset of real ticket_activity event types that matter for delivery
// tracking (Admin Reports' "Recent Changes") — deliberately excludes
// title/description edits, labels, acceptance criteria, attachments, time
// entries, and comments, which are real too but low-value for this widget.
const DELIVERY_ACTIVITY_EVENT_TYPES = [
  "ticket_created",
  "status_changed",
  "assignee_changed",
  "hours_changed",
  "priority_changed",
  "due_date_changed",
  "relation_added",
  "relation_removed",
];

const DELIVERY_ACTIVITY_FETCH_LIMIT = 100;

// Real, uncurated delivery-relevant activity rows across a ticket set, most
// recent first — the caller (reports-screen.tsx) resolves each row against
// the tickets already in its own filtered scope, builds the display text,
// and dedupes relation_added/relation_removed's own two-rows-per-action
// shape. Reuses the same profile-resolution helpers as the rest of this
// file rather than a new lookup mechanism.
export async function loadDeliveryActivityForTickets(ticketIds: string[]): Promise<DeliveryActivityResult> {
  if (ticketIds.length === 0) return { status: "ready", events: [] };

  const supabase = getSupabaseBrowserClient();

  const { data: rows, error } = await supabase
    .from("ticket_activity")
    .select("id, ticket_id, actor_profile_id, event_type, field_name, old_value, new_value, created_at")
    .in("ticket_id", ticketIds)
    .in("event_type", DELIVERY_ACTIVITY_EVENT_TYPES)
    .order("created_at", { ascending: false })
    .limit(DELIVERY_ACTIVITY_FETCH_LIMIT)
    .returns<
      {
        id: string;
        ticket_id: string;
        actor_profile_id: string | null;
        event_type: string;
        field_name: string | null;
        old_value: string | null;
        new_value: string | null;
        created_at: string;
      }[]
    >();

  if (error) {
    logDev("delivery activity query failed", error);
    return { status: "error", message: error.message };
  }

  const actorIds = Array.from(
    new Set((rows ?? []).map((row) => row.actor_profile_id).filter((id): id is string => Boolean(id)))
  );
  const actorsById = await loadProfilesByIds(supabase, actorIds);

  const events: DeliveryActivityEvent[] = (rows ?? []).map((row) => {
    const actor = row.actor_profile_id ? actorsById.get(row.actor_profile_id) : undefined;
    return {
      id: row.id,
      ticketId: row.ticket_id,
      actorId: row.actor_profile_id,
      actorName: resolveProfileName(actor),
      actorAvatar: (actor ? resolveAvatarUrl(actor.avatar_url, actor.updated_at) : null) ?? FALLBACK_AVATAR,
      eventType: row.event_type,
      fieldName: row.field_name,
      oldValue: row.old_value,
      newValue: row.new_value,
      createdAt: row.created_at,
    };
  });

  return { status: "ready", events };
}
