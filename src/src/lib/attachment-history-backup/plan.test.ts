import { describe, expect, it } from "vitest";
import {
  buildBackupPlan,
  buildManifestRecords,
  objectKey,
  toCsv,
  toLocalRelativePath,
  verifyBackup,
  type HistoricalAttachmentRow,
  type LocalObjectState,
} from "./plan";

const hash = (s: string) => `h${s.length}`;

function row(overrides: Partial<HistoricalAttachmentRow> & { id: string; storage_path: string }): HistoricalAttachmentRow {
  return {
    ticket_id: "t1",
    unfuddle_id: 100,
    filename: "file.png",
    mime_type: "image/png",
    size_bytes: 10,
    created_at: "2020-01-01T00:00:00Z",
    is_available: true,
    thumbnail_path: null,
    ...overrides,
  };
}

const source = new Map([
  ["t1/a.png", { sizeBytes: 10 }],
  ["t1/thumbnails/a.png.webp", { sizeBytes: 3 }],
  ["t1/b.pdf", { sizeBytes: 20 }],
]);

const rows = [
  row({ id: "a", storage_path: "t1/a.png", thumbnail_path: "t1/thumbnails/a.png.webp" }),
  row({ id: "b", storage_path: "t1/b.pdf", size_bytes: 20, thumbnail_path: "t1/b.pdf" }),
  row({ id: "u", storage_path: "t1/unavailable/big.zip", is_available: false, size_bytes: 999 }),
];

function ok(sizeBytes: number, sha = "s"): LocalObjectState {
  return { sizeBytes, sha256: sha, recordedSha256: sha, error: null };
}

function allOk(plan: ReturnType<typeof buildBackupPlan>): Map<string, LocalObjectState> {
  return new Map(plan.objects.map((o) => [objectKey(o), ok(o.sizeBytes)]));
}

describe("toLocalRelativePath", () => {
  it("keeps safe storage paths verbatim under a per-kind directory", () => {
    expect(toLocalRelativePath("original", "t1/att-1-Captura_1.45 p._m..png", hash)).toBe("objects/originals/t1/att-1-Captura_1.45 p._m..png");
    expect(toLocalRelativePath("thumbnail", "t1/thumbnails/x.webp", hash)).toBe("objects/thumbnails/t1/thumbnails/x.webp");
  });

  it("encodes traversal, empty, and backslash segments so nothing escapes the backup root", () => {
    expect(toLocalRelativePath("original", "../etc/passwd", hash)).toBe("objects/originals/%enc%../etc/passwd");
    expect(toLocalRelativePath("original", "a//b\\c", hash)).toBe("objects/originals/a/%enc%/%enc%b%5Cc");
    expect(toLocalRelativePath("original", "../x", hash).split("/")).not.toContain("..");
  });

  it("hashes segments that stay too long even after encoding", () => {
    const long = "é".repeat(200);
    expect(toLocalRelativePath("original", `t1/${long}`, hash)).toBe(`objects/originals/t1/%sha%h200`);
  });
});

describe("buildBackupPlan", () => {
  const plan = buildBackupPlan(rows, source, hash);

  it("classifies originals and thumbnails by exact DB path", () => {
    expect(plan.rows.map((r) => [r.row.id, r.original, r.thumbnail])).toEqual([
      ["a", "available", "available"],
      ["b", "available", "self"],
      ["u", "intentionally_unavailable", "none"],
    ]);
  });

  it("downloads a self-thumbnail only once, as the original", () => {
    expect(plan.objects.map(objectKey)).toEqual(["original:t1/a.png", "thumbnail:t1/thumbnails/a.png.webp", "original:t1/b.pdf"]);
  });

  it("flags an available row whose object is absent as unexpected missing", () => {
    const p = buildBackupPlan([row({ id: "m", storage_path: "t1/gone.png", thumbnail_path: "t1/thumbnails/gone.webp" })], source, hash);
    expect(p.rows[0].original).toBe("missing");
    expect(p.rows[0].thumbnail).toBe("missing");
    expect(verifyBackup(p, new Map()).unexpectedMissing).toHaveLength(2);
  });

  it("still backs up an is_available=false row whose object does exist", () => {
    const p = buildBackupPlan([row({ id: "x", storage_path: "t1/a.png", is_available: false })], source, hash);
    expect(p.rows[0].original).toBe("available");
    expect(p.objects).toHaveLength(1);
  });

  it("detects case-only local path collisions", () => {
    const s = new Map([["t1/A.png", { sizeBytes: 1 }], ["t1/a.png", { sizeBytes: 1 }]]);
    const p = buildBackupPlan([row({ id: "1", storage_path: "t1/A.png" }), row({ id: "2", storage_path: "t1/a.png" })], s, hash);
    expect(p.collisions).toHaveLength(1);
    expect(verifyBackup(p, allOk(p)).verified).toBe(false);
  });
});

describe("verifyBackup", () => {
  const plan = buildBackupPlan(rows, source, hash);

  it("verifies a complete backup without counting intentionally unavailable rows as failures", () => {
    const s = verifyBackup(plan, allOk(plan));
    expect(s).toMatchObject({
      verified: true,
      dbRows: 3,
      intentionallyUnavailableRows: 1,
      expectedOriginals: 2,
      downloadedOriginals: 2,
      expectedThumbnails: 1,
      downloadedThumbnails: 1,
      selfThumbnails: 1,
      expectedBytes: 33,
      downloadedBytes: 33,
    });
  });

  it("fails on an absent local file, a size mismatch, or an unrecorded/mismatched checksum", () => {
    const [orig, thumb, pdf] = plan.objects;
    const local = allOk(plan);
    local.set(objectKey(orig), { sizeBytes: null, sha256: null, recordedSha256: null, error: "timeout" });
    local.set(objectKey(thumb), ok(2));
    local.set(objectKey(pdf), { sizeBytes: 20, sha256: "x", recordedSha256: "y", error: null });
    const s = verifyBackup(plan, local);
    expect(s.verified).toBe(false);
    expect(s.failedDownloads).toEqual(["original t1/a.png: timeout"]);
    expect(s.sizeMismatches).toHaveLength(1);
    expect(s.checksumProblems).toHaveLength(1);
    expect(s.downloadedBytes).toBe(0);
  });

  it("never verifies an empty inventory", () => {
    expect(verifyBackup(buildBackupPlan([], source, hash), new Map()).verified).toBe(false);
  });
});

describe("manifest", () => {
  it("records statuses and quotes CSV cells safely", () => {
    const plan = buildBackupPlan([...rows, row({ id: "q", storage_path: "t1/a.png", filename: 'we,ird "name"' })], source, hash);
    const records = buildManifestRecords(plan, allOk(plan));
    expect(records.map((r) => [r.original_status, r.thumbnail_status])).toEqual([
      ["verified", "verified"],
      ["verified", "same_as_original"],
      ["not_applicable", "not_applicable"],
      ["verified", "not_applicable"],
    ]);
    expect(toCsv(records)).toContain('"we,ird ""name"""');
  });
});
