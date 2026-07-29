import type { ExistingProjectRow, PlannedProjectFields, ReconciliationResult } from "../types/phase2";

/**
 * Compares the fields this importer owns/controls against an existing row.
 * Used two ways: (a) idempotent replay — an already-imported project must
 * match on every one of these, or the run stops rather than silently
 * updating it (spec §10 policy, extended to Phase 2's own writes); (b)
 * post-insert reconciliation in APPLY mode, re-reading the row Postgres
 * actually stored rather than trusting the insert payload.
 */
export function diffProjectFields(planned: PlannedProjectFields, actual: ExistingProjectRow): string[] {
  const diffs: string[] = [];

  const compare = (label: string, expected: unknown, got: unknown) => {
    if (expected !== got) diffs.push(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(got)}`);
  };

  compare("organization_id", planned.organization_id, actual.organizationId);
  compare("slug", planned.slug, actual.slug);
  compare("name", planned.name, actual.name);
  compare("project_code", planned.project_code, actual.projectCode);
  compare("description", planned.description, actual.description);
  compare("status", planned.status, actual.status);
  compare("unfuddle_id", planned.unfuddle_id, actual.unfuddleId);
  compare("created_by", planned.created_by, actual.createdBy);
  compare("owner_profile_id", planned.owner_profile_id, actual.ownerProfileId);

  return diffs;
}

export function reconcileInsertedRow(
  planned: PlannedProjectFields,
  inserted: ExistingProjectRow,
  expectedDefaults: { health: string; category: string },
): ReconciliationResult {
  const diffs = diffProjectFields(planned, inserted);

  if (inserted.health !== expectedDefaults.health) {
    diffs.push(`health: expected schema default "${expectedDefaults.health}", got "${inserted.health}"`);
  }
  if (inserted.category !== expectedDefaults.category) {
    diffs.push(`category: expected schema default "${expectedDefaults.category}", got "${inserted.category}"`);
  }
  if (!inserted.unfuddleImportedAt || Math.abs(new Date(inserted.unfuddleImportedAt).getTime() - new Date(planned.unfuddle_imported_at).getTime()) > 1000) {
    diffs.push(`unfuddle_imported_at: expected ~${planned.unfuddle_imported_at}, got ${inserted.unfuddleImportedAt}`);
  }

  return { ok: diffs.length === 0, diffs };
}
