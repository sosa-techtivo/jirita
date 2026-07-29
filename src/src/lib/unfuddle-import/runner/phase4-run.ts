#!/usr/bin/env -S node --import tsx
/**
 * Phase 4 of the Unfuddle -> Jirita importer: import only the 412 comments
 * on the 170 already-imported KTVibe tickets.
 *
 * Never touches time entries, attachments, relations, subscriptions,
 * audit-trails, notebooks, changesets, project_memberships, or historical
 * activity — see ../phases.ts.
 *
 * Default mode is PREVIEW (writes nothing). APPLY only runs with the
 * explicit --apply flag, and only once every precondition — including the
 * ticket_comments_log_activity side-effect audit (see
 * preflight/audit-comment-side-effects.ts) — passes. As of this task, that
 * audit still blocks APPLY: unlike tickets_log_created (fixed in a
 * dedicated task), no bypass has been built for comments yet — this task
 * explicitly forbids inventing one here.
 *
 * Usage:
 *   npx tsx src/lib/unfuddle-import/runner/phase4-run.ts \
 *     --backup=/path/to/backup.xml --media=/path/to/media [--apply]
 */
import { runDryRun } from "./dry-run";
import { printDryRunReport } from "./print-report";
import { printPhase4Report } from "./phase4-print-report";
import { getSupabaseAdminClient } from "../supabase-admin-client";
import { runPrecheck as runPhase2Precheck } from "../preflight/run-precheck";
import { runCommentPrecheck } from "../preflight/run-comment-precheck";
import { insertComments } from "../import-comments/insert-comments";
import {
  KNOWN_ORPHAN_UNFUDDLE_IDS,
  TARGET_ORGANIZATION_SLUG,
  TARGET_UNFUDDLE_MILESTONE_ID,
  TARGET_UNFUDDLE_PROJECT_ID,
  TARGET_USER_UNFUDDLE_IDS,
  type Phase3Config as Phase4Config,
} from "../config";
import type { Phase4PrecheckResult, Phase4Report } from "../types/phase4";

function loadEnvFile(): void {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    /* no .env.local in cwd — rely on already-exported env vars */
  }
}

function parseArgs(argv: string[]): Phase4Config {
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
    console.error("Usage: phase4-run.ts --backup=<path to backup.xml> --media=<path to media/> [--apply] [--project=152] [--milestone=183]");
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

function emptyPrecheck(reason: string): Phase4PrecheckResult {
  return {
    organization: { slug: TARGET_ORGANIZATION_SLUG, matchCount: 0, organizationId: null, name: null, error: null },
    project: { projectId: null, ok: false, error: null },
    ticketsReconciled: { total: 0, ok: false, error: null },
    parents: { map: new Map(), missingParents: [], totalTicketsInProject: 0, ok: false },
    userMap: { map: new Map(), entries: [], ok: false, blockingReasons: [] },
    commentStats: {
      total: 0,
      withBody: 0,
      emptyBody: 0,
      withKnownAuthor: 0,
      withRemovedButKnownAuthor: 0,
      withOrphanAuthor150: 0,
      withOrphanAuthor153: 0,
      withEmptyAuthorId: 0,
      unexpectedAuthorIds: [],
      updatedDiffersFromCreated: 0,
      withPendingAttachments: 0,
      ticketsWithComments: 0,
      maxCommentsPerTicket: 0,
    },
    mapping: { planned: [], errors: [], ok: false },
    idempotency: { newComments: [], alreadyImportedMatching: [], conflicting: [], duplicateUnfuddleIdsInBatch: [], identicalContentDifferentIds: [], ok: false },
    sideEffects: { activityRowsPerInsertedComment: 0, activityActorSource: "", activityTimestampIssue: "", projectMembershipSideEffect: "", blocksApply: true, reason },
    ok: false,
    blockingReasons: [reason],
  };
}

function finish(report: Phase4Report): void {
  printPhase4Report(report);
  process.exitCode = report.outcome === "failed" ? 1 : 0;
}

async function main(): Promise<void> {
  loadEnvFile();
  const config = parseArgs(process.argv.slice(2));
  const mode: Phase4Report["mode"] = config.apply ? "APPLY" : "PREVIEW";

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

  // ── Step 2: the existing Phase 2 preflight (org/users/project conflicts). ──
  const phase2Precheck = await runPhase2Precheck(admin, parsed, config);

  // ── Step 3: Phase 4's own precheck — Phase 3 reconciliation, comment
  // parents, author map, mapping, idempotency, and the (currently blocking)
  // side-effect audit. ──
  const { result: precheck } = await runCommentPrecheck(admin, parsed, config);

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

  // ── APPLY — data preconditions passed. Side effects are a separate,
  // always-on gate (see Phase 3's own runner for the same pattern). ──
  if (precheck.sideEffects.blocksApply) {
    finish({ mode, precheck, applyOutcome: null, outcome: "failed", failureReasons: [precheck.sideEffects.reason] });
    return;
  }

  if (precheck.idempotency.newComments.length === 0) {
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
    const applyOutcome = await insertComments(admin, precheck.idempotency.newComments);
    applyOutcome.skippedAlreadyImported = precheck.idempotency.alreadyImportedMatching.length;
    const ok = applyOutcome.error === null && applyOutcome.reconciliationDiffs.length === 0;
    finish({
      mode,
      precheck,
      applyOutcome,
      outcome: ok ? "apply_success" : "failed",
      failureReasons: ok ? [] : [applyOutcome.error ?? "Reconciliation found differences after insert.", ...applyOutcome.reconciliationDiffs.map((d) => `comment ${d.unfuddleId}: ${d.diffs.join("; ")}`)],
    });
  } catch (err) {
    finish({ mode, precheck, applyOutcome: null, outcome: "failed", failureReasons: [(err as Error).message] });
  }
}

main().catch((err) => {
  console.error("Phase 4 crashed:", err);
  process.exitCode = 1;
});
