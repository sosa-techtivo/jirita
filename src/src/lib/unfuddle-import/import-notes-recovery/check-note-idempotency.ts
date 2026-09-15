import type { SupabaseClient } from "@supabase/supabase-js";
import type { ExistingJiritaNote, NoteIdempotencyClassification, NoteInsertPlan } from "../types/notes-recovery";

interface NoteRow {
  id: string;
  project_id: string;
  title: string;
  unfuddle_note_key: string | null;
  created_at: string;
  created_by: string | null;
  updated_by: string | null;
}

/**
 * Real historical idempotency by project_notes.unfuddle_note_key — same
 * pattern as check-relation-idempotency.ts. Never uses title/content
 * matching for idempotency (task's explicit instruction): a plan whose key
 * has no match in `project_notes` is always "new", regardless of whether
 * some existing row happens to share its title.
 *
 * Scoped to the approved destination projects (`projectIds`, the 6
 * allowlisted UUIDs) — this is where every existing native note (e.g.
 * KTVibe's "Siteground Staging") lives, and where the idempotency check
 * must confirm none of them are matched/altered by this classification.
 *
 * A key match whose existing row sits in a DIFFERENT project than the
 * plan's own destination is a real conflict, never treated as "already
 * imported" — this is exactly the failure mode the first (KTVibe-only)
 * recovery produced, and it must never be silently accepted again.
 */
export async function checkNoteIdempotency(
  admin: SupabaseClient,
  projectIds: string[],
  plans: NoteInsertPlan[],
): Promise<NoteIdempotencyClassification> {
  const { data, error } = await admin
    .from("project_notes")
    .select("id, project_id, title, unfuddle_note_key, created_at, created_by, updated_by")
    .in("project_id", projectIds)
    .returns<NoteRow[]>();

  if (error) {
    throw new Error(`project_notes idempotency lookup failed: ${error.message}`);
  }

  const existing: ExistingJiritaNote[] = (data ?? []).map((r) => ({
    id: r.id,
    projectId: r.project_id,
    title: r.title,
    unfuddleNoteKey: r.unfuddle_note_key,
    createdAt: r.created_at,
    createdBy: r.created_by,
    updatedBy: r.updated_by,
  }));

  const byHistoricalKey = new Map<string, ExistingJiritaNote>();
  for (const e of existing) {
    if (e.unfuddleNoteKey) byHistoricalKey.set(e.unfuddleNoteKey, e);
  }

  // Defensive — group-logical-pages.ts already guarantees one candidate per
  // (notebook_id, page_number), so this should always be empty.
  const seenKeysInBatch = new Set<string>();
  const duplicateKeysInBatch: string[] = [];
  for (const p of plans) {
    const key = p.plannedRow.unfuddle_note_key;
    if (seenKeysInBatch.has(key)) duplicateKeysInBatch.push(key);
    seenKeysInBatch.add(key);
  }

  const newPlans: NoteInsertPlan[] = [];
  const alreadyImportedMatching: NoteIdempotencyClassification["alreadyImportedMatching"] = [];
  const conflicting: NoteIdempotencyClassification["conflicting"] = [];
  const matchedExistingIds = new Set<string>();

  for (const p of plans) {
    const match = byHistoricalKey.get(p.plannedRow.unfuddle_note_key);
    if (!match) {
      newPlans.push(p);
      continue;
    }
    matchedExistingIds.add(match.id);
    const diffs: string[] = [];
    if (match.projectId !== p.plannedRow.project_id) {
      diffs.push(`project_id: expected ${p.plannedRow.project_id}, got ${match.projectId} — same historical key resolved to a DIFFERENT destination project`);
    }
    if (match.title !== p.plannedRow.title) diffs.push(`title: expected "${p.plannedRow.title}", got "${match.title}"`);
    if ((match.createdBy ?? null) !== (p.plannedRow.created_by ?? null)) {
      diffs.push(`created_by: expected ${p.plannedRow.created_by ?? "null"}, got ${match.createdBy ?? "null"}`);
    }
    if (diffs.length > 0) conflicting.push({ plan: p, existing: match, diffs });
    else alreadyImportedMatching.push({ plan: p, existing: match });
  }

  // Every project_notes row (within the 6 approved destinations) with no
  // historical key at all — native notes like KTVibe's "Siteground
  // Staging" live here and must never be matched/altered by this
  // classification.
  const existingNativeNotes = existing.filter((e) => !e.unfuddleNoteKey);

  return { newPlans, alreadyImportedMatching, conflicting, duplicateKeysInBatch, existingNativeNotes };
}
