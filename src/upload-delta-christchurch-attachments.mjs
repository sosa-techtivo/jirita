import fs from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const PROJECT_ID = "3bd8e57e-0051-42b3-9eea-faa50ad59150";
const MIGRATION_ROOT =
  "/Users/Alex/Documents/jirita/migrations/unfuddle_Aug24/delta-christchurch-attachments";

const BUCKET = "ticket-attachments";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing Supabase environment variables");
}

const supabase = createClient(
  supabaseUrl,
  serviceRoleKey,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);

const manifest = JSON.parse(
  await fs.readFile(
    path.join(MIGRATION_ROOT, "attachments-optimized-manifest.json"),
    "utf8"
  )
);

const report = {
  processed: 0,
  failed: 0,
  db_inserted: 0,
  db_already_existing: 0,
  originals_uploaded: 0,
  originals_existing: 0,
  thumbnails_uploaded: 0,
  thumbnails_existing: 0,
  failures: [],
};

for (const item of manifest) {
  try {
    const { data: ticket, error: ticketError } = await supabase
      .from("tickets")
      .select("id")
      .eq("project_id", PROJECT_ID)
      .eq("unfuddle_id", item.ticket_unfuddle_id)
      .single();

    if (ticketError || !ticket) {
      throw new Error(
        `Ticket not found for unfuddle_id ${item.ticket_unfuddle_id}`
      );
    }

    const { data: comment, error: commentError } = await supabase
      .from("ticket_comments")
      .select("id")
      .eq("ticket_id", ticket.id)
      .eq("unfuddle_id", item.comment_unfuddle_id)
      .single();

    if (commentError || !comment) {
      throw new Error(
        `Comment not found for unfuddle_id ${item.comment_unfuddle_id}`
      );
    }

    const originalPath = path.join(
      MIGRATION_ROOT,
      "optimized",
      item.optimized_filename
    );

    const thumbnailPath = path.join(
      MIGRATION_ROOT,
      "thumbnails",
      item.thumbnail_filename
    );

    const originalStoragePath =
      `${ticket.id}/${comment.id}-${item.unfuddle_id}.webp`;

    const thumbnailStoragePath =
      `${ticket.id}/thumb-${comment.id}-${item.unfuddle_id}.webp`;

    const originalBuffer = await fs.readFile(originalPath);
    const thumbnailBuffer = await fs.readFile(thumbnailPath);

    const { error: originalUploadError } = await supabase.storage
      .from(BUCKET)
      .upload(
        originalStoragePath,
        originalBuffer,
        {
          contentType: "image/webp",
          upsert: false,
        }
      );

    if (originalUploadError) {
      if (
        originalUploadError.message?.toLowerCase().includes("already exists") ||
        originalUploadError.message?.toLowerCase().includes("duplicate")
      ) {
        report.originals_existing += 1;
      } else {
        throw new Error(
          `Original upload failed: ${originalUploadError.message}`
        );
      }
    } else {
      report.originals_uploaded += 1;
    }

    const { error: thumbnailUploadError } = await supabase.storage
      .from(BUCKET)
      .upload(
        thumbnailStoragePath,
        thumbnailBuffer,
        {
          contentType: "image/webp",
          upsert: false,
        }
      );

    if (thumbnailUploadError) {
      if (
        thumbnailUploadError.message?.toLowerCase().includes("already exists") ||
        thumbnailUploadError.message?.toLowerCase().includes("duplicate")
      ) {
        report.thumbnails_existing += 1;
      } else {
        throw new Error(
          `Thumbnail upload failed: ${thumbnailUploadError.message}`
        );
      }
    } else {
      report.thumbnails_uploaded += 1;
    }

    const { data: existing } = await supabase
      .from("ticket_attachments")
      .select("id")
      .eq("ticket_id", ticket.id)
      .eq("unfuddle_id", item.unfuddle_id)
      .maybeSingle();

    if (existing) {
      report.db_already_existing += 1;
    } else {
      const { error: insertError } = await supabase
        .from("ticket_attachments")
        .insert({
          ticket_id: ticket.id,
          comment_id: comment.id,
          filename: item.original_filename,
          storage_path: originalStoragePath,
          thumbnail_path: thumbnailStoragePath,
          mime_type: "image/webp",
          size_bytes: item.optimized_bytes,
          unfuddle_id: item.unfuddle_id,
          is_available: true,
        });

      if (insertError) {
        throw new Error(
          `DB insert failed: ${insertError.message}`
        );
      }

      report.db_inserted += 1;
    }

    report.processed += 1;
  } catch (error) {
    report.failed += 1;
    report.failures.push({
      unfuddle_id: item.unfuddle_id,
      filename: item.original_filename,
      error: String(error?.message || error),
    });
  }
}

const reportPath = path.join(
  MIGRATION_ROOT,
  "attachments-upload-report.json"
);

await fs.writeFile(
  reportPath,
  JSON.stringify(report, null, 2)
);

console.log("CHRISTCHURCHATL.ORG — DELTA ATTACHMENT UPLOAD");
console.log("=".repeat(70));
console.log("Mode: APPLY");
console.log("Bucket:", BUCKET);
console.log("Attachments:", manifest.length);
console.log();
console.log("RESULT");
console.log("-".repeat(70));
console.log("Processed:             ", report.processed);
console.log("Failed:                ", report.failed);
console.log("DB inserted:           ", report.db_inserted);
console.log("DB already existing:   ", report.db_already_existing);
console.log("Originals uploaded:    ", report.originals_uploaded);
console.log("Originals existing:    ", report.originals_existing);
console.log("Thumbnails uploaded:   ", report.thumbnails_uploaded);
console.log("Thumbnails existing:   ", report.thumbnails_existing);
console.log("Report:", reportPath);

if (report.failed === 0) {
  console.log();
  console.log("UPLOAD RESULT: COMPLETE ✅");
} else {
  console.log();
  console.log("UPLOAD RESULT: INCOMPLETE ⚠️");
}
