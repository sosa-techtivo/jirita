import type { Phase4Report } from "../types/phase4";

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

export function printPhase4Report(report: Phase4Report): void {
  const { precheck } = report;

  section("PREFLIGHT");
  bullet("Modo", report.mode);
  bullet("Organización", precheck.organization.organizationId ? `sí (${precheck.organization.name})` : `NO — ${precheck.organization.error}`);
  bullet("Proyecto", precheck.project.projectId ? `sí (${precheck.project.projectId})` : `NO — ${precheck.project.error}`);
  bullet("Tickets de Fase 3 reconciliados", precheck.ticketsReconciled.ok ? `sí (${precheck.ticketsReconciled.total})` : `NO — ${precheck.ticketsReconciled.error}`);

  bullet("Usuarios resueltos", precheck.userMap.entries.filter((e) => e.status === "resolved").length);
  for (const entry of precheck.userMap.entries) {
    console.log(`    - [${entry.status}] unfuddle ${entry.unfuddleId} ${entry.fullName ?? "(sin nombre)"} <${entry.email ?? "?"}>${entry.detail ? " — " + entry.detail : ""}`);
  }
  bullet("Autores huérfanos (sin Person en el backup)", precheck.userMap.entries.filter((e) => e.status === "orphan_no_backup_record").length);

  bullet("Ticket padres faltantes", precheck.parents.missingParents.length);
  listDetails(precheck.parents.missingParents.map((id) => `ticket unfuddle_id ${id}`));

  section("EFECTOS SECUNDARIOS");
  bullet("Filas de ticket_activity por comentario insertado", precheck.sideEffects.activityRowsPerInsertedComment);
  bullet("Origen del actor", precheck.sideEffects.activityActorSource);
  bullet("Problema de timestamp", precheck.sideEffects.activityTimestampIssue);
  bullet("project_memberships", precheck.sideEffects.projectMembershipSideEffect);
  bullet("Bloquea APPLY", precheck.sideEffects.blocksApply ? "SÍ" : "no");
  if (precheck.sideEffects.blocksApply) console.log(`    - ${precheck.sideEffects.reason}`);

  section("COMENTARIOS DEL BACKUP");
  const s = precheck.commentStats;
  bullet("Total", s.total);
  bullet("Con body / body vacío", `${s.withBody} / ${s.emptyBody}`);
  bullet("Con author conocido", s.withKnownAuthor);
  bullet("  de los cuales, author removido pero conocido", s.withRemovedButKnownAuthor);
  bullet("Con author huérfano 150", s.withOrphanAuthor150);
  bullet("Con author huérfano 153", s.withOrphanAuthor153);
  bullet("Con author-id vacío", s.withEmptyAuthorId);
  bullet("Author ids inesperados", s.unexpectedAuthorIds.length > 0 ? s.unexpectedAuthorIds.join(", ") : "(ninguno)");
  bullet("Con updated_at ≠ created_at", s.updatedDiffersFromCreated);
  bullet("Con adjuntos anidados (pendientes para Fase 6)", s.withPendingAttachments);
  bullet("Tickets que contienen comentarios", s.ticketsWithComments);
  bullet("Máximo de comentarios por ticket", s.maxCommentsPerTicket);

  if (precheck.mapping.errors.length > 0) {
    bullet("Errores de mapeo", precheck.mapping.errors.length);
    listDetails(precheck.mapping.errors.map((e) => e.reason));
  }

  section("IDEMPOTENCIA");
  const idem = precheck.idempotency;
  bullet("Nuevos", idem.newComments.length);
  bullet("Ya importados y coincidentes", idem.alreadyImportedMatching.length);
  bullet("Conflictos (existen y difieren)", idem.conflicting.length);
  for (const c of idem.conflicting) listDetails(c.diffs.map((d) => `comment ${c.planned.unfuddle_id}: ${d}`));
  bullet("unfuddle_id duplicados en el lote", idem.duplicateUnfuddleIdsInBatch.length);
  bullet("Contenido idéntico, IDs distintos (informativo, no se fusionan)", idem.identicalContentDifferentIds.length);
  listDetails(idem.identicalContentDifferentIds.map((g) => `${g.unfuddleIds.join(", ")}`));

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
    for (const d of a.reconciliationDiffs) listDetails(d.diffs.map((x) => `comment ${d.unfuddleId}: ${x}`));
    if (a.error) bullet("Error", a.error);
  }

  section("RESULTADO");
  const outcomeLabel: Record<Phase4Report["outcome"], string> = {
    preview_success: "PHASE 4 PREVIEW SUCCESS",
    apply_success: "PHASE 4 APPLY SUCCESS",
    failed: "PHASE 4 FAILED",
  };
  console.log(outcomeLabel[report.outcome]);
  if (report.outcome === "failed") {
    console.log("Razones:");
    for (const reason of report.failureReasons) console.log(`  - ${reason}`);
  }
  console.log("");
}
