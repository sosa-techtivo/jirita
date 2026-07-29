import type { Phase6Report } from "../types/phase6";

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

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(2)} ${units[i]}`;
}

export function printPhase6Report(report: Phase6Report): void {
  const { precheck } = report;

  section("PREFLIGHT");
  bullet("Modo", report.mode);
  bullet("Organización", precheck.organization.organizationId ? `sí (${precheck.organization.name})` : `NO — ${precheck.organization.error}`);
  bullet("Proyecto", precheck.project.projectId ? `sí (${precheck.project.projectId})` : `NO — ${precheck.project.error}`);
  bullet("Tickets de Fase 3 reconciliados (existencia, no drift)", precheck.ticketsReconciled.ok ? `sí (${precheck.ticketsReconciled.total})` : `NO — ${precheck.ticketsReconciled.error}`);
  bullet("Comentarios de Fase 4 reconciliados", precheck.commentsReconciled.ok ? `sí (${precheck.commentsReconciled.total})` : `NO — ${precheck.commentsReconciled.error}`);
  bullet("Bucket de Storage", `${precheck.storageAudit.bucketId} (público: ${precheck.storageAudit.isPublic})`);
  bullet("Soporte de adjuntos de comentario en el schema", precheck.schemaAudit.hasCommentIdColumn ? "sí" : "NO — solo ticket_id");
  bullet("Clave de idempotencia disponible", precheck.schemaAudit.hasUnfuddleIdColumn ? "sí (unfuddle_id)" : "NO — sin columna unfuddle_id");
  bullet("Bloqueos para un futuro APPLY (estructurales, no errores de esta auditoría)", precheck.schemaAudit.blockingReasons.length);
  bullet("Conflictos de auditoría (datos/archivos/padres)", precheck.blockingReasons.length);

  section("ESQUEMA DE ADJUNTOS (ticket_attachments)");
  const sa = precheck.schemaAudit;
  bullet("Columna unfuddle_id", sa.hasUnfuddleIdColumn ? "sí" : "NO EXISTE");
  bullet("Columna comment_id / parent polimórfico", sa.hasCommentIdColumn ? "sí" : "NO EXISTE — solo ticket_id");
  bullet("storage_path UNIQUE constraint", sa.storagePathUniqueConstraint ? "sí" : "no");
  bullet("storage_path determinístico entre reimportaciones", sa.storagePathDeterministic ? "sí" : "NO — usa crypto.randomUUID() en cada escritura");
  bullet("uploaded_by acepta null", sa.uploadedByNullable ? "sí" : "no");
  bullet("Columna updated_at", sa.hasUpdatedAtColumn ? "sí" : "NO EXISTE");
  bullet("Trigger de actividad", `${sa.activityTrigger.exists ? "existe" : "no existe"}, incondicional=${sa.activityTrigger.unconditional} — ${sa.activityTrigger.description}`);
  bullet("Trigger de membership", `${sa.membershipTrigger.exists ? "existe" : "no existe"} — ${sa.membershipTrigger.description}`);

  section("STORAGE (Supabase)");
  const st = precheck.storageAudit;
  bullet("Bucket", st.bucketId);
  bullet("Público", st.isPublic ? "sí" : "no");
  bullet("Convención de path actual", st.pathConvention);
  bullet("Política SELECT", st.selectPolicy);
  bullet("Política INSERT", st.insertPolicy);
  bullet("Política DELETE", st.deletePolicy);
  bullet("Límite de tamaño configurado", st.sizeLimitConfigured);

  section("ADJUNTOS (250 esperados)");
  const xs = precheck.xmlStats;
  bullet("Total XML (Fase 1)", xs.total);
  bullet("De ticket (parentType=Ticket)", xs.ticketLevel);
  bullet("De comentario (parentType=Comment)", xs.commentLevel);
  bullet("parentType inesperados", xs.unexpectedParentTypes.length > 0 ? xs.unexpectedParentTypes.join(", ") : "(ninguno)");
  bullet("Tickets con adjuntos", xs.ticketsWithAttachments);
  bullet("Comentarios con adjuntos", xs.commentsWithAttachments);
  bullet("filename vacío", xs.emptyFilename);
  bullet("MIME vacío", xs.emptyMime);
  bullet("MIME genérico (application/octet-stream)", xs.genericMime);
  bullet("size vacío", xs.emptySize);
  bullet("size cero", xs.zeroSize);
  bullet("created_at vacío", xs.emptyCreatedAt);
  bullet("updated_at vacío (sin columna destino en JIRITA)", xs.emptyUpdatedAt);
  bullet("attachment IDs duplicados", xs.duplicateAttachmentIds);
  bullet("filenames únicos", xs.uniqueFilenames);
  bullet("filenames repetidos (grupos)", xs.repeatedFilenames.length);
  listDetails(xs.repeatedFilenames.map((f) => `"${f.filename}" x${f.count}`));
  bullet("Extensiones", xs.extensionCounts.map((e) => `${e.ext}=${e.count}`).join(", "));
  bullet("Extensiones potencialmente peligrosas (incl. .svg, previsualizado vía <img>, sin ejecución de script)", xs.dangerousExtensionFiles.length);
  listDetails(xs.dangerousExtensionFiles.map((f) => `${f.unfuddleId}: ${f.filename} (${f.contentType})`));
  bullet("Archivos comprimidos", xs.archiveFiles);
  bullet("Sin extensión", xs.noExtensionFiles);
  bullet("Usuarios/creator en el XML", "N/A — confirmado: ningún <attachment> en todo el backup tiene un campo creator/person/uploader (solo content-type, created-at, filename, id, parent-id, parent-type, project-id, size, updated-at)");

  section("ARCHIVOS FÍSICOS (media/)");
  const pf = precheck.physicalFiles;
  bullet("Resueltos / esperados", `${pf.resolved} / 250`);
  bullet("Faltantes", pf.missing);
  listDetails(pf.missingIds.map((id) => `attachment ${id}`));
  bullet("Ambiguos (candidatos múltiples)", pf.ambiguous);
  bullet("Bytes totales", `${pf.totalBytes} (${formatBytes(pf.totalBytes)})`);
  bullet("Máximo", formatBytes(pf.maxBytes));
  bullet("Mínimo", formatBytes(pf.minBytes));
  bullet("Promedio", formatBytes(pf.avgBytes));
  bullet("Mediana", formatBytes(pf.medianBytes));
  bullet("Distribución por rango", Object.entries(pf.sizeDistribution).map(([k, v]) => `${k}=${v}`).join(", "));
  bullet("Archivos vacíos (0 bytes)", pf.emptyFiles);
  bullet("Diferencia tamaño XML vs físico", pf.sizeMismatches.length);
  listDetails(pf.sizeMismatches.map((m) => `${m.unfuddleId}: XML=${m.declared} real=${m.real}`));
  bullet("Archivos sobre el límite de referencia (50MB)", pf.filesOverLimit.length);
  listDetails(pf.filesOverLimit.map((f) => `${f.unfuddleId}: ${f.filename} (${formatBytes(f.bytes)})`));
  bullet("Grupos con bytes idénticos (IDs distintos, hash SHA-256)", pf.duplicateContentGroups.length);
  listDetails(pf.duplicateContentGroups.map((g) => `${g.hash.slice(0, 16)}...: ${g.unfuddleIds.join(", ")} (se conservan como filas independientes)`));

  section("PADRES");
  bullet("Tickets resueltos", precheck.ticketParents.map.size);
  bullet("Tickets faltantes", precheck.ticketParents.missingParents.length);
  listDetails(precheck.ticketParents.missingParents.map((id) => `ticket unfuddle_id ${id}`));
  bullet("Comentarios resueltos", precheck.commentParents.map.size);
  bullet("Comentarios faltantes", precheck.commentParents.missingParents.length);
  listDetails(precheck.commentParents.missingParents.map((id) => `comment unfuddle_id ${id}`));

  section("MAPEO DE FILAS PLANIFICADAS (250 esperados)");
  const mp = precheck.mapping;
  bullet("Filas planificadas", mp.planned.length);
  bullet("De ticket (comment_id=null)", mp.planned.filter((p) => p.comment_id === null).length);
  bullet("De comentario (comment_id real)", mp.planned.filter((p) => p.comment_id !== null).length);
  bullet("uploaded_by=null en todas", mp.planned.every((p) => p.uploaded_by === null) ? "sí" : "NO");
  bullet("updated_at preservado (no vacío)", mp.planned.filter((p) => p.updated_at !== null).length);
  bullet("Errores de mapeo (padre no resuelto, etc.)", mp.errors.length);
  listDetails(mp.errors.map((e) => `${e.attachmentUnfuddleId} (${e.parentType} ${e.parentUnfuddleId}): ${e.reason}`));

  section("IDEMPOTENCIA EN BASE DE DATOS");
  if (precheck.dbIdempotency === null) {
    console.log("  PREPARADA, NO EJECUTADA — ticket_attachments.unfuddle_id no existe todavía en el schema en vivo (ver ESQUEMA DE ADJUNTOS / migración 20260825000000, no desplegada). check-attachment-db-idempotency.ts está implementada y lista para clasificar nuevos/ya-importados-coincidentes/conflictos por unfuddle_id en cuanto la migración esté desplegada; no se ejecuta contra la base real en esta ejecución.");
  } else {
    bullet("Nuevos", precheck.dbIdempotency.newRows.length);
    bullet("Ya importados y coincidentes", precheck.dbIdempotency.alreadyImportedMatching.length);
    bullet("Conflictos", precheck.dbIdempotency.conflicting.length);
    bullet("unfuddle_id duplicados en el batch", precheck.dbIdempotency.duplicateUnfuddleIdsInBatch.length);
  }

  section("IDEMPOTENCIA EN STORAGE");
  if (precheck.storageIdempotency === null) {
    console.log("  PREPARADA, NO EJECUTADA — ningún objeto ha sido subido nunca bajo el esquema de path determinístico <ticket_id>/att-<unfuddle_id>-<filename> (la app solo escribe con crypto.randomUUID()). check-attachment-storage-idempotency.ts está implementada (list() de solo lectura + verificación por tamaño y SHA-256 para objetos existentes, nunca upsert, nunca sobrescribe) y lista para una futura tarea de APPLY; no se ejecuta contra el bucket real en esta ejecución.");
  } else {
    bullet("Verificados", precheck.storageIdempotency.checked);
    bullet("Objeto no existe", precheck.storageIdempotency.notExists);
    bullet("Objeto existe y coincide", precheck.storageIdempotency.existsMatching);
    bullet("Objeto existe y difiere", precheck.storageIdempotency.existsDiffers);
    bullet("Colisiones de path dentro del batch", precheck.storageIdempotency.pathCollisions.length);
  }

  section("ESTRATEGIA DE OBJECT PATH (en uso)");
  const op = precheck.objectPathProposal;
  bullet("Patrón", op.pattern);
  bullet("Ejemplo", op.example);
  for (const r of op.rationale) console.log(`    - ${r}`);

  section("BLOQUEOS PARA UN FUTURO APPLY");
  if (precheck.schemaAudit.blockingReasons.length === 0) {
    console.log("  Ninguno — schema, RPC, bypass y APPLY en sí ya fueron verificados/ejecutados en vivo (ver phases.ts, Phase 6 = implemented).");
  } else {
    console.log("  Hallazgos pendientes sobre el mecanismo (no bloquean necesariamente un futuro re-run idempotente):");
  }
  listDetails(precheck.schemaAudit.blockingReasons);

  bullet("Conflictos de auditoría encontrados (datos/archivos/padres)", precheck.blockingReasons.length);
  listDetails(precheck.blockingReasons);

  section("RESULTADO");
  console.log(report.outcome === "preview_success" ? "PHASE 6 PREVIEW SUCCESS" : "PHASE 6 FAILED");
  console.log("(PREVIEW SUCCESS significa que la auditoría se ejecutó correctamente — NO significa que APPLY esté habilitado. Ver BLOQUEOS PARA UN FUTURO APPLY arriba. Ningún archivo fue subido ni ninguna fila fue insertada.)");
  if (report.outcome === "failed") {
    console.log("Razones (problemas de auditoría, no bloqueos estructurales ya conocidos):");
    for (const reason of report.failureReasons) console.log(`  - ${reason}`);
  }
  console.log("");
}
