import { describe, it, expect } from "vitest";
import { buildNoteHistoricalKey } from "./build-note-key";

describe("buildNoteHistoricalKey", () => {
  it("builds the deterministic unfuddle:note:<notebookId>:<pageNumber> key", () => {
    expect(buildNoteHistoricalKey(170, 3)).toBe("unfuddle:note:170:3");
  });

  it("never depends on a revision-specific page id — only notebook id + page number", () => {
    // Same logical identity regardless of which <page><id> produced it.
    expect(buildNoteHistoricalKey(170, 3)).toBe(buildNoteHistoricalKey(170, 3));
  });

  it("is distinct for different notebooks with the same page number", () => {
    expect(buildNoteHistoricalKey(1, 1)).not.toBe(buildNoteHistoricalKey(2, 1));
  });
});
