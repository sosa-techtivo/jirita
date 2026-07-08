// Avatar photo upload: validate -> center-crop/resize (canvas) -> upload to
// the "avatars" Supabase Storage bucket. See
// supabase/migrations/20260710000000_avatars_storage.sql for the bucket +
// policies this writes to, and membership.ts's resolveAvatarUrl for how the
// stored path gets turned back into a displayable URL.

import { getSupabaseBrowserClient } from "./supabase-client";

export const ALLOWED_AVATAR_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
const MAX_SOURCE_BYTES = 8 * 1024 * 1024; // 8MB — generous cap on the original file, before resize
const OUTPUT_SIZE = 320; // px, square
const OUTPUT_QUALITY = 0.85;

export function validateAvatarFile(file: File): string | null {
  if (!ALLOWED_AVATAR_TYPES.includes(file.type)) {
    return "Please choose a JPG, PNG, or WEBP image.";
  }
  if (file.size > MAX_SOURCE_BYTES) {
    return "That image is too large — please choose one under 8MB.";
  }
  return null;
}

// Center-crops to a square and re-encodes as JPEG, regardless of the source
// image's shape/format — keeps every uploaded avatar a predictable
// shape/size so the existing rounded-full <img> tags (Profile/Sidebar/
// Header) never need object-fit/crop styling changes to look right.
export function resizeAvatarToSquareJpeg(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      try {
        const side = Math.min(img.width, img.height);
        const sx = (img.width - side) / 2;
        const sy = (img.height - side) / 2;

        const canvas = document.createElement("canvas");
        canvas.width = OUTPUT_SIZE;
        canvas.height = OUTPUT_SIZE;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Image processing isn't supported in this browser.");
        ctx.drawImage(img, sx, sy, side, side, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);

        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error("Could not process the image."))),
          "image/jpeg",
          OUTPUT_QUALITY
        );
      } catch (err) {
        reject(err instanceof Error ? err : new Error("Could not process the image."));
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("That file couldn't be read as an image."));
    };
    img.src = objectUrl;
  });
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Could not read the processed image."));
    reader.readAsDataURL(blob);
  });
}

export type AvatarUploadResult = { status: "success"; path: string } | { status: "error"; message: string };

// One fixed filename per user ("<uid>/avatar.jpg", upserted) — every
// re-upload overwrites the same object, so there's nothing to clean up and
// the stored `profiles.avatar_url` path never needs to change format.
export async function uploadAvatarBlob(userId: string, blob: Blob): Promise<AvatarUploadResult> {
  const path = `${userId}/avatar.jpg`;
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.storage.from("avatars").upload(path, blob, {
    upsert: true,
    contentType: "image/jpeg",
  });

  if (error) {
    return { status: "error", message: error.message };
  }
  return { status: "success", path };
}
