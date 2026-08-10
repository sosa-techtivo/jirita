import type { BackfillReport, TableSummary } from "./types";

function printTable(label: string, s: TableSummary, mode: "preview" | "apply"): void {
  const selfThumbLabel = mode === "preview" ? "<=600px — would set thumbnail_path=storage_path" : "<=600px — thumbnail_path set to storage_path";
  console.log(`\n  ${label}`);
  console.log(`    candidates (thumbnail_path IS NULL)     : ${s.candidates}`);
  console.log(`    skipped — not an image (pdf/doc/svg)    : ${s.skippedNotImage}`);
  console.log(`    attempted (raster images)               : ${s.attempted}`);
  console.log(`    ${selfThumbLabel.padEnd(41)}: ${s.selfThumbnail}`);
  console.log(`    ${(mode === "preview" ? "physical thumbnails — would create" : "physical thumbnails — created").padEnd(41)}: ${s.created}`);
  console.log(`    failed                                   : ${s.failed}`);
  if (mode === "apply") {
    console.log(`    rows updated (thumbnail_path set)       : ${s.rowsUpdated}`);
  }
}

export function printBackfillReport(report: BackfillReport): void {
  const heading = report.mode === "preview" ? "PREVIEW (dry run — no writes)" : "APPLY";
  console.log("\n============================================================");
  console.log(` Attachment thumbnail backfill — ${heading}`);
  console.log(` batch size: ${report.batchSize}   elapsed: ${(report.elapsedMs / 1000).toFixed(1)}s`);
  console.log("============================================================");

  printTable("ticket_attachments", report.perTable.ticket_attachments, report.mode);
  printTable("project_note_attachments", report.perTable.project_note_attachments, report.mode);

  const selfThumbTotalLabel =
    report.mode === "preview" ? "<=600px — would set thumbnail_path=storage_path" : "<=600px — thumbnail_path set to storage_path";
  console.log("\n  TOTAL");
  console.log(`    candidates                               : ${report.total.candidates}`);
  console.log(`    skipped — not an image                   : ${report.total.skippedNotImage}`);
  console.log(`    attempted                                : ${report.total.attempted}`);
  console.log(`    ${selfThumbTotalLabel.padEnd(41)}: ${report.total.selfThumbnail}`);
  console.log(
    `    ${(report.mode === "preview" ? "physical thumbnails — estimated to create" : "physical thumbnails — created").padEnd(41)}: ${report.total.created}`
  );
  console.log(`    failed                                    : ${report.total.failed}`);
  if (report.mode === "apply") {
    console.log(`    rows updated (writes performed)          : ${report.total.rowsUpdated}`);
  } else {
    console.log(`    writes performed                         : 0`);
  }

  if (report.failures.length > 0) {
    console.log(`\n  FAILURES (${report.failures.length}):`);
    for (const f of report.failures) {
      console.log(`    [${f.table}] id=${f.id} stage=${f.stage} path=${f.storagePath}`);
      console.log(`      ${f.message}`);
    }
  }

  console.log("\n============================================================");
  if (report.mode === "preview") {
    console.log(" This was a PREVIEW — nothing was written to Storage or the database.");
    console.log(" Re-run with --apply to actually generate/persist thumbnails and");
    console.log(" self-thumbnail (<=600px) rows.");
  } else {
    console.log(" APPLY complete. Re-running this script is safe — completed rows");
    console.log(" (thumbnail_path already set, including <=600px self-thumbnails)");
    console.log(" are never re-fetched or reprocessed.");
  }
  console.log("============================================================\n");
}
