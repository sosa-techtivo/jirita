#!/usr/bin/env -S node --import tsx
/**
 * Historical thumbnail backfill for ticket_attachments /
 * project_note_attachments — generates the same physical, width-capped
 * WebP derivative Cached Egress Phase 2 already generates for *new*
 * uploads (src/lib/tickets.ts / src/lib/notes.ts), but for existing rows
 * whose thumbnail_path is still NULL. Never touches new uploads, RLS,
 * buckets, caches, or any UI — see src/lib/attachment-thumbnail-backfill/
 * for the actual logic; this file is only the CLI entry point.
 *
 * Default mode is PREVIEW (reads/decodes real objects to report accurate
 * counts, writes nothing to Storage or the database). APPLY only runs with
 * the explicit --apply flag.
 *
 * Usage:
 *   npx tsx src/lib/attachment-thumbnail-backfill/runner/backfill-run.ts [--apply] [--batch-size=20]
 *
 * Or via package.json:
 *   npm run backfill:thumbnails:preview
 *   npm run backfill:thumbnails:apply
 */
import { getSupabaseAdminClient } from "../../unfuddle-import/supabase-admin-client";
import { runBackfill } from "../run-backfill";
import { printBackfillReport } from "../print-report";

function loadEnvFile(): void {
  // Standalone CLI, not `next dev`/`next build` — .env.local isn't
  // auto-loaded here the way Next.js loads it. Best-effort only: env vars
  // may already be exported some other way (CI, shell), so a missing file
  // is not an error. Same precedent as
  // unfuddle-import/runner/phase2-run.ts's own loadEnvFile.
  try {
    process.loadEnvFile(".env.local");
  } catch {
    /* no .env.local in cwd — rely on already-exported env vars */
  }
}

function parseArgs(argv: string[]): { apply: boolean; batchSize: number } {
  let apply = false;
  let batchSize = 20;
  for (const arg of argv) {
    if (arg === "--apply") {
      apply = true;
      continue;
    }
    const match = /^--batch-size=(\d+)$/.exec(arg);
    if (match) batchSize = Math.max(1, Number(match[1]));
  }
  return { apply, batchSize };
}

async function main(): Promise<void> {
  loadEnvFile();
  const { apply, batchSize } = parseArgs(process.argv.slice(2));
  const mode = apply ? "apply" : "preview";

  console.log(`Starting attachment thumbnail backfill in ${mode.toUpperCase()} mode (batch size ${batchSize})...`);
  if (mode === "apply") {
    console.log("APPLY will upload thumbnails to Storage and persist thumbnail_path. Originals are never modified.");
  }

  const admin = getSupabaseAdminClient();
  const report = await runBackfill(admin, { mode, batchSize });
  printBackfillReport(report);

  if (report.total.failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error("Backfill run crashed:", err);
  process.exitCode = 1;
});
