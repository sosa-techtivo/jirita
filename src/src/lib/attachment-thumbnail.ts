// Shared by uploadTicketAttachment (lib/tickets.ts) and
// uploadProjectNoteAttachment (lib/notes.ts) — both need the exact same
// "downscale a just-picked image File to a small inline-preview derivative"
// step, so it lives here once instead of being copy-pasted per feature the
// way the rest of this codebase deliberately duplicates near-identical UI
// (see note-attachments.tsx's own header comment) — this one is pure logic
// with zero behavioral drift risk between callers.
//
// Runs entirely client-side (createImageBitmap/canvas, no server round
// trip, no new dependency) — replaces the earlier Supabase Image
// Transformations approach, which turned out to require a project-level
// feature/plan this app can't assume is enabled. A physical, pre-resized
// object in Storage has no such dependency: any project on any plan can
// serve it.

const THUMBNAIL_MAX_WIDTH = 600;

// Only real bitmap formats — an SVG is already a small, resolution-
// independent file, so re-rasterizing it into a capped-width raster would
// be a pure loss (fixed pixel size, larger bytes than the original for most
// icon/diagram SVGs) for no egress benefit.
const THUMBNAIL_SOURCE_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/bmp",
  "image/avif",
]);

export interface GeneratedAttachmentThumbnail {
  blob: Blob;
  /** Reflects the blob's *actual* encoded type (see below) — never assumed. */
  ext: "webp" | "png";
}

// Best-effort by design — every failure path (unsupported source type,
// decode failure, an image already narrower than the cap, a browser with no
// canvas 2D context) returns null rather than throwing, so a caller never
// needs its own try/catch to keep a thumbnail failure from blocking the
// already-succeeded original upload.
export async function generateAttachmentThumbnail(file: File): Promise<GeneratedAttachmentThumbnail | null> {
  if (!THUMBNAIL_SOURCE_MIME_TYPES.has(file.type)) return null;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return null;
  }

  // Already small enough — a second, separately-stored copy would only add
  // Storage/egress overhead for zero size reduction.
  if (bitmap.width <= THUMBNAIL_MAX_WIDTH) {
    bitmap.close();
    return null;
  }

  const targetWidth = THUMBNAIL_MAX_WIDTH;
  const targetHeight = Math.round(bitmap.height * (targetWidth / bitmap.width));

  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return null;
  }
  // Single drawImage into a canvas already sized to the target — this is
  // what preserves aspect ratio (targetHeight was derived from it above)
  // and avoids any crop/stretch.
  ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.82));
  if (!blob) return null;

  // canvas.toBlob silently falls back to PNG when the browser can't encode
  // the requested type — read the blob's own type back rather than assuming
  // "we asked for webp" succeeded, so the stored file's extension always
  // matches its real bytes.
  return { blob, ext: blob.type === "image/webp" ? "webp" : "png" };
}
