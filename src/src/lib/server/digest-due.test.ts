import { describe, expect, it } from "vitest";
import { isDigestDue, type EmailDigestFrequency } from "./digest-due";

const NOW = new Date("2026-08-26T12:00:00.000Z");

function hoursAgo(hours: number): string {
  return new Date(NOW.getTime() - hours * 60 * 60 * 1000).toISOString();
}

describe("isDigestDue", () => {
  it("null lastSentAt is never due (the init case is handled separately by the caller)", () => {
    expect(isDigestDue({ frequency: "1h", lastSentAt: null, now: NOW })).toBe(false);
    expect(isDigestDue({ frequency: "daily", lastSentAt: null, now: NOW })).toBe(false);
  });

  describe("1h", () => {
    it("not due just under an hour", () => {
      expect(isDigestDue({ frequency: "1h", lastSentAt: hoursAgo(0.99), now: NOW })).toBe(false);
    });
    it("due at exactly an hour", () => {
      expect(isDigestDue({ frequency: "1h", lastSentAt: hoursAgo(1), now: NOW })).toBe(true);
    });
    it("due well past an hour", () => {
      expect(isDigestDue({ frequency: "1h", lastSentAt: hoursAgo(2), now: NOW })).toBe(true);
    });
  });

  describe("4h", () => {
    it("not due just under 4 hours", () => {
      expect(isDigestDue({ frequency: "4h", lastSentAt: hoursAgo(3.99), now: NOW })).toBe(false);
    });
    it("due at exactly 4 hours", () => {
      expect(isDigestDue({ frequency: "4h", lastSentAt: hoursAgo(4), now: NOW })).toBe(true);
    });
    it("due well past 4 hours", () => {
      expect(isDigestDue({ frequency: "4h", lastSentAt: hoursAgo(5), now: NOW })).toBe(true);
    });
  });

  describe("8h", () => {
    it("not due just under 8 hours", () => {
      expect(isDigestDue({ frequency: "8h", lastSentAt: hoursAgo(7.99), now: NOW })).toBe(false);
    });
    it("due at exactly 8 hours", () => {
      expect(isDigestDue({ frequency: "8h", lastSentAt: hoursAgo(8), now: NOW })).toBe(true);
    });
    it("due well past 8 hours", () => {
      expect(isDigestDue({ frequency: "8h", lastSentAt: hoursAgo(9), now: NOW })).toBe(true);
    });
  });

  describe("daily", () => {
    it("not due just under 24 hours", () => {
      expect(isDigestDue({ frequency: "daily", lastSentAt: hoursAgo(23.99), now: NOW })).toBe(false);
    });
    it("due at exactly 24 hours", () => {
      expect(isDigestDue({ frequency: "daily", lastSentAt: hoursAgo(24), now: NOW })).toBe(true);
    });
    it("due well past 24 hours", () => {
      expect(isDigestDue({ frequency: "daily", lastSentAt: hoursAgo(30), now: NOW })).toBe(true);
    });
  });

  it("an invalid frequency (bypassing TypeScript, e.g. from a runtime DB value) is never due, not a crash", () => {
    const bogus = "weekly" as EmailDigestFrequency;
    expect(isDigestDue({ frequency: bogus, lastSentAt: hoursAgo(999), now: NOW })).toBe(false);
  });

  it("an unparseable lastSentAt is never due, not a crash", () => {
    expect(isDigestDue({ frequency: "1h", lastSentAt: "not-a-date", now: NOW })).toBe(false);
  });
});
