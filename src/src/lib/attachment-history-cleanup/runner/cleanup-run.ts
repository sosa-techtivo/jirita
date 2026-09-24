#!/usr/bin/env -S node --import tsx
/**
 * First cleanup batch for historical Unfuddle ticket attachments: rows with
 * unfuddle_id IS NOT NULL, still is_available, whose original currently
 * exists in `ticket-attachments` at >= 5 MiB (expected: 19 rows, ~261 MiB).
 * See ../policy.ts and ../run-cleanup.ts.
 *
 * DEFAULT IS DRY RUN — read-only: fresh discovery, a backup gate against the
 * verified local backup (manifest + journal + fresh SHA-256 of each local
 * file), and a report ending in "CLEANUP DRY RUN VERIFIED" / "NOT VERIFIED"
 * plus a batch fingerprint.
 *
 * APPLY (requires Alex's explicit authorization):
 *   --apply --confirm=<fingerprint printed by the approved dry run>
 * Re-discovers and re-gates from scratch, refuses if the fingerprint no
 * longer matches, then per candidate: re-check → remove Storage object(s) →
 * confirm absence → set is_available = false. The DB row is never deleted.
 *
 * Usage (from the project root holding .env.local):
 *   npm run cleanup:unfuddle-attachments:dry-run [-- --backup=<backup dir>]
 * The npm script is dry-run only; apply is deliberately never scripted.
 */
import path from "node:path";
import { formatBytes } from "../../attachment-orphan-cleanup/eligibility";
import { getSupabaseAdminClient } from "../../unfuddle-import/supabase-admin-client";
import { EXPECTED_CANDIDATES, MIN_ORIGINAL_BYTES, parseCliArgs } from "../policy";
import { applyCleanup, DEFAULT_BACKUP_DIR, discover, type DiscoveryResult } from "../run-cleanup";

function loadEnvFile(): void {
  // Same precedent as attachment-orphan-cleanup/runner/cleanup-run.ts.
  try {
    process.loadEnvFile(".env.local");
  } catch {
    /* no .env.local in cwd — rely on already-exported env vars */
  }
}

function printDiscovery(mode: string, backupRoot: string, d: DiscoveryResult): void {
  const s = d.summary;
  console.log(`\n=== Historical Unfuddle attachment cleanup — ${mode} (${new Date().toISOString()}) ===`);
  console.log(`Backup gate: ${backupRoot}`);
  console.log(`Policy: unfuddle_id IS NOT NULL, is_available, original in Storage >= ${formatBytes(MIN_ORIGINAL_BYTES)}`);
  console.log(`Historical rows scanned: ${d.historicalRows}\n`);

  d.batch.forEach((c, i) => {
    const ctx = d.context.get(c.row.ticket_id);
    const thumb =
      c.thumbnail === "separate" ? `SEPARATE ${c.row.thumbnail_path} (${c.thumbnailBytes} B) — will also be removed` : c.thumbnail === "separate_missing" ? `SEPARATE BUT MISSING ${c.row.thumbnail_path}` : c.thumbnail;
    console.log(`#${String(i + 1).padStart(2)}  ${c.eligible ? "ELIGIBLE  " : "INELIGIBLE"}  ${formatBytes(c.originalBytes).padStart(10)}  ${c.row.filename}`);
    console.log(`      project:      ${ctx?.project ?? "(unknown)"}   ticket: ${ctx?.ticket ?? "?"} (${c.row.ticket_id})`);
    console.log(`      attachment:   ${c.row.id}   unfuddle_id: ${c.row.unfuddle_id}   mime: ${c.row.mime_type ?? "(none)"}`);
    console.log(`      original:     ${c.originalBytes} bytes   ${c.row.storage_path}`);
    console.log(`      thumbnail:    ${thumb}`);
    console.log(`      backup gate:  ${c.eligible ? `verified (sha256 ${c.originalSha256})` : `FAILED — ${c.problems.join("; ")}`}`);
  });

  console.log("\n=== Summary ===");
  const line = (label: string, value: string | number) => console.log(`  ${label.padEnd(36)} ${value}`);
  line("Candidates discovered:", s.candidates);
  line("Eligible:", s.eligible);
  line("Ineligible:", s.ineligible);
  line("Original bytes reclaimable:", `${s.originalBytes} (${formatBytes(s.originalBytes)})`);
  line("Thumbnail bytes reclaimable:", `${s.thumbnailBytes} (${formatBytes(s.thumbnailBytes)})`);
  line("Total bytes reclaimable:", `${s.totalBytes} (${formatBytes(s.totalBytes)})`);
  line("Separate thumbnails in batch:", s.separateThumbnails);
  line("Self-thumbnails in batch:", s.selfThumbnails);
  line(`Matches expected ${EXPECTED_CANDIDATES} / ~261 MiB:`, s.expectationProblems.length ? `NO — ${s.expectationProblems.join("; ")}` : "yes");
  line("Safe for a later explicit --apply:", s.verified ? "yes" : "NO");
  line("Batch fingerprint:", s.fingerprint);
}

async function main(): Promise<void> {
  loadEnvFile();
  const args = parseCliArgs(process.argv.slice(2));
  const backupRoot = path.resolve(args.backupDir ?? DEFAULT_BACKUP_DIR);
  const admin = getSupabaseAdminClient();

  if (args.mode === "dry-run") {
    const discovery = await discover(admin, backupRoot);
    printDiscovery("DRY RUN", backupRoot, discovery);
    console.log("\nDRY RUN — nothing was removed or updated.");
    if (discovery.summary.verified) {
      console.log("\nCLEANUP DRY RUN VERIFIED");
      console.log(`(A later, separately authorized apply would be: npx tsx src/lib/attachment-history-cleanup/runner/cleanup-run.ts --apply --confirm=${discovery.summary.fingerprint})`);
    } else {
      console.log(`\nCLEANUP DRY RUN NOT VERIFIED — ${discovery.summary.reasons.join("; ")}`);
      process.exitCode = 1;
    }
    return;
  }

  const { discovery, apply } = await applyCleanup(admin, backupRoot, args.confirm);
  printDiscovery("APPLY", backupRoot, discovery);
  for (const item of apply.items) console.log(`  ${item.outcome.toUpperCase().padEnd(8)} ${item.attachmentId}  ${item.detail}`);
  const archived = apply.items.filter((i) => i.outcome === "archived").length;
  console.log(`\nAPPLY: archived ${archived}/${discovery.batch.length}.`);
  if (apply.aborted) {
    console.log(`APPLY STOPPED — ${apply.aborted}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  const dryRun = !process.argv.includes("--apply");
  console.error(`\n${dryRun ? "CLEANUP DRY RUN NOT VERIFIED — " : ""}cleanup run crashed:`, err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
