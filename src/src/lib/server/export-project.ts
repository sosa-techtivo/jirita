// Backend export engine for a single Project. Builds one in-memory object
// containing every row needed to later reconstruct the project as a new
// project — nothing else. No UI, no file writes, no Storage access, no
// compression, no serialization, and no restoration: this module only ever
// returns a plain JS object built from Supabase reads.
//
// Scope is exactly the 11 tables identified as "project data" in the prior
// schema audit (organizations/projects/tickets... relationship review):
// projects, project_memberships, ticket_statuses, tickets, ticket_comments,
// ticket_activity, ticket_time_entries, ticket_attachments (metadata only),
// ticket_relations, project_notes, project_note_activity.
//
// Every row is a raw, unmapped copy of its table — snake_case, exactly as
// stored — not the camelCase DTOs the UI layer (lib/projects.ts,
// lib/tickets.ts, lib/notes.ts) maps to. A future restore needs the real
// column shape, not a UI-trimmed one, so every query below selects "*"
// rather than reusing those modules' curated *_COLUMNS constants.
//
// Deliberately never queried here: auth.*, profiles, organizations,
// notifications, project_repository_connections (GitHub OAuth + encrypted
// tokens). Foreign keys that point at profiles (assignee_profile_id,
// author_profile_id, uploaded_by, logged_by, created_by, actor_profile_id,
// owner_profile_id, connected_by_profile_id-style columns, etc.) are kept as
// raw ids on every row below — resolving them to real people in a
// destination workspace is a restore-time concern this engine doesn't
// decide. Storage is never touched: ticket_attachments rows keep their
// storage_path string as plain metadata, no object is ever read.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function getAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL.");
  if (!serviceRoleKey) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY.");
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// PostgREST's own per-request row cap — every multi-row fetch below pages
// past it explicitly, so a project with more than 1000 tickets/activity
// rows/time entries is never silently truncated.
const PAGE_SIZE = 1000;

// Keeps `.in(...)`/`.or(...)` filter URLs from growing unbounded on a
// project with a very large ticket set.
const ID_CHUNK_SIZE = 200;

// ── Raw row shapes (snake_case, mirrors the live schema exactly) ───────────

export interface ExportedProjectRow {
  id: string;
  organization_id: string;
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
  unfuddle_id: string | null;
  unfuddle_imported_at: string | null;
  repository_provider: string | null;
  repository_url: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExportedProjectMembershipRow {
  id: string;
  project_id: string;
  profile_id: string;
  title: string | null;
  weekly_capacity: number | null;
  project_role: "lead" | "member";
  created_at: string;
}

export interface ExportedTicketStatusRow {
  id: string;
  project_id: string;
  name: string;
  sort_order: number;
  legacy_enum_value: string | null;
  created_at: string;
}

export interface ExportedTicketRow {
  id: string;
  project_id: string;
  ticket_number: number;
  title: string;
  description: string | null;
  status: string;
  /** Only present when the (paused, not-yet-live) per-project ticket-statuses
   *  schema is available — see detectStatusSchemaAvailable below. Absent
   *  entirely under the legacy schema, never a fabricated/derived value. */
  status_id?: string;
  priority: string;
  type: string;
  assignee_profile_id: string | null;
  milestone: string | null;
  labels: string[];
  acceptance_criteria: string[] | null;
  acceptance_criteria_done: boolean[];
  story_points: number | null;
  hours: number | null;
  due_date: string | null;
  unfuddle_id: string | null;
  unfuddle_imported_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExportedTicketCommentRow {
  id: string;
  ticket_id: string;
  author_profile_id: string | null;
  body: string;
  unfuddle_id: string | null;
  unfuddle_imported_at: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface ExportedTicketActivityRow {
  id: string;
  ticket_id: string;
  actor_profile_id: string | null;
  event_type: string;
  payload: Record<string, unknown> | null;
  field_name: string | null;
  old_value: string | null;
  new_value: string | null;
  created_at: string;
}

export interface ExportedTicketTimeEntryRow {
  id: string;
  ticket_id: string;
  logged_by: string | null;
  minutes: number;
  work_date: string;
  comment: string | null;
  unfuddle_id: string | null;
  updated_at: string | null;
  created_at: string;
}

// Metadata only — storage_path is kept as a plain string reference to the
// object's key in the `ticket-attachments` bucket; this engine never calls
// Supabase Storage, so no file bytes are ever read or held in memory.
export interface ExportedTicketAttachmentRow {
  id: string;
  ticket_id: string;
  storage_path: string;
  filename: string;
  size_bytes: number;
  mime_type: string | null;
  uploaded_by: string | null;
  comment_id: string | null;
  unfuddle_id: string | null;
  updated_at: string | null;
  created_at: string;
}

export interface ExportedTicketRelationRow {
  id: string;
  ticket_id: string;
  related_ticket_id: string;
  kind: "related_to" | "blocks" | "duplicates";
  created_by: string | null;
  unfuddle_relation_key: string | null;
  created_at: string;
}

export interface ExportedProjectNoteRow {
  id: string;
  project_id: string;
  title: string;
  content: string;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExportedProjectNoteActivityRow {
  id: string;
  project_id: string;
  note_id: string | null;
  note_title: string;
  actor_profile_id: string | null;
  event_type: string;
  field_name: string | null;
  old_value: string | null;
  new_value: string | null;
  created_at: string;
}

export interface ExportedProjectSummary {
  members: number;
  statuses: number;
  tickets: number;
  comments: number;
  activity: number;
  timeEntries: number;
  attachments: number;
  relations: number;
  notes: number;
  noteActivity: number;
}

export interface ExportedProjectData {
  /** Wall-clock time this snapshot was built, ISO 8601 — not a project column. */
  exportedAt: string;
  project: ExportedProjectRow;
  members: ExportedProjectMembershipRow[];
  statuses: ExportedTicketStatusRow[];
  tickets: ExportedTicketRow[];
  comments: ExportedTicketCommentRow[];
  activity: ExportedTicketActivityRow[];
  timeEntries: ExportedTicketTimeEntryRow[];
  attachments: ExportedTicketAttachmentRow[];
  relations: ExportedTicketRelationRow[];
  notes: ExportedProjectNoteRow[];
  noteActivity: ExportedProjectNoteActivityRow[];
  /** Row counts for each collection above — same keys, no other data. */
  summary: ExportedProjectSummary;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// Pages a `.select("*").eq(column, value)` query past PAGE_SIZE.
async function fetchAllByEq<T>(client: SupabaseClient, table: string, column: string, value: string): Promise<T[]> {
  const rows: T[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await client
      .from(table)
      .select("*")
      .eq(column, value)
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`[exportProject] Failed reading "${table}": ${error.message}`);
    const page = (data ?? []) as T[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return rows;
}

// Pages a `.select("*").in(column, values)` query past both PAGE_SIZE and
// ID_CHUNK_SIZE (chunking `values` first, then paging each chunk).
async function fetchAllByIn<T>(client: SupabaseClient, table: string, column: string, values: string[]): Promise<T[]> {
  if (values.length === 0) return [];
  const rows: T[] = [];
  for (const idChunk of chunk(values, ID_CHUNK_SIZE)) {
    let from = 0;
    for (;;) {
      const { data, error } = await client
        .from(table)
        .select("*")
        .in(column, idChunk)
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw new Error(`[exportProject] Failed reading "${table}": ${error.message}`);
      const page = (data ?? []) as T[];
      rows.push(...page);
      if (page.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }
  }
  return rows;
}

// ticket_relations has no DB-level constraint forcing both sides of a
// relation into the same project (see the schema audit's risk #5) — so a
// relation touching one of this project's tickets could, in principle, have
// its *other* id on either side. Matching against both ticket_id and
// related_ticket_id (per chunk) and de-duplicating by row id is what makes
// this fetch — and the cross-project validation below — exhaustive rather
// than only catching leaks in one direction.
async function fetchAllTicketRelations(client: SupabaseClient, ticketIds: string[]): Promise<ExportedTicketRelationRow[]> {
  if (ticketIds.length === 0) return [];
  const byId = new Map<string, ExportedTicketRelationRow>();
  for (const idChunk of chunk(ticketIds, ID_CHUNK_SIZE)) {
    const inList = idChunk.join(",");
    let from = 0;
    for (;;) {
      const { data, error } = await client
        .from("ticket_relations")
        .select("*")
        .or(`ticket_id.in.(${inList}),related_ticket_id.in.(${inList})`)
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw new Error(`[exportProject] Failed reading "ticket_relations": ${error.message}`);
      const page = (data ?? []) as ExportedTicketRelationRow[];
      for (const row of page) byId.set(row.id, row);
      if (page.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }
  }
  return Array.from(byId.values());
}

// Detects whether the per-project ticket-statuses schema — the
// `ticket_statuses` table and `tickets.status_id` column added together,
// atomically, by 20260830000000_add_per_project_ticket_statuses.sql — is
// actually available in this environment. That migration is paused and not
// applied to production, so this must never be assumed.
//
// PostgREST doesn't expose information_schema/pg_catalog through its REST
// API (only tables in the exposed "public" schema are queryable at all), so
// there is no true schema-introspection call available here without adding
// a new RPC/migration — out of scope for this fix. The next best signal
// Supabase's own client actually gives is PostgREST's structured error
// code: PGRST205 specifically means "this relation isn't in the schema
// cache" (confirmed live against this project's own Supabase instance —
// see the response accompanying this change), as opposed to any other
// error, which is re-thrown rather than silently treated as "legacy
// schema". This is a single, minimal, read-only probe — never a write,
// never a migration, and the two paused-schema columns/table are always
// applied together by that one migration, so checking for `ticket_statuses`
// alone is a reliable proxy for `tickets.status_id` as well.
async function detectStatusSchemaAvailable(client: SupabaseClient): Promise<boolean> {
  const { error } = await client.from("ticket_statuses").select("id").limit(1);
  if (!error) return true;
  if (error.code === "PGRST205") return false;
  throw new Error(`[exportProject] Failed probing "ticket_statuses" availability: ${error.message}`);
}

export async function exportProject(projectId: string): Promise<ExportedProjectData> {
  const client = getAdminClient();

  // ── Validation: project must actually exist ────────────────────────────
  const { data: projectRow, error: projectError } = await client
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .maybeSingle<ExportedProjectRow>();
  if (projectError) throw new Error(`[exportProject] Failed reading "projects": ${projectError.message}`);
  if (!projectRow) throw new Error(`[exportProject] No project found with id "${projectId}".`);

  const statusSchemaAvailable = await detectStatusSchemaAvailable(client);

  const [members, statuses, tickets, notes] = await Promise.all([
    fetchAllByEq<ExportedProjectMembershipRow>(client, "project_memberships", "project_id", projectId),
    // Never queried at all under the legacy schema — not just tolerated as
    // a failure — so no PGRST205 error is ever surfaced from this
    // project-scoped call, and no row is ever fabricated in its place.
    statusSchemaAvailable
      ? fetchAllByEq<ExportedTicketStatusRow>(client, "ticket_statuses", "project_id", projectId)
      : Promise.resolve<ExportedTicketStatusRow[]>([]),
    fetchAllByEq<ExportedTicketRow>(client, "tickets", "project_id", projectId),
    fetchAllByEq<ExportedProjectNoteRow>(client, "project_notes", "project_id", projectId),
  ]);

  const ticketIds = tickets.map((t) => t.id);
  const noteIds = new Set(notes.map((n) => n.id));

  const [comments, activity, timeEntries, attachments, relations, noteActivity] = await Promise.all([
    fetchAllByIn<ExportedTicketCommentRow>(client, "ticket_comments", "ticket_id", ticketIds),
    fetchAllByIn<ExportedTicketActivityRow>(client, "ticket_activity", "ticket_id", ticketIds),
    fetchAllByIn<ExportedTicketTimeEntryRow>(client, "ticket_time_entries", "ticket_id", ticketIds),
    fetchAllByIn<ExportedTicketAttachmentRow>(client, "ticket_attachments", "ticket_id", ticketIds),
    fetchAllTicketRelations(client, ticketIds),
    fetchAllByEq<ExportedProjectNoteActivityRow>(client, "project_note_activity", "project_id", projectId),
  ]);

  // ── Validation: referential integrity of what was just fetched ─────────
  // Defensive re-checks on top of the query filters above — surface a
  // corrupted/inconsistent source project loudly instead of silently
  // exporting an incomplete or cross-project-contaminated snapshot.

  const ticketIdSet = new Set(ticketIds);
  const statusIdSet = new Set(statuses.map((s) => s.id));

  // Under the legacy schema, an empty `statuses` array is the correct,
  // expected shape (see statusSchemaAvailable above) — only a genuine
  // per-project schema with zero rows for this project is an integrity
  // problem worth failing loudly on.
  if (statusSchemaAvailable && statuses.length === 0) {
    throw new Error(`[exportProject] Project ${projectId} has no ticket_statuses rows — cannot export a restorable snapshot.`);
  }

  for (const t of tickets) {
    if (t.project_id !== projectId) {
      throw new Error(`[exportProject] Ticket ${t.id} returned for project ${projectId} actually belongs to project ${t.project_id}.`);
    }
    // status_id only exists to validate once the per-project schema is
    // actually live — under the legacy schema the column doesn't exist at
    // all, so t.status_id is simply absent, never a value to check.
    if (statusSchemaAvailable && (!t.status_id || !statusIdSet.has(t.status_id))) {
      throw new Error(
        `[exportProject] Ticket ${t.id} has status_id ${t.status_id ?? "null"}, which is not among this project's exported ticket_statuses.`
      );
    }
  }

  for (const r of relations) {
    if (!ticketIdSet.has(r.ticket_id) || !ticketIdSet.has(r.related_ticket_id)) {
      throw new Error(
        `[exportProject] ticket_relations row ${r.id} links ticket ${r.ticket_id} to ${r.related_ticket_id} — at least one side is outside project ${projectId}'s ticket set (cross-project relation).`
      );
    }
  }

  for (const n of noteActivity) {
    if (n.note_id !== null && !noteIds.has(n.note_id)) {
      throw new Error(
        `[exportProject] project_note_activity row ${n.id} references note ${n.note_id}, which is not among this project's exported notes.`
      );
    }
  }

  for (const m of members) {
    if (m.project_id !== projectId) {
      throw new Error(`[exportProject] project_memberships row ${m.id} returned for project ${projectId} actually belongs to project ${m.project_id}.`);
    }
  }

  return {
    exportedAt: new Date().toISOString(),
    project: projectRow,
    members,
    statuses,
    tickets,
    comments,
    activity,
    timeEntries,
    attachments,
    relations,
    notes,
    noteActivity,
    summary: {
      members: members.length,
      statuses: statuses.length,
      tickets: tickets.length,
      comments: comments.length,
      activity: activity.length,
      timeEntries: timeEntries.length,
      attachments: attachments.length,
      relations: relations.length,
      notes: notes.length,
      noteActivity: noteActivity.length,
    },
  };
}
