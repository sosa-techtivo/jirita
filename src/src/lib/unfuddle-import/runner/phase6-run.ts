#!/usr/bin/env -S node --import tsx
/**
 * Phase 6 of the Unfuddle -> Jirita importer: the 250 KTVibe attachments
 * (ticket-level + comment-level) — files to Storage, historical rows to
 * ticket_attachments.
 *
 * PREVIEW (default) never writes anything. APPLY (--apply) performs the
 * real import, but only after re-confirming the exact expected numbers
 * from a fresh precheck run in this same invocation — any drift from the
 * known-good counts (250 planned, 70/180 split, 0 mapping errors, 0
 * missing parents, DB idempotency = 250 new/0 conflicts, Storage
 * idempotency = 250 not-exists/0 conflicts) aborts before any write.
 *
 * Order per row: verify DB idempotency (from the fresh precheck) -> verify
 * Storage idempotency (same) -> upload the object only if missing -> insert
 * the row exclusively via insert_ticket_attachments_bypassing_activity_log
 * -> reconcile that exact row by re-selecting it -> record -> continue.
 * Stops at the very first error; never deletes an uploaded object or an
 * inserted row automatically; never retries indiscriminately.
 *
 * Usage:
 *   npx tsx src/lib/unfuddle-import/runner/phase6-run.ts \
 *     --backup=/path/to/backup.xml --media=/path/to/media [--apply]
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { runDryRun } from "./dry-run";
import { printDryRunReport } from "./print-report";
import { printPhase6Report } from "./phase6-print-report";
import { printSnapshot, printApplyOutcome, printDbReconciliation, printStorageReconciliation, printHashVerification, printSideEffects } from "./phase6-print-apply-report";
import { getSupabaseAdminClient } from "../supabase-admin-client";
import { runPrecheck as runPhase2Precheck } from "../preflight/run-precheck";
import { runAttachmentPrecheck } from "../preflight/run-attachment-precheck";
import { snapshotBeforeApply } from "../import-attachments/snapshot-before-apply";
import { applyAttachments } from "../import-attachments/apply-attachments";
import { reconcilePostApplyDb, reconcilePostApplyStorage } from "../import-attachments/reconcile-post-apply";
import { verifyRequiredHashSample } from "../import-attachments/verify-attachment-hashes";
import {
  KNOWN_ORPHAN_UNFUDDLE_IDS,
  TARGET_ORGANIZATION_SLUG,
  TARGET_UNFUDDLE_MILESTONE_ID,
  TARGET_UNFUDDLE_PROJECT_ID,
  TARGET_USER_UNFUDDLE_IDS,
  type Phase3Config as Phase6Config,
} from "../config";
import type { Phase6PrecheckResult, Phase6Report } from "../types/phase6";

function loadEnvFile(): void {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    /* no .env.local in cwd — rely on already-exported env vars */
  }
}

function parseArgs(argv: string[]): { config: Phase6Config; apply: boolean } {
  const args = new Map<string, string>();
  let apply = false;
  for (const arg of argv) {
    if (arg === "--apply") {
      apply = true;
      continue;
    }
    const match = /^--([^=]+)=(.*)$/.exec(arg);
    if (match) args.set(match[1], match[2]);
  }

  const backupXmlPath = args.get("backup");
  const mediaDir = args.get("media");
  if (!backupXmlPath || !mediaDir) {
    console.error("Usage: phase6-run.ts --backup=<path to backup.xml> --media=<path to media/> [--apply] [--project=152] [--milestone=183]");
    process.exit(2);
  }

  return {
    apply,
    config: {
      backupXmlPath,
      mediaDir,
      targetProjectId: args.has("project") ? Number(args.get("project")) : TARGET_UNFUDDLE_PROJECT_ID,
      targetMilestoneId: args.has("milestone") ? Number(args.get("milestone")) : TARGET_UNFUDDLE_MILESTONE_ID,
      organizationSlug: TARGET_ORGANIZATION_SLUG,
      targetUserUnfuddleIds: TARGET_USER_UNFUDDLE_IDS,
      knownOrphanUnfuddleIds: KNOWN_ORPHAN_UNFUDDLE_IDS,
      apply,
    },
  };
}

function emptyPrecheck(reason: string): Phase6PrecheckResult {
  return {
    organization: { slug: TARGET_ORGANIZATION_SLUG, matchCount: 0, organizationId: null, name: null, error: null },
    project: { projectId: null, ok: false, error: null },
    ticketsReconciled: { total: 0, ok: false, error: null },
    commentsReconciled: { total: 0, ok: false, error: null },
    ticketParents: { map: new Map(), missingParents: [], totalTicketsInProject: 0, ok: false },
    commentParents: { map: new Map(), missingParents: [], ok: false },
    xmlStats: {
      total: 0,
      ticketLevel: 0,
      commentLevel: 0,
      unexpectedParentTypes: [],
      emptyFilename: 0,
      emptyMime: 0,
      emptySize: 0,
      zeroSize: 0,
      emptyCreatedAt: 0,
      emptyUpdatedAt: 0,
      genericMime: 0,
      duplicateAttachmentIds: 0,
      uniqueFilenames: 0,
      repeatedFilenames: [],
      extensionCounts: [],
      dangerousExtensionFiles: [],
      archiveFiles: 0,
      noExtensionFiles: 0,
      ticketsWithAttachments: 0,
      commentsWithAttachments: 0,
    },
    physicalFiles: {
      resolved: 0,
      missing: 0,
      missingIds: [],
      ambiguous: 0,
      totalBytes: 0,
      maxBytes: 0,
      minBytes: 0,
      avgBytes: 0,
      medianBytes: 0,
      sizeDistribution: {},
      emptyFiles: 0,
      sizeMismatches: [],
      filesOverLimit: [],
      duplicateContentGroups: [],
    },
    schemaAudit: {
      hasUnfuddleIdColumn: false,
      hasCommentIdColumn: false,
      storagePathUniqueConstraint: false,
      storagePathDeterministic: false,
      uploadedByNullable: false,
      hasUpdatedAtColumn: false,
      activityTrigger: { exists: false, unconditional: false, description: "" },
      membershipTrigger: { exists: false, description: "" },
      blockingReasons: [reason],
    },
    storageAudit: { bucketId: "", isPublic: false, pathConvention: "", selectPolicy: "", insertPolicy: "", deletePolicy: "", sizeLimitConfigured: "" },
    objectPathProposal: { pattern: "", example: "", ticketLevelExample: "", commentLevelExample: "", rationale: [] },
    mapping: { planned: [], errors: [], ok: false },
    dbIdempotency: null,
    storageIdempotency: null,
    ok: false,
    blockingReasons: [reason],
  };
}

function finish(report: Phase6Report): void {
  printPhase6Report(report);
  process.exitCode = report.outcome === "failed" ? 1 : 0;
}

/** Every exact number this task's spec requires before APPLY may write anything. Returns the list of mismatches — empty means "go". */
function checkExactPreApplyNumbers(precheck: Phase6PrecheckResult): string[] {
  const problems: string[] = [];
  if (precheck.xmlStats.total !== 250) problems.push(`xmlStats.total=${precheck.xmlStats.total}, expected 250`);
  if (precheck.xmlStats.ticketLevel !== 70) problems.push(`xmlStats.ticketLevel=${precheck.xmlStats.ticketLevel}, expected 70`);
  if (precheck.xmlStats.commentLevel !== 180) problems.push(`xmlStats.commentLevel=${precheck.xmlStats.commentLevel}, expected 180`);
  if (precheck.physicalFiles.resolved !== 250 || precheck.physicalFiles.missing !== 0 || precheck.physicalFiles.ambiguous !== 0) {
    problems.push(`physicalFiles resolved=${precheck.physicalFiles.resolved} missing=${precheck.physicalFiles.missing} ambiguous=${precheck.physicalFiles.ambiguous}, expected 250/0/0`);
  }
  if (precheck.mapping.planned.length !== 250 || precheck.mapping.errors.length !== 0) {
    problems.push(`mapping planned=${precheck.mapping.planned.length} errors=${precheck.mapping.errors.length}, expected 250/0`);
  }
  if (!precheck.mapping.planned.every((p) => p.uploaded_by === null)) problems.push("Not every planned row has uploaded_by=null.");
  if (new Set(precheck.mapping.planned.map((p) => p.storage_path)).size !== 250) problems.push("Planned storage_path values are not all unique.");
  if (precheck.ticketParents.missingParents.length !== 0) problems.push(`ticketParents.missingParents=${precheck.ticketParents.missingParents.length}, expected 0`);
  if (precheck.commentParents.missingParents.length !== 0) problems.push(`commentParents.missingParents=${precheck.commentParents.missingParents.length}, expected 0`);
  if (!precheck.dbIdempotency) problems.push("dbIdempotency is null.");
  else if (precheck.dbIdempotency.newRows.length !== 250 || precheck.dbIdempotency.alreadyImportedMatching.length !== 0 || precheck.dbIdempotency.conflicting.length !== 0 || precheck.dbIdempotency.duplicateUnfuddleIdsInBatch.length !== 0) {
    problems.push(
      `dbIdempotency new=${precheck.dbIdempotency.newRows.length} alreadyImported=${precheck.dbIdempotency.alreadyImportedMatching.length} conflicting=${precheck.dbIdempotency.conflicting.length} dup=${precheck.dbIdempotency.duplicateUnfuddleIdsInBatch.length}, expected 250/0/0/0`,
    );
  }
  if (!precheck.storageIdempotency) problems.push("storageIdempotency is null.");
  else if (precheck.storageIdempotency.notExists !== 250 || precheck.storageIdempotency.existsMatching !== 0 || precheck.storageIdempotency.existsDiffers !== 0 || precheck.storageIdempotency.pathCollisions.length !== 0) {
    problems.push(
      `storageIdempotency notExists=${precheck.storageIdempotency.notExists} existsMatching=${precheck.storageIdempotency.existsMatching} existsDiffers=${precheck.storageIdempotency.existsDiffers} pathCollisions=${precheck.storageIdempotency.pathCollisions.length}, expected 250/0/0/0`,
    );
  }
  if (precheck.blockingReasons.length !== 0) problems.push(`precheck.blockingReasons=${precheck.blockingReasons.length}, expected 0`);
  return problems;
}

async function runApply(admin: SupabaseClient, config: Phase6Config, precheck: Phase6PrecheckResult): Promise<{ outcome: "apply_success" | "failed"; failureReasons: string[] }> {
  const mismatches = checkExactPreApplyNumbers(precheck);
  if (mismatches.length > 0) {
    console.error("APPLY ABORTADO ANTES DE ESCRIBIR — las cifras exactas requeridas no coinciden con el último PREVIEW:");
    for (const m of mismatches) console.error(`  - ${m}`);
    return { outcome: "failed", failureReasons: mismatches };
  }

  const bucketId = precheck.storageAudit.bucketId;
  const ktvibeProjectId = precheck.project.projectId!;
  const { data: ktvibeTicketRows } = await admin.from("tickets").select("id").eq("project_id", ktvibeProjectId);
  const ktvibeTicketIds = (ktvibeTicketRows ?? []).map((t) => t.id as string);
  const affectedTicketIds = [...new Set(precheck.mapping.planned.map((p) => p.ticket_id))];
  const expectedUnfuddleIds = precheck.mapping.planned.map((p) => p.unfuddle_id);

  const { count: preexistingCountBefore } = await admin.from("ticket_attachments").select("id", { count: "exact", head: true }).is("unfuddle_id", null);

  console.log(`\nTomando snapshot previo (${affectedTicketIds.length} tickets afectados)...`);
  const before = await snapshotBeforeApply(admin, bucketId, ktvibeProjectId, ktvibeTicketIds, affectedTicketIds);
  printSnapshot(before);

  console.log(`\nEjecutando APPLY: ${precheck.mapping.planned.length} adjuntos, batches de <=10...`);
  const applyOutcome = await applyAttachments(admin, bucketId, config.mediaDir, precheck.dbIdempotency!.newRows, precheck.storageIdempotency!.findings);
  printApplyOutcome(applyOutcome);

  if (applyOutcome.error) {
    return { outcome: "failed", failureReasons: [applyOutcome.error, ...applyOutcome.reconciliationDiffs.map((d) => `${d.unfuddleId}: ${d.diffs.join("; ")}`)] };
  }

  console.log("\nReconciliando DB y Storage tras el APPLY...");
  const dbRec = await reconcilePostApplyDb(admin, ktvibeTicketIds, expectedUnfuddleIds, preexistingCountBefore ?? 0);
  printDbReconciliation(dbRec);
  const storageRec = await reconcilePostApplyStorage(admin, bucketId, precheck.mapping.planned);
  printStorageReconciliation(storageRec);

  console.log("\nVerificando hashes de la muestra requerida...");
  const hashRec = await verifyRequiredHashSample(admin, bucketId, config.mediaDir, precheck.mapping.planned, precheck.physicalFiles);
  printHashVerification(hashRec);

  console.log("\nComparando efectos secundarios contra el snapshot...");
  const after = await snapshotBeforeApply(admin, bucketId, ktvibeProjectId, ktvibeTicketIds, affectedTicketIds);
  printSideEffects(before, after, 250, 250, 250);

  const noUnexpectedSideEffects =
    after.ticketAttachmentsKTVibe - before.ticketAttachmentsKTVibe === 250 &&
    after.ticketAttachmentsGlobal - before.ticketAttachmentsGlobal === 250 &&
    after.storageObjectsUnderAffectedFolders - before.storageObjectsUnderAffectedFolders === 250 &&
    after.ticketActivityAttachmentUploadedKTVibe === before.ticketActivityAttachmentUploadedKTVibe &&
    after.projectMembershipsGlobal === before.projectMembershipsGlobal &&
    after.projectMembershipsKTVibe === before.projectMembershipsKTVibe &&
    after.notificationsGlobal === before.notificationsGlobal &&
    after.notificationsForAffectedTickets === before.notificationsForAffectedTickets &&
    after.ticketCommentsKTVibe === before.ticketCommentsKTVibe &&
    after.ticketTimeEntriesKTVibe === before.ticketTimeEntriesKTVibe;

  const ok = applyOutcome.inserted === 250 && applyOutcome.uploaded === 250 && applyOutcome.reconciledOk === 250 && dbRec.ok && storageRec.ok && hashRec.ok && noUnexpectedSideEffects;

  const failureReasons: string[] = [];
  if (!ok) {
    if (applyOutcome.inserted !== 250) failureReasons.push(`Only ${applyOutcome.inserted}/250 rows inserted.`);
    if (applyOutcome.uploaded !== 250) failureReasons.push(`Only ${applyOutcome.uploaded}/250 objects uploaded.`);
    failureReasons.push(...dbRec.issues, ...storageRec.issues);
    if (!hashRec.ok) failureReasons.push("Hash verification found a mismatch in the required sample.");
    if (!noUnexpectedSideEffects) failureReasons.push("Unexpected side effects vs the pre-APPLY snapshot.");
  }

  return { outcome: ok ? "apply_success" : "failed", failureReasons };
}

async function main(): Promise<void> {
  const { config, apply } = parseArgs(process.argv.slice(2));
  const mode: Phase6Report["mode"] = apply ? "APPLY" : "PREVIEW";

  loadEnvFile();

  // ── Step 1: the existing streaming parser + the existing Phase 1 Dry Run. ──
  const { report: dryRunReport, parsed } = await runDryRun(config);
  const { success: dryRunSuccess } = printDryRunReport(dryRunReport);

  if (!dryRunSuccess) {
    const reason = "Phase 1 Dry Run reported failures — see the report above.";
    finish({ mode, precheck: emptyPrecheck(reason), applyOutcome: null, outcome: "failed", failureReasons: [reason] });
    return;
  }

  let admin: SupabaseClient;
  try {
    admin = getSupabaseAdminClient();
  } catch (err) {
    const reason = `Supabase admin client init failed: ${(err as Error).message}`;
    finish({ mode, precheck: emptyPrecheck(reason), applyOutcome: null, outcome: "failed", failureReasons: [reason] });
    return;
  }

  // ── Step 2: the existing Phase 2 preflight. ──
  const phase2Precheck = await runPhase2Precheck(admin, parsed, config);

  // ── Step 3: Phase 6's own precheck — tickets/comments reconciliation,
  // parent resolution (tolerant of ticket #651's legitimate drift), XML
  // field audit, physical file correspondence (hash/size), schema/storage
  // audit, mapping, and real DB/Storage idempotency classification. Never
  // writes anywhere — this is the SAME fresh precheck APPLY re-verifies
  // against below, satisfying "repetir las clasificaciones antes de
  // APPLY" without a second redundant run. ──
  const precheck = await runAttachmentPrecheck(admin, parsed, config, config.mediaDir);

  const dataOk = phase2Precheck.ok && precheck.ok;
  const failureReasons = [...(phase2Precheck.ok ? [] : phase2Precheck.blockingReasons.map((r) => `[Phase 2 preflight] ${r}`)), ...precheck.blockingReasons];

  if (mode === "PREVIEW") {
    finish({ mode, precheck, applyOutcome: null, outcome: dataOk ? "preview_success" : "failed", failureReasons });
    return;
  }

  // ── APPLY ──
  if (!dataOk) {
    finish({ mode, precheck, applyOutcome: null, outcome: "failed", failureReasons });
    return;
  }

  try {
    const { outcome, failureReasons: applyFailureReasons } = await runApply(admin, config, precheck);
    finish({ mode, precheck, applyOutcome: null, outcome, failureReasons: applyFailureReasons });
  } catch (err) {
    finish({ mode, precheck, applyOutcome: null, outcome: "failed", failureReasons: [(err as Error).message] });
  }
}

main().catch((err) => {
  console.error("Phase 6 crashed:", err);
  process.exitCode = 1;
});
