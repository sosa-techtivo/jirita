#!/usr/bin/env -S node --import tsx
/**
 * Cached Egress thumbnail PREVIEW for a *future* Unfuddle -> Jirita
 * attachments migration — separate from, and never invoked by,
 * runner/phase6-run.ts (the already-completed, certified KTVibe import,
 * which this script never touches and never re-triggers). Read-only: parses
 * the backup, resolves already-imported tickets/comments (real reads
 * against Supabase, same identity-only lookups Phase 6's own precheck
 * uses), maps attachments to their planned rows, then classifies each one's
 * thumbnail outcome by reading its *local* media/ file only
 * (plan-attachment-thumbnails.ts, sharp-based, same 600px/WebP-0.82 logic
 * as the live app and the historical backfill). Zero writes to Storage or
 * the database — see the report's own "writes performed: 0" line.
 *
 * This is a reporting tool only; it does not implement its own --apply.
 * The actual write path (thumbnail generation integrated into the row
 * upload/insert) lives in import-attachments/apply-attachments.ts's
 * `generateThumbnails` option, exercised by whatever future project-specific
 * runner performs that project's real Phase 6 APPLY.
 *
 * Usage:
 *   npx tsx src/lib/unfuddle-import/runner/attachment-thumbnails-preview.ts \
 *     --backup=/path/to/backup.xml --media=/path/to/media \
 *     [--project=152] [--milestone=183]
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { runDryRun } from "./dry-run";
import { printDryRunReport } from "./print-report";
import { getSupabaseAdminClient } from "../supabase-admin-client";
import { resolveOrganization } from "../preflight/resolve-organization";
import { resolveCommentParents } from "../preflight/resolve-comment-parents";
import { resolveAttachmentCommentParents } from "../preflight/resolve-attachment-comment-parents";
import { mapAttachmentRows } from "../import-attachments/map-attachment-rows";
import { planAttachmentThumbnails, summarizeThumbnailPlan } from "../import-attachments/plan-attachment-thumbnails";
import { TARGET_ORGANIZATION_SLUG, TARGET_UNFUDDLE_MILESTONE_ID, TARGET_UNFUDDLE_PROJECT_ID, type DryRunConfig } from "../config";
import type { ParsedBackup } from "../types/parse-result";

function loadEnvFile(): void {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    /* no .env.local in cwd — rely on already-exported env vars */
  }
}

function parseArgs(argv: string[]): DryRunConfig {
  const args = new Map<string, string>();
  for (const arg of argv) {
    const match = /^--([^=]+)=(.*)$/.exec(arg);
    if (match) args.set(match[1], match[2]);
  }

  const backupXmlPath = args.get("backup");
  const mediaDir = args.get("media");
  if (!backupXmlPath || !mediaDir) {
    console.error("Usage: attachment-thumbnails-preview.ts --backup=<path to backup.xml> --media=<path to media/> [--project=152] [--milestone=183]");
    process.exit(2);
  }

  return {
    backupXmlPath,
    mediaDir,
    targetProjectId: args.has("project") ? Number(args.get("project")) : TARGET_UNFUDDLE_PROJECT_ID,
    targetMilestoneId: args.has("milestone") ? Number(args.get("milestone")) : TARGET_UNFUDDLE_MILESTONE_ID,
  };
}

/** Same referenced-ticket/-comment collection Phase 6's own precheck uses
 *  (run-attachment-precheck.ts) — reimplemented here rather than imported,
 *  since that module also carries KTVibe-specific exact-count assertions
 *  this script deliberately never exercises. */
function collectReferencedParents(parsed: ParsedBackup): { ticketUnfuddleIds: Set<number>; commentUnfuddleIds: Set<number> } {
  const ticketUnfuddleIds = new Set<number>();
  const commentUnfuddleIds = new Set<number>();
  for (const ticket of parsed.tickets) {
    for (const a of ticket.attachments) ticketUnfuddleIds.add(a.parentUnfuddleId);
    for (const comment of ticket.comments) {
      for (const a of comment.attachments) {
        commentUnfuddleIds.add(a.parentUnfuddleId);
        ticketUnfuddleIds.add(ticket.unfuddleId);
      }
    }
  }
  return { ticketUnfuddleIds, commentUnfuddleIds };
}

async function main(): Promise<void> {
  loadEnvFile();
  const config = parseArgs(process.argv.slice(2));

  const { report: dryRunReport, parsed } = await runDryRun(config);
  const { success: dryRunSuccess } = printDryRunReport(dryRunReport);
  if (!dryRunSuccess) {
    console.error("\nAborting — Phase 1 Dry Run reported failures (see report above). Fix those before previewing thumbnails.");
    process.exitCode = 1;
    return;
  }

  let admin: SupabaseClient;
  try {
    admin = getSupabaseAdminClient();
  } catch (err) {
    console.error(`Supabase admin client init failed: ${(err as Error).message}`);
    process.exitCode = 1;
    return;
  }

  const organization = await resolveOrganization(admin, TARGET_ORGANIZATION_SLUG);
  if (organization.error || !organization.organizationId) {
    console.error(`Organization resolution failed: ${organization.error ?? "no organizationId"}`);
    process.exitCode = 1;
    return;
  }

  const { data: projectRows, error: projectError } = await admin
    .from("projects")
    .select("id")
    .eq("organization_id", organization.organizationId)
    .eq("unfuddle_id", String(config.targetMilestoneId));
  if (projectError || !projectRows || projectRows.length !== 1) {
    console.error(`Project resolution failed: expected exactly 1 project with unfuddle_id "${config.targetMilestoneId}", got ${projectRows?.length ?? 0} (${projectError?.message ?? "no error"}).`);
    process.exitCode = 1;
    return;
  }
  const projectId = projectRows[0].id as string;

  const { data: ticketRows, error: ticketsError } = await admin.from("tickets").select("id").eq("project_id", projectId);
  if (ticketsError) {
    console.error(`Tickets lookup failed: ${ticketsError.message}`);
    process.exitCode = 1;
    return;
  }
  const ticketIds = (ticketRows ?? []).map((t) => t.id as string);

  const { ticketUnfuddleIds, commentUnfuddleIds } = collectReferencedParents(parsed);
  const ticketParents = await resolveCommentParents(admin, projectId, [...ticketUnfuddleIds]);
  if (ticketParents.missingParents.length > 0) {
    console.error(`${ticketParents.missingParents.length} ticket-level attachment(s) reference a ticket not yet imported: ${ticketParents.missingParents.join(", ")}. Run Phases 3-5 for this project first.`);
    process.exitCode = 1;
    return;
  }

  const commentParents = await resolveAttachmentCommentParents(admin, ticketIds, [...commentUnfuddleIds]);
  if (commentParents.missingParents.length > 0) {
    console.error(`${commentParents.missingParents.length} comment-level attachment(s) reference a comment not yet imported: ${commentParents.missingParents.join(", ")}. Run Phases 3-5 for this project first.`);
    process.exitCode = 1;
    return;
  }

  const mapping = mapAttachmentRows(parsed.tickets, ticketParents.map, commentParents.map);
  if (mapping.errors.length > 0) {
    console.error(`${mapping.errors.length} attachment(s) failed to map — thumbnail preview requires a clean mapping. See: ${mapping.errors.map((e) => `${e.attachmentUnfuddleId} (${e.reason})`).join("; ")}`);
    process.exitCode = 1;
    return;
  }

  console.log(`\nPlanning thumbnails for ${mapping.planned.length} attachments (reading local media/ files only — no Storage or database writes)...`);
  const items = await planAttachmentThumbnails(config.mediaDir, mapping.planned);
  const stats = summarizeThumbnailPlan(items);

  console.log("\n============================================================");
  console.log(" Attachment thumbnail PREVIEW (future-project Unfuddle import)");
  console.log("============================================================");
  console.log(`  attachments totales                         : ${stats.totalAttachments}`);
  console.log(`  imágenes >600px — generarían thumbnail físico: ${stats.wouldCreatePhysicalThumbnail}`);
  console.log(`  imágenes <=600px — usarían el original        : ${stats.wouldUseOriginalAsThumbnail}`);
  console.log(`  no-imágenes (pdf/doc/svg/otros)               : ${stats.notImage}`);
  console.log(`  errores                                        : ${stats.errors}`);
  console.log(`  escrituras realizadas                          : 0`);

  if (stats.errorDetails.length > 0) {
    console.log(`\n  ERROR DETAILS (${stats.errorDetails.length}):`);
    for (const e of stats.errorDetails) console.log(`    attachment ${e.attachmentUnfuddleId}: ${e.reason}`);
  }
  console.log("\n============================================================");
  console.log(" This was a PREVIEW — nothing was written to Storage or the database.");
  console.log(" APPLY happens as part of this project's own Phase 6 run, via");
  console.log(" applyAttachments(..., generateThumbnails: true).");
  console.log("============================================================\n");
}

main().catch((err) => {
  console.error("Attachment thumbnail preview crashed:", err);
  process.exitCode = 1;
});
