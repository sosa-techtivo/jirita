import type { Phase2Report } from "../types/phase2";

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

export function printPhase2Report(report: Phase2Report): void {
  const { precheck } = report;

  section("PREFLIGHT");
  bullet("Modo", report.mode);
  bullet(
    "Organización encontrada",
    precheck.organization.organizationId
      ? `sí (${precheck.organization.name}, slug "${precheck.organization.slug}")`
      : `NO (slug "${precheck.organization.slug}")`,
  );
  if (precheck.organization.error) bullet("  error", precheck.organization.error);

  bullet(
    "Proyecto existente (unfuddle_id)",
    precheck.project.existingByUnfuddleId ? `sí (id ${precheck.project.existingByUnfuddleId.id})` : "no",
  );
  bullet("Conflictos de slug", precheck.project.slugConflicts.length);
  listDetails(precheck.project.slugConflicts.map((c) => `project ${c.id} (unfuddle_id=${c.unfuddleId ?? "null"}) already uses slug "${c.slug}"`));
  bullet("Conflictos de project_code", precheck.project.projectCodeConflicts.length);
  listDetails(
    precheck.project.projectCodeConflicts.map((c) => `project ${c.id} (unfuddle_id=${c.unfuddleId ?? "null"}) already uses project_code "${c.projectCode}"`),
  );

  bullet("Usuarios resueltos", `${precheck.users.entries.filter((e) => e.status === "resolved").length}/${precheck.users.entries.length}`);
  for (const entry of precheck.users.entries) {
    console.log(`    - [${entry.status}] unfuddle ${entry.unfuddleId} ${entry.fullName || "(?)"} <${entry.email || "?"}>${entry.detail ? " — " + entry.detail : ""}`);
  }
  bullet("Referencias huérfanas conocidas (nunca se resuelven)", precheck.users.orphanUnfuddleIds.join(", "));

  bullet("Conflictos encontrados", precheck.blockingReasons.length);
  listDetails(precheck.blockingReasons);

  section("PROJECT");
  if (report.plannedFields) {
    console.log("  Configuración final utilizada (payload explícito del INSERT):");
    for (const [k, v] of Object.entries(report.plannedFields)) {
      console.log(`    ${k}: ${JSON.stringify(v)}`);
    }
    console.log("  Columnas dejadas en su default de esquema (no incluidas en el INSERT):");
    for (const [k, v] of Object.entries(report.schemaDefaultsApplied)) {
      console.log(`    ${k}: ${v}`);
    }
  } else {
    console.log("  (no se construyó una fila planeada — ver PREFLIGHT para la razón)");
  }

  if (report.alreadyImportedDiffs !== null) {
    bullet("Comparación contra proyecto ya existente", report.alreadyImportedDiffs.length === 0 ? "coincide en todos los campos" : `${report.alreadyImportedDiffs.length} diferencia(s)`);
    listDetails(report.alreadyImportedDiffs);
  }

  if (report.insertedRow) {
    console.log("  Fila insertada (releída desde Supabase):");
    for (const [k, v] of Object.entries(report.insertedRow)) {
      console.log(`    ${k}: ${JSON.stringify(v)}`);
    }
  }

  if (report.sideEffects) {
    bullet("Efectos secundarios detectados (project_memberships creados)", report.sideEffects.projectMembershipsCreated);
  }

  if (report.reconciliation) {
    bullet("Resultado de la reconciliación", report.reconciliation.ok ? "OK — todos los campos coinciden" : `FALLÓ — ${report.reconciliation.diffs.length} diferencia(s)`);
    listDetails(report.reconciliation.diffs);
  }

  section("RESULTADO");
  const outcomeLabel: Record<Phase2Report["outcome"], string> = {
    preview_success: "PHASE 2 PREVIEW SUCCESS",
    apply_success: "PHASE 2 APPLY SUCCESS",
    already_imported: `PHASE 2 ${report.mode} SUCCESS (PROJECT ALREADY IMPORTED)`,
    failed: "PHASE 2 FAILED",
  };
  console.log(outcomeLabel[report.outcome]);
  if (report.outcome === "already_imported") {
    console.log("PROJECT ALREADY IMPORTED");
  }
  if (report.outcome === "failed") {
    console.log("Razones:");
    for (const reason of report.failureReasons) console.log(`  - ${reason}`);
  }
  console.log("");
}
