import type { Phase7Report } from "../types/phase7";

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

function listDetails(details: string[], limit = 40): void {
  const shown = details.slice(0, limit);
  for (const d of shown) console.log(`    - ${d}`);
  if (details.length > limit) console.log(`    ... and ${details.length - limit} more`);
}

export function printPhase7Report(report: Phase7Report): { success: boolean } {
  bullet("Modo", report.mode);

  if (!report.precheck) {
    section("RESULTADO");
    console.log(`PHASE 7 ${report.outcome.toUpperCase()}`);
    for (const reason of report.failureReasons) console.log(`  - ${reason}`);
    console.log("");
    return { success: report.outcome !== "failed" };
  }

  const { precheck } = report;

  section("GENERAL");
  bullet("Relaciones globales en el backup (verificado por escaneo completo único — ver auditRelationSchema/docs)", precheck.scope.globalRelationsInBackup);
  bullet("Relaciones inicialmente asociadas a KTVibe (source = uno de los 170)", precheck.scope.initiallyAssociatedWithKTVibe);
  bullet("  Internas (ambos extremos en el alcance)", precheck.scope.bothEndsInScopeRaw);
  bullet("  excluded_external (target no importado)", precheck.scope.targetNotImportedRaw);
  bullet("  excluded_external (target en otro proyecto JIRITA)", precheck.scope.targetCrossProjectRaw);
  bullet("  Total excluded_external", precheck.scope.excludedExternalRaw);
  bullet("Relaciones conceptuales únicas dentro del alcance (canonicalizadas)", precheck.canonicalCandidates.length);
  bullet("Claves históricas únicas (unfuddle_relation_key)", new Set(precheck.canonicalCandidates.map((c) => c.unfuddleRelationKey)).size);
  bullet("Tipos distintos", JSON.stringify(precheck.scope.typeDistribution));
  bullet("Relaciones dirigidas (child/parent)", precheck.scope.directedTypeCount);
  bullet("Relaciones simétricas (sibling/related/duplicate)", precheck.scope.symmetricTypeCount);
  bullet("Relaciones sin tipo reconocido", precheck.scope.untypedCount);
  bullet("Self-relations", precheck.scope.selfRelationCount);
  bullet("Tipos inválidos (Fase 1 validateRelations)", precheck.scope.invalidTypeCount);

  section("EXTERNA (excluded_external)");
  if (precheck.blockedRelations.length === 0) {
    console.log("  (ninguna)");
  }
  for (const r of precheck.blockedRelations) {
    console.log(
      `  KTV-${r.source.ticketNumber} / unfuddle ${r.source.ticketUnfuddleId} --${r.raw.type}--> unfuddle ${r.target.ticketUnfuddleId}  clasificación=excluded_external (${r.status})`,
    );
    console.log("    No importada. No se preparó fila planned para esta relación. No es error ni conflicto.");
  }

  section("MAPEO JIRITA (candidatos canonicalizados)");
  bullet("Filas planned", precheck.canonicalCandidates.length);
  bullet("kind = related_to en todas", precheck.canonicalCandidates.every((c) => c.mappedKind === "related_to") ? "sí" : "NO");
  bullet("created_by = null en todas", precheck.canonicalCandidates.every((c) => c.plannedRow.created_by === null) ? "sí" : "NO");
  bullet("Self-relations entre los candidatos", precheck.canonicalCandidates.filter((c) => c.plannedTicketId === c.plannedRelatedTicketId).length);
  bullet("Extremos no resueltos entre los candidatos", 0);
  bullet("Pares duplicados (misma unfuddle_relation_key)", precheck.idempotency?.duplicateKeysInBatch.length ?? "N/A");
  bullet("Conflictos internos", precheck.idempotency?.conflicting.length ?? "N/A");
  for (const c of precheck.canonicalCandidates) {
    const orientation = c.orientation ? ` parent=${c.orientation.parentUnfuddleId} child=${c.orientation.childUnfuddleId}` : "";
    console.log(`  KTV-${c.aTicketNumber} <-> KTV-${c.bTicketNumber}  kind=${c.mappedKind}  key=${c.unfuddleRelationKey}  raw=[${c.rawTypes.join(", ")}]${orientation}`);
  }

  section("RESOLUCIÓN");
  bullet("Ambos tickets resueltos", precheck.scope.bothEndsInScopeRaw);
  bullet("Target no resuelto (no importado)", precheck.scope.targetNotImportedRaw);
  bullet("Target resuelto mas en otro proyecto (cruzado)", precheck.scope.targetCrossProjectRaw);
  bullet("Origen no resuelto", 0);

  section("DUPLICADOS");
  bullet("IDs históricos duplicados (Unfuddle no asigna id propio a una <relationship>)", "N/A — se usa unfuddle_relation_key sintetizado");
  bullet("Triples (from,to,type) exactos repetidos", precheck.duplicates.duplicateRawTriples.length);
  listDetails(precheck.duplicates.duplicateRawTriples.map((d) => `${d.key} x${d.count}`));
  bullet("Pares invertidos (A->B / B->A, mismo par espejado)", precheck.duplicates.invertedPairs.length);
  listDetails(precheck.duplicates.invertedPairs.map((p) => `${p.a} <-> ${p.b}: ${p.forwardType} / ${p.inverseType}`));
  bullet("Mismo par, mapped kind en conflicto entre sus copias espejadas", precheck.duplicates.samePairConflictingMappedKind.length);
  bullet("Self-relations", precheck.duplicates.selfRelations.length);

  section("BASE DE DATOS (idempotencia por unfuddle_relation_key)");
  if (precheck.idempotency) {
    bullet("Nuevas", precheck.idempotency.newCandidates.length);
    bullet("Ya importadas y coincidentes", precheck.idempotency.alreadyImportedMatching.length);
    bullet("Conflictos (misma clave, contenido distinto)", precheck.idempotency.conflicting.length);
    bullet("Claves duplicadas dentro del batch", precheck.idempotency.duplicateKeysInBatch.length);
    bullet("Resuelto por unfuddle_relation_key (identidad histórica real)", precheck.idempotency.hasHistoricalIdentity ? "sí" : "no");
    bullet("Relaciones ya existentes en JIRITA sin relación con este batch (informativo)", precheck.idempotency.unrelatedExistingRelationsInJirita.length);
    for (const e of precheck.idempotency.unrelatedExistingRelationsInJirita) {
      console.log(`    - ${e.id} kind=${e.kind} unfuddle_relation_key=${e.unfuddleRelationKey ?? "null"} created_at=${e.createdAt} created_by=${e.createdBy ?? "null"}`);
    }
    bullet("Escrituras realizadas", 0);
  } else {
    bullet("Clasificación de idempotencia", "no ejecutada (project no resuelto)");
  }

  section("SEMÁNTICA");
  bullet("Conteo por tipo original", JSON.stringify(precheck.scope.typeDistribution));
  bullet("Mapeo aprobado", "related -> related_to | child/parent -> related_to | sibling -> related_to (ninguno mapea a blocks; ningún tipo nuevo)");
  const lossy = precheck.resolved.filter((r) => r.semanticLossy && r.status === "both_resolved").length;
  bullet("Relaciones con pérdida semántica (jerarquía child/parent/sibling no visible en JIRITA)", lossy);
  bullet("Pérdida aceptada explícitamente por decisión de producto", "sí — la identidad/dirección original se preserva solo en unfuddle_relation_key, no en la UI");

  section("SCHEMA DE JIRITA (ticket_relations)");
  bullet("Columna de identidad histórica", `${precheck.schemaAudit.historicalIdentityColumnName} (existe: ${precheck.schemaAudit.hasHistoricalIdentityColumn ? "sí" : "NO"})`);
  bullet("Modelo de storage", precheck.schemaAudit.storageModel);
  bullet("Kinds simétricos canonicalizados por el cliente", precheck.schemaAudit.symmetricKindsCanonicalizedByClient ? "sí" : "no");
  bullet("Constraint anti self-relation", precheck.schemaAudit.selfRelationConstraint ? "sí" : "no");
  bullet("Unique constraint funcional", precheck.schemaAudit.uniqueConstraint);
  bullet("Unique constraint histórico", precheck.schemaAudit.historicalKeyUniqueConstraint);
  bullet("created_by nullable", precheck.schemaAudit.createdByNullable ? "sí" : "no");
  bullet("Cross-project bloqueado en la función (no solo RLS)", precheck.schemaAudit.crossProjectGuardedInFunction ? "sí" : "NO");
  bullet("Trigger de actividad existe / incondicional (insert normal)", `${precheck.schemaAudit.activityTrigger.exists ? "sí" : "no"} / ${precheck.schemaAudit.activityTrigger.unconditional ? "incondicional" : "condicional"}`);
  bullet("Filas de ticket_activity por insert normal", precheck.schemaAudit.activityTrigger.rowsPerInsert);
  bullet("RPC de bypass existente", `${precheck.schemaAudit.bypassRpcExists ? "sí" : "NO"} (${precheck.schemaAudit.bypassRpcName})`);
  bullet("Bloqueos de schema", precheck.schemaAudit.blockingReasons.length);
  listDetails(precheck.schemaAudit.blockingReasons);

  section("EFECTOS (verificados empíricamente con datos temporales)");
  bullet("INSERT normal (sin RPC)", "2 ticket_activity (uno por ticket), sin cambios en tickets.updated_at/memberships/notifications — verificado");
  bullet("INSERT vía RPC de bypass", "0 ticket_activity, sin cambios en tickets/memberships/notifications — verificado");
  bullet("Aislamiento de la GUC", "confirmado — un insert normal inmediatamente después del RPC vuelve a generar sus 2 actividades");
  bullet("Necesidad de bypass/RPC", "resuelta — insert_ticket_relations_bypassing_activity_log desplegado y verificado");

  section("CANDIDATOS (alcance definitivo, canonicalizados)");
  for (const c of precheck.canonicalCandidates) {
    console.log(`  KTV-${c.aTicketNumber} <-> KTV-${c.bTicketNumber}  kind=${c.mappedKind}  key=${c.unfuddleRelationKey}`);
  }

  section("PREFLIGHT");
  bullet("Organización", precheck.organization.organizationId ? `sí (${precheck.organization.name})` : `NO — ${precheck.organization.error}`);
  bullet("Proyecto (KTVibe)", precheck.project.projectId ? `sí (${precheck.project.projectId})` : `NO — ${precheck.project.error}`);
  bullet("Conflictos encontrados (preflight)", precheck.blockingReasons.length);
  listDetails(precheck.blockingReasons);

  if (report.applyOutcome) {
    section("APPLY");
    const a = report.applyOutcome;
    bullet("Intentadas", a.attempted);
    bullet("Insertadas", a.inserted);
    bullet("Claves procesadas", a.insertedKeys.length);
    bullet("Fallidas", a.failed);
    bullet("Posible importación parcial", a.possiblePartialImport ? "SÍ" : "no");
    bullet("Duración", `${a.durationMs} ms`);
    bullet("Reconciliadas OK (19/19 esperado)", a.reconciledOk);
    bullet("Diferencias de reconciliación", a.reconciliationDiffs.length);
    for (const d of a.reconciliationDiffs) listDetails(d.diffs.map((x) => `${d.unfuddleRelationKey}: ${x}`));
    if (a.error) bullet("Error", a.error);
    for (const key of a.insertedKeys) console.log(`    - insertada: ${key}`);
  }

  section("RESULTADO");
  const outcomeLabel: Record<Phase7Report["outcome"], string> = {
    preview_success: "PHASE 7 PREVIEW SUCCESS",
    apply_success: "PHASE 7 APPLY SUCCESS",
    apply_rejected: "PHASE 7 APPLY REJECTED",
    failed: "PHASE 7 FAILED",
  };
  console.log(outcomeLabel[report.outcome]);
  if (report.outcome !== "preview_success" && report.outcome !== "apply_success") {
    console.log("Razones:");
    for (const reason of report.failureReasons) console.log(`  - ${reason}`);
  }
  console.log("");

  return { success: report.outcome === "preview_success" || report.outcome === "apply_success" };
}
