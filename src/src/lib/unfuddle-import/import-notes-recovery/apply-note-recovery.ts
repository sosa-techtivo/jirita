import type { SupabaseClient } from "@supabase/supabase-js";
import type { NoteApplyOutcome, NoteInsertPlan } from "../types/notes-recovery";

interface NoteRow {
  id: string;
  project_id: string;
  title: string;
  content: string;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  unfuddle_note_key: string | null;
}

function diffNoteFields(planned: NoteInsertPlan, actual: NoteRow): string[] {
  const diffs: string[] = [];
  if (actual.project_id !== planned.plannedRow.project_id) diffs.push(`project_id: expected ${planned.plannedRow.project_id}, got ${actual.project_id}`);
  if (actual.title !== planned.plannedRow.title) diffs.push("title: does not match planned value");
  if (actual.created_by !== planned.plannedRow.created_by) diffs.push(`created_by: expected ${planned.plannedRow.created_by}, got ${actual.created_by}`);
  if (actual.updated_by !== planned.plannedRow.updated_by) diffs.push(`updated_by: expected ${planned.plannedRow.updated_by}, got ${actual.updated_by}`);
  if (actual.unfuddle_note_key !== planned.plannedRow.unfuddle_note_key) {
    diffs.push(`unfuddle_note_key: expected ${planned.plannedRow.unfuddle_note_key}, got ${actual.unfuddle_note_key}`);
  }
  // content is intentionally never diffed by logging its value — length-only comparison keeps this reconciliation safe to print.
  if (actual.content.length !== planned.plannedRow.content.length) {
    diffs.push(`content length: expected ${planned.plannedRow.content.length}, got ${actual.content.length}`);
  }
  return diffs;
}

/**
 * Inserts every new candidate in ONE call to
 * insert_project_notes_bypassing_activity_log (migration
 * 20260930100000_project_notes_historical_import_support.sql) — a single
 * PostgREST-managed transaction, same rationale as applyRelations.ts: the
 * volume (158) is small and the RPC already processes its whole input array
 * atomically. Never touches anything but project_notes — no projects
 * write, no manual project_note_activity, no attachments/memberships/
 * notifications.
 *
 * Re-reads every inserted row afterward by unfuddle_note_key (never trusts
 * the RPC's own RETURNING alone) — same discipline as every earlier phase's
 * apply function. Never logs/returns a note's `content` value — only its
 * length is compared, matching this task's "never print note bodies" rule
 * even inside reconciliation diffs.
 *
 * NOT executed against production by this task — see runner/
 * notes-recovery-run.ts's --apply gate. Implemented now so the recovery is
 * ready to run in full once the migration above is approved and deployed.
 */
export async function applyNoteRecovery(admin: SupabaseClient, newPlans: NoteInsertPlan[]): Promise<NoteApplyOutcome> {
  const start = Date.now();
  const attempted = newPlans.length;

  const noteRows = newPlans.map((p) => p.plannedRow);
  const { data, error: insertError } = await admin.rpc("insert_project_notes_bypassing_activity_log", { note_rows: noteRows });

  if (insertError) {
    return {
      attempted,
      inserted: 0,
      insertedKeys: [],
      failed: attempted,
      possiblePartialImport: false,
      reconciledOk: 0,
      reconciliationDiffs: [],
      error: insertError.message,
      durationMs: Date.now() - start,
    };
  }

  const insertedRows = (data ?? []) as unknown as NoteRow[];
  const insertedKeys = insertedRows.map((r) => r.unfuddle_note_key).filter((k): k is string => Boolean(k));

  let reconciledOk = 0;
  const reconciliationDiffs: NoteApplyOutcome["reconciliationDiffs"] = [];
  const plannedByKey = new Map(newPlans.map((p) => [p.plannedRow.unfuddle_note_key, p]));

  if (insertedKeys.length > 0) {
    const { data: rereadData, error: rereadError } = await admin
      .from("project_notes")
      .select("id, project_id, title, content, created_by, updated_by, created_at, updated_at, unfuddle_note_key")
      .in("unfuddle_note_key", insertedKeys)
      .returns<NoteRow[]>();

    if (rereadError) {
      return {
        attempted,
        inserted: insertedRows.length,
        insertedKeys,
        failed: attempted - insertedRows.length,
        possiblePartialImport: insertedRows.length > 0 && insertedRows.length < attempted,
        reconciledOk: 0,
        reconciliationDiffs: [],
        error: `Post-insert re-read failed: ${rereadError.message}`,
        durationMs: Date.now() - start,
      };
    }

    const byKey = new Map((rereadData ?? []).map((r) => [r.unfuddle_note_key as string, r]));
    for (const key of insertedKeys) {
      const actual = byKey.get(key);
      const planned = plannedByKey.get(key);
      if (!actual || !planned) {
        reconciliationDiffs.push({ unfuddleNoteKey: key, diffs: ["row not found on re-read"] });
        continue;
      }
      const diffs = diffNoteFields(planned, actual);
      if (diffs.length === 0) reconciledOk++;
      else reconciliationDiffs.push({ unfuddleNoteKey: key, diffs });
    }
  }

  return {
    attempted,
    inserted: insertedRows.length,
    insertedKeys,
    failed: attempted - insertedRows.length,
    possiblePartialImport: insertedRows.length > 0 && insertedRows.length < attempted,
    reconciledOk,
    reconciliationDiffs,
    error: null,
    durationMs: Date.now() - start,
  };
}
