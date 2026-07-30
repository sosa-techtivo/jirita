import type { DuplicateAudit, ResolvedRelation } from "../types/phase7";

/**
 * Audits the raw (pre-canonicalization) resolved relations for self-
 * relations, exact repeats, mirrored inverse pairs, and any pair whose
 * mapped kind disagrees depending on which raw record you read (which would
 * mean the "every relationship is mirrored" assumption canonicalize-relations.ts
 * relies on doesn't hold for that pair — expected to be empty, checked
 * defensively rather than assumed).
 */
export function auditRelationDuplicates(resolved: ResolvedRelation[]): DuplicateAudit {
  const selfRelations = resolved.filter((r) => r.raw.fromTicketUnfuddleId === r.raw.toTicketUnfuddleId).map((r) => r.raw);

  const tripleCounts = new Map<string, number>();
  for (const r of resolved) {
    const key = `${r.raw.fromTicketUnfuddleId}->${r.raw.toTicketUnfuddleId}:${r.raw.type}`;
    tripleCounts.set(key, (tripleCounts.get(key) ?? 0) + 1);
  }
  const duplicateRawTriples = Array.from(tripleCounts.entries())
    .filter(([, count]) => count > 1)
    .map(([key, count]) => ({ key, count }));

  const bothResolved = resolved.filter((r) => r.status === "both_resolved");
  const typeByOrderedPair = new Map<string, string>();
  for (const r of bothResolved) {
    typeByOrderedPair.set(`${r.raw.fromTicketUnfuddleId}-${r.raw.toTicketUnfuddleId}`, r.raw.type);
  }

  const seenUnordered = new Set<string>();
  const invertedPairs: DuplicateAudit["invertedPairs"] = [];
  for (const r of bothResolved) {
    const a = r.raw.fromTicketUnfuddleId;
    const b = r.raw.toTicketUnfuddleId;
    const unorderedKey = [a, b].sort((x, y) => x - y).join("-");
    if (seenUnordered.has(unorderedKey)) continue;
    const inverseType = typeByOrderedPair.get(`${b}-${a}`);
    if (inverseType !== undefined) {
      invertedPairs.push({ a, b, forwardType: r.raw.type, inverseType });
      seenUnordered.add(unorderedKey);
    }
  }

  const kindsByUnorderedPair = new Map<string, Set<string>>();
  for (const r of bothResolved) {
    const key = [r.raw.fromTicketUnfuddleId, r.raw.toTicketUnfuddleId].sort((x, y) => x - y).join("-");
    const set = kindsByUnorderedPair.get(key) ?? new Set<string>();
    set.add(r.mappedKind);
    kindsByUnorderedPair.set(key, set);
  }
  const samePairConflictingMappedKind = Array.from(kindsByUnorderedPair.entries())
    .filter(([, kinds]) => kinds.size > 1)
    .map(([key, kinds]) => {
      const [a, b] = key.split("-").map(Number);
      return { a, b, kinds: Array.from(kinds) };
    });

  return { duplicateRawTriples, invertedPairs, samePairConflictingMappedKind, selfRelations };
}
