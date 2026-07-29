import type { SupabaseClient } from "@supabase/supabase-js";
import type { TicketParentResolutionResult } from "../types/phase4";

/**
 * Resolves every comment's `parent-id` (an Unfuddle ticket id) against the
 * 170 already-imported tickets, via `tickets.unfuddle_id` and
 * `project_id = KTVibe` only — identity and project membership, nothing
 * else. A ticket that was legitimately edited since Phase 3 (a real,
 * authenticated user changing its `due_date`/`status`/`assignee`/etc. from
 * the live app — see ticket #651/unfuddle_id 11697) still resolves here
 * exactly like any other: this function never reads or compares any field
 * besides `id`/`unfuddle_id`, so it has nothing to say about drift on
 * those other columns. Phase 3's own stricter reconciliation (which does
 * compare those fields, and correctly still flags that ticket) is a
 * separate concern and is deliberately not re-run or weakened here.
 *
 * A comment whose parent isn't among the imported tickets is still a hard
 * precondition failure (task's explicit "si falta cualquier ticket padre,
 * detener APPLY"), and a duplicate `unfuddle_id` among the fetched tickets
 * — which `tickets.unfuddle_id`'s own unique constraint should make
 * impossible, but is checked defensively rather than assumed — is treated
 * as an ambiguous parent, not silently resolved to whichever row happened
 * to be seen last.
 */
export async function resolveCommentParents(
  admin: SupabaseClient,
  projectId: string,
  referencedTicketUnfuddleIds: number[],
): Promise<TicketParentResolutionResult> {
  const { data, error } = await admin.from("tickets").select("id, unfuddle_id").eq("project_id", projectId);

  if (error) {
    return { map: new Map(), missingParents: referencedTicketUnfuddleIds, totalTicketsInProject: 0, ok: false };
  }

  const byUnfuddleId = new Map<number, string>();
  const ambiguous = new Set<number>();
  for (const row of data ?? []) {
    if (row.unfuddle_id === null) continue;
    const n = Number(row.unfuddle_id);
    if (Number.isNaN(n)) continue;
    if (byUnfuddleId.has(n)) ambiguous.add(n);
    else byUnfuddleId.set(n, row.id);
  }

  const map = new Map<number, string>();
  const missingParents: number[] = [];
  for (const ticketUnfuddleId of referencedTicketUnfuddleIds) {
    const ticketId = byUnfuddleId.get(ticketUnfuddleId);
    if (ticketId && !ambiguous.has(ticketUnfuddleId)) map.set(ticketUnfuddleId, ticketId);
    else missingParents.push(ticketUnfuddleId);
  }

  return { map, missingParents, totalTicketsInProject: data?.length ?? 0, ok: missingParents.length === 0 };
}
