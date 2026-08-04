// Pure ZIP builder for a project backup, entirely in memory. Takes the
// Record<path, string | Uint8Array> produced by serializeExportedProject()
// (see serialize-exported-project.ts — untouched by this file beyond it
// already widening its own return type) and turns it into a single ZIP
// archive, still fully in memory: no disk I/O, no Supabase Storage, no
// network calls, no download, no restoration.
//
// Every property of the input becomes exactly one file entry, with exactly
// the same name and exactly the same bytes (compression is lossless — the
// decompressed content is byte-identical to what went in) — no explicit
// directory entries, no extra files, no content rewriting, no extra
// metadata beyond what a valid ZIP entry structurally requires. A path
// containing "/" (e.g. "files/<ticket_id>/<file>") is a normal, safe flat
// ZIP entry name — every standard unzip tool reconstructs the folder
// structure from it without needing a separate directory-marker entry,
// which is why "no folders" here means "no unsafe/traversal paths and no
// explicit directory entries," not "no '/' anywhere in a name."

import { strToU8, unzipSync, zipSync } from "fflate";
import type { SerializedProjectBackup } from "./serialize-exported-project";

// Rejects: empty names, backslashes, a leading/trailing "/", and any path
// segment that is empty, ".", or ".." (directory traversal). Everything
// else — including a plain root filename or a nested "files/a/b/c" path —
// is a safe, flat zip entry name.
function isSafeEntryName(name: string): boolean {
  if (name === "") return false;
  if (name.includes("\\")) return false;
  if (name.startsWith("/") || name.endsWith("/")) return false;
  return name.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

/**
 * Pure function: same input always produces the same set of ZIP entries, no
 * side effects. Returns a Buffer — ready to be handed to a download response
 * later, not sent anywhere by this function itself.
 */
export function buildProjectBackupZip(serializedBackup: SerializedProjectBackup): Buffer {
  if (!serializedBackup || typeof serializedBackup !== "object") {
    throw new Error("[buildProjectBackupZip] serializedBackup must be the object returned by serializeExportedProject().");
  }

  const expectedFilenames = Object.keys(serializedBackup);
  if (expectedFilenames.length === 0) {
    throw new Error("[buildProjectBackupZip] serializedBackup has no files to add to the zip.");
  }

  const zipInput: Record<string, Uint8Array> = {};
  for (const filename of expectedFilenames) {
    const content = serializedBackup[filename];
    if (typeof content !== "string" && !(content instanceof Uint8Array)) {
      throw new Error(`[buildProjectBackupZip] serializedBackup["${filename}"] must be a string or Uint8Array.`);
    }
    if (!isSafeEntryName(filename)) {
      throw new Error(`[buildProjectBackupZip] "${filename}" is not a safe flat zip entry name.`);
    }
    zipInput[filename] = typeof content === "string" ? strToU8(content) : content;
  }

  const zipped = zipSync(zipInput);
  const buffer = Buffer.from(zipped);

  // Validation: re-read the actual zip bytes just produced and confirm
  // every expected file — and only the expected files — really made it in,
  // rather than trusting the input construction above alone.
  const actualFilenames = Object.keys(unzipSync(zipped)).sort();
  const sortedExpected = [...expectedFilenames].sort();
  const sameFiles =
    actualFilenames.length === sortedExpected.length &&
    actualFilenames.every((name, i) => name === sortedExpected[i]);
  if (!sameFiles) {
    throw new Error(
      `[buildProjectBackupZip] zip contents (${actualFilenames.join(", ")}) do not match the expected files (${sortedExpected.join(", ")}).`
    );
  }

  return buffer;
}
