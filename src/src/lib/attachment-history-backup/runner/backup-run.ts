#!/usr/bin/env -S node --import tsx
/**
 * One-off, READ-ONLY local backup of historical Unfuddle ticket attachments
 * (public.ticket_attachments rows with unfuddle_id IS NOT NULL) and their
 * separate thumbnails from the private `ticket-attachments` bucket — taken
 * before any Storage cleanup. Only select/list/download are ever called;
 * nothing in the database or Storage is modified.
 *
 * Output (git-ignored via /backups/ in .gitignore; the runner refuses a
 * destination git would not ignore):
 *   backups/unfuddle-ticket-attachments/<timestamp>/
 *     objects/originals/<storage_path>
 *     objects/thumbnails/<thumbnail_path>
 *     download-journal.jsonl   per-object size + SHA-256 written at download time
 *     manifest.json / manifest.csv
 *
 * Prints exactly "BACKUP VERIFIED" only when a fresh inventory matches the
 * local copy completely; otherwise "BACKUP NOT VERIFIED" plus reasons.
 *
 * Usage (from the project root, i.e. the directory holding .env.local):
 *   npm run backup:unfuddle-attachments
 *   npm run backup:unfuddle-attachments -- --resume=backups/unfuddle-ticket-attachments/<timestamp>
 *
 * --resume continues an interrupted run in place: a file already on disk is
 * reused only if its size and recomputed SHA-256 match its journal entry;
 * anything else is re-downloaded. A new run never reuses an existing dir.
 */
import { execFileSync } from "node:child_process";
import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { formatBytes } from "../../attachment-orphan-cleanup/eligibility";
import { getSupabaseAdminClient } from "../../unfuddle-import/supabase-admin-client";
import type { VerificationSummary } from "../plan";
import { downloadAll, loadInventory, verify, writeManifest } from "../run-backup";

const DEFAULT_BASE = "backups/unfuddle-ticket-attachments";

function loadEnvFile(): void {
  // Same precedent as attachment-orphan-cleanup/runner/cleanup-run.ts.
  try {
    process.loadEnvFile(".env.local");
  } catch {
    /* no .env.local in cwd — rely on already-exported env vars */
  }
}

function parseArgs(argv: string[]): { resume: string | null } {
  let resume: string | null = null;
  for (const arg of argv) {
    const match = /^--resume=(.+)$/.exec(arg);
    if (match) {
      resume = match[1];
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return { resume };
}

/** Refuses a destination git would track. Outside any git repo there is nothing to protect. */
function assertGitIgnored(dir: string): void {
  try {
    execFileSync("git", ["check-ignore", "-q", path.join(dir, "probe")], { stdio: "ignore" });
  } catch (err) {
    const status = (err as { status?: number }).status;
    if (status === 1) throw new Error(`${dir} is not git-ignored — refusing to write a backup payload there.`);
    // 128: not a git repository (or git unavailable) — fine.
  }
}

function printSummary(s: VerificationSummary): void {
  const line = (label: string, value: string | number) => console.log(`  ${label.padEnd(38)} ${value}`);
  console.log("\n=== Verification (fresh inventory vs. local backup) ===");
  line("Historical DB rows discovered:", s.dbRows);
  line("Intentionally unavailable rows:", `${s.intentionallyUnavailableRows} (metadata only — not failures)`);
  line("Expected physical originals:", s.expectedOriginals);
  line("Downloaded + verified originals:", s.downloadedOriginals);
  line("Expected separate thumbnails:", s.expectedThumbnails);
  line("Downloaded + verified thumbnails:", s.downloadedThumbnails);
  line("Self-thumbnails (not downloaded twice):", s.selfThumbnails);
  line("Rows without thumbnail:", s.rowsWithoutThumbnail);
  line("Total expected source bytes:", `${s.expectedBytes} (${formatBytes(s.expectedBytes)})`);
  line("Total downloaded bytes:", `${s.downloadedBytes} (${formatBytes(s.downloadedBytes)})`);
  line("Unexpected missing objects:", s.unexpectedMissing.length);
  line("Failed downloads:", s.failedDownloads.length);
  line("Size mismatches:", s.sizeMismatches.length);
  line("SHA-256 problems:", s.checksumProblems.length);
  line("Local path collisions:", s.collisions.length);
  line("SHA-256 recorded for verified objects:", `${s.downloadedOriginals + s.downloadedThumbnails}/${s.expectedOriginals + s.expectedThumbnails}`);
  line("Rows with DB size_bytes ≠ Storage size:", `${s.dbSizeNotes} (informational)`);
  for (const [title, list] of [
    ["Unexpected missing", s.unexpectedMissing],
    ["Failed downloads", s.failedDownloads],
    ["Size mismatches", s.sizeMismatches],
    ["SHA-256 problems", s.checksumProblems],
    ["Collisions", s.collisions],
  ] as const) {
    if (list.length === 0) continue;
    console.log(`\n${title}:`);
    for (const item of list.slice(0, 50)) console.log(`  ${item}`);
    if (list.length > 50) console.log(`  … ${list.length - 50} more (see manifest.json)`);
  }
}

async function main(): Promise<void> {
  loadEnvFile();
  const { resume } = parseArgs(process.argv.slice(2));
  const startedAt = new Date().toISOString();
  const root = path.resolve(resume ?? path.join(DEFAULT_BASE, startedAt.replace(/[:.]/g, "-")));

  assertGitIgnored(root);
  if (resume) {
    if (!(await stat(root).catch(() => null))?.isDirectory()) throw new Error(`--resume target ${root} does not exist.`);
  } else {
    await mkdir(path.dirname(root), { recursive: true });
    await mkdir(root); // throws EEXIST — never silently reuses an existing backup
  }
  console.log(`Backup directory: ${root}${resume ? " (resuming)" : ""}`);

  const admin = getSupabaseAdminClient();
  console.log("Loading source inventory (read-only)…");
  const { plan } = await loadInventory(admin);
  console.log(`  ${plan.rows.length} historical rows, ${plan.objects.length} physical objects to back up.`);
  if (plan.collisions.length > 0) {
    console.log(`\nBACKUP NOT VERIFIED — ${plan.collisions.length} local path collision(s); nothing downloaded:`);
    for (const c of plan.collisions) console.log(`  ${c}`);
    process.exitCode = 1;
    return;
  }

  let lastPct = -1;
  const download = await downloadAll(admin, root, plan, (done, total) => {
    const pct = Math.floor((done / total) * 100);
    if (pct % 10 === 0 && pct !== lastPct) {
      lastPct = pct;
      console.log(`  ${done}/${total} (${pct}%)`);
    }
  });
  console.log(`Downloaded ${download.downloaded}, reused ${download.reused} already-verified, failed ${download.failed.size}.`);

  console.log("Verifying against a fresh inventory…");
  const { plan: freshPlan, local, summary } = await verify(admin, root, download.failed);
  await writeManifest(root, freshPlan, local, summary, { startedAt, verifiedAt: new Date().toISOString() });
  printSummary(summary);
  console.log(`\nManifest: ${path.join(root, "manifest.json")} (+ manifest.csv)`);
  if (summary.verified) {
    console.log("\nBACKUP VERIFIED");
  } else {
    console.log(`\nBACKUP NOT VERIFIED — ${summary.reasons.join("; ")}`);
    console.log(`Re-run with --resume=${path.relative(process.cwd(), root)} to retry.`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("\nBACKUP NOT VERIFIED — backup run crashed:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
