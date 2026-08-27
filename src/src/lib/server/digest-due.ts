// Server-only. Pure, dependency-free decision of whether a membership's
// digest is due right now — no DB access, no Date.now() call inside (the
// caller always passes `now` explicitly), so this is trivially unit
// testable without waiting real hours or faking global time. See
// digest-due.test.ts.
//
// V1 keeps this deliberately simple, per Fase 3B's own scope: "daily"
// means "every ~24 hours since the last digest," not a fixed wall-clock
// time (e.g. always 8am) — that's a possible future refinement, not this
// phase's job.

if (typeof window !== "undefined") {
  throw new Error("digest-due.ts must never be imported by client-side code.");
}

export type EmailDigestFrequency = "1h" | "4h" | "8h" | "daily";

const FREQUENCY_INTERVAL_MS: Record<EmailDigestFrequency, number> = {
  "1h": 1 * 60 * 60 * 1000,
  "4h": 4 * 60 * 60 * 1000,
  "8h": 8 * 60 * 60 * 1000,
  daily: 24 * 60 * 60 * 1000,
};

export interface IsDigestDueInput {
  frequency: EmailDigestFrequency;
  /** Null means "never sent" — callers handle that as a separate init case, not by calling this. */
  lastSentAt: string | null;
  now: Date;
}

// Returns false for a null lastSentAt — that's intentional: the "first
// ever cycle" case (email_digest_last_sent_at IS NULL) is handled by the
// caller as its own baseline-initialization branch, before this function
// is even consulted (see run-email-digest.ts). This function only ever
// answers "has at least one full interval elapsed since a real last send."
export function isDigestDue(input: IsDigestDueInput): boolean {
  if (!input.lastSentAt) return false;

  const intervalMs = FREQUENCY_INTERVAL_MS[input.frequency];
  if (!intervalMs) return false;

  const lastSentMs = new Date(input.lastSentAt).getTime();
  if (Number.isNaN(lastSentMs)) return false;

  return input.now.getTime() - lastSentMs >= intervalMs;
}
