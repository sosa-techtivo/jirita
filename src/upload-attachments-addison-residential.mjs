import fs from "fs";
import path from "path";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

const PROJECT_ID = "7189549e-3e5c-4a40-9c80-e02da823be71";
const BUCKET = "ticket-attachments";

const MIGRATION_ROOT = path.resolve(
  process.cwd(),
  "../../migrations/unfuddle/preview-addison-smith-residential"
);

const MANIFEST_FILE = path.join(
  MIGRATION_ROOT,
  "attachments-optimized-manifest.json"
);

const OPTIMIZED_DIR = path.join(MIGRATION_ROOT, "optimized");
const THUMBNAILS_DIR = path.join(MIGRATION_ROOT, "thumbnails");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
  );
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

const manifest = JSON.parse(
  fs.readFileSync(MANIFEST_FILE, "utf8")
);

function deterministicUuid(value) {
  const hash = crypto
    .createHash("sha256")
    .update(`jirita-unfuddle-attachment:${value}`)
    .digest();

  const bytes = Buffer.from(hash.subarray(0, 16));

  // UUID v5-compatible formatting.
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = bytes.toString("hex");

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}

function safeFilename(filename) {
  return filename
    .replace(/\//g, "_")
    .replace(/\\/g, "_")
    .replace(/\0/g, "");
}

async function getTicket(unfuddleId) {
  const { data, error } = await supabase
    .from("tickets")
    .select("id")
    .eq("project_id", PROJECT_ID)
    .eq("unfuddle_id", String(unfuddleId))
    .maybeSingle();

  if (error) {
    throw new Error(
      `Ticket lookup failed for ${unfuddleId}: ${error.message}`
    );
  }

  if (!data) {
    throw new Error(
      `Ticket not found for Unfuddle ID ${unfuddleId}`
    );
  }

  return data.id;
}

async function getComment(ticketId, unfuddleId) {
  if (!unfuddleId) {
    return null;
  }

  const { data, error } = await supabase
    .from("ticket_comments")
    .select("id")
    .eq("ticket_id", ticketId)
    .eq("unfuddle_id", String(unfuddleId))
    .maybeSingle();

  if (error) {
    throw new Error(
      `Comment lookup failed for ${unfuddleId}: ${error.message}`
    );
  }

  if (!data) {
    throw new Error(
      `Comment not found for Unfuddle ID ${unfuddleId}`
    );
  }

  return data.id;
}

async function uploadIfNeeded(storagePath, localPath, contentType) {
  const file = fs.readFileSync(localPath);

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, file, {
      contentType,
      upsert: false,
      cacheControl: "3600",
    });

  if (!error) {
    return "uploaded";
  }

  const message = String(error.message || "").toLowerCase();

  // A rerun may encounter an object uploaded by a previous attempt.
  if (
    message.includes("already exists") ||
    message.includes("duplicate")
  ) {
    return "existing";
  }

  throw new Error(
    `Storage upload failed (${storagePath}): ${error.message}`
  );
}

async function attachmentAlreadyExists(unfuddleId) {
  const { data, error } = await supabase
    .from("ticket_attachments")
    .select("id")
    .eq("unfuddle_id", String(unfuddleId))
    .maybeSingle();

  if (error) {
    throw new Error(
      `Attachment existence lookup failed ${unfuddleId}: ${error.message}`
    );
  }

  return Boolean(data);
}

const ticketCache = new Map();
const commentCache = new Map();

let processed = 0;
let dbInserted = 0;
let dbExisting = 0;

let originalsUploaded = 0;
let originalsExisting = 0;

let thumbnailsUploaded = 0;
let thumbnailsExisting = 0;

let failed = 0;

const failures = [];

console.log();
console.log("KTDYC2 — ATTACHMENT UPLOAD");
console.log("=".repeat(70));
console.log("Mode: APPLY");
console.log("Bucket:", BUCKET);
console.log("Attachments:", manifest.attachments.length);
console.log();

for (const item of manifest.attachments) {
  try {
    const unfuddleId = String(item.unfuddle_id);

    let ticketId = ticketCache.get(item.ticket_unfuddle_id);

    if (!ticketId) {
      ticketId = await getTicket(item.ticket_unfuddle_id);
      ticketCache.set(item.ticket_unfuddle_id, ticketId);
    }

    let commentId = null;

    if (item.comment_unfuddle_id) {
      const cacheKey =
        `${ticketId}:${item.comment_unfuddle_id}`;

      if (commentCache.has(cacheKey)) {
        commentId = commentCache.get(cacheKey);
      } else {
        commentId = await getComment(
          ticketId,
          item.comment_unfuddle_id
        );
        commentCache.set(cacheKey, commentId);
      }
    }

    const attachmentUuid = deterministicUuid(unfuddleId);

    const finalFilename = safeFilename(
      item.optimized_filename
    );

    const storagePath =
      `${ticketId}/${attachmentUuid}-${finalFilename}`;

    const optimizedLocalPath = path.join(
      OPTIMIZED_DIR,
      item.optimized_filename
    );

    if (!fs.existsSync(optimizedLocalPath)) {
      throw new Error(
        `Optimized file missing: ${optimizedLocalPath}`
      );
    }

    const finalMime = item.image
      ? "image/webp"
      : item.original_mime_type || "application/octet-stream";

    const originalUploadResult = await uploadIfNeeded(
      storagePath,
      optimizedLocalPath,
      finalMime
    );

    if (originalUploadResult === "uploaded") {
      originalsUploaded++;
    } else {
      originalsExisting++;
    }

    let thumbnailPath = null;

    if (item.image && item.thumbnail_filename) {
      const thumbFilename = safeFilename(
        item.thumbnail_filename
      );

      thumbnailPath =
        `${ticketId}/thumbnails/` +
        `${attachmentUuid}-${thumbFilename}`;

      const thumbLocalPath = path.join(
        THUMBNAILS_DIR,
        item.thumbnail_filename
      );

      if (!fs.existsSync(thumbLocalPath)) {
        throw new Error(
          `Thumbnail missing: ${thumbLocalPath}`
        );
      }

      const thumbResult = await uploadIfNeeded(
        thumbnailPath,
        thumbLocalPath,
        "image/webp"
      );

      if (thumbResult === "uploaded") {
        thumbnailsUploaded++;
      } else {
        thumbnailsExisting++;
      }
    }

    const exists = await attachmentAlreadyExists(
      unfuddleId
    );

    if (exists) {
      dbExisting++;
    } else {
      const { error: insertError } = await supabase
        .from("ticket_attachments")
        .insert({
          ticket_id: ticketId,
          storage_path: storagePath,

          // User-facing filename follows the optimized file,
          // as in TCFCU for converted images.
          filename: item.image
            ? path.parse(item.original_filename).name + ".webp"
            : item.original_filename,

          size_bytes: item.optimized_bytes,
          mime_type: finalMime,

          uploaded_by: null,

          created_at: item.created_at || new Date().toISOString(),
          updated_at: item.updated_at || null,

          unfuddle_id: unfuddleId,
          comment_id: commentId,

          is_available: true,
          thumbnail_path: thumbnailPath,
        });

      if (insertError) {
        throw new Error(
          `DB insert failed ${unfuddleId}: ${insertError.message}`
        );
      }

      dbInserted++;
    }

    processed++;

    if (
      processed % 25 === 0 ||
      processed === manifest.attachments.length
    ) {
      console.log(
        `Processed ${processed}/${manifest.attachments.length}`
      );
    }
  } catch (error) {
    failed++;

    failures.push({
      unfuddle_id: item.unfuddle_id,
      ticket_number: item.ticket_number,
      filename: item.original_filename,
      error: error.message,
    });

    console.error(
      `FAILED ${item.unfuddle_id} / ` +
      `${item.original_filename}: ${error.message}`
    );
  }
}

const report = {
  project_id: PROJECT_ID,
  bucket: BUCKET,
  processed,
  failed,
  db_inserted: dbInserted,
  db_existing: dbExisting,
  originals_uploaded: originalsUploaded,
  originals_existing: originalsExisting,
  thumbnails_uploaded: thumbnailsUploaded,
  thumbnails_existing: thumbnailsExisting,
  failures,
};

const reportPath = path.join(
  MIGRATION_ROOT,
  "attachments-upload-report.json"
);

fs.writeFileSync(
  reportPath,
  JSON.stringify(report, null, 2),
  "utf8"
);

console.log();
console.log("RESULT");
console.log("-".repeat(70));
console.log("Processed:             ", processed);
console.log("Failed:                ", failed);
console.log("DB inserted:           ", dbInserted);
console.log("DB already existing:   ", dbExisting);
console.log("Originals uploaded:    ", originalsUploaded);
console.log("Originals existing:    ", originalsExisting);
console.log("Thumbnails uploaded:   ", thumbnailsUploaded);
console.log("Thumbnails existing:   ", thumbnailsExisting);
console.log();
console.log("Report:", reportPath);

if (failed === 0 && processed === manifest.attachments.length) {
  console.log();
  console.log("UPLOAD RESULT: COMPLETE ✅");
} else {
  console.log();
  console.log("UPLOAD RESULT: INCOMPLETE ⚠️");
}
