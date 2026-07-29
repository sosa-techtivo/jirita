import type { Phase5Report } from "../types/phase5";

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

export function printPhase5Report(report: Phase5Report): void {
  const { precheck } = report;

  section("PREFLIGHT");
  bullet("Modo", report.mode);
  bullet("Organización", precheck.organization.organizationId ? `sí (${precheck.organization.name})` : `NO — ${precheck.organization.error}`);
  bullet("Proyecto", precheck.project.projectId ? `sí (${precheck.project.projectId})` : `NO — ${precheck.project.error}`);
  bullet("Tickets de Fase 3 reconciliados (existencia, no drift)", precheck.ticketsReconciled.ok ? `sí (${precheck.ticketsReconciled.total})` : `NO — ${precheck.ticketsReconciled.error}`);
  bullet("Ticket padres faltantes", precheck.parents.missingParents.length);

  bullet("Usuarios resueltos", precheck.userMap.entries.filter((e) => e.status === "resolved").length);
  for (const entry of precheck.userMap.entries) {
    console.log(`    - [${entry.status}] unfuddle ${entry.unfuddleId} ${entry.fullName ?? "(sin nombre)"} <${entry.email ?? "?"}>${entry.detail ? " — " + entry.detail : ""}`);
  }

  section("AUDITORÍA DE ESQUEMA (ticket_time_entries)");
  const sa = precheck.schemaAudit;
  bullet("Columna unfuddle_id", sa.hasUnfuddleIdColumn ? "sí" : "NO EXISTE");
  bullet("Columna updated_at", sa.hasUpdatedAtColumn ? "sí" : "NO EXISTE");
  bullet("logged_by acepta null", sa.loggedByNullable ? "sí" : "no");
  bullet("Constraint de minutes", sa.minutesConstraint);
  bullet("Trigger de actividad", `${sa.activityTrigger.exists ? "existe" : "no existe"}, incondicional=${sa.activityTrigger.unconditional} — ${sa.activityTrigger.description}`);
  bullet("Trigger de membership", `${sa.membershipTrigger.exists ? "existe" : "no existe"} — ${sa.membershipTrigger.description}`);

  section("TIME ENTRIES DEL BACKUP");
  const s = precheck.stats;
  bullet("Total", s.total);
  bullet("Minutos totales (entero, fuente primaria)", s.totalMinutes);
  bullet("Horas totales (derivado)", s.totalHoursRounded.toFixed(2));
  bullet("Con descripción / sin", `${s.withDescription} / ${s.withoutDescription}`);
  bullet("Con usuario conocido", s.withKnownUser);
  bullet("  de los cuales, removido pero conocido", s.withRemovedButKnownUser);
  bullet("Con usuario huérfano", s.withOrphanUser);
  bullet("Sin person_id", s.withoutPersonId);
  bullet("IDs de usuario inesperados", s.unexpectedUserIds.length > 0 ? s.unexpectedUserIds.join(", ") : "(ninguno)");
  bullet("Con updated_at ≠ created_at (sin columna destino en JIRITA)", s.updatedDiffersFromCreated);
  bullet("Tickets con time entries", s.ticketsWithEntries);
  bullet("Máximo de registros por ticket", s.maxEntriesPerTicket);
  bullet("Máximo de horas en una entrada", s.maxHoursSingleEntry);
  bullet("Mínimo positivo de horas", s.minPositiveHours);
  bullet("Entradas con cero horas", s.zeroHoursCount);
  bullet("Entradas con horas negativas", s.negativeHoursCount);
  bullet("Entradas con pérdida de precisión (hours*60 no entero)", s.precisionLossCount);
  listDetails(s.precisionLossExamples.map((e) => `time entry ${e.unfuddleId}: ${e.hours}h = ${e.minutes}min`));

  if (precheck.mapping.errors.length > 0) {
    bullet("Errores de mapeo", precheck.mapping.errors.length);
    listDetails(precheck.mapping.errors.map((e) => e.reason));
  }

  section("DUPLICADOS HISTÓRICOS (contenido idéntico, IDs distintos)");
  bullet("Grupos", precheck.duplicateContentGroups.length);
  bullet("Filas implicadas", precheck.duplicateContentGroups.reduce((sum, g) => sum + g.unfuddleIds.length, 0));
  for (const g of precheck.duplicateContentGroups) {
    console.log(`    - ${g.key} -> unfuddle ids: ${g.unfuddleIds.join(", ")} (preservados como filas independientes, nunca fusionados)`);
  }

  section("IDEMPOTENCIA");
  if (precheck.idempotency) {
    const idem = precheck.idempotency;
    bullet("Nuevos", idem.newEntries.length);
    bullet("Ya importados y coincidentes", idem.alreadyImportedMatching.length);
    bullet("Conflictos (existen y difieren)", idem.conflicting.length);
    for (const c of idem.conflicting) listDetails(c.diffs.map((d) => `time entry ${c.planned.unfuddle_id}: ${d}`));
    bullet("unfuddle_id duplicados en el lote", idem.duplicateUnfuddleIdsInBatch.length);
  } else {
    console.log("  N/A — la columna unfuddle_id no está confirmada en vivo (ver AUDITORÍA DE ESQUEMA/EFECTOS SECUNDARIOS). No se intentó la consulta contra Supabase para evitar un error de columna inexistente. No se usa ninguna clave compuesta débil como sustituto.");
  }

  section("COMPARACIÓN CON TICKETS.HOURS");
  if (precheck.hoursComparison) {
    const hc = precheck.hoursComparison;
    bullet("Suma tickets.hours (KTVibe)", hc.sumTicketsHours);
    bullet("Suma time entries (backup)", hc.sumTimeEntries);
    bullet("Diferencia", Math.round((hc.sumTicketsHours - hc.sumTimeEntries) * 100) / 100);
    bullet("Tickets con hours>0 pero sin time entries", hc.ticketsWithHoursButNoEntries);
    bullet("Tickets donde la suma de time entries difiere de tickets.hours", `${hc.ticketsWithEntrySumDifferentFromHours} / ${hc.ticketsWithEntries}`);
  } else {
    console.log("  No se pudo calcular — proyecto no resuelto.");
  }

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
    for (const d of a.reconciliationDiffs) listDetails(d.diffs.map((x) => `time entry ${d.unfuddleId}: ${x}`));
    if (a.error) bullet("Error", a.error);
  }

  section("RESULTADO");
  const outcomeLabel: Record<Phase5Report["outcome"], string> = {
    preview_success: "PHASE 5 PREVIEW SUCCESS",
    apply_success: "PHASE 5 APPLY SUCCESS",
    failed: "PHASE 5 FAILED",
  };
  console.log(outcomeLabel[report.outcome]);
  if (report.outcome === "failed") {
    console.log("Razones:");
    for (const reason of report.failureReasons) console.log(`  - ${reason}`);
  }
  console.log("");
}
