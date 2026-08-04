// Second execution layer of the project-backup IMPORTER: writes Phase 2 of
// a restore (ticket_comments, ticket_time_entries, project_notes,
// ticket_attachments metadata, ticket_relations, ticket_activity, and
// project_note_activity) to Supabase, for a project already restored by
// executeProjectRestorePhase1() (see execute-project-restore-phase1.ts).
// Uses rows already computed by buildProjectRestorePlan() — no id or
// mapping is recomputed here. No Storage upload of any kind.
//
// All the actual correctness/atomicity work happens inside one Postgres
// function, restore_project_phase2(jsonb) — see
// supabase/migrations/20260902000000_project_restore_phase2.sql. This
// module is deliberately thin, same as Phase 1's own executor: it builds
// the jsonb payload from the plan as-is and calls that one RPC.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { ProjectRestorePlan } from "./build-project-restore-plan";

// Same service-role justification as execute-project-restore-phase1.ts and
// every other backend-only stage in this pipeline: no caller session
// exists at this layer, and restore_project_phase2 itself is
// grant-restricted to service_role only (see the migration).
function getAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL.");
  if (!serviceRoleKey) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY.");
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export interface ExecuteProjectRestorePhase2Result {
  projectId: string;
  inserted: {
    comments: number;
    activity: number;
    timeEntries: number;
    attachments: number;
    relations: number;
    notes: number;
    noteActivity: number;
  };
  /** How many restored ticket_attachments rows still have no physical file
   *  uploaded — always equal to inserted.attachments in this phase, since
   *  Storage is never touched here. */
  pendingAttachmentFiles: number;
}

interface RestoreProjectPhase2RpcResult {
  projectId: string;
  inserted: ExecuteProjectRestorePhase2Result["inserted"];
  pendingAttachmentFiles: number;
}

function isRestoreProjectPhase2RpcResult(value: unknown): value is RestoreProjectPhase2RpcResult {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<RestoreProjectPhase2RpcResult>;
  if (typeof candidate.projectId !== "string" || typeof candidate.pendingAttachmentFiles !== "number") return false;
  const inserted = candidate.inserted;
  if (!inserted || typeof inserted !== "object") return false;
  const keys: (keyof ExecuteProjectRestorePhase2Result["inserted"])[] = [
    "comments",
    "activity",
    "timeEntries",
    "attachments",
    "relations",
    "notes",
    "noteActivity",
  ];
  return keys.every((key) => typeof (inserted as Record<string, unknown>)[key] === "number");
}

// ticket_attachments columns only — sourceStoragePath (the original
// backup's storage_path, kept in the plan purely for a future copy stage)
// and sourceBytes (the physical file bytes, not a database column at all)
// are never sent to the RPC, matching this requirement explicitly:
// "sourceStoragePath no debe insertarse en la base."
//
// is_available (added by 20260906000000_add_ticket_attachments_is_available)
// mirrors sourceBytes !== null: true for a Full Backup's attachments (Phase
// 3 will genuinely upload the file after this transaction commits), false
// for a Data Only Backup's (Phase 3 is skipped entirely for those — see
// execute-project-restore-phase3.ts — so no object will ever exist at
// storage_path). If Phase 3 fails partway through a Full Backup restore,
// the orchestrator deletes the whole project (see execute-project-
// restore.ts's cleanupIncompleteRestore), so an is_available=true row
// never persists without Phase 3 having actually succeeded.
function toAttachmentPayloadRow(attachment: ProjectRestorePlan["attachments"][number]) {
  return {
    id: attachment.id,
    ticket_id: attachment.ticket_id,
    comment_id: attachment.comment_id,
    filename: attachment.filename,
    storage_path: attachment.storage_path,
    size_bytes: attachment.size_bytes,
    mime_type: attachment.mime_type,
    uploaded_by: attachment.uploaded_by,
    unfuddle_id: attachment.unfuddle_id,
    updated_at: attachment.updated_at,
    created_at: attachment.created_at,
    is_available: attachment.sourceBytes !== null,
  };
}

/**
 * Writes exactly ticket_comments, ticket_time_entries, project_notes,
 * ticket_attachments (metadata only), ticket_relations, ticket_activity,
 * and project_note_activity for one restore plan, via a single
 * transactional RPC (restore_project_phase2). Either every row lands, or
 * (on any validation failure, constraint violation, or count mismatch
 * inside the RPC) nothing does — Postgres rolls back the whole function
 * invocation automatically. Phase 1's own already-committed rows (project,
 * memberships, tickets) are never touched or reverted by this function.
 */
export async function executeProjectRestorePhase2(plan: ProjectRestorePlan): Promise<ExecuteProjectRestorePhase2Result> {
  if (!plan || typeof plan !== "object") {
    throw new Error("[executeProjectRestorePhase2] plan must be the object returned by buildProjectRestorePlan().");
  }
  if (!plan.project || typeof plan.project.id !== "string") {
    throw new Error("[executeProjectRestorePhase2] plan.project.id must be a string — run executeProjectRestorePhase1() first.");
  }
  for (const key of ["comments", "timeEntries", "notes", "attachments", "relations", "activity", "noteActivity"] as const) {
    if (!Array.isArray(plan[key])) {
      throw new Error(`[executeProjectRestorePhase2] plan.${key} must be an array.`);
    }
  }

  const payload = {
    projectId: plan.project.id,
    comments: plan.comments,
    timeEntries: plan.timeEntries,
    notes: plan.notes,
    attachments: plan.attachments.map(toAttachmentPayloadRow),
    relations: plan.relations,
    activity: plan.activity,
    noteActivity: plan.noteActivity,
  };

  // "los conteos del payload coinciden con el plan" — trivially true given
  // payload is built 1:1 from plan above, re-asserted explicitly anyway.
  const countChecks: [string, number, number][] = [
    ["comments", payload.comments.length, plan.comments.length],
    ["timeEntries", payload.timeEntries.length, plan.timeEntries.length],
    ["notes", payload.notes.length, plan.notes.length],
    ["attachments", payload.attachments.length, plan.attachments.length],
    ["relations", payload.relations.length, plan.relations.length],
    ["activity", payload.activity.length, plan.activity.length],
    ["noteActivity", payload.noteActivity.length, plan.noteActivity.length],
  ];
  for (const [label, actual, expected] of countChecks) {
    if (actual !== expected) {
      throw new Error(`[executeProjectRestorePhase2] payload.${label}.length (${actual}) does not match plan.${label}.length (${expected}).`);
    }
  }

  const client = getAdminClient();
  const { data, error } = await client.rpc("restore_project_phase2", { payload });
  if (error) {
    throw new Error(`[executeProjectRestorePhase2] restore_project_phase2 failed: ${error.message}`);
  }
  if (!isRestoreProjectPhase2RpcResult(data)) {
    throw new Error(`[executeProjectRestorePhase2] restore_project_phase2 returned an unexpected shape: ${JSON.stringify(data)}`);
  }

  return {
    projectId: data.projectId,
    inserted: data.inserted,
    pendingAttachmentFiles: data.pendingAttachmentFiles,
  };
}
