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

const STATUS_FROM_DB: Record<string, TicketStatus> = {
  backlog: "backlog",
  to_do: "to-do",
  in_progress: "in-progress",
  review: "review",
  blocked: "blocked",
  done: "done",
};

const PRIORITY_VALUES: TicketPriority[] = ["high", "normal", "low"];

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
}

interface AssigneeProfileRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  updated_at: string;
}

const TICKET_COLUMNS =
  "id, ticket_number, title, description, status, priority, type, assignee_profile_id, milestone, labels, acceptance_criteria, acceptance_criteria_done, story_points, hours, due_date, updated_at";

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
// prefix — used for Comments/Activity in the Ticket Preview Drawer, which
// render their own leading text ("· 3 days ago") instead of that prefix.
function formatRelativeTime(isoTimestamp: string): string {
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
    priority: PRIORITY_VALUES.includes(row.priority as TicketPriority) ? (row.priority as TicketPriority) : "normal",
    type: TYPE_FROM_DB[row.type] ?? "TASK",
    assignee: {
      name: assigneeName,
      avatar: (assigneeRow ? resolveAvatarUrl(assigneeRow.avatar_url, assigneeRow.updated_at) : null) ?? FALLBACK_AVATAR,
    },
    milestone: row.milestone ?? "No Milestone",
    labels: row.labels ?? [],
    acceptanceCriteria: row.acceptance_criteria && row.acceptance_criteria.length > 0 ? row.acceptance_criteria : undefined,
    acceptanceCriteriaDone: row.acceptance_criteria_done ?? [],
    storyPoints: row.story_points ?? undefined,
    hours: row.hours !== null ? Number(row.hours) : undefined,
    dueDate: formatDueDate(row.due_date),
    updatedAt: formatTicketUpdatedAt(row.updated_at),
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
      priority: "normal",
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
  backlog: "Inbox",
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
  high: "High",
  normal: "Normal",
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
    case "time_logged": {
      const minutes = Number(row.new_value ?? "0");
      const hrs = Math.round((minutes / 60) * 10) / 10;
      return `${who}logged ${hrs} h`.trim();
    }
    case "added_a_comment":
      return `${who}added a comment`.trim();
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

// ── Attachments (Ticket Detail) ─────────────────────────────────────────────────
// Real Supabase Storage + a ticket_attachments metadata row per file — the
// section previously only simulated an upload locally (fake progress,
// nothing persisted). Rename/replace/delete still aren't wired to any real
// write path (no UI exists for them to call), matching this fix's scope.

const ATTACHMENTS_BUCKET = "ticket-attachments";

export interface TicketAttachment {
  id: string;
  filename: string;
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
