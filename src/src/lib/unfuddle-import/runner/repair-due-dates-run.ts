#!/usr/bin/env -S node --import tsx
/**
 * Due-date drift repair for the already-completed KTVibe migration.
 *
 * ── Root cause (confirmed by direct code/schema/data evidence, not guessed) ──
 *
 * The Unfuddle -> Jirita ticket importer (Phase 3, ../import-tickets/) is
 * NOT the culprit: `mapTicketRows` (import-tickets/map-ticket-rows.ts) sets
 * `due_date: ticket.dueOn` as a pure passthrough of the raw
 * `<due-on>YYYY-MM-DD</due-on>` XML text (parser/backup-xml-parser.ts's
 * `textOrNull`, no date construction at all), and the insert goes through
 * `insert_tickets_bypassing_activity_log` (migration 20260822000000,
 * verified live to produce zero ticket_activity rows). No file anywhere in
 * src/lib/unfuddle-import ever calls `.update()`/`.upsert()` on `tickets`
 * (grep-confirmed) — every write is a one-time `.insert()` via a service-
 * role client, which has no `auth.uid()` session to attribute anything to.
 * The importer physically cannot have produced an authenticated
 * "due_date_changed" activity row.
 *
 * What actually happened, after Phase 3's insert already wrote the correct
 * `due_date` (confirmed against the raw backup — see below):
 *
 *   1. Before this repair, `due_date` displayed with no year at all
 *      ("Jun 1" — see the year-inclusive-date-display task earlier in this
 *      project's history). Opening the Due Date editor
 *      (EditableSidebarDueDate in ../../components/tickets/
 *      ticket-detail-screen.tsx, or PreviewDueDateControl in
 *      ticket-preview-panel.tsx) seeded its native <input type="date">
 *      by calling `parseDisplayDate("Jun 1")` — which, being unable to
 *      recover a year from a yearless display string, HARDCODED the
 *      current year (`return month ? \`2026-${month}-${day}\` : "";` in the
 *      then-current ../../components/tickets/ticket-ui.tsx). That
 *      hardcoding is what turned 2018 into 2026 — no `new Date()` call, no
 *      `setFullYear`, just a literal `2026-` string prefix baked into the
 *      reverse-parser, on the exact code path an editor open must run
 *      through to populate its input.
 *   2. Both editors auto-save `onBlur` — merely opening the field and
 *      clicking/tabbing away (no intentional value change required) calls
 *      `save()`, which round-trips the already-corrupted "2026-06-01"
 *      through `formatISODate` -> `parseDisplayDate` again and persists it
 *      via the ordinary `updateTicket()` path (a normal authenticated
 *      Supabase `.update()`, not a service-role script).
 *   3. That ordinary update is what the real `tickets_log_updated` AFTER
 *      UPDATE trigger (supabase/migrations/20260728000000_
 *      real_ticket_activity_log.sql, line ~78: `actor uuid := auth.uid();`)
 *      is designed to log for any authenticated session — it does not, and
 *      structurally cannot, distinguish "an intentional edit" from "a
 *      round-trip bug's side effect". `auth.uid()` at the moment that
 *      UPDATE executed resolved to whoever's real browser session made the
 *      API call (Alex Sosa, per the confirmed Activity entry) — the
 *      attribution is technically accurate about *who called the API*, not
 *      evidence of an intentional edit. This was never a synthetic/fake
 *      activity row fabricated by the importer; it is a real row describing
 *      a real (buggy) write.
 *
 * `parseDisplayDate`'s hardcoded year was already fixed (to parse the real
 * year now that the display format includes one) as part of the unrelated
 * date-formatting task earlier in this session — that fix already prevents
 * this exact corruption path from firing again for any ticket, since the
 * trigger's `IS DISTINCT FROM` check means a correctly round-tripped
 * (unchanged) value now produces no update and no activity at all. No
 * further application code needed to change for that reason. This script
 * only repairs data already corrupted before that fix landed.
 *
 * ── What this script does ──
 *
 * PREVIEW (default): parses the Unfuddle backup XML (source of truth),
 * reads every live KTVibe ticket's due_date + its due_date_changed activity
 * history, classifies each ticket, and reports counts + a full per-ticket
 * table. Writes nothing.
 *
 * APPLY (--apply): re-parses/re-queries fresh (never reuses the earlier
 * PREVIEW's in-memory result), updates only tickets still classified
 * "incorrecto" at that moment (one plain `.update()` per ticket, guarded by
 * `.eq("due_date", <value observed right then>)` for idempotency/race
 * safety — see apply-due-date-fixes.ts), then re-classifies once more and
 * reports the post-APPLY diff. Never touches tickets with no due date on
 * either side, tickets already correct, or tickets classified
 * "no_verificable" (a value present on only one side — could be a
 * legitimate real edit; never inferred, never overwritten).
 *
 * Usage:
 *   npx tsx src/lib/unfuddle-import/runner/repair-due-dates-run.ts \
 *     --backup=/path/to/backup.xml [--apply] [--project=152] [--milestone=183]
 */
import { parseBackupXml } from "../parser/backup-xml-parser";
import { getSupabaseAdminClient } from "../supabase-admin-client";
import { resolveOrganization } from "../preflight/resolve-organization";
import { resolveTargetProjectForTickets } from "../preflight/resolve-target-project-for-tickets";
import {
  TARGET_ORGANIZATION_SLUG,
  TARGET_UNFUDDLE_MILESTONE_ID,
  TARGET_UNFUDDLE_PROJECT_ID,
  EXPECTED_PROJECT_SLUG,
  EXPECTED_PROJECT_CODE,
} from "../config";
import {
  classifyDueDates,
  type ClassificationResult,
  type DueDateActivityRow,
  type LiveTicketRow,
} from "../repair-due-dates/classify-due-dates";
import { applyDueDateFixes } from "../repair-due-dates/apply-due-date-fixes";
import type { SupabaseClient } from "@supabase/supabase-js";

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
    console.error("Usage: repair-due-dates-run.ts --backup=<path to backup.xml> [--apply] [--project=152] [--milestone=183]");
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
  if (org.error || !org.organizationId) {
    throw new Error(`Could not resolve organization "${TARGET_ORGANIZATION_SLUG}": ${org.error}`);
  }
  const project = await resolveTargetProjectForTickets(
    admin,
    org.organizationId,
    String(targetMilestoneId),
    EXPECTED_PROJECT_SLUG,
    EXPECTED_PROJECT_CODE,
  );
  if (!project.ok || !project.projectId) {
    throw new Error(`Could not resolve KTVibe project: ${project.error}`);
  }
  return project.projectId;
}

async function loadLiveState(
  admin: SupabaseClient,
  projectId: string,
): Promise<{ liveTickets: LiveTicketRow[]; activityByTicketId: Map<string, DueDateActivityRow[]> }> {
  const { data: liveTickets, error: ticketsError } = await admin
    .from("tickets")
    .select("id, unfuddle_id, ticket_number, due_date")
    .eq("project_id", projectId);
  if (ticketsError) throw new Error(`tickets query failed: ${ticketsError.message}`);

  const ticketIds = (liveTickets ?? []).map((t) => t.id as string);
  const activityByTicketId = new Map<string, DueDateActivityRow[]>();
  if (ticketIds.length > 0) {
    const { data: activity, error: activityError } = await admin
      .from("ticket_activity")
      .select("ticket_id, actor_profile_id, old_value, new_value, created_at")
      .eq("field_name", "due_date")
      .in("ticket_id", ticketIds)
      .order("created_at", { ascending: true });
    if (activityError) throw new Error(`ticket_activity query failed: ${activityError.message}`);
    for (const row of activity ?? []) {
      const list = activityByTicketId.get(row.ticket_id as string) ?? [];
      list.push({
        ticket_id: row.ticket_id as string,
        actor_profile_id: row.actor_profile_id as string | null,
        old_value: row.old_value as string | null,
        new_value: row.new_value as string | null,
        created_at: row.created_at as string,
      });
      activityByTicketId.set(row.ticket_id as string, list);
    }
  }

  return {
    liveTickets: (liveTickets ?? []).map((t) => ({
      id: t.id as string,
      unfuddle_id: t.unfuddle_id as string | null,
      ticket_number: t.ticket_number as number | null,
      due_date: t.due_date as string | null,
    })),
    activityByTicketId,
  };
}

async function resolveActorNames(admin: SupabaseClient, result: ClassificationResult): Promise<Map<string, string>> {
  const ids = new Set<string>();
  for (const t of result.tickets) for (const a of t.relatedActivity) if (a.actor_profile_id) ids.add(a.actor_profile_id);
  if (ids.size === 0) return new Map();
  const { data } = await admin.from("profiles").select("id, first_name, last_name, email").in("id", [...ids]);
  const names = new Map<string, string>();
  for (const row of data ?? []) {
    const name = [row.first_name, row.last_name].filter(Boolean).join(" ").trim();
    names.set(row.id as string, name || (row.email as string) || row.id as string);
  }
  return names;
}

function printClassification(result: ClassificationResult, actorNames: Map<string, string>, label: string): void {
  const { summary, tickets } = result;
  console.log(`\n=== ${label} ===`);
  console.log(`Tickets inspeccionados:        ${summary.inspected}`);
  console.log(`Con Due Date en Unfuddle:      ${summary.withSourceDueDate}`);
  console.log(`Correctos:                     ${summary.correct}`);
  console.log(`Incorrectos:                   ${summary.incorrect}`);
  console.log(`Sin correspondencia:           ${summary.noCorrespondence}`);
  console.log(`No verificables:               ${summary.notVerifiable}`);
  console.log(`Updates planeados:             ${summary.plannedUpdates}`);

  const notable = tickets.filter((t) => t.category !== "sin_due_date_ambos" && t.category !== "correcto");
  if (notable.length === 0) {
    console.log("(Ningún ticket fuera de 'sin_due_date_ambos'/'correcto'.)");
    return;
  }

  console.log("\nticketKey | categoria | unfuddleId | actual | esperado | patron_2026 | actividad_due_date");
  for (const t of notable) {
    const activityDesc = t.relatedActivity
      .map((a) => {
        const actor = a.actor_profile_id ? actorNames.get(a.actor_profile_id) ?? a.actor_profile_id : "NULL (sin usuario)";
        return `[${a.created_at}] ${actor}: ${a.old_value ?? "∅"} -> ${a.new_value ?? "∅"}`;
      })
      .join(" ; ") || "(ninguna)";
    console.log(
      `${t.ticketKey ?? "(sin ticket JIRITA)"} | ${t.category} | ${t.unfuddleId} | ${t.currentDueDate ?? "∅"} | ${t.plannedDueDate ?? t.sourceDueDate ?? "∅"} | ${t.yearSubstitutionPattern ? "SI" : "no"} | ${activityDesc}`,
    );
  }
}

async function main(): Promise<void> {
  loadEnvFile();
  const args = parseArgs(process.argv.slice(2));

  console.log(`Parsing backup XML: ${args.backupXmlPath} (project=${args.targetProjectId}, milestone=${args.targetMilestoneId})`);
  const parsed = await parseBackupXml({
    backupXmlPath: args.backupXmlPath,
    targetProjectId: args.targetProjectId,
    targetMilestoneId: args.targetMilestoneId,
  });
  console.log(`Parsed ${parsed.tickets.length} source tickets.`);

  const admin = getSupabaseAdminClient();
  const projectId = await resolveKtvibeProjectId(admin, args.targetMilestoneId);

  const runClassification = async (): Promise<ClassificationResult> => {
    const { liveTickets, activityByTicketId } = await loadLiveState(admin, projectId);
    return classifyDueDates(parsed.tickets, liveTickets, EXPECTED_PROJECT_CODE, activityByTicketId);
  };

  const preview = await runClassification();
  const actorNames = await resolveActorNames(admin, preview);
  printClassification(preview, actorNames, "PREVIEW");

  if (!args.apply) {
    console.log("\nPREVIEW only — pass --apply to write. No data modified.");
    return;
  }

  // Fresh PREVIEW inside this same invocation, immediately before writing —
  // never reuses the classification computed above, per the task's explicit
  // "no ejecutar APPLY sin PREVIEW fresco en la misma invocación".
  console.log("\nRe-running a fresh classification immediately before APPLY...");
  const freshPreApply = await runClassification();
  const freshActorNames = await resolveActorNames(admin, freshPreApply);
  printClassification(freshPreApply, freshActorNames, "PREVIEW FRESCO (pre-APPLY)");

  const toFix = freshPreApply.tickets.filter((t) => t.category === "incorrecto");
  if (toFix.length === 0) {
    console.log("\nAPPLY: 0 tickets need updating (already correct as of this fresh check). Nothing written.");
    return;
  }

  console.log(`\nAPPLY: writing ${toFix.length} ticket(s)...`);
  const results = await applyDueDateFixes(admin, toFix);
  for (const r of results) {
    console.log(`  ${r.ticketKey ?? r.unfuddleId}: ${r.ok ? "OK" : "FAILED"} (${r.fromDueDate ?? "∅"} -> ${r.toDueDate}) rowsUpdated=${r.rowsUpdated}${r.error ? ` error=${r.error}` : ""}`);
  }
  const failed = results.filter((r) => !r.ok);
  if (failed.length > 0) console.log(`\n${failed.length} update(s) FAILED — see above.`);

  const postApply = await runClassification();
  printClassification(postApply, await resolveActorNames(admin, postApply), "POST-APPLY (verificación)");
  if (postApply.summary.incorrect === 0) {
    console.log("\nPOST-APPLY: 0 tickets incorrectos restantes.");
  } else {
    console.log(`\nPOST-APPLY: ${postApply.summary.incorrect} ticket(s) TODAVIA incorrectos — revisar antes de considerar esto resuelto.`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
