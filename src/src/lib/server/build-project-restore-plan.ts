// Third layer of the project-backup IMPORTER: turns a validated backup
// (parseProjectBackupZip()) plus its preview (previewProjectRestore()) into
// a complete, ready-to-execute restore plan — new ids for every row, every
// internal reference rewritten to point at those new ids, every profile
// reference resolved through a caller-supplied mapping. Pure, synchronous,
// in-memory: no ZIP re-read, no Supabase query, no Storage access, no disk
// I/O, no project/ticket/file creation. Those are all later layers.
//
// Profile-reference column nullability was re-audited directly against the
// live migrations (`grep -n "not null\|references public.profiles"
// supabase/migrations/*.sql`) rather than assumed. Across the 12 backup
// tables this module touches, exactly one profile-reference column is
// NOT NULL: `project_memberships.profile_id` (20260708000000_mvp_schema.sql
// line 138). Every other one (`projects.owner_profile_id`,
// `projects.created_by`, `tickets.assignee_profile_id`,
// `tickets.created_by`, `ticket_comments.author_profile_id`,
// `ticket_activity.actor_profile_id`, `ticket_time_entries.logged_by`,
// `ticket_attachments.uploaded_by`, `ticket_relations.created_by`,
// `project_notes.created_by`, `project_notes.updated_by`,
// `project_note_activity.actor_profile_id`) is `references ... on delete
// set null`, i.e. nullable — matching every `Exported*Row` type's own
// `string | null` typing in export-project.ts.

import { randomUUID } from "node:crypto";
import type {
  ExportedProjectRow,
  ExportedProjectMembershipRow,
  ExportedTicketStatusRow,
  ExportedTicketRow,
  ExportedTicketCommentRow,
  ExportedTicketActivityRow,
  ExportedTicketTimeEntryRow,
  ExportedTicketAttachmentRow,
  ExportedTicketRelationRow,
  ExportedProjectNoteRow,
  ExportedProjectNoteActivityRow,
} from "./export-project";
import type { ParsedProjectBackup } from "./parse-project-backup-zip";
import type { ProjectRestorePreview } from "./preview-project-restore";

// ── Structured error ────────────────────────────────────────────────────────

export class ProjectRestorePlanError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super(`Cannot build a restore plan (${issues.length} issue(s)):\n- ${issues.join("\n- ")}`);
    this.name = "ProjectRestorePlanError";
    this.issues = issues;
  }
}

// ── Options ──────────────────────────────────────────────────────────────────

export interface ProjectRestorePlanOptions {
  destinationOrganizationId: string;
  projectName: string;
  projectSlug: string;
  projectCode: string;
  /** Source profile id -> destination profile id, or null to leave unattributed.
   *  Never inferred/guessed here — a missing key is treated exactly like an
   *  explicit `null` (see resolveProfileRef). */
  profileMappings: Record<string, string | null>;
}

// ── Planned row shapes ──────────────────────────────────────────────────────
// Structurally identical to the corresponding Exported*Row (same columns,
// same nullability) — new *values*, not a new shape — except
// PlannedTicketAttachmentRow, which adds sourceStoragePath (requirement 10).
// Named distinctly so this module's public contract doesn't silently drift
// if export-project.ts's own types ever change for unrelated reasons.

export type PlannedProjectRow = ExportedProjectRow;
export type PlannedTicketStatusRow = ExportedTicketStatusRow;
export type PlannedProjectMembershipRow = ExportedProjectMembershipRow;
export type PlannedTicketRow = ExportedTicketRow;
export type PlannedTicketCommentRow = ExportedTicketCommentRow;
export type PlannedTicketActivityRow = ExportedTicketActivityRow;
export type PlannedTicketTimeEntryRow = ExportedTicketTimeEntryRow;
export type PlannedTicketRelationRow = ExportedTicketRelationRow;
export type PlannedProjectNoteRow = ExportedProjectNoteRow;
export type PlannedProjectNoteActivityRow = ExportedProjectNoteActivityRow;

export interface PlannedTicketAttachmentRow extends ExportedTicketAttachmentRow {
  /** The original storage_path from the backup — not a live Storage
   *  object, just a pointer for a future copy stage. Never read/written by
   *  this function. */
  sourceStoragePath: string;
  /** The attachment's physical bytes, straight from
   *  ParsedProjectBackup.attachmentFiles — null when the source backup
   *  didn't include physical files at all (parsedBackup.attachmentsIncluded
   *  is false). Exposed only for a future restore-execution stage to
   *  upload; never read, copied, or uploaded by this function itself. */
  sourceBytes: Uint8Array | null;
}

// ── Id maps ──────────────────────────────────────────────────────────────────

export interface ProjectRestoreIdMaps {
  projectIdMap: Record<string, string>;
  statusIdMap: Record<string, string>;
  ticketIdMap: Record<string, string>;
  commentIdMap: Record<string, string>;
  activityIdMap: Record<string, string>;
  timeEntryIdMap: Record<string, string>;
  attachmentIdMap: Record<string, string>;
  relationIdMap: Record<string, string>;
  noteIdMap: Record<string, string>;
  noteActivityIdMap: Record<string, string>;
  membershipIdMap: Record<string, string>;
}

export interface ProjectRestorePlan extends ProjectRestoreIdMaps {
  /** Pass-through of ParsedProjectBackup.attachmentsIncluded — true only
   *  when every planned attachment's sourceBytes is real (non-null). */
  attachmentsIncluded: boolean;
  project: PlannedProjectRow;
  statuses: PlannedTicketStatusRow[];
  members: PlannedProjectMembershipRow[];
  tickets: PlannedTicketRow[];
  comments: PlannedTicketCommentRow[];
  activity: PlannedTicketActivityRow[];
  timeEntries: PlannedTicketTimeEntryRow[];
  attachments: PlannedTicketAttachmentRow[];
  relations: PlannedTicketRelationRow[];
  notes: PlannedProjectNoteRow[];
  noteActivity: PlannedProjectNoteActivityRow[];
}

// ── Profile resolution ───────────────────────────────────────────────────────

// A missing key is treated exactly like an explicit `null` mapping in both
// branches below — the caller (a future UI, informed by
// preview.profileReferences) decides every mapping explicitly; nothing here
// ever falls back to "map it to itself" or to the current user.
function resolveProfileRef(
  originalId: string | null,
  required: boolean,
  fieldLabel: string,
  profileMappings: Record<string, string | null>,
  blockingIssues: string[]
): string | null {
  if (originalId === null) return null;

  const hasMapping = Object.prototype.hasOwnProperty.call(profileMappings, originalId);
  const mapped = hasMapping ? profileMappings[originalId] : null;

  if (mapped === null) {
    if (required) {
      blockingIssues.push(
        `${fieldLabel}: source profile "${originalId}" has no destination mapping (or is mapped to null), but this column does not allow null.`
      );
    }
    return null;
  }
  return mapped;
}

// ── Entry point ──────────────────────────────────────────────────────────────

export function buildProjectRestorePlan(
  parsedBackup: ParsedProjectBackup,
  preview: ProjectRestorePreview,
  options: ProjectRestorePlanOptions
): ProjectRestorePlan {
  // ── Preconditions (requirement 12) — fail fast, before building anything ──
  const preconditionIssues: string[] = [];
  if (!preview.canRestore) {
    preconditionIssues.push("preview.canRestore is false — this backup/organization pair cannot be restored yet.");
  }
  if (preview.destinationOrganizationId !== options.destinationOrganizationId) {
    preconditionIssues.push(
      `options.destinationOrganizationId ("${options.destinationOrganizationId}") does not match preview.destinationOrganizationId ("${preview.destinationOrganizationId}").`
    );
  }
  if (parsedBackup.project.id !== preview.sourceProject.id) {
    preconditionIssues.push(
      `parsedBackup.project.id ("${parsedBackup.project.id}") does not match preview.sourceProject.id ("${preview.sourceProject.id}") — parsedBackup and preview must come from the same backup.`
    );
  }
  if (typeof options.projectSlug !== "string" || options.projectSlug.trim() === "") {
    preconditionIssues.push("options.projectSlug must be a non-empty string.");
  }
  if (typeof options.projectCode !== "string" || options.projectCode.trim() === "") {
    preconditionIssues.push("options.projectCode must be a non-empty string.");
  }
  if (preconditionIssues.length > 0) {
    throw new ProjectRestorePlanError(preconditionIssues);
  }

  const blockingIssues: string[] = [];
  const profileMappings = options.profileMappings;

  // ── project ────────────────────────────────────────────────────────────
  const newProjectId = randomUUID();
  const projectIdMap: Record<string, string> = { [parsedBackup.project.id]: newProjectId };

  const sourceProject = parsedBackup.project;
  const project: PlannedProjectRow = {
    ...sourceProject,
    id: newProjectId,
    organization_id: options.destinationOrganizationId,
    name: options.projectName,
    slug: options.projectSlug,
    project_code: options.projectCode,
    owner_profile_id: resolveProfileRef(sourceProject.owner_profile_id, false, "project.owner_profile_id", profileMappings, blockingIssues),
    created_by: resolveProfileRef(sourceProject.created_by, false, "project.created_by", profileMappings, blockingIssues),
    // Requirement 8: never carry a GitHub OAuth-era link into the restored
    // project — a future Connect GitHub has to be run again, same as
    // project_repository_connections.ts already requires on any
    // repository reconfiguration.
    repository_provider: null,
    repository_url: null,
    // created_at/updated_at intentionally preserved verbatim, not
    // refreshed to "now" — requirement 8's "no modificar fechas
    // históricas".
  };

  // ── statuses (only when the paused per-project schema is present) ───────
  const statusIdMap: Record<string, string> = {};
  const statuses: PlannedTicketStatusRow[] = parsedBackup.statuses.map((s) => {
    const newStatusId = randomUUID();
    statusIdMap[s.id] = newStatusId;
    return { ...s, id: newStatusId, project_id: newProjectId };
  });

  // ── members ───────────────────────────────────────────────────────────
  const membershipIdMap: Record<string, string> = {};
  const members: PlannedProjectMembershipRow[] = parsedBackup.members.map((m) => {
    const newMembershipId = randomUUID();
    membershipIdMap[m.id] = newMembershipId;
    // project_memberships.profile_id is the one NOT NULL profile column
    // among all 12 tables (see the audit note at the top of this file).
    const profileId = resolveProfileRef(m.profile_id, true, `members[${m.id}].profile_id`, profileMappings, blockingIssues);
    return {
      ...m,
      id: newMembershipId,
      project_id: newProjectId,
      // Cast is safe: a null here always means resolveProfileRef already
      // pushed a blocking issue above (required=true), so this row is
      // discarded (the whole call throws) before anyone reads this value.
      profile_id: (profileId ?? "") as string,
    };
  });

  // ── tickets ───────────────────────────────────────────────────────────
  const ticketIdMap: Record<string, string> = {};
  const tickets: PlannedTicketRow[] = parsedBackup.tickets.map((t) => {
    const newTicketId = randomUUID();
    ticketIdMap[t.id] = newTicketId;

    const planned: PlannedTicketRow = {
      ...t,
      id: newTicketId,
      project_id: newProjectId,
      // ticket_number, status (legacy), created_at, updated_at, due_date,
      // hours, story_points, etc. all pass through untouched via the
      // spread above — requirement 9.
      assignee_profile_id: resolveProfileRef(t.assignee_profile_id, false, `tickets[${t.id}].assignee_profile_id`, profileMappings, blockingIssues),
      created_by: resolveProfileRef(t.created_by, false, `tickets[${t.id}].created_by`, profileMappings, blockingIssues),
    };

    // Requirement 9: never invent a status_id for a legacy-schema ticket.
    if ("status_id" in t && t.status_id) {
      const mappedStatusId = statusIdMap[t.status_id];
      if (!mappedStatusId) {
        blockingIssues.push(`tickets[${t.id}].status_id "${t.status_id}" does not correspond to any row in statuses.json.`);
      } else {
        planned.status_id = mappedStatusId;
      }
    } else {
      delete planned.status_id;
    }

    return planned;
  });

  // ── comments ──────────────────────────────────────────────────────────
  const commentIdMap: Record<string, string> = {};
  const comments: PlannedTicketCommentRow[] = parsedBackup.comments.map((c) => {
    const newCommentId = randomUUID();
    commentIdMap[c.id] = newCommentId;
    const newTicketId = ticketIdMap[c.ticket_id];
    if (!newTicketId) {
      blockingIssues.push(`comments[${c.id}].ticket_id "${c.ticket_id}" was not found among the planned tickets.`);
    }
    return {
      ...c,
      id: newCommentId,
      ticket_id: newTicketId ?? c.ticket_id,
      author_profile_id: resolveProfileRef(c.author_profile_id, false, `comments[${c.id}].author_profile_id`, profileMappings, blockingIssues),
    };
  });

  // ── activity ──────────────────────────────────────────────────────────
  const activityIdMap: Record<string, string> = {};
  const activity: PlannedTicketActivityRow[] = parsedBackup.activity.map((a) => {
    const newActivityId = randomUUID();
    activityIdMap[a.id] = newActivityId;
    const newTicketId = ticketIdMap[a.ticket_id];
    if (!newTicketId) {
      blockingIssues.push(`activity[${a.id}].ticket_id "${a.ticket_id}" was not found among the planned tickets.`);
    }
    return {
      ...a,
      id: newActivityId,
      ticket_id: newTicketId ?? a.ticket_id,
      actor_profile_id: resolveProfileRef(a.actor_profile_id, false, `activity[${a.id}].actor_profile_id`, profileMappings, blockingIssues),
    };
  });

  // ── timeEntries ───────────────────────────────────────────────────────
  const timeEntryIdMap: Record<string, string> = {};
  const timeEntries: PlannedTicketTimeEntryRow[] = parsedBackup.timeEntries.map((te) => {
    const newTimeEntryId = randomUUID();
    timeEntryIdMap[te.id] = newTimeEntryId;
    const newTicketId = ticketIdMap[te.ticket_id];
    if (!newTicketId) {
      blockingIssues.push(`timeEntries[${te.id}].ticket_id "${te.ticket_id}" was not found among the planned tickets.`);
    }
    return {
      ...te,
      id: newTimeEntryId,
      ticket_id: newTicketId ?? te.ticket_id,
      logged_by: resolveProfileRef(te.logged_by, false, `timeEntries[${te.id}].logged_by`, profileMappings, blockingIssues),
    };
  });

  // ── attachments (metadata + a planned, not-yet-copied storage path) ──────
  const attachmentIdMap: Record<string, string> = {};
  const attachments: PlannedTicketAttachmentRow[] = parsedBackup.attachments.map((at) => {
    const newAttachmentId = randomUUID();
    attachmentIdMap[at.id] = newAttachmentId;
    const newTicketId = ticketIdMap[at.ticket_id];
    if (!newTicketId) {
      blockingIssues.push(`attachments[${at.id}].ticket_id "${at.ticket_id}" was not found among the planned tickets.`);
    }
    const newCommentId = at.comment_id === null ? null : commentIdMap[at.comment_id];
    if (at.comment_id !== null && !newCommentId) {
      blockingIssues.push(`attachments[${at.id}].comment_id "${at.comment_id}" was not found among the planned comments.`);
    }
    const resolvedTicketId = newTicketId ?? at.ticket_id;
    return {
      ...at,
      id: newAttachmentId,
      ticket_id: resolvedTicketId,
      // Same "<ticket_id>/<uuid>-<filename>" convention the real
      // ticket-attachments bucket already uses (see
      // 20260724000000_add_ticket_attachments.sql) — the new attachment's
      // own id doubles as the uuid segment, so no unrelated extra id is
      // generated just for this. No file is read/copied here — requirement
      // 10 explicitly defers that to a later stage.
      storage_path: `${resolvedTicketId}/${newAttachmentId}-${at.filename}`,
      sourceStoragePath: at.storage_path,
      // Present (non-null) only when parsedBackup.attachmentsIncluded is
      // true — see the ParsedProjectBackup contract in
      // parse-project-backup-zip.ts. Read-only lookup; the bytes
      // themselves are never touched, copied, or uploaded here.
      sourceBytes: parsedBackup.attachmentFiles[at.storage_path] ?? null,
      comment_id: newCommentId ?? null,
      uploaded_by: resolveProfileRef(at.uploaded_by, false, `attachments[${at.id}].uploaded_by`, profileMappings, blockingIssues),
    };
  });

  // ── relations ─────────────────────────────────────────────────────────
  const relationIdMap: Record<string, string> = {};
  const relations: PlannedTicketRelationRow[] = parsedBackup.relations.map((r) => {
    const newRelationId = randomUUID();
    relationIdMap[r.id] = newRelationId;
    const newTicketId = ticketIdMap[r.ticket_id];
    const newRelatedTicketId = ticketIdMap[r.related_ticket_id];
    if (!newTicketId) {
      blockingIssues.push(`relations[${r.id}].ticket_id "${r.ticket_id}" was not found among the planned tickets.`);
    }
    if (!newRelatedTicketId) {
      blockingIssues.push(`relations[${r.id}].related_ticket_id "${r.related_ticket_id}" was not found among the planned tickets.`);
    }
    return {
      ...r,
      id: newRelationId,
      ticket_id: newTicketId ?? r.ticket_id,
      related_ticket_id: newRelatedTicketId ?? r.related_ticket_id,
      created_by: resolveProfileRef(r.created_by, false, `relations[${r.id}].created_by`, profileMappings, blockingIssues),
    };
  });

  // ── notes ─────────────────────────────────────────────────────────────
  const noteIdMap: Record<string, string> = {};
  const notes: PlannedProjectNoteRow[] = parsedBackup.notes.map((n) => {
    const newNoteId = randomUUID();
    noteIdMap[n.id] = newNoteId;
    return {
      ...n,
      id: newNoteId,
      project_id: newProjectId,
      created_by: resolveProfileRef(n.created_by, false, `notes[${n.id}].created_by`, profileMappings, blockingIssues),
      updated_by: resolveProfileRef(n.updated_by, false, `notes[${n.id}].updated_by`, profileMappings, blockingIssues),
    };
  });

  // ── noteActivity ──────────────────────────────────────────────────────
  const noteActivityIdMap: Record<string, string> = {};
  const noteActivity: PlannedProjectNoteActivityRow[] = parsedBackup.noteActivity.map((na) => {
    const newNoteActivityId = randomUUID();
    noteActivityIdMap[na.id] = newNoteActivityId;
    const newNoteId = na.note_id === null ? null : noteIdMap[na.note_id];
    if (na.note_id !== null && !newNoteId) {
      blockingIssues.push(`noteActivity[${na.id}].note_id "${na.note_id}" was not found among the planned notes.`);
    }
    return {
      ...na,
      id: newNoteActivityId,
      project_id: newProjectId,
      note_id: newNoteId ?? null,
      actor_profile_id: resolveProfileRef(na.actor_profile_id, false, `noteActivity[${na.id}].actor_profile_id`, profileMappings, blockingIssues),
    };
  });

  if (blockingIssues.length > 0) {
    throw new ProjectRestorePlanError(blockingIssues);
  }

  const plan: ProjectRestorePlan = {
    attachmentsIncluded: parsedBackup.attachmentsIncluded,
    projectIdMap,
    statusIdMap,
    ticketIdMap,
    commentIdMap,
    activityIdMap,
    timeEntryIdMap,
    attachmentIdMap,
    relationIdMap,
    noteIdMap,
    noteActivityIdMap,
    membershipIdMap,
    project,
    statuses,
    members,
    tickets,
    comments,
    activity,
    timeEntries,
    attachments,
    relations,
    notes,
    noteActivity,
  };

  assertPlanIntegrity(plan, parsedBackup);

  return plan;
}

// ── Final self-check (requirement 12) ───────────────────────────────────────
// Re-derives, from the plan just built, every guarantee requirement 12
// lists — a genuine postcondition check on the actual output, not a repeat
// of the construction logic above. Should never fire given a correct
// implementation; exists so a future change to this file that breaks one of
// these guarantees fails loudly instead of silently.

function assertPlanIntegrity(plan: ProjectRestorePlan, parsedBackup: ParsedProjectBackup): void {
  const issues: string[] = [];

  const idMaps: [string, Record<string, string>][] = [
    ["projectIdMap", plan.projectIdMap],
    ["statusIdMap", plan.statusIdMap],
    ["ticketIdMap", plan.ticketIdMap],
    ["commentIdMap", plan.commentIdMap],
    ["activityIdMap", plan.activityIdMap],
    ["timeEntryIdMap", plan.timeEntryIdMap],
    ["attachmentIdMap", plan.attachmentIdMap],
    ["relationIdMap", plan.relationIdMap],
    ["noteIdMap", plan.noteIdMap],
    ["noteActivityIdMap", plan.noteActivityIdMap],
    ["membershipIdMap", plan.membershipIdMap],
  ];

  // No new id duplicated, anywhere in the plan.
  const allNewIds = idMaps.flatMap(([, map]) => Object.values(map));
  if (new Set(allNewIds).size !== allNewIds.length) {
    issues.push("Two or more rows in the plan were assigned the same new id.");
  }

  // No structural internal reference still points at a *source* id.
  const structuralOriginalIds = new Set([
    ...Object.keys(plan.projectIdMap),
    ...Object.keys(plan.statusIdMap),
    ...Object.keys(plan.ticketIdMap),
    ...Object.keys(plan.commentIdMap),
    ...Object.keys(plan.noteIdMap),
  ]);
  const ticketIdValues = new Set(Object.values(plan.ticketIdMap));
  const statusIdValues = new Set(Object.values(plan.statusIdMap));
  const commentIdValues = new Set(Object.values(plan.commentIdMap));
  const noteIdValues = new Set(Object.values(plan.noteIdMap));

  const checkNotOriginal = (label: string, value: string) => {
    if (structuralOriginalIds.has(value)) {
      issues.push(`${label} still points at a source backup id ("${value}") instead of a newly planned one.`);
    }
  };
  const checkExistsIn = (label: string, value: string, target: Set<string>) => {
    if (!target.has(value)) {
      issues.push(`${label} ("${value}") does not exist among the plan's own new ids.`);
    }
  };

  checkNotOriginal("project.id", plan.project.id);

  for (const s of plan.statuses) {
    checkNotOriginal(`statuses[${s.id}].project_id`, s.project_id);
    checkExistsIn(`statuses[${s.id}].project_id`, s.project_id, new Set([plan.project.id]));
  }

  for (const m of plan.members) {
    checkNotOriginal(`members[${m.id}].project_id`, m.project_id);
    checkExistsIn(`members[${m.id}].project_id`, m.project_id, new Set([plan.project.id]));
  }

  const originalTicketByNewId = new Map(parsedBackup.tickets.map((t) => [plan.ticketIdMap[t.id], t]));
  for (const t of plan.tickets) {
    checkNotOriginal(`tickets[${t.id}].project_id`, t.project_id);
    checkExistsIn(`tickets[${t.id}].project_id`, t.project_id, new Set([plan.project.id]));
    if (t.project_id !== plan.project.id) {
      issues.push(`tickets[${t.id}] lost its project_id (expected "${plan.project.id}", got "${t.project_id}").`);
    }
    const original = originalTicketByNewId.get(t.id);
    if (!original || t.ticket_number !== original.ticket_number) {
      issues.push(`tickets[${t.id}] lost or changed its original ticket_number.`);
    }
    if (t.status_id) {
      checkNotOriginal(`tickets[${t.id}].status_id`, t.status_id);
      checkExistsIn(`tickets[${t.id}].status_id`, t.status_id, statusIdValues);
    }
  }

  for (const c of plan.comments) {
    checkNotOriginal(`comments[${c.id}].ticket_id`, c.ticket_id);
    checkExistsIn(`comments[${c.id}].ticket_id`, c.ticket_id, ticketIdValues);
  }
  for (const a of plan.activity) {
    checkNotOriginal(`activity[${a.id}].ticket_id`, a.ticket_id);
    checkExistsIn(`activity[${a.id}].ticket_id`, a.ticket_id, ticketIdValues);
  }
  for (const te of plan.timeEntries) {
    checkNotOriginal(`timeEntries[${te.id}].ticket_id`, te.ticket_id);
    checkExistsIn(`timeEntries[${te.id}].ticket_id`, te.ticket_id, ticketIdValues);
  }
  for (const at of plan.attachments) {
    checkNotOriginal(`attachments[${at.id}].ticket_id`, at.ticket_id);
    checkExistsIn(`attachments[${at.id}].ticket_id`, at.ticket_id, ticketIdValues);
    if (at.comment_id !== null) {
      checkNotOriginal(`attachments[${at.id}].comment_id`, at.comment_id);
      checkExistsIn(`attachments[${at.id}].comment_id`, at.comment_id, commentIdValues);
    }
  }
  for (const r of plan.relations) {
    checkNotOriginal(`relations[${r.id}].ticket_id`, r.ticket_id);
    checkNotOriginal(`relations[${r.id}].related_ticket_id`, r.related_ticket_id);
    checkExistsIn(`relations[${r.id}].ticket_id`, r.ticket_id, ticketIdValues);
    checkExistsIn(`relations[${r.id}].related_ticket_id`, r.related_ticket_id, ticketIdValues);
  }
  for (const n of plan.notes) {
    checkNotOriginal(`notes[${n.id}].project_id`, n.project_id);
    checkExistsIn(`notes[${n.id}].project_id`, n.project_id, new Set([plan.project.id]));
  }
  for (const na of plan.noteActivity) {
    checkNotOriginal(`noteActivity[${na.id}].project_id`, na.project_id);
    checkExistsIn(`noteActivity[${na.id}].project_id`, na.project_id, new Set([plan.project.id]));
    if (na.note_id !== null) {
      checkNotOriginal(`noteActivity[${na.id}].note_id`, na.note_id);
      checkExistsIn(`noteActivity[${na.id}].note_id`, na.note_id, noteIdValues);
    }
  }

  const summary = parsedBackup.manifest.summary;
  const countChecks: [string, number, number][] = [
    ["members", plan.members.length, summary.members],
    ["statuses", plan.statuses.length, summary.statuses],
    ["tickets", plan.tickets.length, summary.tickets],
    ["comments", plan.comments.length, summary.comments],
    ["activity", plan.activity.length, summary.activity],
    ["timeEntries", plan.timeEntries.length, summary.timeEntries],
    ["attachments", plan.attachments.length, summary.attachments],
    ["relations", plan.relations.length, summary.relations],
    ["notes", plan.notes.length, summary.notes],
    ["noteActivity", plan.noteActivity.length, summary.noteActivity],
  ];
  for (const [label, actual, expected] of countChecks) {
    if (actual !== expected) {
      issues.push(`plan.${label}.length (${actual}) does not match manifest.summary.${label} (${expected}).`);
    }
  }

  if (issues.length > 0) {
    throw new ProjectRestorePlanError(issues);
  }
}
