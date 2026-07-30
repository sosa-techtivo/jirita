#!/usr/bin/env -S node --import tsx
/**
 * One-off, narrowly-scoped repair: link Unfuddle person-id 150's historical
 * KTVibe references (comment author) to a manually-created JIRITA profile
 * for "Luis L.".
 *
 * ── Why this one is different from repair-orphan-user-153-run.ts ──
 *
 * Person-id 150 has no `<person>` element anywhere in backup.xml (a
 * genuinely orphaned id, same structural situation as 153 was) and,
 * unlike 153, no email or any other structured identity was ever found for
 * it — only a free-text name glimpsed in self-referential audit-trail
 * descriptions ("Ticket reassigned from *Luis L.*", performed by person-id
 * 150 itself, 79 occurrences vs. 0 for any other name in that position —
 * confirmed distinct from person-id 153/Micaela Levinsonas, whose own
 * self-referential pattern is "Micaela L.", 850 occurrences, with zero
 * overlap in tickets between the two ids). Per the explicit product
 * decision for this case (no email/identity to resolve automatically), a
 * profile was created manually ahead of time to represent "Luis L." —
 * this script never creates that profile itself, only resolves it (by
 * email, the same lookup shape as the 153 script) and reuses it exactly
 * like repair-orphan-user-153-run.ts reused Micaela's.
 *
 * Same guarantees as the 153 script: never creates an `auth.users` row or
 * a `profiles` row, never writes `profiles.unfuddle_id`, only points
 * existing null FK columns (comment author, ticket assignee/reporter, time
 * entry logger — whichever actually exist for this id) at the given
 * profile id, and only where the live column is still null.
 *
 * Usage:
 *   npx tsx src/lib/unfuddle-import/runner/repair-orphan-user-150-run.ts \
 *     --backup=/path/to/backup.xml [--apply] [--project=152] [--milestone=183]
 */
import { parseBackupXml } from "../parser/backup-xml-parser";
import { getSupabaseAdminClient } from "../supabase-admin-client";
import { resolveOrganization } from "../preflight/resolve-organization";
import { resolveTargetProjectForTickets } from "../preflight/resolve-target-project-for-tickets";
import { TARGET_ORGANIZATION_SLUG, TARGET_UNFUDDLE_MILESTONE_ID, TARGET_UNFUDDLE_PROJECT_ID, EXPECTED_PROJECT_SLUG, EXPECTED_PROJECT_CODE } from "../config";
import {
  classifyAliasReferences,
  type AliasClassificationResult,
  type LiveCommentRow,
  type LiveTicketRow,
  type LiveTimeEntryRow,
} from "../repair-orphan-user-alias/classify-alias-references";
import { applyAliasFixes } from "../repair-orphan-user-alias/apply-alias-fix";
import type { SupabaseClient } from "@supabase/supabase-js";

const LUIS_L_EMAIL = "luisl@techtivo.com";
const ORPHAN_UNFUDDLE_PERSON_ID = 150;

function loadEnvFile(): void {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    /* no .env.local in cwd — rely on already-exported env vars */
  }
}

interface Args {
  backupXmlPath: string;
  targetProjectId: number;
  targetMilestoneId: number;
  apply: boolean;
}

function parseArgs(argv: string[]): Args {
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
  if (!backupXmlPath) {
    console.error("Usage: repair-orphan-user-150-run.ts --backup=<path to backup.xml> [--apply] [--project=152] [--milestone=183]");
    process.exit(2);
  }
  return {
    backupXmlPath,
    targetProjectId: args.has("project") ? Number(args.get("project")) : TARGET_UNFUDDLE_PROJECT_ID,
    targetMilestoneId: args.has("milestone") ? Number(args.get("milestone")) : TARGET_UNFUDDLE_MILESTONE_ID,
    apply,
  };
}

async function resolveKtvibeProjectId(admin: SupabaseClient, targetMilestoneId: number): Promise<string> {
  const org = await resolveOrganization(admin, TARGET_ORGANIZATION_SLUG);
  if (org.error || !org.organizationId) throw new Error(`Could not resolve organization: ${org.error}`);
  const project = await resolveTargetProjectForTickets(admin, org.organizationId, String(targetMilestoneId), EXPECTED_PROJECT_SLUG, EXPECTED_PROJECT_CODE);
  if (!project.ok || !project.projectId) throw new Error(`Could not resolve KTVibe project: ${project.error}`);
  return project.projectId;
}

/** Resolves the manually-created "Luis L." profile by email — never by name/initials, same match discipline as every other person in this migration. Fails loudly if it's missing or ambiguous rather than guessing. */
async function resolveLuisLProfileId(admin: SupabaseClient): Promise<string> {
  const { data, error } = await admin.from("profiles").select("id, email, first_name, last_name").ilike("email", LUIS_L_EMAIL);
  if (error) throw new Error(`profiles query failed: ${error.message}`);
  const rows = data ?? [];
  if (rows.length === 0) throw new Error(`No profile found with email ${LUIS_L_EMAIL} — refusing to proceed (no target to point to). Create the profile first; this script never creates one.`);
  if (rows.length > 1) throw new Error(`${rows.length} profiles matched email ${LUIS_L_EMAIL} — expected exactly one, ambiguity — refusing to proceed.`);
  return rows[0].id as string;
}

async function loadLiveState(admin: SupabaseClient, projectId: string) {
  const { data: liveTickets, error: ticketsError } = await admin
    .from("tickets")
    .select("id, unfuddle_id, ticket_number, assignee_profile_id, created_by")
    .eq("project_id", projectId);
  if (ticketsError) throw new Error(`tickets query failed: ${ticketsError.message}`);

  const ticketIds = (liveTickets ?? []).map((t) => t.id as string);

  const { data: liveComments, error: commentsError } = await admin
    .from("ticket_comments")
    .select("id, unfuddle_id, author_profile_id")
    .in("ticket_id", ticketIds);
  if (commentsError) throw new Error(`ticket_comments query failed: ${commentsError.message}`);

  const { data: liveTimeEntries, error: timeEntriesError } = await admin
    .from("ticket_time_entries")
    .select("id, unfuddle_id, logged_by")
    .in("ticket_id", ticketIds);
  if (timeEntriesError) throw new Error(`ticket_time_entries query failed: ${timeEntriesError.message}`);

  return {
    liveTickets: (liveTickets ?? []) as LiveTicketRow[],
    liveComments: (liveComments ?? []) as LiveCommentRow[],
    liveTimeEntries: (liveTimeEntries ?? []) as LiveTimeEntryRow[],
  };
}

function printClassification(result: AliasClassificationResult, targetProfileId: string, label: string): void {
  const { summary, references, alreadyCorrect, conflicting } = result;
  console.log(`\n=== ${label} ===`);
  console.log(`Target profile (Luis L.): ${targetProfileId}`);
  console.log(`Total referencias en origen a person-id ${ORPHAN_UNFUDDLE_PERSON_ID}: ${summary.totalSourceReferences}`);
  console.log(`Comentarios afectados (planeados):    ${summary.commentsAffected}`);
  console.log(`Tickets con reporter/creator null:    ${summary.ticketsWithNullReporter}`);
  console.log(`Tickets con assignee null:             ${summary.ticketsWithNullAssignee}`);
  console.log(`Time entries afectados:                ${summary.timeEntriesAffected}`);
  console.log(`Activities afectadas:                  ${summary.activitiesAffected} (no aplica — ticket_activity nunca se pobló para tickets históricos importados)`);
  console.log(`Adjuntos afectados:                    ${summary.attachmentsAffected} (no aplica — Unfuddle no registra uploader/creator en <attachment>, uploaded_by es null para todos los adjuntos importados)`);
  console.log(`Updates planeados:                     ${summary.plannedUpdates}`);

  if (references.length > 0) {
    console.log("\nkind | ticketKey | liveRowId | actual -> planeado");
    for (const r of references) {
      console.log(`${r.kind} | ${r.ticketKey ?? "(sin match)"} | ${r.liveRowId} | ${r.currentValue ?? "∅"} -> ${r.plannedValue}`);
    }
  }

  console.log(`\nReferencias previas ya asociadas al perfil de Luis L. antes de este repair: ${alreadyCorrect.length}`);
  if (conflicting.length > 0) {
    console.log(`\nADVERTENCIA: ${conflicting.length} referencia(s) con un valor YA asignado a otro perfil distinto — NUNCA sobrescritas:`);
    for (const r of conflicting) {
      console.log(`  ${r.kind} | ${r.ticketKey ?? "(sin match)"} | liveRowId=${r.liveRowId} | valor actual=${r.currentValue}`);
    }
  }
}

async function main(): Promise<void> {
  loadEnvFile();
  const args = parseArgs(process.argv.slice(2));

  console.log(`Parsing backup XML: ${args.backupXmlPath} (project=${args.targetProjectId}, milestone=${args.targetMilestoneId})`);
  const parsed = await parseBackupXml({ backupXmlPath: args.backupXmlPath, targetProjectId: args.targetProjectId, targetMilestoneId: args.targetMilestoneId });
  console.log(`Parsed ${parsed.tickets.length} source tickets.`);

  const admin = getSupabaseAdminClient();
  const projectId = await resolveKtvibeProjectId(admin, args.targetMilestoneId);
  const targetProfileId = await resolveLuisLProfileId(admin);

  const runClassification = async () => {
    const { liveTickets, liveComments, liveTimeEntries } = await loadLiveState(admin, projectId);
    return classifyAliasReferences(parsed.tickets, liveComments, liveTickets, liveTimeEntries, targetProfileId, EXPECTED_PROJECT_CODE, ORPHAN_UNFUDDLE_PERSON_ID);
  };

  const preview = await runClassification();
  printClassification(preview, targetProfileId, "PREVIEW");

  if (preview.conflicting.length > 0) {
    console.log("\nSe encontraron referencias en conflicto (ya apuntan a otro perfil) — deteniendo. Revisar manualmente antes de continuar.");
    return;
  }

  if (!args.apply) {
    console.log("\nPREVIEW only — pass --apply to write. No data modified.");
    return;
  }

  console.log("\nRe-running a fresh classification immediately before APPLY...");
  const freshPreApply = await runClassification();
  printClassification(freshPreApply, targetProfileId, "PREVIEW FRESCO (pre-APPLY)");

  if (freshPreApply.conflicting.length > 0) {
    console.log("\nAPPLY abortado: referencias en conflicto detectadas en el chequeo fresco. No se escribió nada.");
    return;
  }

  if (freshPreApply.references.length === 0) {
    console.log("\nAPPLY: 0 referencias por actualizar (ya todo correcto). Nada escrito.");
    return;
  }

  console.log(`\nAPPLY: escribiendo ${freshPreApply.references.length} referencia(s)...`);
  const results = await applyAliasFixes(admin, freshPreApply.references);
  for (const r of results) {
    console.log(`  ${r.kind} | ${r.ticketKey ?? "(sin match)"} | liveRowId=${r.liveRowId}: ${r.ok ? "OK" : "FAILED"} rowsUpdated=${r.rowsUpdated}${r.error ? ` error=${r.error}` : ""}`);
  }
  const failed = results.filter((r) => !r.ok);
  if (failed.length > 0) console.log(`\n${failed.length} actualizacion(es) FALLARON — ver arriba.`);

  const postApply = await runClassification();
  printClassification(postApply, targetProfileId, "POST-APPLY (verificación)");
  if (postApply.summary.plannedUpdates === 0) {
    console.log("\nPOST-APPLY: 0 referencias pendientes para person-id 150.");
  } else {
    console.log(`\nPOST-APPLY: ${postApply.summary.plannedUpdates} referencia(s) TODAVÍA pendientes — revisar antes de considerar esto resuelto.`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
