/**
 * Builds the deterministic historical-identity key persisted as
 * ticket_relations.unfuddle_relation_key (supabase/migrations/
 * 20260826000000). Unfuddle assigns no id of its own to a <relationship>
 * element (confirmed against the raw XML), so this key is synthesized
 * instead from the two Unfuddle ticket ids and the *original*
 * (pre-mapping) relation type — preserving the identity/semantics/
 * direction a literal id would have, even though the JIRITA-facing `kind`
 * column collapses everything to 'related_to' (see mapRelationKind in
 * resolve-relation-tickets.ts).
 *
 * - related/sibling/duplicate are symmetric in Unfuddle — A "sibling" B and
 *   B "sibling" A are the same fact — so the key sorts the two ids
 *   (min:max), guaranteeing both of a mirrored pair's raw records produce
 *   the identical key.
 * - child/parent are directional: two views of the same fact, not two
 *   different facts. Confirmed directly against this batch's raw XML —
 *   ticket 17562 (KTV-2493) has 5 "child" records, each naming one of its
 *   own children; each of those 5 children's own record has exactly one
 *   "parent" record pointing back to 17562, never the reverse. So: in a
 *   "child" record, the record's OWN ticket (`fromUnfuddleId`) is the
 *   parent and the target (`toUnfuddleId`) is the child; in a "parent"
 *   record it's the opposite. orientParentChild below resolves both raw
 *   directions of a mirrored pair to the identical (parent, child)
 *   assignment, so both produce the identical key too.
 */
export function buildRelationHistoricalKey(fromUnfuddleId: number, toUnfuddleId: number, rawType: string): string {
  switch (rawType) {
    case "child":
      return `unfuddle:parent_child:${fromUnfuddleId}:${toUnfuddleId}`;
    case "parent":
      return `unfuddle:parent_child:${toUnfuddleId}:${fromUnfuddleId}`;
    case "sibling":
      return `unfuddle:sibling:${symmetricPair(fromUnfuddleId, toUnfuddleId)}`;
    case "duplicate":
      return `unfuddle:duplicate:${symmetricPair(fromUnfuddleId, toUnfuddleId)}`;
    case "related":
    default:
      return `unfuddle:related:${symmetricPair(fromUnfuddleId, toUnfuddleId)}`;
  }
}

function symmetricPair(a: number, b: number): string {
  const [min, max] = a <= b ? [a, b] : [b, a];
  return `${min}:${max}`;
}

/** parent/child orientation for a raw "child" or "parent" record — see the module comment above for the evidence this is based on. Returns null for any other type (nothing to orient). */
export function orientParentChild(fromUnfuddleId: number, toUnfuddleId: number, rawType: string): { parentUnfuddleId: number; childUnfuddleId: number } | null {
  if (rawType === "child") return { parentUnfuddleId: fromUnfuddleId, childUnfuddleId: toUnfuddleId };
  if (rawType === "parent") return { parentUnfuddleId: toUnfuddleId, childUnfuddleId: fromUnfuddleId };
  return null;
}
