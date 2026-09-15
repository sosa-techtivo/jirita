import type { NotesRecoveryReport } from "../types/notes-recovery";
import { EXPECTED_ALLOWLISTED_TOTAL } from "../import-notes-recovery/notebook-project-allowlist";

// SAFETY CONTRACT: this file may print title / notebookId / pageNumber /
// version counts / timestamps / resolved author identity (email, name) /
// project name+UUID / historical keys — and NOTHING else off a
// LogicalNoteCandidate/PlannedNoteInsertRow. It must NEVER print
// `.content`, and it must never accept a raw project_notes row without
// naming every field it prints explicitly (no `console.log(row)`).
// content-derived hashes are intentionally NOT printed here — they are not
// needed for this multi-project PREVIEW's own idempotency story (that's by
// unfuddle_note_key), so they stay out per this task's "no innecesario"
// sensitive-adjacent-data rule.

const line = (char = "-") => char.repeat(72);

function section(title: string): void {
  console.log("");
  console.log(line("="));
  console.log(title);
  console.log(line("="));
}

function bullet(label: string, value: string | number): void {
  console.log(`  ${label}: ${value}`);
}

function listDetails(details: string[], limit = 60): void {
  const shown = details.slice(0, limit);
  for (const d of shown) console.log(`    - ${d}`);
  if (details.length > limit) console.log(`    ... and ${details.length - limit} more`);
}

export function printNotesRecoveryReport(report: NotesRecoveryReport): { success: boolean } {
  bullet("Modo", report.mode);

  if (!report.precheck) {
    section("RESULTADO");
    console.log(`NOTES RECOVERY ${report.outcome.toUpperCase()}`);
    console.log(`VEREDICTO: ${report.outcome === "preview_success" || report.outcome === "apply_success" ? "PASS" : "FAIL"}`);
    for (const reason of report.failureReasons) console.log(`  - ${reason}`);
    console.log("");
    return { success: report.outcome === "preview_success" || report.outcome === "apply_success" };
  }

  const { precheck } = report;

  section("FUENTE (backup.xml, notebooks del proyecto Unfuddle 152)");
  bullet("Notebooks encontrados", precheck.parsed.notebookCount);
  bullet("Revisiones de página encontradas", precheck.parsed.revisionCount);
  bullet("Notes lógicas totales (todos los notebooks)", precheck.grouping.candidates.length);
  bullet("Problemas de continuidad de versión", precheck.grouping.continuityIssues.length);
  for (const issue of precheck.grouping.continuityIssues) {
    console.log(`    - notebook=${issue.notebookUnfuddleId} page=${issue.pageNumber} razón=${issue.reason} versiones=[${issue.versionsPresent.join(",")}]`);
  }

  const allowlistedCount = precheck.allowlistAssignment.allowlisted.reduce((sum, b) => sum + b.candidates.length, 0);
  const excludedCount = precheck.allowlistAssignment.excluded.length;

  section("ALLOWLIST (fail-closed — solo 6 notebooks aprobados)");
  bullet("Notes en el allowlist (candidatas a escribirse)", allowlistedCount);
  bullet("Notes excluidas (notebook no aprobado)", excludedCount);
  bullet("Total esperado allowlisted (7+3+8+1+8+1)", EXPECTED_ALLOWLISTED_TOTAL);
  bullet("Coincide con lo esperado", allowlistedCount === EXPECTED_ALLOWLISTED_TOTAL ? "sí" : "NO");
  bullet("Mismatches de conteo por notebook", precheck.allowlistAssignment.countMismatches.length);
  for (const m of precheck.allowlistAssignment.countMismatches) {
    console.log(`    - notebook=${m.mapping.notebookUnfuddleId} (${m.mapping.jiritaProjectName}): esperado=${m.expected} encontrado=${m.actual}`);
  }
  bullet("Entradas del allowlist sin candidatos en la fuente", precheck.allowlistAssignment.unmappedAllowlistEntries.length);
  for (const u of precheck.allowlistAssignment.unmappedAllowlistEntries) {
    console.log(`    - notebook=${u.notebookUnfuddleId} (${u.jiritaProjectName}) — 0 candidatos encontrados`);
  }
  // Explicit, informative confirmation of the two named exclusions — never
  // special-cased in code, just confirmed here from the same generic
  // exclusion list every other non-allowlisted notebook falls into.
  const excludedNotebookIds = new Set(precheck.allowlistAssignment.excluded.map((c) => c.notebookUnfuddleId));
  bullet('Notebook 255 "Addison Smith" excluido', excludedNotebookIds.has(255) ? "sí (confirmado)" : "N/A — no encontrado en la fuente");
  bullet('Notebook 224 "KTDrive your career" excluido', excludedNotebookIds.has(224) ? "sí (confirmado)" : "N/A — no encontrado en la fuente");

  section("AUTORES (created_by / updated_by — solo Notes allowlisted)");
  bullet("Ids de autor referenciados", precheck.authorResolution.entries.length);
  bullet("Resueltos", precheck.authorResolution.entries.filter((e) => e.status !== "unresolved").length);
  bullet("Sin resolver", precheck.authorResolution.entries.filter((e) => e.status === "unresolved").length);
  for (const e of precheck.authorResolution.entries) {
    console.log(`    - unfuddle_id=${e.unfuddleId} status=${e.status} email=${e.email ?? "N/A"} name=${e.fullName ?? "N/A"} profile_id=${e.profileId ?? "N/A"}`);
  }

  section("DESTINOS (por notebook allowlisted)");
  for (const bucket of precheck.allowlistAssignment.allowlisted) {
    const resolution = precheck.projectResolutions.find((r) => r.mapping.notebookUnfuddleId === bucket.mapping.notebookUnfuddleId);
    const destPlans = precheck.plans.filter((p) => resolution?.projectId && p.plannedRow.project_id === resolution.projectId);
    const newForDest = precheck.idempotency?.newPlans.filter((p) => resolution?.projectId && p.plannedRow.project_id === resolution.projectId).length ?? "N/A";
    const alreadyForDest =
      precheck.idempotency?.alreadyImportedMatching.filter((x) => resolution?.projectId && x.plan.plannedRow.project_id === resolution.projectId).length ?? "N/A";
    const conflictsForDest =
      precheck.idempotency?.conflicting.filter((x) => resolution?.projectId && x.plan.plannedRow.project_id === resolution.projectId).length ?? "N/A";

    console.log(`  - ${bucket.mapping.jiritaProjectName}`);
    console.log(`      project_uuid: ${bucket.mapping.jiritaProjectUuid}`);
    console.log(`      notebook_id: ${bucket.mapping.notebookUnfuddleId} ("${bucket.mapping.notebookTitle}")`);
    console.log(`      milestone histórico (informativo): ${bucket.mapping.historicalMilestoneId}`);
    console.log(`      resuelto en JIRITA sin drift: ${resolution?.ok ? "sí" : `NO — ${resolution?.error}`}`);
    console.log(`      candidate Notes: ${bucket.candidates.length} (esperado ${bucket.mapping.expectedLogicalNotes})`);
    console.log(`      planned: ${destPlans.length}`);
    console.log(`      new: ${newForDest}  already_imported: ${alreadyForDest}  conflicts: ${conflictsForDest}`);
  }

  section("IDEMPOTENCIA GLOBAL (por unfuddle_note_key, las 6 proyectos destino)");
  if (precheck.idempotency) {
    bullet("Nuevas (total)", precheck.idempotency.newPlans.length);
    bullet("Ya importadas y coincidentes (total)", precheck.idempotency.alreadyImportedMatching.length);
    bullet("Conflictos (total)", precheck.idempotency.conflicting.length);
    bullet("Claves duplicadas dentro del batch", precheck.idempotency.duplicateKeysInBatch.length);
    bullet("Notes nativas existentes en los 6 proyectos destino (sin unfuddle_note_key)", precheck.idempotency.existingNativeNotes.length);
    for (const n of precheck.idempotency.existingNativeNotes) {
      console.log(`    - id=${n.id} project_id=${n.projectId} title="${n.title}" created_at=${n.createdAt} — nativa, no candidata, no tocada`);
    }
    for (const c of precheck.idempotency.conflicting) {
      console.log(`    - CONFLICTO key=${c.plan.plannedRow.unfuddle_note_key}: ${c.diffs.join("; ")}`);
    }
  } else {
    bullet("Clasificación de idempotencia", "no disponible — ver PREFLIGHT para la razón");
  }

  section("PREFLIGHT");
  bullet("Bloqueos encontrados", precheck.blockingReasons.length);
  listDetails(precheck.blockingReasons);

  if (report.mode === "APPLY") {
    section("APPLY");
    if (report.applyOutcome) {
      const a = report.applyOutcome;
      bullet("Intentadas (nuevas)", a.attempted);
      bullet("Insertadas", a.inserted);
      bullet("Fallidas", a.failed);
      bullet("Posible importación parcial", a.possiblePartialImport ? "SÍ" : "no");
      bullet("Duración", `${a.durationMs} ms`);
      bullet("Reconciliadas OK (re-lectura inmediata post-insert)", a.reconciledOk);
      bullet("Diferencias de reconciliación (inmediata)", a.reconciliationDiffs.length);
      for (const d of a.reconciliationDiffs) listDetails(d.diffs.map((x) => `${d.unfuddleNoteKey}: ${x}`));
      if (a.error) bullet("Error", a.error);
    } else {
      bullet("RPC de inserción", "no invocado (0 nuevas — ejecución idempotente, todo ya importado)");
    }

    section("RECONCILIACIÓN POST-WRITE (independiente, contra las 28 esperadas)");
    if (report.reconciliation) {
      const r = report.reconciliation;
      bullet("Total esperado", r.totalExpected);
      bullet("Total encontrado y coincidente", r.totalActualMatching);
      bullet("Keys esperadas faltantes", r.missingKeys.length);
      bullet("Keys encontradas en proyecto inesperado", r.unexpectedDestinationKeys.length);
      for (const u of r.unexpectedDestinationKeys) console.log(`    - key=${u.key} esperado=${u.expectedProjectId} encontrado=${u.actualProjectId}`);
      bullet("project_note_activity generado para estas Notes (esperado 0)", r.recoveryActivityRowCount);
      for (const d of r.perDestination) {
        console.log(`    - ${d.mapping.jiritaProjectName}: esperado=${d.expectedCount} encontrado=${d.actualCount}`);
      }
      bullet("Reconciliación OK", r.ok ? "sí" : "NO");
    } else {
      bullet("Reconciliación", "no ejecutada (APPLY abortado antes de escribir)");
    }
  }

  section("RESULTADO");
  const outcomeLabel: Record<NotesRecoveryReport["outcome"], string> = {
    preview_success: "NOTES RECOVERY PREVIEW SUCCESS",
    apply_success: "NOTES RECOVERY APPLY SUCCESS",
    apply_rejected: "NOTES RECOVERY APPLY REJECTED",
    failed: "NOTES RECOVERY FAILED",
  };
  console.log(outcomeLabel[report.outcome]);
  console.log(`VEREDICTO: ${report.outcome === "preview_success" || report.outcome === "apply_success" ? "PASS" : "FAIL"}`);
  if (report.outcome !== "preview_success" && report.outcome !== "apply_success") {
    console.log("Razones:");
    for (const reason of report.failureReasons) console.log(`  - ${reason}`);
  }
  console.log("");

  return { success: report.outcome === "preview_success" || report.outcome === "apply_success" };
}
