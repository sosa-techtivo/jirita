import type { SupabaseClient } from "@supabase/supabase-js";
import type { ParsedBackup } from "../types/parse-result";
import type { Phase3Config as Phase6Config } from "../config";
import { resolveOrganization } from "./resolve-organization";
import { resolveCommentParents } from "./resolve-comment-parents";
import { resolveAttachmentCommentParents } from "./resolve-attachment-comment-parents";
import { auditAttachmentSchema } from "./audit-attachment-schema";
import { auditAttachmentStorage } from "./audit-attachment-storage";
import { computeAttachmentStats } from "../import-attachments/compute-attachment-stats";
import { resolvePhysicalFiles } from "../import-attachments/resolve-physical-files";
import { proposeObjectPathStrategy } from "../import-attachments/propose-object-path";
import { mapAttachmentRows } from "../import-attachments/map-attachment-rows";
import { checkAttachmentDbIdempotency } from "../import-attachments/check-attachment-db-idempotency";
import { checkAttachmentStorageIdempotency } from "../import-attachments/check-attachment-storage-idempotency";
import type { Phase6PrecheckResult } from "../types/phase6";

export async function runAttachmentPrecheck(admin: SupabaseClient, parsed: ParsedBackup, config: Phase6Config, mediaDir: string): Promise<Phase6PrecheckResult> {
  const organization = await resolveOrganization(admin, config.organizationSlug);

  const blockingReasons: string[] = [];
  if (organization.error) blockingReasons.push(`Organization: ${organization.error}`);

  let projectId: string | null = null;
  let projectError: string | null = null;
  if (organization.organizationId) {
    const { data, error } = await admin.from("projects").select("id").eq("organization_id", organization.organizationId).eq("unfuddle_id", String(config.targetMilestoneId));
    if (error) projectError = `projects lookup failed: ${error.message}`;
    else if ((data ?? []).length !== 1) projectError = `Expected exactly one project with unfuddle_id "${config.targetMilestoneId}", found ${(data ?? []).length}.`;
    else projectId = data![0].id;
  } else {
    projectError = "Organization was not resolved — cannot look up the project.";
  }
  if (projectError) blockingReasons.push(`Project: ${projectError}`);

  let ticketsTotal = 0;
  let ticketsError: string | null = null;
  let ticketIds: string[] = [];
  if (projectId) {
    const { data, error, count } = await admin.from("tickets").select("id", { count: "exact" }).eq("project_id", projectId);
    if (error) ticketsError = `tickets count failed: ${error.message}`;
    else {
      ticketsTotal = count ?? 0;
      ticketIds = (data ?? []).map((t) => t.id);
      if (ticketsTotal !== 170) ticketsError = `Expected exactly 170 imported tickets, found ${ticketsTotal}.`;
    }
  } else {
    ticketsError = "Project was not resolved — cannot verify imported tickets.";
  }
  if (ticketsError) blockingReasons.push(`Tickets: ${ticketsError}`);

  let commentsTotal = 0;
  let commentsError: string | null = null;
  if (ticketIds.length > 0) {
    const { count, error } = await admin.from("ticket_comments").select("id", { count: "exact", head: true }).in("ticket_id", ticketIds);
    if (error) commentsError = `ticket_comments count failed: ${error.message}`;
    else {
      commentsTotal = count ?? 0;
      if (commentsTotal !== 412) commentsError = `Expected exactly 412 imported comments, found ${commentsTotal}.`;
    }
  } else {
    commentsError = "Tickets were not resolved — cannot verify imported comments.";
  }
  if (commentsError) blockingReasons.push(`Comments: ${commentsError}`);

  const referencedTicketIds = new Set<number>();
  const referencedCommentIds = new Set<number>();
  for (const ticket of parsed.tickets) {
    for (const a of ticket.attachments) referencedTicketIds.add(a.parentUnfuddleId);
    for (const comment of ticket.comments) {
      for (const a of comment.attachments) {
        referencedCommentIds.add(a.parentUnfuddleId);
        // A comment-level attachment's DB row still needs a real ticket_id
        // (the comment's own parent ticket, known here directly from the
        // parse tree) — not just the comment's own referencedCommentIds
        // entry. Without this, a ticket whose only attachments are on its
        // comments (no direct ticket-level attachment) would never appear
        // in ticketParents below, and mapAttachmentRows would wrongly
        // report its comment attachments as "ticket parent unresolved".
        referencedTicketIds.add(ticket.unfuddleId);
      }
    }
  }

  const ticketParents = projectId
    ? await resolveCommentParents(admin, projectId, [...referencedTicketIds])
    : { map: new Map<number, string>(), missingParents: [...referencedTicketIds], totalTicketsInProject: 0, ok: false };
  if (ticketParents.missingParents.length > 0) {
    blockingReasons.push(`${ticketParents.missingParents.length} ticket-level attachment(s) reference a ticket not among the imported 170: ${ticketParents.missingParents.join(", ")}.`);
  }

  const commentParents = await resolveAttachmentCommentParents(admin, ticketIds, [...referencedCommentIds]);
  if (commentParents.missingParents.length > 0) {
    blockingReasons.push(`${commentParents.missingParents.length} comment-level attachment(s) reference a comment not among the imported 412: ${commentParents.missingParents.join(", ")}.`);
  }

  const xmlStats = computeAttachmentStats(parsed.tickets);
  if (xmlStats.total !== 250) blockingReasons.push(`Expected exactly 250 attachments from the parser, got ${xmlStats.total}.`);
  if (xmlStats.unexpectedParentTypes.length > 0) blockingReasons.push(`Unexpected attachment parentType value(s): ${xmlStats.unexpectedParentTypes.join(", ")}.`);
  if (xmlStats.duplicateAttachmentIds > 0) blockingReasons.push(`${xmlStats.duplicateAttachmentIds} duplicate attachment unfuddle_id(s) within the parsed batch.`);

  const physicalFiles = await resolvePhysicalFiles(parsed.tickets, mediaDir);
  if (physicalFiles.missing > 0) blockingReasons.push(`${physicalFiles.missing} attachment(s) have no physical file in media/: ${physicalFiles.missingIds.join(", ")}.`);
  if (physicalFiles.filesOverLimit.length > 0) {
    blockingReasons.push(`${physicalFiles.filesOverLimit.length} file(s) exceed the reference size limit: ${physicalFiles.filesOverLimit.map((f) => `${f.unfuddleId} (${f.filename})`).join(", ")}.`);
  }

  // Deliberately NOT folded into `blockingReasons`/`ok`: these are known,
  // structural facts about the *current* schema (no unfuddle_id, no
  // comment_id, unconditional activity trigger) — not anomalies this
  // audit run discovered. Same separation already used for Phase 3/4's own
  // side-effect triggers before their bypasses existed: the audit itself
  // (tickets/comments/parents/physical files all reconciled) can complete
  // successfully while APPLY readiness is a separate, explicitly reported
  // question — see runner/phase6-print-report.ts's "Bloqueos para APPLY"
  // section, sourced from schemaAudit.blockingReasons directly.
  const schemaAudit = auditAttachmentSchema();

  const storageAudit = auditAttachmentStorage();
  const objectPathProposal = proposeObjectPathStrategy();

  // Real (not a placeholder): resolves ticket_id/comment_id/storage_path for
  // all 250 planned rows against the already-live tickets/ticket_comments
  // tables, using the exact deterministic path generator that would be used
  // by a future APPLY. Mapping errors here are genuine audit findings (an
  // attachment whose parent never resolved), so they ARE folded into
  // blockingReasons/ok — unlike schemaAudit.blockingReasons, which is a
  // known, structural fact about the *current undeployed* schema, not
  // something this run discovered.
  const mapping = mapAttachmentRows(parsed.tickets, ticketParents.map, commentParents.map);
  if (mapping.errors.length > 0) {
    blockingReasons.push(`${mapping.errors.length} attachment(s) failed to map to a planned row: ${mapping.errors.map((e) => `${e.attachmentUnfuddleId} (${e.reason})`).join("; ")}.`);
  }

  // Migration 20260825000000 was applied manually via the Supabase SQL
  // Editor (confirmed by the user, not re-deployed or modified here) — both
  // idempotency checks now run for real, read-only, against the live
  // project. Neither inserts a row nor uploads a file; a failure here (e.g.
  // the migration somehow not actually live) is a genuine audit finding,
  // so — unlike schemaAudit.blockingReasons — an error from either check
  // IS folded into the main blockingReasons/ok.
  const { result: dbIdempotency, error: dbIdempotencyError } = await checkAttachmentDbIdempotency(admin, mapping.planned);
  if (dbIdempotencyError) blockingReasons.push(`Attachment DB idempotency check failed: ${dbIdempotencyError}`);
  else if (dbIdempotency && dbIdempotency.conflicting.length > 0) {
    blockingReasons.push(`${dbIdempotency.conflicting.length} attachment(s) already exist with a conflicting unfuddle_id: ${dbIdempotency.conflicting.map((c) => c.planned.attachmentUnfuddleId).join(", ")}.`);
  }

  const { result: storageIdempotency, error: storageIdempotencyError } = await checkAttachmentStorageIdempotency(admin, storageAudit.bucketId, mapping.planned, mediaDir);
  if (storageIdempotencyError) blockingReasons.push(`Attachment Storage idempotency check failed: ${storageIdempotencyError}`);
  else if (storageIdempotency && storageIdempotency.existsDiffers > 0) {
    blockingReasons.push(`${storageIdempotency.existsDiffers} Storage object(s) already exist at the expected deterministic path with different content.`);
  }

  const result: Phase6PrecheckResult = {
    organization,
    project: { projectId, ok: projectId !== null, error: projectError },
    ticketsReconciled: { total: ticketsTotal, ok: ticketsTotal === 170, error: ticketsError },
    commentsReconciled: { total: commentsTotal, ok: commentsTotal === 412, error: commentsError },
    ticketParents,
    commentParents,
    xmlStats,
    physicalFiles,
    schemaAudit,
    storageAudit,
    objectPathProposal,
    mapping,
    dbIdempotency,
    storageIdempotency,
    ok: blockingReasons.length === 0,
    blockingReasons,
  };

  return result;
}
