import { describe, it, expect } from "vitest";
import { resolveApplyAuthorization } from "./resolve-apply-authorization";

describe("resolveApplyAuthorization", () => {
  it("H: --apply without --confirm-allowlisted-28 is blocked before any write path", () => {
    const result = resolveApplyAuthorization(true, false);
    expect(result.authorized).toBe(false);
    expect(result.blocked).toBe(true);
    expect(result.usageError).toBe(false);
    expect(result.message).toMatch(/confirm-allowlisted-28/);
  });

  it("I: --confirm-allowlisted-28 without --apply is a usage error, never a write path", () => {
    const result = resolveApplyAuthorization(false, true);
    expect(result.authorized).toBe(false);
    expect(result.blocked).toBe(false);
    expect(result.usageError).toBe(true);
    expect(result.message).toMatch(/Usage/);
  });

  it("authorizes only when BOTH flags are present", () => {
    const result = resolveApplyAuthorization(true, true);
    expect(result.authorized).toBe(true);
    expect(result.blocked).toBe(false);
    expect(result.usageError).toBe(false);
    expect(result.message).toBeNull();
  });

  it("neither flag is a normal PREVIEW — not blocked, not a usage error", () => {
    const result = resolveApplyAuthorization(false, false);
    expect(result.authorized).toBe(false);
    expect(result.blocked).toBe(false);
    expect(result.usageError).toBe(false);
  });
});
