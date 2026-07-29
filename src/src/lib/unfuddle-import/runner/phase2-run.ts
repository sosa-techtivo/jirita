#!/usr/bin/env -S node --import tsx
/**
 * Phase 2 of the Unfuddle -> Jirita importer: validate real Supabase
 * preconditions and import only the KTVibe `projects` row.
 *
 * Never touches project_memberships, tickets, comments, time entries,
 * attachments, relations, activity, or profiles.unfuddle_id — those stay
 * exactly Phase 3+ (see ../phases.ts).
 *
 * Default mode is PREVIEW (writes nothing). APPLY only runs with the
 * explicit --apply flag, and only after every precondition below passes.
 *
 * Usage:
 *   npx tsx src/lib/unfuddle-import/runner/phase2-run.ts \
 *     --backup=/path/to/backup.xml --media=/path/to/media [--apply]
 */
import { runDryRun } from "./dry-run";
import { printDryRunReport } from "./print-report";
import { printPhase2Report } from "./phase2-print-report";
import { getSupabaseAdminClient } from "../supabase-admin-client";
import { runPrecheck } from "../preflight/run-precheck";
import { buildPlannedProjectFields, EXPECTED_SCHEMA_DEFAULTS } from "../import-project/build-project-row";
import { diffProjectFields } from "../import-project/reconcile-project-row";
import { insertProject } from "../import-project/insert-project";
import {
  KNOWN_ORPHAN_UNFUDDLE_IDS,
  TARGET_ORGANIZATION_SLUG,
  TARGET_UNFUDDLE_MILESTONE_ID,
  TARGET_UNFUDDLE_PROJECT_ID,
  TARGET_USER_UNFUDDLE_IDS,
  type Phase2Config,
} from "../config";
import type { Phase2PrecheckResult, Phase2Report } from "../types/phase2";

function loadEnvFile(): void {
  // Standalone CLI, not `next dev`/`next build` — .env.local isn't
  // auto-loaded here the way Next.js loads it. Best-effort only: env vars
  // may already be exported some other way (CI, shell), so a missing file
  // is not an error.
  try {
    process.loadEnvFile(".env.local");
  } catch {
    /* no .env.local in cwd — rely on already-exported env vars */
  }
}

function parseArgs(argv: string[]): Phase2Config {
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
    console.error("Usage: phase2-run.ts --backup=<path to backup.xml> --media=<path to media/> [--apply] [--project=152] [--milestone=183]");
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

function emptyPrecheck(reason: string): Phase2PrecheckResult {
  return {
    organization: { slug: TARGET_ORGANIZATION_SLUG, matchCount: 0, organizationId: null, name: null, error: null },
    users: { entries: [], orphanUnfuddleIds: KNOWN_ORPHAN_UNFUDDLE_IDS, ok: false },
    project: { plannedSlug: "", plannedProjectCode: "", existingByUnfuddleId: null, slugConflicts: [], projectCodeConflicts: [] },
    ok: false,
    blockingReasons: [reason],
  };
}

function finish(report: Phase2Report): void {
  printPhase2Report(report);
  process.exitCode = report.outcome === "failed" ? 1 : 0;
}

async function main(): Promise<void> {
  loadEnvFile();
  const config = parseArgs(process.argv.slice(2));
  const mode: Phase2Report["mode"] = config.apply ? "APPLY" : "PREVIEW";

  // ── Step 1+2: the existing streaming parser + the existing Phase 1 Dry
  // Run — reused, not re-implemented, and never skipped in either mode. ──
  const { report: dryRunReport, parsed } = await runDryRun(config);
  const { success: dryRunSuccess } = printDryRunReport(dryRunReport);

  if (!dryRunSuccess) {
    finish({
      mode,
      precheck: emptyPrecheck("Phase 1 Dry Run reported failures — see the report above."),
      plannedFields: null,
      schemaDefaultsApplied: EXPECTED_SCHEMA_DEFAULTS,
      insertedRow: null,
      reconciliation: null,
      sideEffects: null,
      alreadyImportedDiffs: null,
      outcome: "failed",
      failureReasons: ["Phase 1 Dry Run reported failures — see the report above."],
    });
    return;
  }

  let admin;
  try {
    admin = getSupabaseAdminClient();
  } catch (err) {
    const reason = `Supabase admin client init failed: ${(err as Error).message}`;
    finish({
      mode,
      precheck: emptyPrecheck(reason),
      plannedFields: null,
      schemaDefaultsApplied: EXPECTED_SCHEMA_DEFAULTS,
      insertedRow: null,
      reconciliation: null,
      sideEffects: null,
      alreadyImportedDiffs: null,
      outcome: "failed",
      failureReasons: [reason],
    });
    return;
  }

  // ── Step 3: the real Supabase precheck — always runs, in both modes
  // ("repetir todas las validaciones" applies to APPLY too). ──
  const precheck = await runPrecheck(admin, parsed, config);

  const executedAt = new Date();
  const plannedFields =
    parsed.project && precheck.organization.organizationId
      ? buildPlannedProjectFields(parsed.project, precheck.organization.organizationId, executedAt)
      : null;

  // Idempotent replay: a project with this unfuddle_id already existing is
  // not itself a blocking conflict — compare it against what we'd plan to
  // insert instead. Never auto-update.
  if (precheck.project.existingByUnfuddleId && plannedFields) {
    const diffs = diffProjectFields(plannedFields, precheck.project.existingByUnfuddleId);
    finish({
      mode,
      precheck,
      plannedFields,
      schemaDefaultsApplied: EXPECTED_SCHEMA_DEFAULTS,
      insertedRow: precheck.project.existingByUnfuddleId,
      reconciliation: null,
      sideEffects: null,
      alreadyImportedDiffs: diffs,
      outcome: diffs.length === 0 ? "already_imported" : "failed",
      failureReasons:
        diffs.length === 0
          ? []
          : [`Existing project ${precheck.project.existingByUnfuddleId.id} differs from the expected configuration — not updating automatically.`, ...diffs],
    });
    return;
  }

  if (!precheck.ok || !plannedFields) {
    finish({
      mode,
      precheck,
      plannedFields,
      schemaDefaultsApplied: EXPECTED_SCHEMA_DEFAULTS,
      insertedRow: null,
      reconciliation: null,
      sideEffects: null,
      alreadyImportedDiffs: null,
      outcome: "failed",
      failureReasons: precheck.blockingReasons.length > 0 ? precheck.blockingReasons : ["Preconditions not satisfied."],
    });
    return;
  }

  if (mode === "PREVIEW") {
    finish({
      mode,
      precheck,
      plannedFields,
      schemaDefaultsApplied: EXPECTED_SCHEMA_DEFAULTS,
      insertedRow: null,
      reconciliation: null,
      sideEffects: null,
      alreadyImportedDiffs: null,
      outcome: "preview_success",
      failureReasons: [],
    });
    return;
  }

  // ── APPLY — every precondition above passed. ──
  try {
    const { insertedRow, reconciliation, projectMembershipsCreated } = await insertProject(admin, plannedFields);
    const sideEffectFailure = projectMembershipsCreated > 0 ? [`Unexpected side effect: ${projectMembershipsCreated} project_memberships row(s) were created.`] : [];
    const failureReasons = [...(reconciliation.ok ? [] : reconciliation.diffs), ...sideEffectFailure];

    finish({
      mode,
      precheck,
      plannedFields,
      schemaDefaultsApplied: EXPECTED_SCHEMA_DEFAULTS,
      insertedRow,
      reconciliation,
      sideEffects: { projectMembershipsCreated },
      alreadyImportedDiffs: null,
      outcome: failureReasons.length === 0 ? "apply_success" : "failed",
      failureReasons,
    });
  } catch (err) {
    finish({
      mode,
      precheck,
      plannedFields,
      schemaDefaultsApplied: EXPECTED_SCHEMA_DEFAULTS,
      insertedRow: null,
      reconciliation: null,
      sideEffects: null,
      alreadyImportedDiffs: null,
      outcome: "failed",
      failureReasons: [(err as Error).message],
    });
  }
}

main().catch((err) => {
  console.error("Phase 2 crashed:", err);
  process.exitCode = 1;
});
