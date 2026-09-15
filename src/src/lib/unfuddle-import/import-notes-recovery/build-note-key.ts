/**
 * Deterministic historical-identity key for project_notes.unfuddle_note_key
 * (supabase/migrations/20260930100000_project_notes_historical_import_support.sql).
 *
 * Logical page identity is (notebook_id, page_number) — never the
 * revision-specific <page><id> (each edit receives a new one; confirmed
 * directly against the raw backup.xml, same reasoning
 * build-relation-key.ts already established for ticket_relations).
 */
export function buildNoteHistoricalKey(notebookUnfuddleId: number, pageNumber: number): string {
  return `unfuddle:note:${notebookUnfuddleId}:${pageNumber}`;
}
