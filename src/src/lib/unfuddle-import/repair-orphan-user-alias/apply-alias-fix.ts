import type { SupabaseClient } from "@supabase/supabase-js";
import type { AliasReference } from "./classify-alias-references";

const TABLE_BY_KIND: Record<AliasReference["kind"], { table: string; column: string }> = {
  comment_author: { table: "ticket_comments", column: "author_profile_id" },
  ticket_assignee: { table: "tickets", column: "assignee_profile_id" },
  ticket_reporter: { table: "tickets", column: "created_by" },
  time_entry_logger: { table: "ticket_time_entries", column: "logged_by" },
};

export interface AliasFixResult {
  kind: AliasReference["kind"];
  ticketKey: string | null;
  liveRowId: string;
  ok: boolean;
  rowsUpdated: number;
  error: string | null;
}

/**
 * Applies exactly the references a fresh classifyAliasReferences() call
 * just found still null — never a stale PREVIEW. `.eq(column, null)` is
 * the idempotency/race guard: a row already fixed (by an earlier run, or
 * by anything else in between) is never touched twice or overwritten.
 */
export async function applyAliasFixes(admin: SupabaseClient, references: AliasReference[]): Promise<AliasFixResult[]> {
  const results: AliasFixResult[] = [];

  for (const ref of references) {
    const { table, column } = TABLE_BY_KIND[ref.kind];
    const { data, error } = await admin
      .from(table)
      .update({ [column]: ref.plannedValue })
      .eq("id", ref.liveRowId)
      .is(column, null)
      .select("id");

    if (error) {
      results.push({ kind: ref.kind, ticketKey: ref.ticketKey, liveRowId: ref.liveRowId, ok: false, rowsUpdated: 0, error: error.message });
      continue;
    }

    const rowsUpdated = data?.length ?? 0;
    results.push({
      kind: ref.kind,
      ticketKey: ref.ticketKey,
      liveRowId: ref.liveRowId,
      ok: rowsUpdated === 1,
      rowsUpdated,
      error: rowsUpdated === 1 ? null : `Expected to update 1 row, updated ${rowsUpdated} — value likely changed since PREVIEW; re-run PREVIEW.`,
    });
  }

  return results;
}
