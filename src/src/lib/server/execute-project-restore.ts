// Top-level orchestrator of the project-backup IMPORTER's write side: runs
// executeProjectRestorePhase1() -> executeProjectRestorePhase2() ->
// executeProjectRestorePhase3() in order (see those three files — none of
// their logic is duplicated or recomputed here), and guarantees that a
// failure at any stage never leaves a partially-restored project visible.
//
// Phase 1's own RPC (restore_project_phase1) is a single Postgres
// transaction — on its own failure, nothing was written, so there is
// nothing to clean up. Phase 2's own RPC is likewise transactional for its
// own seven tables, but by the time it runs, Phase 1's project/members/
// tickets already committed in a separate, earlier transaction — a Phase 2
// failure therefore requires this orchestrator to remove what Phase 1 left
// behind. Phase 3 has no Postgres transaction to rely on at all (Storage
// has none); it already cleans up its own this-run uploads internally on
// failure, but by the time it runs, both Phase 1 and Phase 2 have already
// committed real rows — a Phase 3 failure requires removing all of that
// too, plus double-checking Storage.

import { createHash } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { ProjectRestorePlan } from "./build-project-restore-plan";
import { executeProjectRestorePhase1 } from "./execute-project-restore-phase1";
import { executeProjectRestorePhase2 } from "./execute-project-restore-phase2";
import { executeProjectRestorePhase3, type ExecuteProjectRestorePhase3Result } from "./execute-project-restore-phase3";

const ATTACHMENTS_BUCKET = "ticket-attachments";

// Same service-role justification as every other backend-only stage in
// this pipeline: no caller session exists at this layer, and cleanup
// (deleting the incomplete project, removing this plan's own Storage
// paths) needs the same unrestricted access the three phases themselves
// already use.
function getAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL.");
  if (!serviceRoleKey) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY.");
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// ── Structured error ────────────────────────────────────────────────────────

export type ProjectRestoreExecutionStage = "phase1" | "phase2" | "phase3" | "cleanup";

export class ProjectRestoreExecutionError extends Error {
  readonly stage: ProjectRestoreExecutionStage;
  /** null when no cleanup was attempted (phase1 failures — its RPC is
   *  atomic, nothing was ever written). true/false once a cleanup attempt
   *  actually ran, reflecting whether it fully succeeded. */
  readonly cleanupSucceeded: boolean | null;
  readonly originalError?: unknown;

  constructor(stage: ProjectRestoreExecutionStage, message: string, cleanupSucceeded: boolean | null, originalError?: unknown) {
    super(message);
    this.name = "ProjectRestoreExecutionError";
    this.stage = stage;
    this.cleanupSucceeded = cleanupSucceeded;
    this.originalError = originalError;
  }
}

// ── Result shape ─────────────────────────────────────────────────────────────

export interface ExecuteProjectRestoreResult {
  projectId: string;
  restored: {
    members: number;
    tickets: number;
    comments: number;
    activity: number;
    timeEntries: number;
    attachments: number;
    attachmentFiles: number;
    attachmentBytes: number;
    relations: number;
    notes: number;
    noteActivity: number;
  };
}

// ── Cleanup (requirement 5) ──────────────────────────────────────────────────

export interface CleanupIncompleteRestoreResult {
  cleanupSucceeded: boolean;
  projectRemoved: boolean;
  storagePathsRemaining: string[];
}

async function downloadIfExists(client: SupabaseClient, storagePath: string): Promise<Uint8Array | null> {
  const { data, error } = await client.storage.from(ATTACHMENTS_BUCKET).download(storagePath);
  if (error || !data) return null;
  return new Uint8Array(await data.arrayBuffer());
}

function sameContent(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  return createHash("sha256").update(a).digest("hex") === createHash("sha256").update(b).digest("hex");
}

/**
 * Removes a restored-but-incomplete project entirely.
 *
 * Storage is handled content-aware, not path-blind: for each plan
 * attachment with sourceBytes, downloads whatever (if anything) currently
 * sits at its destination storage_path and only removes it when its
 * content byte-for-byte matches sourceBytes — i.e., it was genuinely
 * uploaded by this same execution (either still there because Phase 3's
 * own internal cleanup didn't reach it, or left behind by some other
 * partial state). A path that has different content — a preexisting file
 * this run never wrote, occupying the same destination by coincidence — is
 * left completely untouched, matching "no borrar archivos preexistentes
 * ajenos" even in that adversarial case; the blind assumption that a
 * freshly-generated destination path can never collide with anything else
 * is true in the common case, but this check makes the guarantee real
 * rather than assumed.
 *
 * The project row itself is deleted unconditionally (it is unambiguously
 * this execution's own row — plan.project.id, never the source project),
 * relying on ON DELETE CASCADE (already fixed for notes/relations/
 * attachment metadata — 20260903000000/20260904000000) to take every
 * dependent row (members, tickets, comments, activity, time entries,
 * attachment metadata, relations, notes, note activity) with it.
 */
async function cleanupIncompleteRestore(client: SupabaseClient, plan: ProjectRestorePlan): Promise<CleanupIncompleteRestoreResult> {
  const ownPathsToRemove: string[] = [];
  for (const attachment of plan.attachments) {
    if (attachment.sourceBytes === null) continue;
    const current = await downloadIfExists(client, attachment.storage_path);
    if (current === null) continue; // nothing there — nothing to remove
    if (sameContent(current, attachment.sourceBytes)) {
      ownPathsToRemove.push(attachment.storage_path);
    }
    // else: content differs — a foreign/preexisting file occupies this
    // path by coincidence; deliberately never touched.
  }
  if (ownPathsToRemove.length > 0) {
    const { error: removeError } = await client.storage.from(ATTACHMENTS_BUCKET).remove(ownPathsToRemove);
    if (removeError) {
      console.error(`[executeProjectRestore] Storage cleanup remove() reported an error (continuing to verify): ${removeError.message}`);
    }
  }

  const { error: deleteError } = await client.from("projects").delete().eq("id", plan.project.id);
  if (deleteError) {
    console.error(`[executeProjectRestore] Failed to delete incomplete project ${plan.project.id}: ${deleteError.message}`);
  }

  const { data: remainingProject } = await client.from("projects").select("id").eq("id", plan.project.id).maybeSingle();
  const projectRemoved = !remainingProject;

  const storagePathsRemaining: string[] = [];
  for (const path of ownPathsToRemove) {
    if ((await downloadIfExists(client, path)) !== null) storagePathsRemaining.push(path);
  }

  return {
    cleanupSucceeded: projectRemoved && storagePathsRemaining.length === 0,
    projectRemoved,
    storagePathsRemaining,
  };
}

// ── Entry point ──────────────────────────────────────────────────────────────

/**
 * Runs the full restore — Phase 1, then Phase 2, then Phase 3 — for one
 * plan, ensuring no partial result is ever left visible. A plan always
 * describes a brand-new destination project (never the source project the
 * backup came from) with repository_provider/repository_url already null
 * (buildProjectRestorePlan's own guarantee, unchanged here).
 *
 * Idempotent with respect to failure: this function keeps no state of its
 * own between calls, so a fresh call with a newly-built plan (a different
 * plan.project.id) always runs normally regardless of any prior outcome.
 * Reusing the *same*, already-(partially-)executed plan a second time is
 * caught by Phase 1's own precondition (`restore_project_phase1` rejects
 * outright if `plan.project.id` already exists) — that existing check is
 * the collision detector; it is not reimplemented here.
 */
export async function executeProjectRestore(plan: ProjectRestorePlan): Promise<ExecuteProjectRestoreResult> {
  if (!plan || typeof plan !== "object") {
    throw new Error("[executeProjectRestore] plan must be the object returned by buildProjectRestorePlan().");
  }
  if (!plan.project || typeof plan.project.id !== "string" || plan.project.id.length === 0) {
    throw new Error("[executeProjectRestore] plan.project.id must be a non-empty string.");
  }
  // preview.canRestore was already required to be true for
  // buildProjectRestorePlan() to have returned this plan at all — it
  // throws ProjectRestorePlanError otherwise (see build-project-restore-
  // plan.ts's own precondition checks). A real ProjectRestorePlan value is
  // itself the proof; there is nothing left to re-check here without
  // re-fetching data this function has no reason to touch.
  if (!Object.values(plan.projectIdMap).includes(plan.project.id)) {
    throw new Error(`[executeProjectRestore] plan.projectIdMap does not contain plan.project.id ("${plan.project.id}") — plan looks inconsistent.`);
  }

  const client = getAdminClient();

  // ── Phase 1 — atomic on its own; a failure here writes nothing ─────────
  let phase1Result;
  try {
    phase1Result = await executeProjectRestorePhase1(plan);
  } catch (err) {
    throw new ProjectRestoreExecutionError("phase1", messageOf(err), null, err);
  }
  if (phase1Result.projectId !== plan.project.id) {
    throw new ProjectRestoreExecutionError(
      "phase1",
      `executeProjectRestorePhase1 returned projectId "${phase1Result.projectId}", which does not match plan.project.id "${plan.project.id}".`,
      null
    );
  }

  // ── Phase 2 — a failure here must undo Phase 1's already-committed rows ─
  let phase2Result;
  try {
    phase2Result = await executeProjectRestorePhase2(plan);
  } catch (err) {
    const cleanup = await cleanupIncompleteRestore(client, plan);
    throw new ProjectRestoreExecutionError("phase2", messageOf(err), cleanup.cleanupSucceeded, err);
  }
  if (phase2Result.projectId !== plan.project.id) {
    const cleanup = await cleanupIncompleteRestore(client, plan);
    throw new ProjectRestoreExecutionError(
      "phase2",
      `executeProjectRestorePhase2 returned projectId "${phase2Result.projectId}", which does not match plan.project.id "${plan.project.id}".`,
      cleanup.cleanupSucceeded
    );
  }

  // ── Phase 3 — a failure here must undo Phase 1 + Phase 2's rows, and
  // double-check Storage on top of Phase 3's own internal per-run cleanup ─
  // A Data Only backup (plan.attachmentsIncluded === false) never had
  // physical files, so Phase 3 is skipped entirely rather than invoked and
  // made to no-op — this is the normal, successful path for that backup
  // type, never treated as a failure requiring cleanup. Phase 2's
  // already-restored attachment metadata is left exactly as it is; no file
  // upload is ever attempted for a nonexistent source file.
  let phase3Result: ExecuteProjectRestorePhase3Result;
  if (!plan.attachmentsIncluded) {
    phase3Result = { projectId: plan.project.id, uploaded: 0, uploadedBytes: 0, verified: 0, paths: [] };
  } else {
    try {
      phase3Result = await executeProjectRestorePhase3(plan);
    } catch (err) {
      const cleanup = await cleanupIncompleteRestore(client, plan);
      throw new ProjectRestoreExecutionError("phase3", messageOf(err), cleanup.cleanupSucceeded, err);
    }
    if (phase3Result.projectId !== plan.project.id) {
      const cleanup = await cleanupIncompleteRestore(client, plan);
      throw new ProjectRestoreExecutionError(
        "phase3",
        `executeProjectRestorePhase3 returned projectId "${phase3Result.projectId}", which does not match plan.project.id "${plan.project.id}".`,
        cleanup.cleanupSucceeded
      );
    }
  }

  return {
    projectId: plan.project.id,
    restored: {
      members: phase1Result.inserted.members,
      tickets: phase1Result.inserted.tickets,
      comments: phase2Result.inserted.comments,
      activity: phase2Result.inserted.activity,
      timeEntries: phase2Result.inserted.timeEntries,
      attachments: phase2Result.inserted.attachments,
      attachmentFiles: phase3Result.uploaded,
      attachmentBytes: phase3Result.uploadedBytes,
      relations: phase2Result.inserted.relations,
      notes: phase2Result.inserted.notes,
      noteActivity: phase2Result.inserted.noteActivity,
    },
  };
}
