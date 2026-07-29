import type { Phase3Report } from "../types/phase3";

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

function listDetails(details: string[], limit = 25): void {
  const shown = details.slice(0, limit);
  for (const d of shown) console.log(`    - ${d}`);
  if (details.length > limit) console.log(`    ... and ${details.length - limit} more`);
}

function recordCounts(record: Record<string, number>): string {
  const entries = Object.entries(record);
  if (entries.length === 0) return "(none)";
  return entries.map(([k, v]) => `${k}=${v}`).join(", ");
}

export function printPhase3Report(report: Phase3Report): void {
  const { precheck } = report;

  section("PREFLIGHT");
  bullet("Modo", report.mode);
  bullet("Organización", precheck.organization.organizationId ? `sí (${precheck.organization.name})` : `NO — ${precheck.organization.error}`);
  bullet("Proyecto destino", precheck.project.projectId ? `sí (${precheck.project.projectId})` : `NO — ${precheck.project.error}`);
  bullet(
    "Proyecto reconciliado (slug/project_code/org)",
    precheck.project.ok ? "sí, sin drift" : `NO — org:${precheck.project.organizationMatches} slug:${precheck.project.slugMatches} code:${precheck.project.projectCodeMatches}`,
  );

  bullet("Usuarios resueltos", precheck.userMap.entries.filter((e) => e.status === "resolved").length);
  bullet("Usuarios faltantes (known Person, no profile match)", precheck.userMap.entries.filter((e) => e.status === "not_found_in_profiles").length);
  bullet("Usuarios ambiguos (multiple matches)", precheck.userMap.entries.filter((e) => e.status === "multiple_matches").length);
  bullet("Referencias huérfanas conocidas (sin Person en el backup)", precheck.userMap.entries.filter((e) => e.status === "orphan_no_backup_record").length);
  for (const entry of precheck.userMap.entries) {
    console.log(`    - [${entry.status}] unfuddle ${entry.unfuddleId} ${entry.fullName ?? "(sin nombre)"} <${entry.email ?? "?"}>${entry.detail ? " — " + entry.detail : ""}`);
  }

  section("EFECTOS SECUNDARIOS");
  bullet("Filas de ticket_activity por ticket insertado", precheck.sideEffects.activityRowsPerInsertedTicket);
  bullet("Origen del actor", precheck.sideEffects.activityActorSource);
  bullet("Problema de timestamp", precheck.sideEffects.activityTimestampIssue);
  bullet("project_memberships", precheck.sideEffects.projectMembershipSideEffect);
  bullet("Bloquea APPLY", precheck.sideEffects.blocksApply ? "SÍ" : "no");
  if (precheck.sideEffects.blocksApply) console.log(`    - ${precheck.sideEffects.reason}`);

  section("TICKETS DEL BACKUP");
  const s = precheck.ticketStats;
  bullet("Total", s.total);
  bullet("Por estado original", recordCounts(s.byOriginalStatus));
  bullet("Por estado JIRITA", recordCounts(s.byJiritaStatus));
  bullet("Por prioridad original", recordCounts(s.byOriginalPriority));
  bullet("Por prioridad JIRITA", recordCounts(s.byJiritaPriority));
  bullet("Con descripción / sin", `${s.withDescription} / ${s.withoutDescription}`);
  bullet("Con due date / sin", `${s.withDueDate} / ${s.withoutDueDate}`);
  bullet("Con estimación / sin", `${s.withEstimate} / ${s.withoutEstimate}`);
  bullet("Con assignee / sin", `${s.withAssignee} / ${s.withoutAssignee}`);
  bullet("Con reporter huérfano", s.withOrphanReporter);
  bullet("Con assignee huérfano", s.withOrphanAssignee);

  if (precheck.mapping.errors.length > 0) {
    bullet("Errores de mapeo", precheck.mapping.errors.length);
    listDetails(precheck.mapping.errors.map((e) => e.reason));
  }

  section("IDEMPOTENCIA");
  const idem = precheck.idempotency;
  bullet("Nuevos", idem.newTickets.length);
  bullet("Ya importados y coincidentes", idem.alreadyImportedMatching.length);
  bullet("Conflictos (existen y difieren)", idem.conflicting.length);
  for (const c of idem.conflicting) listDetails(c.diffs.map((d) => `ticket ${c.planned.unfuddle_id}: ${d}`));
  bullet("Colisiones de ticket_number", idem.ticketNumberCollisions.length);
  listDetails(idem.ticketNumberCollisions.map((c) => `ticket_number ${c.planned.ticket_number}: planned unfuddle_id ${c.planned.unfuddle_id} vs existing ${c.existing.id} (unfuddle_id ${c.existing.unfuddleId})`));
  bullet("ticket_number duplicados en el lote", idem.duplicateTicketNumbersInBatch.length);
  bullet("unfuddle_id duplicados en el lote", idem.duplicateUnfuddleIdsInBatch.length);

  bullet("Conflictos encontrados (preflight total)", precheck.blockingReasons.length);
  listDetails(precheck.blockingReasons);

  if (report.applyOutcome) {
    section("APPLY");
    const a = report.applyOutcome;
    bullet("Intentados", a.attempted);
    bullet("Insertados", a.inserted);
    bullet("Omitidos (ya importados)", a.skippedAlreadyImported);
    bullet("Fallidos", a.failed);
    bullet("Posible importación parcial", a.possiblePartialImport ? "SÍ" : "no");
    bullet("Reconciliados OK", a.reconciledOk);
    bullet("Diferencias encontradas", a.reconciliationDiffs.length);
    for (const d of a.reconciliationDiffs) listDetails(d.diffs.map((x) => `ticket ${d.unfuddleId}: ${x}`));
    if (a.error) bullet("Error", a.error);
  }

  section("RESULTADO");
  const outcomeLabel: Record<Phase3Report["outcome"], string> = {
    preview_success: "PHASE 3 PREVIEW SUCCESS",
    apply_success: "PHASE 3 APPLY SUCCESS",
    failed: "PHASE 3 FAILED",
  };
  console.log(outcomeLabel[report.outcome]);
  if (report.outcome === "failed") {
    console.log("Razones:");
    for (const reason of report.failureReasons) console.log(`  - ${reason}`);
  }
  console.log("");
}
