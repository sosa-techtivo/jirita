// Supabase Storage's remove() reports an RLS-filtered (or already-missing)
// object as a normal success — no error, just absent from the returned
// list of objects it actually deleted. Checking only `error` is what let
// ticket_attachments_storage_delete's broken policy (fixed in
// 20260930110000) silently leak every deleted attachment's files. This
// compares what was requested against what remove() really deleted.

/** Requested paths, deduplicated — a backfilled "self-thumbnail" row has
 *  thumbnail_path === storage_path, which must count as one object, not two. */
export function attachmentPathsToRemove(storagePath: string, thumbnailPath: string | null): string[] {
  return thumbnailPath && thumbnailPath !== storagePath ? [storagePath, thumbnailPath] : [storagePath];
}

/** Every requested path remove() did not report as deleted. Empty means
 *  the cleanup fully succeeded. */
export function findUnremovedPaths(
  requestedPaths: string[],
  removed: ReadonlyArray<{ name: string }> | null | undefined
): string[] {
  const removedNames = new Set((removed ?? []).map((object) => object.name));
  return Array.from(new Set(requestedPaths)).filter((path) => !removedNames.has(path));
}
