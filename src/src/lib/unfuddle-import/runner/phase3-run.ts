#!/usr/bin/env -S node --import tsx
/**
 * Phase 3 of the Unfuddle -> Jirita importer: import only the 170 KTVibe
 * tickets (first-level tickets already materialized by Phase 1's parser —
 * no second parser, no embedded associated-tickets copies).
 *
 * Never touches project_memberships, comments, time entries, attachments,
 * relations, subscriptions, audit-trails, notebooks, or changesets — see
 * ../phases.ts.
 *
 * Default mode is PREVIEW (writes nothing). APPLY only runs with the
 * explicit --apply flag, and only once every precondition — including the
 * ticket_activity side-effect audit (see
 * preflight/audit-ticket-side-effects.ts) — passes.
 *
 * Usage:
 *   npx tsx src/lib/unfuddle-import/runner/phase3-run.ts \
 *     --backup=/path/to/backup.xml --media=/path/to/media [--apply]
 */
import { runDryRun } from "./dry-run";
import { printDryRunReport } from "./print-report";
import { printPhase3Report } from "./phase3-print-report";
import { getSupabaseAdminClient } from "../supabase-admin-client";
import { runPrecheck as runPhase2Precheck } from "../preflight/run-precheck";
import { runTicketPrecheck } from "../preflight/run-ticket-precheck";
import { insertTickets } from "../import-tickets/insert-tickets";
import {
  KNOWN_ORPHAN_UNFUDDLE_IDS,
  TARGET_ORGANIZATION_SLUG,
  TARGET_UNFUDDLE_MILESTONE_ID,
  TARGET_UNFUDDLE_PROJECT_ID,
  TARGET_USER_UNFUDDLE_IDS,
  type Phase3Config,
} from "../config";
import type { Phase3PrecheckResult, Phase3Report } from "../types/phase3";

function loadEnvFile(): void {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    /* no .env.local in cwd — rely on already-exported env vars */
  }
}

function parseArgs(argv: string[]): Phase3Config {
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
    console.error("Usage: phase3-run.ts --backup=<path to backup.xml> --media=<path to media/> [--apply] [--project=152] [--milestone=183]");
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

function emptyTicketPrecheck(reason: string): Phase3PrecheckResult {
  return {
    organization: { slug: TARGET_ORGANIZATION_SLUG, matchCount: 0, organizationId: null, name: null, error: null },
    project: { organizationId: null, projectId: null, slug: null, projectCode: null, organizationMatches: false, slugMatches: false, projectCodeMatches: false, ok: false, error: null },
    userMap: { map: new Map(), entries: [], ok: false, blockingReasons: [] },
    ticketStats: {
      total: 0,
      byOriginalStatus: {},
      byJiritaStatus: {},
      byOriginalPriority: {},
      byJiritaPriority: {},
      withDescription: 0,
      withoutDescription: 0,
      withDueDate: 0,
      withoutDueDate: 0,
      withEstimate: 0,
      withoutEstimate: 0,
      withAssignee: 0,
      withoutAssignee: 0,
      withOrphanReporter: 0,
      withOrphanAssignee: 0,
    },
    mapping: { planned: [], errors: [], ok: false },
    idempotency: { newTickets: [], alreadyImportedMatching: [], conflicting: [], ticketNumberCollisions: [], duplicateTicketNumbersInBatch: [], duplicateUnfuddleIdsInBatch: [], ok: false },
    sideEffects: { activityRowsPerInsertedTicket: 0, activityActorSource: "", activityTimestampIssue: "", projectMembershipSideEffect: "", blocksApply: true, reason },
    ok: false,
    blockingReasons: [reason],
  };
}

function finish(report: Phase3Report): void {
  printPhase3Report(report);
  process.exitCode = report.outcome === "failed" ? 1 : 0;
}

async function main(): Promise<void> {
  loadEnvFile();
  const config = parseArgs(process.argv.slice(2));
  const mode: Phase3Report["mode"] = config.apply ? "APPLY" : "PREVIEW";

  // ── Step 1: the existing streaming parser + the existing Phase 1 Dry Run
  // — reused, never re-implemented, never skipped. ──
  const { report: dryRunReport, parsed } = await runDryRun(config);
  const { success: dryRunSuccess } = printDryRunReport(dryRunReport);

  if (!dryRunSuccess) {
    const reason = "Phase 1 Dry Run reported failures — see the report above.";
    finish({ mode, precheck: emptyTicketPrecheck(reason), applyOutcome: null, outcome: "failed", failureReasons: [reason] });
    return;
  }

  let admin;
  try {
    admin = getSupabaseAdminClient();
  } catch (err) {
    const reason = `Supabase admin client init failed: ${(err as Error).message}`;
    finish({ mode, precheck: emptyTicketPrecheck(reason), applyOutcome: null, outcome: "failed", failureReasons: [reason] });
    return;
  }

  // ── Step 2: the existing Phase 2 preflight — re-run, not skipped, so a
  // drifted org/project/user precondition is caught here too. ──
  const phase2Precheck = await runPhase2Precheck(admin, parsed, config);

  // ── Step 3: Phase 3's own precheck — project drift, user map, ticket
  // mapping, idempotency, and the (always-on) side-effect audit. ──
  const { result: precheck } = await runTicketPrecheck(admin, parsed, config);

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

  // ── APPLY — data preconditions passed. The side-effect audit is a
  // separate, always-on gate: it does not affect PREVIEW's own success (its
  // job is exactly to surface this), but it does block real writes. ──
  if (precheck.sideEffects.blocksApply) {
    finish({ mode, precheck, applyOutcome: null, outcome: "failed", failureReasons: [precheck.sideEffects.reason] });
    return;
  }

  if (precheck.idempotency.newTickets.length === 0) {
    finish({
      mode,
      precheck,
      applyOutcome: { attempted: 0, inserted: 0, skippedAlreadyImported: precheck.idempotency.alreadyImportedMatching.length, failed: 0, possiblePartialImport: false, insertedUnfuddleIds: [], reconciledOk: 0, reconciliationDiffs: [], error: null },
      outcome: "apply_success",
      failureReasons: [],
    });
    return;
  }

  try {
    const applyOutcome = await insertTickets(admin, precheck.project.projectId as string, precheck.idempotency.newTickets);
    applyOutcome.skippedAlreadyImported = precheck.idempotency.alreadyImportedMatching.length;
    const ok = applyOutcome.error === null && applyOutcome.reconciliationDiffs.length === 0;
    finish({
      mode,
      precheck,
      applyOutcome,
      outcome: ok ? "apply_success" : "failed",
      failureReasons: ok ? [] : [applyOutcome.error ?? "Reconciliation found differences after insert.", ...applyOutcome.reconciliationDiffs.map((d) => `ticket ${d.unfuddleId}: ${d.diffs.join("; ")}`)],
    });
  } catch (err) {
    finish({ mode, precheck, applyOutcome: null, outcome: "failed", failureReasons: [(err as Error).message] });
  }
}

main().catch((err) => {
  console.error("Phase 3 crashed:", err);
  process.exitCode = 1;
});
