// First execution layer of the project-backup IMPORTER: writes Phase 1 of
// a restore (project, project_memberships, tickets only) to Supabase, using
// rows already computed by buildProjectRestorePlan() (see
// build-project-restore-plan.ts — untouched by this file, no id or mapping
// is recomputed here). Comments, activity, time entries, attachments,
// relations, notes, note_activity, and per-project ticket_statuses are
// explicitly out of scope for this phase — nothing here writes to those
// tables, and nothing here touches Storage.
//
// All the actual correctness/atomicity work happens inside one Postgres
// function, restore_project_phase1(jsonb) — see
// supabase/migrations/20260901000000_project_restore_phase1.sql. This
// module is deliberately thin: it builds the jsonb payload from the plan
// as-is and calls that one RPC. "No confiar en el cliente para la
// integridad" means the validation lives in the RPC, not duplicated (and
// potentially drifting) here.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { ProjectRestorePlan } from "./build-project-restore-plan";

// Same service-role justification as every other backend-only stage in
// this pipeline (export-project.ts, preview-project-restore.ts,
// collect-project-backup-attachment-files.ts): no caller session exists at
// this layer, and restore_project_phase1 itself is grant-restricted to
// service_role only (see the migration) — no other role could call it
// even if it wanted to.
function getAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL.");
  if (!serviceRoleKey) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY.");
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export interface ExecuteProjectRestorePhase1Result {
  projectId: string;
  inserted: {
    members: number;
    tickets: number;
  };
}

interface RestoreProjectPhase1RpcResult {
  projectId: string;
  inserted: {
    members: number;
    tickets: number;
  };
}

function isRestoreProjectPhase1RpcResult(value: unknown): value is RestoreProjectPhase1RpcResult {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<RestoreProjectPhase1RpcResult>;
  return (
    typeof candidate.projectId === "string" &&
    !!candidate.inserted &&
    typeof candidate.inserted === "object" &&
    typeof candidate.inserted.members === "number" &&
    typeof candidate.inserted.tickets === "number"
  );
}

/**
 * Writes exactly project, project_memberships, and tickets for one restore
 * plan, via a single transactional RPC (restore_project_phase1). Either
 * every row lands, or (on any validation failure, constraint violation, or
 * count mismatch inside the RPC) nothing does — Postgres rolls back the
 * whole function invocation automatically.
 */
export async function executeProjectRestorePhase1(plan: ProjectRestorePlan): Promise<ExecuteProjectRestorePhase1Result> {
  if (!plan || typeof plan !== "object") {
    throw new Error("[executeProjectRestorePhase1] plan must be the object returned by buildProjectRestorePlan().");
  }
  if (!plan.project || typeof plan.project !== "object") {
    throw new Error("[executeProjectRestorePhase1] plan.project must be a real planned project row.");
  }
  if (!Array.isArray(plan.members)) {
    throw new Error("[executeProjectRestorePhase1] plan.members must be an array.");
  }
  if (!Array.isArray(plan.tickets)) {
    throw new Error("[executeProjectRestorePhase1] plan.tickets must be an array.");
  }

  const client = getAdminClient();

  // Sent as-is — no id/mapping is recomputed, no field is renamed or
  // reshaped. Extra keys the RPC doesn't read (e.g. a ticket's optional
  // status_id, when present) are harmless: restore_project_phase1 never
  // selects that column at all, matching this phase's own "no restaurar
  // estados todavía" scope.
  const payload = {
    project: plan.project,
    members: plan.members,
    tickets: plan.tickets,
  };

  const { data, error } = await client.rpc("restore_project_phase1", { payload });
  if (error) {
    throw new Error(`[executeProjectRestorePhase1] restore_project_phase1 failed: ${error.message}`);
  }
  if (!isRestoreProjectPhase1RpcResult(data)) {
    throw new Error(`[executeProjectRestorePhase1] restore_project_phase1 returned an unexpected shape: ${JSON.stringify(data)}`);
  }

  return {
    projectId: data.projectId,
    inserted: {
      members: data.inserted.members,
      tickets: data.inserted.tickets,
    },
  };
}
