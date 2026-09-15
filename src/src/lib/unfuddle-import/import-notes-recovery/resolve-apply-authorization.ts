/**
 * The two-flag human-authorization gate for APPLY, per this task's
 * explicit requirement — replaces the prior task's temporary unconditional
 * --apply block with something that still can't fire by accident.
 *
 *   --apply alone                          -> blocked, clear message, no write
 *   --confirm-allowlisted-28 alone         -> usage error, no write
 *   --apply --confirm-allowlisted-28       -> authorized to proceed to preflight/write
 *   neither                                -> PREVIEW (not an error)
 *
 * A pure function — checked before the XML is read or Supabase is
 * contacted, so it can be unit-tested without any I/O.
 */
export interface ApplyAuthorizationResult {
  /** true only when both flags are present — the sole path to proceeding toward a write. */
  authorized: boolean;
  /** --apply was requested without confirmation — must abort before any write. */
  blocked: boolean;
  /** --confirm-allowlisted-28 was passed without --apply — a usage error, never a write path. */
  usageError: boolean;
  message: string | null;
}

export function resolveApplyAuthorization(apply: boolean, confirmAllowlisted28: boolean): ApplyAuthorizationResult {
  if (apply && !confirmAllowlisted28) {
    return {
      authorized: false,
      blocked: true,
      usageError: false,
      message: "APPLY requires --confirm-allowlisted-28 as well — refusing to proceed without explicit confirmation of the 28-Note allowlisted scope.",
    };
  }
  if (confirmAllowlisted28 && !apply) {
    return {
      authorized: false,
      blocked: false,
      usageError: true,
      message:
        "Usage: --confirm-allowlisted-28 has no effect without --apply. Pass both --apply --confirm-allowlisted-28 together to run APPLY (only once explicitly authorized), or neither for PREVIEW.",
    };
  }
  if (apply && confirmAllowlisted28) {
    return { authorized: true, blocked: false, usageError: false, message: null };
  }
  return { authorized: false, blocked: false, usageError: false, message: null };
}
