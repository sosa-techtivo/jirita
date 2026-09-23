#!/usr/bin/env -S node --import tsx
/**
 * Orphaned-object cleanup for the private `ticket-attachments` Storage
 * bucket (JIR-98 follow-up). An object is eligible only when its exact path
 * is referenced by neither ticket_attachments.storage_path nor
 * ticket_attachments.thumbnail_path, it is older than 24 hours, and a fresh
 * re-check still finds it unreferenced — see ../eligibility.ts and
 * ../run-cleanup.ts. Only this bucket; never touches the database.
 *
 * Default mode is DRY RUN: discovers and reports, deletes nothing. APPLY
 * only runs with the explicit --apply flag, re-checks references again
 * immediately before each removal batch, and aborts outright (deleting
 * nothing) if more objects are eligible than --max-delete (default 100).
 *
 * Usage:
 *   npx tsx src/lib/attachment-orphan-cleanup/runner/cleanup-run.ts [--apply] [--max-delete=100]
 *
 * Or via package.json (dry run only):
 *   npm run cleanup:orphan-attachments:dry-run
 */
import { getSupabaseAdminClient } from "../../unfuddle-import/supabase-admin-client";
import { formatBytes, totalBytes, type StorageObjectInfo } from "../eligibility";
import { BUCKET, runOrphanCleanup, type CleanupReport } from "../run-cleanup";

function loadEnvFile(): void {
  // Same precedent as attachment-thumbnail-backfill/runner/backfill-run.ts:
  // standalone CLI, so .env.local isn't auto-loaded the way Next.js does.
  try {
    process.loadEnvFile(".env.local");
  } catch {
    /* no .env.local in cwd — rely on already-exported env vars */
  }
}

function parseArgs(argv: string[]): { apply: boolean; maxDelete: number } {
  let apply = false;
  let maxDelete = 100;
  for (const arg of argv) {
    if (arg === "--apply") {
      apply = true;
      continue;
    }
    const match = /^--max-delete=(\d+)$/.exec(arg);
    if (match) {
      maxDelete = Number(match[1]);
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return { apply, maxDelete };
}

function printObjects(title: string, objects: StorageObjectInfo[]): void {
  console.log(`\n${title}: ${objects.length} (${formatBytes(totalBytes(objects))})`);
  for (const o of [...objects].sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""))) {
    console.log(`  ${o.createdAt ?? "(no created_at)"}  ${formatBytes(o.sizeBytes).padStart(10)}  ${o.path}`);
  }
}

function printReport(report: CleanupReport): void {
  console.log(`\n=== ${BUCKET} orphan cleanup — ${report.mode.toUpperCase()} (${report.now.toISOString()}) ===`);
  console.log(`Storage objects scanned:        ${report.totalObjects} (${formatBytes(report.totalObjectBytes)})`);
  console.log(`ticket_attachments rows:        ${report.referencedRows}`);
  console.log(`Referenced objects (kept):      ${report.referencedObjects}`);
  printObjects("Skipped — unreferenced but created within the last 24h", report.recentUnreferenced);
  printObjects("Skipped — became referenced at re-check", report.nowReferenced);
  printObjects("ELIGIBLE orphan candidates", report.eligible);
  console.log(`\nCandidate total: ${report.eligible.length} objects, ${totalBytes(report.eligible)} bytes (${formatBytes(totalBytes(report.eligible))})`);

  if (!report.apply) {
    console.log("\nDRY RUN — no objects were deleted. Re-run with --apply to delete the eligible objects above.");
    return;
  }

  const a = report.apply;
  if (a.aborted) {
    console.log(`\nAPPLY ABORTED — ${a.aborted}`);
    return;
  }
  console.log(`\nAPPLY: requested ${a.requested}, actually removed ${a.removed.length}.`);
  if (a.skippedAtFinalRecheck.length > 0) {
    console.log(`Skipped at final pre-delete re-check (now referenced): ${a.skippedAtFinalRecheck.length}`);
    for (const p of a.skippedAtFinalRecheck) console.log(`  ${p}`);
  }
  if (a.notRemoved.length > 0) {
    console.log(`NOT removed (partial removal): ${a.notRemoved.length}`);
    for (const p of a.notRemoved) console.log(`  ${p}`);
  }
  for (const e of a.errors) console.log(`remove() error: ${e}`);
}

async function main(): Promise<void> {
  loadEnvFile();
  const { apply, maxDelete } = parseArgs(process.argv.slice(2));
  const report = await runOrphanCleanup(getSupabaseAdminClient(), { mode: apply ? "apply" : "dry-run", maxDelete });
  printReport(report);
  if (report.apply && (report.apply.aborted || report.apply.notRemoved.length > 0 || report.apply.errors.length > 0)) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("Orphan cleanup run crashed:", err);
  process.exitCode = 1;
});
