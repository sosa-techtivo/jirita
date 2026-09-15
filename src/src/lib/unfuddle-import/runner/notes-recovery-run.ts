#!/usr/bin/env -S node --import tsx
/**
 * Unfuddle Notebook/Page -> project_notes recovery, multi-project /
 * fail-closed (see import-notes-recovery/notebook-project-allowlist.ts).
 *
 * The first recovery attempt was technically correct but semantically
 * wrong: it assumed every Notebook's Notes belonged to KTVibe, because
 * Unfuddle Project 152's <notebook><project-id> is a shared container id,
 * not the real per-notebook JIRITA destination. Those 158 rows were
 * inserted into the wrong project and have since been deleted from
 * `project_notes` (preserved in `_backup_project_notes_recovery_20260915`
 * for audit — never touched by this recovery).
 *
 * PREVIEW is the default and never writes. APPLY requires BOTH `--apply`
 * AND `--confirm-allowlisted-28` — either flag alone aborts before Supabase
 * is even touched, with a clear message (task's explicit two-flag human
 * authorization gate, replacing the prior task's temporary unconditional
 * --apply block). Even with both flags, APPLY re-validates the exact
 * expected numbers (53/248/158/28/130, the 7+3+8+1+8+1 per-destination
 * split, 0 continuity issues, 0 unresolved authors, 0 conflicts, and a
 * defense-in-depth check that every planned row's notebook is still in the
 * allowlist) against a FRESH precheck in this same invocation before
 * calling the insert RPC, and always reconciles the full 28-Note expected
 * state from the database afterward (see reconcile-note-recovery.ts) before
 * ever declaring success — a second, idempotent APPLY run (0 new / 28
 * already imported) is treated as valid, not an error.
 *
 * Usage (PREVIEW — default, never writes):
 *   npx tsx src/lib/unfuddle-import/runner/notes-recovery-run.ts \
 *     --backup=/path/to/backup.xml [--project=152]
 *
 * Usage (APPLY — NOT executed by this task; requires Alex's explicit
 * separate authorization to actually run):
 *   npx tsx src/lib/unfuddle-import/runner/notes-recovery-run.ts \
 *     --backup=/path/to/backup.xml --apply --confirm-allowlisted-28
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseBackupXml } from "../parser/backup-xml-parser";
import { runNotesRecoveryPrecheck } from "../preflight/run-notes-recovery-precheck";
import { applyNoteRecovery } from "../import-notes-recovery/apply-note-recovery";
import { reconcileNoteRecovery } from "../import-notes-recovery/reconcile-note-recovery";
import { checkExactPreApplyNumbers } from "../import-notes-recovery/check-exact-pre-apply-numbers";
import { resolveApplyAuthorization } from "../import-notes-recovery/resolve-apply-authorization";
import { printNotesRecoveryReport } from "./notes-recovery-print-report";
import { getSupabaseAdminClient } from "../supabase-admin-client";
import { TARGET_UNFUDDLE_MILESTONE_ID, TARGET_UNFUDDLE_PROJECT_ID } from "../config";
import type { NotesRecoveryPrecheckResult, NotesRecoveryReport } from "../types/notes-recovery";
import type { UserReference } from "../types/models";

interface RawArgs {
  backupXmlPath: string | undefined;
  targetUnfuddleProjectId: number;
  apply: boolean;
  confirmAllowlisted28: boolean;
}

function loadEnvFile(): void {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    /* no .env.local in cwd — rely on already-exported env vars */
  }
}

function parseArgs(argv: string[]): RawArgs {
  const args = new Map<string, string>();
  let apply = false;
  let confirmAllowlisted28 = false;
  for (const arg of argv) {
    if (arg === "--apply") {
      apply = true;
      continue;
    }
    if (arg === "--confirm-allowlisted-28") {
      confirmAllowlisted28 = true;
      continue;
    }
    const match = /^--([^=]+)=(.*)$/.exec(arg);
    if (match) args.set(match[1], match[2]);
  }

  return {
    backupXmlPath: args.get("backup"),
    targetUnfuddleProjectId: args.has("project") ? Number(args.get("project")) : TARGET_UNFUDDLE_PROJECT_ID,
    apply,
    confirmAllowlisted28,
  };
}

function finish(report: NotesRecoveryReport): void {
  const { success } = printNotesRecoveryReport(report);
  process.exitCode = success ? 0 : 1;
}

async function runApply(admin: SupabaseClient, precheck: NotesRecoveryPrecheckResult): Promise<NotesRecoveryReport> {
  const mismatches = checkExactPreApplyNumbers(precheck);
  if (mismatches.length > 0) {
    console.error("APPLY ABORTADO ANTES DE ESCRIBIR — las cifras exactas requeridas no coinciden con el PREVIEW fresco de esta misma invocación:");
    for (const m of mismatches) console.error(`  - ${m}`);
    return { mode: "APPLY", precheck, applyOutcome: null, reconciliation: null, outcome: "apply_rejected", failureReasons: mismatches };
  }

  const newPlans = precheck.idempotency!.newPlans;
  const failureReasons: string[] = [];
  let applyOutcome = null;

  if (newPlans.length === 0) {
    // Idempotent second run: everything already imported, nothing to
    // insert — a valid success state, not an error. Still reconciled below
    // against the full expected 28, same as a first run.
    console.log("\nTodas las 28 Notes allowlisted ya estaban importadas — 0 nuevas para insertar (ejecución idempotente).");
  } else {
    console.log(`\nEjecutando APPLY: ${newPlans.length} Notes nuevas, batch único transaccional...`);
    applyOutcome = await applyNoteRecovery(admin, newPlans);

    const insertOk =
      applyOutcome.error === null &&
      applyOutcome.inserted === newPlans.length &&
      applyOutcome.reconciledOk === newPlans.length &&
      applyOutcome.reconciliationDiffs.length === 0 &&
      !applyOutcome.possiblePartialImport;

    if (!insertOk) {
      if (applyOutcome.error) failureReasons.push(applyOutcome.error);
      if (applyOutcome.inserted !== newPlans.length) failureReasons.push(`Only ${applyOutcome.inserted}/${newPlans.length} new rows inserted.`);
      if (applyOutcome.reconciledOk !== newPlans.length) failureReasons.push(`Only ${applyOutcome.reconciledOk}/${newPlans.length} new rows reconciled without diffs.`);
      failureReasons.push(...applyOutcome.reconciliationDiffs.map((d) => `${d.unfuddleNoteKey}: ${d.diffs.join("; ")}`));
      return { mode: "APPLY", precheck, applyOutcome, reconciliation: null, outcome: "failed", failureReasons };
    }
  }

  // ── Post-write reconciliation — ALWAYS against the full expected 28-Note
  // state (precheck.plans), whether this run inserted 28, 0, or anything in
  // between, and required before declaring success even if the RPC itself
  // reported success. ──
  const reconciliation = await reconcileNoteRecovery(admin, precheck.plans);
  if (!reconciliation.ok) {
    return { mode: "APPLY", precheck, applyOutcome, reconciliation, outcome: "failed", failureReasons: reconciliation.blockingReasons };
  }

  return { mode: "APPLY", precheck, applyOutcome, reconciliation, outcome: "apply_success", failureReasons: [] };
}

async function main(): Promise<void> {
  const raw = parseArgs(process.argv.slice(2));

  // ── Two-flag human-authorization gate — checked first, before the XML,
  // Supabase, or any precheck logic. Either flag alone must abort before
  // any write path is even reachable. ──
  const authorization = resolveApplyAuthorization(raw.apply, raw.confirmAllowlisted28);
  if (authorization.blocked) {
    console.error(authorization.message);
    finish({ mode: "APPLY", precheck: null, applyOutcome: null, reconciliation: null, outcome: "apply_rejected", failureReasons: [authorization.message!] });
    return;
  }
  if (authorization.usageError) {
    console.error(authorization.message);
    process.exitCode = 2;
    return;
  }

  if (!raw.backupXmlPath) {
    console.error("Usage: notes-recovery-run.ts --backup=<path to backup.xml> [--project=152] [--apply --confirm-allowlisted-28]");
    process.exitCode = 2;
    return;
  }
  const config = { backupXmlPath: raw.backupXmlPath, targetUnfuddleProjectId: raw.targetUnfuddleProjectId, apply: raw.apply };
  const mode: NotesRecoveryReport["mode"] = config.apply ? "APPLY" : "PREVIEW";

  loadEnvFile();

  let admin: SupabaseClient;
  try {
    admin = getSupabaseAdminClient();
  } catch (err) {
    finish({ mode, precheck: null, applyOutcome: null, reconciliation: null, outcome: "failed", failureReasons: [`Supabase admin client init failed: ${(err as Error).message}`] });
    return;
  }

  // ── Step 1: the existing (untouched) Phase 1 streaming parser — only its
  // `users` output is needed here, for author resolution. ──
  let backupUsers: UserReference[];
  try {
    const parsedBackup = await parseBackupXml({
      backupXmlPath: config.backupXmlPath,
      targetProjectId: config.targetUnfuddleProjectId,
      targetMilestoneId: TARGET_UNFUDDLE_MILESTONE_ID,
    });
    backupUsers = parsedBackup.users;
  } catch (err) {
    finish({ mode, precheck: null, applyOutcome: null, reconciliation: null, outcome: "failed", failureReasons: [`backup.xml People parse failed: ${(err as Error).message}`] });
    return;
  }

  // ── Step 2: this recovery's own precheck (parse notebooks/pages, group,
  // filter by the approved allowlist, resolve authors, idempotency) —
  // read-only throughout. This is the SAME fresh precheck APPLY re-verifies
  // exact numbers against below. ──
  const precheck = await runNotesRecoveryPrecheck(admin, backupUsers, {
    backupXmlPath: config.backupXmlPath,
    targetUnfuddleProjectId: config.targetUnfuddleProjectId,
  });

  if (mode === "PREVIEW") {
    finish({ mode, precheck, applyOutcome: null, reconciliation: null, outcome: precheck.ok ? "preview_success" : "failed", failureReasons: precheck.blockingReasons });
    return;
  }

  // ── APPLY — reached only with BOTH --apply and --confirm-allowlisted-28.
  // Gated on the fresh precheck's exact numbers, then a single atomic RPC
  // call (only for new candidates), then full DB reconciliation of the
  // complete expected 28-Note state. ──
  try {
    const report = await runApply(admin, precheck);
    finish(report);
  } catch (err) {
    finish({ mode, precheck, applyOutcome: null, reconciliation: null, outcome: "failed", failureReasons: [(err as Error).message] });
  }
}

// Only auto-run when this file is the actual entry point — see dry-run.ts's
// own comment for why every later phase's runner needs this same guard.
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  main().catch((err) => {
    console.error("Notes Recovery crashed:", err);
    process.exitCode = 1;
  });
}
