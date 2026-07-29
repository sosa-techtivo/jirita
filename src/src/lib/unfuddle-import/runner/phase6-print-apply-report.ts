import type { AttachmentApplyOutcome } from "../types/phase6";
import type { AttachmentApplySnapshot } from "../import-attachments/snapshot-before-apply";
import type { PostApplyDbReconciliation, PostApplyStorageReconciliation } from "../import-attachments/reconcile-post-apply";
import type { HashVerificationResult } from "../import-attachments/verify-attachment-hashes";

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

export function printSnapshot(snap: AttachmentApplySnapshot): void {
  section("APPLY: SNAPSHOT PREVIO");
  bullet("ticket_attachments de KTVibe", snap.ticketAttachmentsKTVibe);
  bullet("ticket_attachments global", snap.ticketAttachmentsGlobal);
  bullet("Objetos en Storage bajo los folders afectados", snap.storageObjectsUnderAffectedFolders);
  bullet("ticket_activity attachment_uploaded (KTVibe)", snap.ticketActivityAttachmentUploadedKTVibe);
  bullet("project_memberships global", snap.projectMembershipsGlobal);
  bullet("project_memberships KTVibe", snap.projectMembershipsKTVibe);
  bullet("notifications global", snap.notificationsGlobal);
  bullet("notifications de los tickets afectados", snap.notificationsForAffectedTickets);
  bullet("ticket_comments de KTVibe", snap.ticketCommentsKTVibe);
  bullet("ticket_time_entries de KTVibe", snap.ticketTimeEntriesKTVibe);
  bullet("Tickets afectados con campos capturados", snap.affectedTicketFields.length);
}

export function printApplyOutcome(outcome: AttachmentApplyOutcome): void {
  section("APPLY: EJECUCIÓN");
  bullet("Intentados", outcome.attempted);
  bullet("Subidos a Storage", outcome.uploaded);
  bullet("Insertados en DB", outcome.inserted);
  bullet("Ya importados (saltados)", outcome.skippedAlreadyImported);
  bullet("Fallidos", outcome.failed);
  bullet("Reconciliados OK (por fila, inmediatamente tras insertar)", outcome.reconciledOk);
  bullet("Posible importación parcial", outcome.possiblePartialImport ? "sí" : "no");
  bullet("Objetos huérfanos (subidos, fila no insertada)", outcome.orphanObjects.length);
  for (const o of outcome.orphanObjects) console.log(`    - attachment ${o.attachmentUnfuddleId}: ${o.storagePath}`);
  bullet("Diffs de reconciliación por fila", outcome.reconciliationDiffs.length);
  for (const d of outcome.reconciliationDiffs) console.log(`    - ${d.unfuddleId}: ${d.diffs.join("; ")}`);
  bullet("Batches ejecutados", outcome.batches.length);
  for (const b of outcome.batches) {
    console.log(`    - batch ${b.index}: ids=[${b.attachmentUnfuddleIds.join(",")}] subidos=${b.uploaded} insertados=${b.inserted} reconciliados=${b.reconciled} duración=${b.durationMs}ms errores=${b.errors.length}`);
    for (const e of b.errors) console.log(`        ! ${e}`);
  }
  if (outcome.error) bullet("Error de detención", outcome.error);
}

export function printDbReconciliation(rec: PostApplyDbReconciliation): void {
  section("APPLY: RECONCILIACIÓN — BASE DE DATOS");
  bullet("Filas históricas totales", rec.totalHistoricalRows);
  bullet("unfuddle_id distintos", rec.distinctUnfuddleIds);
  bullet("unfuddle_id fuera del conjunto esperado", rec.unexpectedUnfuddleIds.length);
  bullet("Ticket-level (comment_id=null)", rec.ticketLevelCount);
  bullet("Comment-level (comment_id no null)", rec.commentLevelCount);
  bullet("Tickets distintos con adjunto directo (ticket-level) — la cifra '53'", rec.distinctTicketsWithDirectAttachment);
  bullet("Tickets distintos con cualquier adjunto (directo o vía comentario)", rec.distinctTicketsWithAnyAttachment);
  bullet("Comentarios distintos con adjuntos", rec.distinctCommentsWithAttachments);
  bullet("Filas con ticket_id fuera de KTVibe", rec.ticketsNotInKTVibe.length);
  bullet("Filas con comment_id de ticket incorrecto", rec.commentsBelongingToWrongTicket.length);
  bullet("Drift del ticket #651 intacto (due_date=2026-06-01)", rec.ticket651DueDateStillDrifted ? "sí" : "NO");
  bullet("Filas preexistentes (unfuddle_id=null) sin cambios", rec.preexistingNonHistoricalRowsUnchanged ? "sí" : "NO");
  bullet("OK", rec.ok ? "sí" : "NO");
  for (const i of rec.issues) console.log(`    ! ${i}`);
}

export function printStorageReconciliation(rec: PostApplyStorageReconciliation): void {
  section("APPLY: RECONCILIACIÓN — STORAGE");
  bullet("Paths esperados", rec.expectedPaths);
  bullet("Paths encontrados", rec.foundPaths);
  bullet("Paths distintos", rec.distinctPaths);
  bullet("Paths faltantes", rec.missingPaths.length);
  for (const p of rec.missingPaths) console.log(`    - falta: ${p}`);
  bullet("Objetos inesperados", rec.unexpectedExtraObjects.length);
  for (const p of rec.unexpectedExtraObjects) console.log(`    - inesperado: ${p}`);
  bullet("Diferencias de tamaño remoto", rec.sizeMismatches.length);
  for (const m of rec.sizeMismatches) console.log(`    - attachment ${m.attachmentUnfuddleId}: esperado=${m.expected} remoto=${m.actual}`);
  bullet("OK", rec.ok ? "sí" : "NO");
  for (const i of rec.issues) console.log(`    ! ${i}`);
}

export function printHashVerification(result: HashVerificationResult): void {
  section("APPLY: VERIFICACIÓN DE HASHES");
  console.log(`  ${result.scopeDescription}`);
  for (const c of result.checks) {
    console.log(`    - attachment ${c.attachmentUnfuddleId} (${c.reason}): ${c.match ? "COINCIDE" : "NO COINCIDE"}${c.error ? ` — error: ${c.error}` : ""}`);
  }
  bullet("OK", result.ok ? "sí" : "NO");
}

export function printSideEffects(before: AttachmentApplySnapshot, after: AttachmentApplySnapshot, expectedNewAttachmentsKTVibe: number, expectedNewAttachmentsGlobal: number, expectedNewStorageObjects: number): void {
  section("APPLY: EFECTOS SECUNDARIOS (comparación contra el snapshot)");
  bullet("ticket_attachments KTVibe: antes/después/esperado", `${before.ticketAttachmentsKTVibe} / ${after.ticketAttachmentsKTVibe} / +${expectedNewAttachmentsKTVibe}`);
  bullet("ticket_attachments global: antes/después/esperado", `${before.ticketAttachmentsGlobal} / ${after.ticketAttachmentsGlobal} / +${expectedNewAttachmentsGlobal}`);
  bullet("Objetos Storage bajo folders afectados: antes/después/esperado", `${before.storageObjectsUnderAffectedFolders} / ${after.storageObjectsUnderAffectedFolders} / +${expectedNewStorageObjects}`);
  bullet("ticket_activity attachment_uploaded (KTVibe): antes/después (esperado sin cambio)", `${before.ticketActivityAttachmentUploadedKTVibe} / ${after.ticketActivityAttachmentUploadedKTVibe}`);
  bullet("project_memberships global: antes/después (esperado sin cambio)", `${before.projectMembershipsGlobal} / ${after.projectMembershipsGlobal}`);
  bullet("project_memberships KTVibe: antes/después (esperado sin cambio)", `${before.projectMembershipsKTVibe} / ${after.projectMembershipsKTVibe}`);
  bullet("notifications global: antes/después (esperado sin cambio)", `${before.notificationsGlobal} / ${after.notificationsGlobal}`);
  bullet("notifications tickets afectados: antes/después (esperado sin cambio)", `${before.notificationsForAffectedTickets} / ${after.notificationsForAffectedTickets}`);
  bullet("ticket_comments KTVibe: antes/después (esperado sin cambio)", `${before.ticketCommentsKTVibe} / ${after.ticketCommentsKTVibe}`);
  bullet("ticket_time_entries KTVibe: antes/después (esperado sin cambio)", `${before.ticketTimeEntriesKTVibe} / ${after.ticketTimeEntriesKTVibe}`);

  const beforeByTicket = new Map(before.affectedTicketFields.map((t) => [t.ticketId, t]));
  let ticketsChanged = 0;
  for (const t of after.affectedTicketFields) {
    const b = beforeByTicket.get(t.ticketId);
    if (!b) continue;
    if (b.updatedAt !== t.updatedAt || b.hours !== t.hours) ticketsChanged++;
  }
  bullet("Tickets afectados cuyo updated_at/hours cambió (esperado 0)", ticketsChanged);

  const ok =
    after.ticketAttachmentsKTVibe - before.ticketAttachmentsKTVibe === expectedNewAttachmentsKTVibe &&
    after.ticketAttachmentsGlobal - before.ticketAttachmentsGlobal === expectedNewAttachmentsGlobal &&
    after.storageObjectsUnderAffectedFolders - before.storageObjectsUnderAffectedFolders === expectedNewStorageObjects &&
    after.ticketActivityAttachmentUploadedKTVibe === before.ticketActivityAttachmentUploadedKTVibe &&
    after.projectMembershipsGlobal === before.projectMembershipsGlobal &&
    after.projectMembershipsKTVibe === before.projectMembershipsKTVibe &&
    after.notificationsGlobal === before.notificationsGlobal &&
    after.notificationsForAffectedTickets === before.notificationsForAffectedTickets &&
    after.ticketCommentsKTVibe === before.ticketCommentsKTVibe &&
    after.ticketTimeEntriesKTVibe === before.ticketTimeEntriesKTVibe &&
    ticketsChanged === 0;
  bullet("OK (sin efectos secundarios inesperados)", ok ? "sí" : "NO");
}
