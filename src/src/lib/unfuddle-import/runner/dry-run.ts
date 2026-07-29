#!/usr/bin/env -S node --import tsx
/**
 * Phase 1 of the Unfuddle -> Jirita importer: Parser + Dry Run.
 *
 * Strictly read-only — see phases.ts for the (currently unimplemented)
 * phases that will eventually write to Supabase. This script:
 *   - never connects to Supabase
 *   - never inserts/updates any data
 *   - never creates files or persistent logs
 *   - only prints a structured report to the console
 *
 * Usage:
 *   npx tsx src/lib/unfuddle-import/runner/dry-run.ts \
 *     --backup=/path/to/backup.xml --media=/path/to/media \
 *     [--project=152] [--milestone=183]
 */
import { parseBackupXml } from "../parser/backup-xml-parser";
import { resolveUsers } from "../validation/resolve-users";
import { validateRelations } from "../validation/validate-relations";
import { validateDuplicates } from "../validation/validate-duplicates";
import { verifyAttachments } from "../validation/verify-attachments";
import { printDryRunReport } from "./print-report";
import { TARGET_UNFUDDLE_MILESTONE_ID, TARGET_UNFUDDLE_PROJECT_ID, type DryRunConfig } from "../config";
import type { DryRunReport } from "../types/report";
import type { ParsedBackup } from "../types/parse-result";

function parseArgs(argv: string[]): DryRunConfig {
  const args = new Map<string, string>();
  for (const arg of argv) {
    const match = /^--([^=]+)=(.*)$/.exec(arg);
    if (match) args.set(match[1], match[2]);
  }

  const backupXmlPath = args.get("backup");
  const mediaDir = args.get("media");
  if (!backupXmlPath || !mediaDir) {
    console.error("Usage: dry-run.ts --backup=<path to backup.xml> --media=<path to media/> [--project=152] [--milestone=183]");
    process.exit(2);
  }

  return {
    backupXmlPath,
    mediaDir,
    targetProjectId: args.has("project") ? Number(args.get("project")) : TARGET_UNFUDDLE_PROJECT_ID,
    targetMilestoneId: args.has("milestone") ? Number(args.get("milestone")) : TARGET_UNFUDDLE_MILESTONE_ID,
  };
}

/** Exported so Phase 2 (runner/phase2-run.ts) can reuse this exact Dry Run rather than re-implementing it. */
export async function runDryRun(config: DryRunConfig): Promise<{ report: DryRunReport; parsed: ParsedBackup }> {
  const parseStart = Date.now();
  const parsed = await parseBackupXml({
    backupXmlPath: config.backupXmlPath,
    targetProjectId: config.targetProjectId,
    targetMilestoneId: config.targetMilestoneId,
  });
  const parseElapsedMs = Date.now() - parseStart;

  const users = resolveUsers(parsed.tickets, parsed.users);
  const relations = validateRelations(parsed.tickets);
  const duplicates = validateDuplicates(parsed.tickets);
  const attachments = await verifyAttachments(parsed.tickets, config.mediaDir);

  const commentCount = parsed.tickets.reduce((sum, t) => sum + t.comments.length, 0);
  const timeEntryCount = parsed.tickets.reduce((sum, t) => sum + t.timeEntries.length, 0);
  const attachmentCount = parsed.tickets.reduce(
    (sum, t) => sum + t.attachments.length + t.comments.reduce((cs, c) => cs + c.attachments.length, 0),
    0,
  );
  const relationCount = parsed.tickets.reduce((sum, t) => sum + t.relations.length, 0);

  const report: DryRunReport = {
    config,
    general: {
      projectFound: parsed.projectMeta !== null,
      projectTitle: parsed.projectMeta?.title ?? null,
      milestoneFound: parsed.project !== null,
      milestoneTitle: parsed.project?.name ?? null,
      ticketCount: parsed.tickets.length,
      commentCount,
      timeEntryCount,
      attachmentCount,
      relationCount,
      parseElapsedMs,
    },
    users,
    attachments,
    relations,
    duplicates,
  };

  return { report, parsed };
}

async function main(): Promise<void> {
  const config = parseArgs(process.argv.slice(2));
  const { report } = await runDryRun(config);
  const { success } = printDryRunReport(report);
  process.exitCode = success ? 0 : 1;
}

// Only auto-run when this file is the actual entry point (`tsx .../dry-run.ts`
// directly) — every later phase's runner imports `runDryRun` from this same
// file to reuse Phase 1 as a library call, and without this guard that
// `import` alone (module evaluation, before any of the importing file's own
// code runs) would silently trigger a full second parse + report print as
// an unwanted side effect, using whatever raw `process.argv` the *importing*
// script happened to be invoked with.
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  main().catch((err) => {
    console.error("Dry run crashed:", err);
    process.exitCode = 1;
  });
}
