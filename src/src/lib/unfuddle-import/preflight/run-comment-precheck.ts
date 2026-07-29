import type { SupabaseClient } from "@supabase/supabase-js";
import type { ParsedBackup } from "../types/parse-result";
import type { Phase3Config as Phase4Config } from "../config";
import { resolveOrganization } from "./resolve-organization";
import { resolveCommentParents } from "./resolve-comment-parents";
import { resolveUserMap } from "./resolve-user-map";
import { auditCommentSideEffects } from "./audit-comment-side-effects";
import { mapCommentRows } from "../import-comments/map-comment-rows";
import { computeCommentStats } from "../import-comments/compute-comment-stats";
import { checkCommentIdempotency } from "../import-comments/check-comment-idempotency";
import type { Phase4PrecheckResult, UserMapEntryStatus } from "../types/phase4";

export async function runCommentPrecheck(admin: SupabaseClient, parsed: ParsedBackup, config: Phase4Config) {
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
  if (projectId) {
    const { count, error } = await admin.from("tickets").select("id", { count: "exact", head: true }).eq("project_id", projectId);
    if (error) ticketsError = `tickets count failed: ${error.message}`;
    else {
      ticketsTotal = count ?? 0;
      if (ticketsTotal !== 170) ticketsError = `Expected exactly 170 imported tickets, found ${ticketsTotal}.`;
    }
  } else {
    ticketsError = "Project was not resolved — cannot verify imported tickets.";
  }
  if (ticketsError) blockingReasons.push(`Tickets: ${ticketsError}`);

  const referencedTicketIds = new Set<number>();
  const referencedAuthorIds = new Set<number>();
  for (const ticket of parsed.tickets) {
    for (const comment of ticket.comments) {
      referencedTicketIds.add(comment.ticketUnfuddleId);
      if (comment.authorUnfuddleId !== null) referencedAuthorIds.add(comment.authorUnfuddleId);
    }
  }

  const parents = projectId
    ? await resolveCommentParents(admin, projectId, [...referencedTicketIds])
    : { map: new Map<number, string>(), missingParents: [...referencedTicketIds], totalTicketsInProject: 0, ok: false };
  if (parents.missingParents.length > 0) {
    blockingReasons.push(`${parents.missingParents.length} comment(s) reference a ticket not among the imported 170: ${parents.missingParents.join(", ")}.`);
  }

  const userMap = await resolveUserMap(admin, parsed.users, [...referencedAuthorIds]);
  for (const reason of userMap.blockingReasons) blockingReasons.push(reason);

  // Task's stricter rule for comments: any author id with no backup Person
  // record that ISN'T one of the two already-documented known orphans
  // (150/153) is itself a stop condition, not silently treated as "just
  // another orphan".
  const unexpectedOrphans = userMap.entries.filter((e) => e.status === "orphan_no_backup_record" && e.unfuddleId !== 150 && e.unfuddleId !== 153);
  for (const entry of unexpectedOrphans) {
    blockingReasons.push(`Comment author id ${entry.unfuddleId} has no backup Person record and is not one of the documented known orphans (150/153) — stopping rather than treating it as another orphan.`);
  }

  const userStatusById = new Map<number, UserMapEntryStatus>(userMap.entries.map((e) => [e.unfuddleId, e.status]));
  const commentStats = computeCommentStats(parsed.tickets, parsed.users, userStatusById);

  const sideEffects = auditCommentSideEffects();

  const mapping = mapCommentRows(parsed.tickets, parents.map, userMap.map);
  for (const err of mapping.errors) blockingReasons.push(`Comment ${err.commentUnfuddleId} (ticket ${err.ticketUnfuddleId}): ${err.reason}`);

  const idempotency = mapping.planned.length > 0 || mapping.ok ? await checkCommentIdempotency(admin, mapping.planned) : {
    newComments: [],
    alreadyImportedMatching: [],
    conflicting: [],
    duplicateUnfuddleIdsInBatch: [],
    identicalContentDifferentIds: [],
    ok: false,
  };
  if (idempotency.conflicting.length > 0) {
    blockingReasons.push(`${idempotency.conflicting.length} existing comment(s) differ from the expected configuration — not updating automatically.`);
  }
  if (idempotency.duplicateUnfuddleIdsInBatch.length > 0) {
    blockingReasons.push(`${idempotency.duplicateUnfuddleIdsInBatch.length} duplicate unfuddle_id(s) within the parsed batch.`);
  }

  const result: Phase4PrecheckResult = {
    organization,
    project: { projectId, ok: projectId !== null, error: projectError },
    ticketsReconciled: { total: ticketsTotal, ok: ticketsTotal === 170, error: ticketsError },
    parents,
    userMap,
    commentStats,
    mapping,
    idempotency,
    sideEffects,
    ok: blockingReasons.length === 0,
    blockingReasons,
  };

  return { result, projectId };
}
