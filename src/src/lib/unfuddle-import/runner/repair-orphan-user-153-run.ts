#!/usr/bin/env -S node --import tsx
/**
 * One-off, narrowly-scoped repair: link Unfuddle person-id 153's historical
 * KTVibe references (comment author, ticket assignee/reporter) to Micaela
 * Levinsonas's already-existing JIRITA profile.
 *
 * ── Confirmation evidence (multiple independent records, not a single
 *    screenshot) ──
 *
 * 1. Person-id 153 has NO `<person>` element anywhere in backup.xml — a
 *    genuinely orphaned id (the account was fully removed from Unfuddle's
 *    People export), distinct from an `is-removed`-flagged person (who
 *    still keeps a `<person>` record). This is why `resolveTargetUsers`
 *    (Phase 2) could never have resolved it: that function only matches
 *    against `<person>` records by email, and 153 has none.
 * 2. 850 audit-trail events across the backup are a person-id-153-performed
 *    "Ticket reassigned from *Micaela L.*" — a ~19x majority over the next
 *    most common name in the same self-referential position ("Maria Jose
 *    A.", 44 times), meaning person 153 overwhelmingly reassigns tickets
 *    away from a person Unfuddle's own free text calls "Micaela L.".
 * 3. Independently verified on two separate KTVibe tickets: KTV-1893
 *    (comment 52181 by author-id 153 at 2025-01-29T23:11:47Z, "smoke test
 *    live passed", followed 3 seconds later by event 266414 at
 *    2025-01-29T23:11:50Z, "Ticket reassigned from *Micaela L.* to *Maria
 *    Jose A.*", actor person-id 153) and KTV-1925 (comment 52301 by
 *    author-id 153 at 2025-03-20T10:57:42Z, followed 6 seconds later by
 *    event 267060, "Ticket reassigned from *Micaela L.* to *Mex A.*",
 *    actor person-id 153) — the exact same person finishing testing work
 *    and immediately reassigning the ticket away from themself, described
 *    as "Micaela L." both times.
 * 4. Comment 52078 on KTV-1893 (author-id 148, Maria Jose Abadia) addresses
 *    author-id 153 directly as "Mica" — the common short form of Micaela.
 * 5. Person-id 153's KTVibe footprint (17 tickets, 34 comments, 3
 *    tickets as final assignee+reporter, 0 time entries) never overlaps
 *    with person-id 150's ("Luis L.", 21 tickets, 36 comments, confirmed
 *    still unresolved — 79 self-referential "Luis L." events, 0 for
 *    "Micaela L.") — they are unambiguously different people.
 *
 * Micaela Levinsonas already has a real, existing `profiles` row (matched
 * by email micalev45@gmail.com) — this script never creates an
 * `auth.users` row or a `profiles` row, only points existing null FK
 * columns at her existing profile id. It also never writes
 * `profiles.unfuddle_id` — that column is reserved for her current/primary
 * Unfuddle account (id 155, itself not linked yet — a separate, out-of-
 * scope finding, not touched here) and has a unique constraint; person-id
 * 153 is an old, retired alias of the same real person, handled as a
 * one-time explicit correction on the affected rows themselves, not as a
 * new persistent identity mapping (no schema change).
 *
 * Person-id 150 ("Luis L.") is untouched by this script — confirmed
 * distinct (see point 5) and still has no email/no `<person>` record
 * anywhere, so it remains correctly unresolved.
 *
 * Usage:
 *   npx tsx src/lib/unfuddle-import/runner/repair-orphan-user-153-run.ts \
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

const MICAELA_EMAIL = "micalev45@gmail.com";
const ORPHAN_UNFUDDLE_PERSON_ID = 153;

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
    console.error("Usage: repair-orphan-user-153-run.ts --backup=<path to backup.xml> [--apply] [--project=152] [--milestone=183]");
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

async function resolveMicaelaProfileId(admin: SupabaseClient): Promise<string> {
  const { data, error } = await admin.from("profiles").select("id, email").ilike("email", MICAELA_EMAIL);
  if (error) throw new Error(`profiles query failed: ${error.message}`);
  const rows = data ?? [];
  if (rows.length === 0) throw new Error(`No profile found with email ${MICAELA_EMAIL} — refusing to proceed (no target to point to).`);
  if (rows.length > 1) throw new Error(`${rows.length} profiles matched email ${MICAELA_EMAIL} — expected exactly one, ambiguity — refusing to proceed.`);
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
  console.log(`Target profile (Micaela Levinsonas): ${targetProfileId}`);
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

  if (alreadyCorrect.length > 0) {
    console.log(`\n${alreadyCorrect.length} referencia(s) ya correctas (sin cambio necesario).`);
  }
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
  const targetProfileId = await resolveMicaelaProfileId(admin);

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
    console.log("\nPOST-APPLY: 0 referencias pendientes para person-id 153.");
  } else {
    console.log(`\nPOST-APPLY: ${postApply.summary.plannedUpdates} referencia(s) TODAVÍA pendientes — revisar antes de considerar esto resuelto.`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
