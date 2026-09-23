import { describe, expect, it } from "vitest";
import {
  classifyObjects,
  collectReferencedPaths,
  excludeNewlyReferenced,
  formatBytes,
  isOutsideSafetyWindow,
  totalBytes,
  type StorageObjectInfo,
} from "./eligibility";

const NOW = new Date("2026-09-22T12:00:00.000Z");

function hoursAgo(hours: number): string {
  return new Date(NOW.getTime() - hours * 60 * 60 * 1000).toISOString();
}

function obj(path: string, createdAt: string | null = hoursAgo(48), sizeBytes = 100): StorageObjectInfo {
  return { path, sizeBytes, createdAt };
}

describe("collectReferencedPaths", () => {
  it("collects both storage_path and thumbnail_path, skipping nulls", () => {
    const paths = collectReferencedPaths([
      { storage_path: "t1/a.png", thumbnail_path: "t1/thumbnails/a.png.webp" },
      { storage_path: "t1/b.pdf", thumbnail_path: null },
      { storage_path: null, thumbnail_path: null },
    ]);
    expect([...paths].sort()).toEqual(["t1/a.png", "t1/b.pdf", "t1/thumbnails/a.png.webp"]);
  });
});

describe("isOutsideSafetyWindow", () => {
  it("false inside the 24h window", () => {
    expect(isOutsideSafetyWindow(hoursAgo(23.9), NOW)).toBe(false);
  });
  it("true at and beyond 24h", () => {
    expect(isOutsideSafetyWindow(hoursAgo(24), NOW)).toBe(true);
    expect(isOutsideSafetyWindow(hoursAgo(72), NOW)).toBe(true);
  });
  it("fails closed on a missing or unparseable created_at", () => {
    expect(isOutsideSafetyWindow(null, NOW)).toBe(false);
    expect(isOutsideSafetyWindow("not-a-date", NOW)).toBe(false);
  });
});

describe("classifyObjects", () => {
  const referenced = collectReferencedPaths([{ storage_path: "t1/a.png", thumbnail_path: "t1/thumbnails/a.png.webp" }]);

  it("an object referenced by storage_path is never a candidate", () => {
    const result = classifyObjects([obj("t1/a.png")], referenced, NOW);
    expect(result.candidates).toEqual([]);
    expect(result.referenced.map((o) => o.path)).toEqual(["t1/a.png"]);
  });
  it("an object referenced only by thumbnail_path is never a candidate", () => {
    const result = classifyObjects([obj("t1/thumbnails/a.png.webp")], referenced, NOW);
    expect(result.candidates).toEqual([]);
    expect(result.referenced).toHaveLength(1);
  });
  it("a recent unreferenced object is skipped, not a candidate", () => {
    const result = classifyObjects([obj("t1/new.png", hoursAgo(1))], referenced, NOW);
    expect(result.candidates).toEqual([]);
    expect(result.recentUnreferenced.map((o) => o.path)).toEqual(["t1/new.png"]);
  });
  it("an old unreferenced object is a candidate", () => {
    const result = classifyObjects([obj("t1/orphan.png")], referenced, NOW);
    expect(result.candidates.map((o) => o.path)).toEqual(["t1/orphan.png"]);
  });
  it("matches exact paths only — no prefix/substring match", () => {
    const result = classifyObjects([obj("t1/a.png.bak"), obj("t1/thumbnails/a.png")], referenced, NOW);
    expect(result.candidates.map((o) => o.path)).toEqual(["t1/a.png.bak", "t1/thumbnails/a.png"]);
  });
});

describe("excludeNewlyReferenced", () => {
  it("drops a candidate that became referenced since discovery", () => {
    const { eligible, nowReferenced } = excludeNewlyReferenced(
      [obj("t1/x.png"), obj("t1/y.png")],
      new Set(["t1/y.png"])
    );
    expect(eligible.map((o) => o.path)).toEqual(["t1/x.png"]);
    expect(nowReferenced.map((o) => o.path)).toEqual(["t1/y.png"]);
  });
});

describe("totalBytes / formatBytes", () => {
  it("sums sizes", () => {
    expect(totalBytes([obj("a", null, 1024), obj("b", null, 2048)])).toBe(3072);
  });
  it("formats human-readable sizes", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1.50 KB");
    expect(formatBytes(18 * 1024 * 1024)).toBe("18.00 MB");
  });
});
