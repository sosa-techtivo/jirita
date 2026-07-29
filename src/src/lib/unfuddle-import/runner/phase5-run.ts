#!/usr/bin/env -S node --import tsx
/**
 * Phase 5 of the Unfuddle -> Jirita importer: the 221 KTVibe time entries.
 *
 * Infrastructure only in this task — migration 20260824000000 (adds
 * `unfuddle_id`/`updated_at` to `ticket_time_entries`, the activity
 * bypass guard, and `insert_ticket_time_entries_bypassing_activity_log`)
 * has been designed and written but could not be applied from this
 * session (no Supabase project access — see preflight/audit-time-entry-schema.ts).
 * `schemaAudit.blocksApply` stays `true` until that migration is confirmed
 * live with real controlled tests, so this runner's APPLY branch — fully
 * built, mirroring Phase 3/4 exactly — is not reachable yet.
 *
 * Default mode is PREVIEW (writes nothing). APPLY only runs with the
 * explicit --apply flag, and only once every precondition passes,
 * including the schema/bypass audit.
 *
 * Usage:
 *   npx tsx src/lib/unfuddle-import/runner/phase5-run.ts \
 *     --backup=/path/to/backup.xml --media=/path/to/media [--apply]
 */
import { runDryRun } from "./dry-run";
import { printDryRunReport } from "./print-report";
import { printPhase5Report } from "./phase5-print-report";
import { getSupabaseAdminClient } from "../supabase-admin-client";
import { runPrecheck as runPhase2Precheck } from "../preflight/run-precheck";
import { runTimeEntryPrecheck } from "../preflight/run-time-entry-precheck";
import { insertTimeEntries } from "../import-time-entries/insert-time-entries";
import {
  KNOWN_ORPHAN_UNFUDDLE_IDS,
  TARGET_ORGANIZATION_SLUG,
  TARGET_UNFUDDLE_MILESTONE_ID,
  TARGET_UNFUDDLE_PROJECT_ID,
  TARGET_USER_UNFUDDLE_IDS,
  type Phase3Config as Phase5Config,
} from "../config";
import type { Phase5PrecheckResult, Phase5Report } from "../types/phase5";

function loadEnvFile(): void {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    /* no .env.local in cwd — rely on already-exported env vars */
  }
}

function parseArgs(argv: string[]): Phase5Config {
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
    console.error("Usage: phase5-run.ts --backup=<path to backup.xml> --media=<path to media/> [--apply] [--project=152] [--milestone=183]");
    process.exit(2);
  }

  return {
    backupXmlPath,
    mediaDir,
    targetProjectId: args.has("project") ? Number(args.get("project")) : TARGET_UNFUDDLE_PROJECT_ID,
    targetMilestoneId: args.has("milestone") ? Number(args.get("milestone")) : TARGET_UNFUDDLE_MILESTONE_ID,
    organizationSlug: TARGET_ORGANIZATION_SLUG,
    targetUserUnfuddleIds: TARGET_USER_UNFUDDLE_IDS,
    knownOrphanUnfuddleIds: KNOWN_ORPHAN_UNFUDDLE_IDS,
    apply,
  };
}

function emptyPrecheck(reason: string): Phase5PrecheckResult {
  return {
    organization: { slug: TARGET_ORGANIZATION_SLUG, matchCount: 0, organizationId: null, name: null, error: null },
    project: { projectId: null, ok: false, error: null },
    ticketsReconciled: { total: 0, ok: false, error: null },
    parents: { map: new Map(), missingParents: [], totalTicketsInProject: 0, ok: false },
    userMap: { map: new Map(), entries: [], ok: false, blockingReasons: [] },
    stats: {
      total: 0,
      totalMinutes: 0,
      totalHoursRounded: 0,
      withDescription: 0,
      withoutDescription: 0,
      withKnownUser: 0,
      withRemovedButKnownUser: 0,
      withOrphanUser: 0,
      withoutPersonId: 0,
      unexpectedUserIds: [],
      updatedDiffersFromCreated: 0,
      ticketsWithEntries: 0,
      maxEntriesPerTicket: 0,
      maxHoursSingleEntry: 0,
      minPositiveHours: 0,
      zeroHoursCount: 0,
      negativeHoursCount: 0,
      precisionLossCount: 0,
      precisionLossExamples: [],
    },
    duplicateContentGroups: [],
    mapping: { planned: [], errors: [], ok: false },
    schemaAudit: {
      hasUnfuddleIdColumn: false,
      hasUpdatedAtColumn: false,
      loggedByNullable: false,
      minutesConstraint: "",
      activityTrigger: { exists: false, unconditional: false, description: "" },
      membershipTrigger: { exists: false, description: "" },
      blocksApply: true,
      reason,
    },
    hoursComparison: null,
    idempotency: null,
    ok: false,
    blockingReasons: [reason],
  };
}

function finish(report: Phase5Report): void {
  printPhase5Report(report);
  process.exitCode = report.outcome === "failed" ? 1 : 0;
}

async function main(): Promise<void> {
  loadEnvFile();
  const config = parseArgs(process.argv.slice(2));
  const mode: Phase5Report["mode"] = config.apply ? "APPLY" : "PREVIEW";

  // ── Step 1: the existing streaming parser + the existing Phase 1 Dry Run. ──
  const { report: dryRunReport, parsed } = await runDryRun(config);
  const { success: dryRunSuccess } = printDryRunReport(dryRunReport);

  if (!dryRunSuccess) {
    const reason = "Phase 1 Dry Run reported failures — see the report above.";
    finish({ mode, precheck: emptyPrecheck(reason), applyOutcome: null, outcome: "failed", failureReasons: [reason] });
    return;
  }

  let admin;
  try {
    admin = getSupabaseAdminClient();
  } catch (err) {
    const reason = `Supabase admin client init failed: ${(err as Error).message}`;
    finish({ mode, precheck: emptyPrecheck(reason), applyOutcome: null, outcome: "failed", failureReasons: [reason] });
    return;
  }

  // ── Step 2: the existing Phase 2 preflight. ──
  const phase2Precheck = await runPhase2Precheck(admin, parsed, config);

  // ── Step 3: Phase 5's own precheck — ticket-parent resolution (tolerant
  // of ticket #651's legitimate drift), user map, mapping, schema/bypass
  // audit, and (once the schema audit says the column is live)
  // unfuddle_id-keyed idempotency. ──
  const precheck = await runTimeEntryPrecheck(admin, parsed, config);

  const dataOk = phase2Precheck.ok && precheck.ok;
  const failureReasons = [...(phase2Precheck.ok ? [] : phase2Precheck.blockingReasons.map((r) => `[Phase 2 preflight] ${r}`)), ...precheck.blockingReasons];

  if (!dataOk) {
    finish({ mode, precheck, applyOutcome: null, outcome: "failed", failureReasons });
    return;
  }

  if (mode === "PREVIEW") {
    finish({ mode, precheck, applyOutcome: null, outcome: "preview_success", failureReasons: [] });
    return;
  }

  // ── APPLY — not reachable while schemaAudit.blocksApply holds (dataOk
  // would already be false above, since that reason is folded into
  // blockingReasons). Kept fully built for the task that verifies the
  // migration live and actually runs this. ──
  if (precheck.schemaAudit.blocksApply || !precheck.idempotency) {
    finish({ mode, precheck, applyOutcome: null, outcome: "failed", failureReasons: [precheck.schemaAudit.reason] });
    return;
  }

  if (precheck.idempotency.newEntries.length === 0) {
    finish({
      mode,
      precheck,
      applyOutcome: {
        attempted: 0,
        inserted: 0,
        skippedAlreadyImported: precheck.idempotency.alreadyImportedMatching.length,
        failed: 0,
        possiblePartialImport: false,
        insertedUnfuddleIds: [],
        reconciledOk: 0,
        reconciliationDiffs: [],
        error: null,
      },
      outcome: "apply_success",
      failureReasons: [],
    });
    return;
  }

  try {
    const applyOutcome = await insertTimeEntries(admin, precheck.idempotency.newEntries);
    applyOutcome.skippedAlreadyImported = precheck.idempotency.alreadyImportedMatching.length;
    const ok = applyOutcome.error === null && applyOutcome.reconciliationDiffs.length === 0;
    finish({
      mode,
      precheck,
      applyOutcome,
      outcome: ok ? "apply_success" : "failed",
      failureReasons: ok ? [] : [applyOutcome.error ?? "Reconciliation found differences after insert.", ...applyOutcome.reconciliationDiffs.map((d) => `time entry ${d.unfuddleId}: ${d.diffs.join("; ")}`)],
    });
  } catch (err) {
    finish({ mode, precheck, applyOutcome: null, outcome: "failed", failureReasons: [(err as Error).message] });
  }
}

main().catch((err) => {
  console.error("Phase 5 crashed:", err);
  process.exitCode = 1;
});
