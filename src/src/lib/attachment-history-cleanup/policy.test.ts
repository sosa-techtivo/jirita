import { describe, expect, it } from "vitest";
import { buildBackupPlan, type HistoricalAttachmentRow } from "../attachment-history-backup/plan";
import {
  EXPECTED_CANDIDATES,
  EXPECTED_ORIGINAL_BYTES,
  KNOWN_UNAVAILABLE_IDS,
  MIN_ORIGINAL_BYTES,
  gateCandidate,
  parseCliArgs,
  recheckProblems,
  selectCandidates,
  summarizeBatch,
  type BackupEvidence,
  type BackupObjectEvidence,
  type Candidate,
} from "./policy";

const MiB = 1024 * 1024;

function row(overrides: Partial<HistoricalAttachmentRow> & { id: string; storage_path: string }): HistoricalAttachmentRow {
  return {
    ticket_id: "t1",
    unfuddle_id: 1,
    filename: "f.zip",
    mime_type: "application/zip",
    size_bytes: null,
    created_at: "2020-01-01T00:00:00Z",
    is_available: true,
    thumbnail_path: null,
    ...overrides,
  };
}

function planRows(rows: HistoricalAttachmentRow[], sizes: Record<string, number>) {
  return buildBackupPlan(rows, new Map(Object.entries(sizes).map(([p, s]) => [p, { sizeBytes: s }])), (s) => s).rows;
}

function goodObject(size: number, sha = "abc"): BackupObjectEvidence {
  return { manifestSize: size, manifestStatus: "verified", manifestSha256: sha, journalSize: size, journalSha256: sha, localSize: size, localSha256: sha };
}

function evidenceFor(c: Candidate, thumbnail: BackupObjectEvidence | null = null): BackupEvidence {
  return { manifestStoragePath: c.row.storage_path, manifestThumbnailPath: c.row.thumbnail_path, original: goodObject(c.originalBytes), thumbnail };
}

describe("selectCandidates", () => {
  it("selects only available historical originals physically >= 5 MiB", () => {
    const rows = planRows(
      [
        row({ id: "big", storage_path: "t/big.zip" }),
        row({ id: "edge", storage_path: "t/edge.zip" }),
        row({ id: "small", storage_path: "t/small.zip" }),
        row({ id: "flagged", storage_path: "t/flagged.zip", is_available: false }),
        row({ id: "gone", storage_path: "t/gone.zip" }),
        row({ id: "known", storage_path: "t/unavailable/x.zip", is_available: false, size_bytes: 100 * MiB }),
      ],
      { "t/big.zip": 20 * MiB, "t/edge.zip": MIN_ORIGINAL_BYTES, "t/small.zip": MIN_ORIGINAL_BYTES - 1, "t/flagged.zip": 30 * MiB },
    );
    expect(selectCandidates(rows).map((c) => c.row.id)).toEqual(["big", "edge"]);
  });

  it("uses physical Storage size, not DB size_bytes", () => {
    const rows = planRows([row({ id: "a", storage_path: "t/a", size_bytes: 50 * MiB })], { "t/a": MiB });
    expect(selectCandidates(rows)).toEqual([]);
  });

  it("never selects a known metadata-only row even if it looks available", () => {
    const [id] = [...KNOWN_UNAVAILABLE_IDS];
    const rows = planRows([row({ id, storage_path: "t/k" })], { "t/k": 50 * MiB });
    expect(selectCandidates(rows)).toEqual([]);
  });

  it("classifies none / self / separate / separate-but-missing thumbnails", () => {
    const rows = planRows(
      [
        row({ id: "none", storage_path: "t/1" }),
        row({ id: "self", storage_path: "t/2", thumbnail_path: "t/2" }),
        row({ id: "sep", storage_path: "t/3", thumbnail_path: "t/thumbnails/3.webp" }),
        row({ id: "miss", storage_path: "t/4", thumbnail_path: "t/thumbnails/4.webp" }),
      ],
      { "t/1": 9 * MiB, "t/2": 8 * MiB, "t/3": 7 * MiB, "t/thumbnails/3.webp": 1000, "t/4": 6 * MiB },
    );
    expect(selectCandidates(rows).map((c) => [c.row.id, c.thumbnail, c.thumbnailBytes])).toEqual([
      ["none", "none", null],
      ["self", "self", null],
      ["sep", "separate", 1000],
      ["miss", "separate_missing", null],
    ]);
  });
});

describe("gateCandidate", () => {
  const [plain, self, sep, miss] = selectCandidates(
    planRows(
      [
        row({ id: "plain", storage_path: "t/1" }),
        row({ id: "self", storage_path: "t/2", thumbnail_path: "t/2" }),
        row({ id: "sep", storage_path: "t/3", thumbnail_path: "t/th/3" }),
        row({ id: "miss", storage_path: "t/4", thumbnail_path: "t/th/4" }),
      ],
      { "t/1": 9 * MiB, "t/2": 8 * MiB, "t/3": 7 * MiB, "t/th/3": 500, "t/4": 6 * MiB },
    ),
  );

  it("passes a fully backed-up original and removes only that path", () => {
    const g = gateCandidate(plain, evidenceFor(plain));
    expect(g.eligible).toBe(true);
    expect(g.pathsToRemove).toEqual(["t/1"]);
  });

  it("treats a self-thumbnail as one physical object", () => {
    const g = gateCandidate(self, evidenceFor(self));
    expect(g.eligible).toBe(true);
    expect(g.pathsToRemove).toEqual(["t/2"]);
  });

  it("requires a separate thumbnail to pass the gate independently", () => {
    expect(gateCandidate(sep, evidenceFor(sep, null)).eligible).toBe(false);
    const g = gateCandidate(sep, evidenceFor(sep, goodObject(500, "th")));
    expect(g.eligible).toBe(true);
    expect(g.pathsToRemove).toEqual(["t/3", "t/th/3"]);
  });

  it("blocks a thumbnail_path whose object is missing", () => {
    expect(gateCandidate(miss, evidenceFor(miss)).eligible).toBe(false);
  });

  it.each<[string, (e: BackupEvidence) => BackupEvidence]>([
    ["not in manifest", () => null as unknown as BackupEvidence],
    ["manifest path differs", (e) => ({ ...e, manifestStoragePath: "t/other" })],
    ["manifest status not verified", (e) => ({ ...e, original: { ...e.original, manifestStatus: "failed" } })],
    ["backup size ≠ current size", (e) => ({ ...e, original: { ...e.original, manifestSize: 1, journalSize: 1, localSize: 1 } })],
    ["no recorded SHA-256", (e) => ({ ...e, original: { ...e.original, journalSha256: null } })],
    ["local file missing", (e) => ({ ...e, original: { ...e.original, localSize: null, localSha256: null } })],
    ["local file altered", (e) => ({ ...e, original: { ...e.original, localSha256: "tampered" } })],
  ])("fails closed when %s", (_label, mutate) => {
    const g = gateCandidate(plain, mutate(evidenceFor(plain)));
    expect(g.eligible).toBe(false);
    expect(g.problems.length).toBeGreaterThan(0);
  });
});

describe("summarizeBatch", () => {
  function batchOf(count: number, totalBytes: number) {
    const each = Math.floor(totalBytes / count);
    const rows = Array.from({ length: count }, (_, i) => row({ id: `r${String(i).padStart(2, "0")}`, storage_path: `t/${i}` }));
    const sizes = Object.fromEntries(rows.map((r, i) => [r.storage_path, i === 0 ? totalBytes - each * (count - 1) : each]));
    return selectCandidates(planRows(rows, sizes)).map((c) => gateCandidate(c, evidenceFor(c)));
  }

  it("verifies the expected 19 / ~261 MiB batch when every candidate passes", () => {
    const s = summarizeBatch(batchOf(EXPECTED_CANDIDATES, EXPECTED_ORIGINAL_BYTES + 123_456));
    expect(s).toMatchObject({ verified: true, candidates: 19, eligible: 19, ineligible: 0, thumbnailBytes: 0 });
    expect(s.fingerprint).toMatch(/^[0-9a-f]{16}$/);
  });

  it("fails closed on a different candidate count instead of expanding", () => {
    expect(summarizeBatch(batchOf(20, EXPECTED_ORIGINAL_BYTES)).verified).toBe(false);
    expect(summarizeBatch(batchOf(18, EXPECTED_ORIGINAL_BYTES)).verified).toBe(false);
  });

  it("fails closed on materially different bytes", () => {
    expect(summarizeBatch(batchOf(19, EXPECTED_ORIGINAL_BYTES + 10 * MiB)).expectationProblems).toHaveLength(1);
  });

  it("blocks the whole batch when a single candidate fails the gate", () => {
    const batch = batchOf(19, EXPECTED_ORIGINAL_BYTES);
    batch[5] = gateCandidate(batch[5], null);
    const s = summarizeBatch(batch);
    expect(s).toMatchObject({ verified: false, eligible: 18, ineligible: 1 });
  });

  it("changes the fingerprint when any gated fact changes", () => {
    const a = batchOf(19, EXPECTED_ORIGINAL_BYTES);
    const b = [...a];
    b[0] = { ...b[0], originalSha256: "different" };
    expect(summarizeBatch(a).fingerprint).not.toBe(summarizeBatch(b).fingerprint);
  });
});

describe("recheckProblems", () => {
  const [c] = selectCandidates(planRows([row({ id: "a", storage_path: "t/a" })], { "t/a": 9 * MiB }));
  const g = gateCandidate(c, evidenceFor(c));
  const fresh = { is_available: true, unfuddle_id: 1, storage_path: "t/a", thumbnail_path: null };

  it("passes when fresh state is unchanged", () => {
    expect(recheckProblems(g, fresh, new Map([["t/a", 9 * MiB]]))).toEqual([]);
  });

  it("rejects stale candidates", () => {
    expect(recheckProblems(g, null, new Map())).not.toEqual([]);
    expect(recheckProblems(g, { ...fresh, is_available: false }, new Map([["t/a", 9 * MiB]]))).not.toEqual([]);
    expect(recheckProblems(g, { ...fresh, thumbnail_path: "t/th" }, new Map([["t/a", 9 * MiB]]))).not.toEqual([]);
    expect(recheckProblems(g, fresh, new Map([["t/a", 1]]))).not.toEqual([]);
    expect(recheckProblems(g, fresh, new Map([["t/a", null]]))).not.toEqual([]);
  });
});

describe("parseCliArgs", () => {
  it("defaults to dry run", () => {
    expect(parseCliArgs([])).toEqual({ mode: "dry-run", backupDir: null });
  });

  it("requires --apply and a well-formed --confirm together", () => {
    expect(parseCliArgs(["--apply", "--confirm=0123456789abcdef"])).toMatchObject({ mode: "apply", confirm: "0123456789abcdef" });
    expect(() => parseCliArgs(["--apply"])).toThrow();
    expect(() => parseCliArgs(["--confirm=0123456789abcdef"])).toThrow();
    expect(() => parseCliArgs(["--apply", "--confirm=xyz"])).toThrow();
  });

  it("rejects unknown, malformed, and duplicate arguments", () => {
    expect(() => parseCliArgs(["--aply"])).toThrow();
    expect(() => parseCliArgs(["--apply=true"])).toThrow();
    expect(() => parseCliArgs(["--backup="])).toThrow();
    expect(() => parseCliArgs(["--backup=a", "--backup=b"])).toThrow();
  });
});
