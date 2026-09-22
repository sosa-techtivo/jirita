import { describe, expect, it } from "vitest";
import { attachmentPathsToRemove, findUnremovedPaths } from "./attachment-storage-remove";

const ORIGINAL = "ticket-1/uuid-shot.png";
const THUMBNAIL = "ticket-1/thumbnails/uuid-shot.png.webp";

describe("attachmentPathsToRemove", () => {
  it("original only when there is no thumbnail", () => {
    expect(attachmentPathsToRemove(ORIGINAL, null)).toEqual([ORIGINAL]);
  });
  it("original and thumbnail when both exist", () => {
    expect(attachmentPathsToRemove(ORIGINAL, THUMBNAIL)).toEqual([ORIGINAL, THUMBNAIL]);
  });
  it("a self-thumbnail (thumbnail_path === storage_path) counts once", () => {
    expect(attachmentPathsToRemove(ORIGINAL, ORIGINAL)).toEqual([ORIGINAL]);
  });
});

describe("findUnremovedPaths", () => {
  it("empty when every requested path was removed", () => {
    expect(findUnremovedPaths([ORIGINAL, THUMBNAIL], [{ name: THUMBNAIL }, { name: ORIGINAL }])).toEqual([]);
  });
  it("every path when remove() deleted nothing (the RLS-filtered success case)", () => {
    expect(findUnremovedPaths([ORIGINAL, THUMBNAIL], [])).toEqual([ORIGINAL, THUMBNAIL]);
  });
  it("every path when remove() returned no data", () => {
    expect(findUnremovedPaths([ORIGINAL], null)).toEqual([ORIGINAL]);
    expect(findUnremovedPaths([ORIGINAL], undefined)).toEqual([ORIGINAL]);
  });
  it("only the missing path on a partial removal", () => {
    expect(findUnremovedPaths([ORIGINAL, THUMBNAIL], [{ name: ORIGINAL }])).toEqual([THUMBNAIL]);
  });
  it("duplicate requested paths are reported at most once", () => {
    expect(findUnremovedPaths([ORIGINAL, ORIGINAL], [])).toEqual([ORIGINAL]);
  });
});
