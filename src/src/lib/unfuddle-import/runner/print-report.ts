import { formatBytes } from "../utils/value-parsing";
import type { DryRunReport } from "../types/report";

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

function listDetails(details: string[], limit = 20): void {
  const shown = details.slice(0, limit);
  for (const d of shown) console.log(`    - ${d}`);
  if (details.length > limit) console.log(`    ... and ${details.length - limit} more`);
}

/** Prints the required GENERAL/USUARIOS/ARCHIVOS/RELACIONES/VALIDACIONES/RESULTADO FINAL report and returns the verdict. */
export function printDryRunReport(report: DryRunReport): { success: boolean; reasons: string[] } {
  const { general, users, attachments, relations, duplicates, config } = report;

  section("GENERAL");
  bullet("Backup XML", config.backupXmlPath);
  bullet("Media dir", config.mediaDir);
  bullet("Parse time", `${general.parseElapsedMs} ms`);
  bullet("Proyecto encontrado", general.projectFound ? `sí (${general.projectTitle}, id ${config.targetProjectId})` : `NO (id ${config.targetProjectId})`);
  bullet("Milestone encontrado", general.milestoneFound ? `sí (${general.milestoneTitle}, id ${config.targetMilestoneId})` : `NO (id ${config.targetMilestoneId})`);
  bullet("Tickets encontrados", general.ticketCount);
  bullet("Comentarios", general.commentCount);
  bullet("Time entries", general.timeEntryCount);
  bullet("Adjuntos", general.attachmentCount);
  bullet("Relaciones", general.relationCount);

  section("USUARIOS");
  bullet("Usuarios resueltos", users.resolvedUnfuddleIds.length);
  bullet("Usuarios inexistentes", users.nonexistentUnfuddleIds.length);
  if (users.nonexistentUnfuddleIds.length > 0) {
    console.log(`    ids: ${users.nonexistentUnfuddleIds.join(", ")}`);
  }
  bullet("Usuarios huérfanos (is-removed)", users.orphanedUnfuddleIds.length);
  if (users.orphanedUnfuddleIds.length > 0) {
    console.log(`    ids: ${users.orphanedUnfuddleIds.join(", ")}`);
  }
  bullet("Advertencias", users.warnings.length);
  listDetails(users.warnings);

  section("ARCHIVOS");
  bullet("Adjuntos referenciados", attachments.totalReferenced);
  bullet("Adjuntos encontrados", attachments.foundCount);
  bullet("Adjuntos faltantes", attachments.missingCount);
  listDetails(attachments.missingDetails);
  bullet("Tamaño total (encontrados)", formatBytes(attachments.totalSizeBytes));
  bullet("Archivos en media/ (traversal completo)", attachments.mediaDirFileCount);
  if (attachments.sizeMismatchWarnings.length > 0) {
    bullet("Advertencias de tamaño", attachments.sizeMismatchWarnings.length);
    listDetails(attachments.sizeMismatchWarnings);
  }

  section("RELACIONES");
  bullet("Válidas", relations.validCount);
  bullet("Inválidas", relations.invalidCount);
  listDetails(relations.invalidDetails);
  bullet("Externas al milestone", relations.externalCount);
  listDetails(relations.externalDetails);

  section("VALIDACIONES");
  bullet("Ticket numbers duplicados", duplicates.duplicateTicketNumbers.length);
  listDetails(duplicates.duplicateTicketNumbers.map((f) => `${f.key} (${f.count}x)`));
  bullet("Unfuddle ids duplicados — tickets", duplicates.duplicateTicketUnfuddleIds.length);
  bullet("Unfuddle ids duplicados — comentarios", duplicates.duplicateCommentUnfuddleIds.length);
  bullet("Unfuddle ids duplicados — time entries", duplicates.duplicateTimeEntryUnfuddleIds.length);
  bullet("Unfuddle ids duplicados — adjuntos", duplicates.duplicateAttachmentUnfuddleIds.length);
  bullet("Comentarios inconsistentes (contenido duplicado)", duplicates.duplicateCommentContent.length);
  listDetails(duplicates.duplicateCommentContent.map((f) => `${f.key.slice(0, 80)}... (${f.count}x)`));
  bullet("Time entries inconsistentes (contenido duplicado)", duplicates.duplicateTimeEntryContent.length);
  listDetails(duplicates.duplicateTimeEntryContent.map((f) => `${f.key.slice(0, 80)}... (${f.count}x)`));

  const reasons: string[] = [];
  if (!general.projectFound) reasons.push(`Unfuddle Project ${config.targetProjectId} was not found in the backup.`);
  if (!general.milestoneFound) reasons.push(`Unfuddle Milestone ${config.targetMilestoneId} was not found in the backup.`);
  if (general.ticketCount === 0) reasons.push(`No top-level tickets were found for Milestone ${config.targetMilestoneId}.`);
  if (attachments.missingCount > 0) reasons.push(`${attachments.missingCount} attachment(s) referenced by in-scope data are missing from media/.`);
  if (duplicates.duplicateTicketUnfuddleIds.length > 0) reasons.push(`${duplicates.duplicateTicketUnfuddleIds.length} duplicate ticket unfuddle_id(s).`);
  if (duplicates.duplicateTicketNumbers.length > 0) reasons.push(`${duplicates.duplicateTicketNumbers.length} duplicate ticket number(s).`);
  if (duplicates.duplicateCommentUnfuddleIds.length > 0) reasons.push(`${duplicates.duplicateCommentUnfuddleIds.length} duplicate comment unfuddle_id(s).`);
  if (duplicates.duplicateTimeEntryUnfuddleIds.length > 0) reasons.push(`${duplicates.duplicateTimeEntryUnfuddleIds.length} duplicate time entry unfuddle_id(s).`);
  if (duplicates.duplicateAttachmentUnfuddleIds.length > 0) reasons.push(`${duplicates.duplicateAttachmentUnfuddleIds.length} duplicate attachment unfuddle_id(s).`);
  if (relations.invalidCount > 0) reasons.push(`${relations.invalidCount} invalid relation(s) (self-reference or unrecognized type).`);

  const success = reasons.length === 0;

  section("RESULTADO FINAL");
  if (success) {
    console.log("DRY RUN SUCCESS");
    const warningCount =
      users.nonexistentUnfuddleIds.length +
      users.orphanedUnfuddleIds.length +
      relations.externalCount +
      duplicates.duplicateCommentContent.length +
      duplicates.duplicateTimeEntryContent.length +
      attachments.sizeMismatchWarnings.length;
    if (warningCount > 0) {
      console.log(`(${warningCount} non-blocking warning(s) reported above — see USUARIOS/ARCHIVOS/RELACIONES/VALIDACIONES.)`);
    }
  } else {
    console.log("DRY RUN FAILED");
    console.log("Razones:");
    for (const reason of reasons) console.log(`  - ${reason}`);
  }
  console.log("");

  return { success, reasons };
}
