// Node-side equivalent of src/lib/attachment-thumbnail.ts's
// generateAttachmentThumbnail — same target (max ~600px wide, aspect ratio
// preserved, WebP ~0.82 quality, skip if already <=600px) but this backfill
// runs as a CLI, not in a browser, so createImageBitmap/canvas (both
// DOM-only) aren't available. `sharp` does the decode/resize/encode here
// instead; it was already resolving in node_modules as an optional
// dependency of `next` (used by next/image when present), so this makes an
// existing, already-working capability an explicit dependency rather than
// introducing a new one.
//
// Deliberately NOT shared with attachment-thumbnail.ts — that module is
// imported by browser components and must stay free of Node-only imports
// (sharp is a native addon, has no browser build). Kept in lockstep by
// convention (same 600px cap, same WebP quality), not by shared code.

import sharp from "sharp";

const THUMBNAIL_MAX_WIDTH = 600;
const THUMBNAIL_WEBP_QUALITY = 82;

// Same raster allowlist as attachment-thumbnail.ts's
// THUMBNAIL_SOURCE_MIME_TYPES, expressed as extensions (historical rows are
// gated by filename extension here, not File.type — there's no File object,
// just a stored filename). SVG is deliberately excluded, same reasoning:
// already a small, resolution-independent file, re-rasterizing it is a
// pure loss.
const RASTER_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "avif"]);

export function isRasterExtension(ext: string): boolean {
  return RASTER_EXTENSIONS.has(ext.toLowerCase());
}

export interface NodeGeneratedThumbnail {
  buffer: Buffer;
  ext: "webp";
  width: number;
  height: number;
}

export type ThumbnailGenerationOutcome =
  | { kind: "generated"; thumbnail: NodeGeneratedThumbnail }
  | { kind: "skipped-too-small"; width: number; height: number }
  | { kind: "error"; message: string };

// Assumes the caller already gated on isRasterExtension — this only decides
// generated vs. skipped-too-small vs. error, it doesn't re-check the
// extension allowlist.
export async function generateThumbnailFromBuffer(original: Buffer): Promise<ThumbnailGenerationOutcome> {
  let width: number | undefined;
  let height: number | undefined;
  try {
    const metadata = await sharp(original).metadata();
    width = metadata.width;
    height = metadata.height;
  } catch (err) {
    return { kind: "error", message: err instanceof Error ? err.message : String(err) };
  }
  if (!width || !height) {
    return { kind: "error", message: "Could not read image dimensions (missing width/height in metadata)." };
  }

  // Already small enough — matches attachment-thumbnail.ts's own guard:
  // a second, separately-stored copy would only add Storage/egress
  // overhead for zero size reduction. thumbnail_path stays NULL for this
  // row; no file is written.
  if (width <= THUMBNAIL_MAX_WIDTH) {
    return { kind: "skipped-too-small", width, height };
  }

  try {
    // Width only (no height) — sharp derives height from the source aspect
    // ratio automatically, so this can never crop or stretch.
    const buffer = await sharp(original)
      .resize({ width: THUMBNAIL_MAX_WIDTH, withoutEnlargement: true })
      .webp({ quality: THUMBNAIL_WEBP_QUALITY })
      .toBuffer();
    const resizedMeta = await sharp(buffer).metadata();
    const resizedWidth = resizedMeta.width ?? THUMBNAIL_MAX_WIDTH;
    const resizedHeight = resizedMeta.height ?? Math.round((height * THUMBNAIL_MAX_WIDTH) / width);

    return {
      kind: "generated",
      thumbnail: { buffer, ext: "webp", width: resizedWidth, height: resizedHeight },
    };
  } catch (err) {
    return { kind: "error", message: err instanceof Error ? err.message : String(err) };
  }
}
