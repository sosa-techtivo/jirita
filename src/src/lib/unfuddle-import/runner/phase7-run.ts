#!/usr/bin/env -S node --import tsx
/**
 * Phase 7 of the Unfuddle -> Jirita importer: the 19 unique internal
 * ticket-to-ticket relations for the 170 already-imported KTVibe tickets.
 *
 * PREVIEW (default) never writes anything. APPLY (--apply) performs the
 * real import, but only after a FRESH precheck run in this same invocation
 * confirms the exact expected numbers (19 new, 0 already imported, 0
 * conflicts, 0 duplicate keys, 1 excluded_external, 0 self-relations, 0
 * cross-project) — any drift aborts before any write, same discipline as
 * every earlier phase's APPLY gate (see checkExactPreApplyNumbers below and
 * Phase 6's own runner for the precedent).
 *
 * The excluded_external relation (KTV-1581/unfuddle 15446 -> unfuddle
 * 15457, a real Unfuddle ticket outside Milestone 183 that was never
 * imported) is never inserted, under any circumstance — it is filtered out
 * before candidates are even built (see import-relations/canonicalize-
 * relations.ts, which only ever consumes `status === "both_resolved"`
 * relations).
 *
 * Order: fresh PREVIEW (parse + precheck) -> exact-number gate -> single
 * atomic RPC call for all 19 rows -> re-read/reconcile every inserted row
 * against the planned mapping. Stops at the first failure; never deletes an
 * inserted row automatically; never retries indiscriminately; never
 * updates/upserts.
 *
 * Usage:
 *   npx tsx src/lib/unfuddle-import/runner/phase7-run.ts \
 *     --backup=/path/to/backup.xml --media=/path/to/media [--apply]
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { runDryRun } from "./dry-run";
import { printDryRunReport } from "./print-report";
import { printPhase7Report } from "./phase7-print-report";
import { getSupabaseAdminClient } from "../supabase-admin-client";
import { runRelationPrecheck } from "../preflight/run-relation-precheck";
import { applyRelations } from "../import-relations/apply-relations";
import {
  TARGET_ORGANIZATION_SLUG,
  TARGET_UNFUDDLE_MILESTONE_ID,
  TARGET_UNFUDDLE_PROJECT_ID,
  type Phase2Config as Phase7Config,
} from "../config";
import type { Phase7Report, RelationsPrecheckResult } from "../types/phase7";

function loadEnvFile(): void {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    /* no .env.local in cwd — rely on already-exported env vars */
  }
}

function parseArgs(argv: string[]): { config: Phase7Config; apply: boolean } {
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
    console.error("Usage: phase7-run.ts --backup=<path to backup.xml> --media=<path to media/> [--apply] [--project=152] [--milestone=183]");
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
      targetUserUnfuddleIds: [],
      knownOrphanUnfuddleIds: [],
      apply,
    },
  };
}

function finish(report: Phase7Report): void {
  const { success } = printPhase7Report(report);
  process.exitCode = success ? 0 : 1;
}

/** Every exact number this task's spec requires before APPLY may write anything. Returns the list of mismatches — empty means "go". */
function checkExactPreApplyNumbers(precheck: RelationsPrecheckResult): string[] {
  const problems: string[] = [];
  if (precheck.blockingReasons.length !== 0) problems.push(`precheck.blockingReasons=${precheck.blockingReasons.length}, expected 0`);
  if (precheck.scope.initiallyAssociatedWithKTVibe !== 39) problems.push(`scope.initiallyAssociatedWithKTVibe=${precheck.scope.initiallyAssociatedWithKTVibe}, expected 39`);
  if (precheck.scope.bothEndsInScopeRaw !== 38) problems.push(`scope.bothEndsInScopeRaw=${precheck.scope.bothEndsInScopeRaw}, expected 38`);
  if (precheck.scope.excludedExternalRaw !== 1) problems.push(`scope.excludedExternalRaw=${precheck.scope.excludedExternalRaw}, expected 1`);
  if (precheck.scope.targetCrossProjectRaw !== 0) problems.push(`scope.targetCrossProjectRaw=${precheck.scope.targetCrossProjectRaw}, expected 0`);
  if (precheck.scope.selfRelationCount !== 0) problems.push(`scope.selfRelationCount=${precheck.scope.selfRelationCount}, expected 0`);
  if (precheck.blockedRelations.length !== 1) problems.push(`blockedRelations.length=${precheck.blockedRelations.length}, expected 1 (excluded_external)`);
  if (precheck.canonicalCandidates.length !== 19) problems.push(`canonicalCandidates.length=${precheck.canonicalCandidates.length}, expected 19`);
  if (new Set(precheck.canonicalCandidates.map((c) => c.unfuddleRelationKey)).size !== 19) problems.push("Planned unfuddleRelationKey values are not all unique.");
  if (!precheck.canonicalCandidates.every((c) => c.mappedKind === "related_to")) problems.push("Not every candidate maps to related_to.");
  if (!precheck.canonicalCandidates.every((c) => c.plannedRow.created_by === null)) problems.push("Not every candidate has created_by=null.");
  if (!precheck.idempotency) problems.push("idempotency is null.");
  else {
    if (precheck.idempotency.newCandidates.length !== 19) problems.push(`idempotency.newCandidates=${precheck.idempotency.newCandidates.length}, expected 19`);
    if (precheck.idempotency.alreadyImportedMatching.length !== 0) problems.push(`idempotency.alreadyImportedMatching=${precheck.idempotency.alreadyImportedMatching.length}, expected 0`);
    if (precheck.idempotency.conflicting.length !== 0) problems.push(`idempotency.conflicting=${precheck.idempotency.conflicting.length}, expected 0`);
    if (precheck.idempotency.duplicateKeysInBatch.length !== 0) problems.push(`idempotency.duplicateKeysInBatch=${precheck.idempotency.duplicateKeysInBatch.length}, expected 0`);
    if (precheck.idempotency.unrelatedExistingRelationsInJirita.length !== 2) problems.push(`idempotency.unrelatedExistingRelationsInJirita=${precheck.idempotency.unrelatedExistingRelationsInJirita.length}, expected 2 (the native relations)`);
  }
  return problems;
}

async function runApply(admin: SupabaseClient, precheck: RelationsPrecheckResult): Promise<Phase7Report> {
  const mismatches = checkExactPreApplyNumbers(precheck);
  if (mismatches.length > 0) {
    console.error("APPLY ABORTADO ANTES DE ESCRIBIR — las cifras exactas requeridas no coinciden con el PREVIEW fresco de esta misma invocación:");
    for (const m of mismatches) console.error(`  - ${m}`);
    return { mode: "APPLY", precheck, applyOutcome: null, outcome: "apply_rejected", failureReasons: mismatches };
  }

  console.log(`\nEjecutando APPLY: ${precheck.idempotency!.newCandidates.length} relaciones, batch único transaccional...`);
  const applyOutcome = await applyRelations(admin, precheck.idempotency!.newCandidates);

  const ok =
    applyOutcome.error === null &&
    applyOutcome.attempted === 19 &&
    applyOutcome.inserted === 19 &&
    applyOutcome.reconciledOk === 19 &&
    applyOutcome.reconciliationDiffs.length === 0 &&
    !applyOutcome.possiblePartialImport;

  const failureReasons: string[] = [];
  if (!ok) {
    if (applyOutcome.error) failureReasons.push(applyOutcome.error);
    if (applyOutcome.inserted !== 19) failureReasons.push(`Only ${applyOutcome.inserted}/19 rows inserted.`);
    if (applyOutcome.reconciledOk !== 19) failureReasons.push(`Only ${applyOutcome.reconciledOk}/19 rows reconciled without diffs.`);
    failureReasons.push(...applyOutcome.reconciliationDiffs.map((d) => `${d.unfuddleRelationKey}: ${d.diffs.join("; ")}`));
  }

  return { mode: "APPLY", precheck, applyOutcome, outcome: ok ? "apply_success" : "failed", failureReasons };
}

async function main(): Promise<void> {
  const { config, apply } = parseArgs(process.argv.slice(2));
  const mode: Phase7Report["mode"] = apply ? "APPLY" : "PREVIEW";

  loadEnvFile();

  // ── Step 1: the existing streaming parser + the existing Phase 1 Dry Run. ──
  const { report: dryRunReport, parsed } = await runDryRun(config);
  const { success: dryRunSuccess } = printDryRunReport(dryRunReport);

  if (!dryRunSuccess) {
    const reason = "Phase 1 Dry Run reported failures — see the report above.";
    finish({ mode, precheck: null, applyOutcome: null, outcome: "failed", failureReasons: [reason] });
    return;
  }

  let admin: SupabaseClient;
  try {
    admin = getSupabaseAdminClient();
  } catch (err) {
    const reason = `Supabase admin client init failed: ${(err as Error).message}`;
    finish({ mode, precheck: null, applyOutcome: null, outcome: "failed", failureReasons: [reason] });
    return;
  }

  // ── Step 2: Phase 7's own precheck — read-only throughout (see
  // preflight/run-relation-precheck.ts: only .select() calls, never
  // .insert()/.update()/.delete()/.rpc()). This is the SAME fresh precheck
  // APPLY re-verifies exact numbers against below — satisfying "PREVIEW
  // fresco dentro de la misma invocación de APPLY" without a second,
  // redundant run. ──
  const precheck = await runRelationPrecheck(admin, parsed, config);

  if (mode === "PREVIEW") {
    finish({ mode, precheck, applyOutcome: null, outcome: precheck.ok ? "preview_success" : "failed", failureReasons: precheck.blockingReasons });
    return;
  }

  // ── APPLY — gated on the fresh precheck's exact numbers, then a single
  // atomic RPC call, then full reconciliation. ──
  try {
    const report = await runApply(admin, precheck);
    finish(report);
  } catch (err) {
    finish({ mode, precheck, applyOutcome: null, outcome: "failed", failureReasons: [(err as Error).message] });
  }
}

// Only auto-run when this file is the actual entry point — see dry-run.ts's
// own comment for why every later phase's runner needs this same guard.
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  main().catch((err) => {
    console.error("Phase 7 crashed:", err);
    process.exitCode = 1;
  });
}
