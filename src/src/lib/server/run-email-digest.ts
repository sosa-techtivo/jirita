// Server-only. The single periodic digest worker (Fase 3B) — one run scans
// every organization_membership with email_digest_enabled = true and
// status = 'active', and for each one that's actually due (per its own
// email_digest_frequency), sends exactly one digest email covering
// everything still unread since its own email_digest_last_sent_at.
//
// Reached only via /api/cron/email-digest's Route Handler, the sole place
// that authenticates the caller (CRON_SECRET) — this module has no auth
// concept of its own and must never be reachable from anywhere else. No
// per-frequency cron jobs: this one worker decides, per membership,
// whether it's due right now (see digest-due.ts).

import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isDigestDue, type EmailDigestFrequency } from "./digest-due";
import { loadUnreadNotificationsForDigest } from "./digest-notifications-query";
import { buildDigestEmail } from "./digest-email";
import { getAppBaseUrl } from "./app-base-url";
import { sendTransactionalEmail } from "../email-sender";

if (typeof window !== "undefined") {
  throw new Error("run-email-digest.ts must never be imported by client-side code.");
}

function requireSupabaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL.");
  return url;
}

function getAdminClient(): SupabaseClient {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error(
      "Missing Supabase server environment variables. Set SUPABASE_SERVICE_ROLE_KEY (see .env.example)."
    );
  }
  return createClient(requireSupabaseUrl(), serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// Never logs a raw error object, notification content, or recipient email
// — only a plain message plus (where useful) a membership id, matching
// every other server module's logging convention in this codebase.
function logDigestWarning(operation: string, detail?: unknown): void {
  const message = detail instanceof Error ? detail.message : detail;
  console.warn(`[email-digest] ${operation}`, message ?? "");
}

interface MembershipRow {
  id: string;
  organization_id: string;
  profile_id: string;
  email_digest_frequency: string;
  email_digest_last_sent_at: string | null;
}

export interface EmailDigestRunSummary {
  membershipsChecked: number;
  due: number;
  initialized: number;
  sent: number;
  empty: number;
  failed: number;
}

// Concurrency strategy (no new column): atomically claims one membership's
// digest cycle by advancing email_digest_last_sent_at to `nowIso` in a
// single UPDATE, guarded by comparing against the exact value this run
// read moments ago (or IS NULL, for first-ever initialization). Only the
// caller whose compare-and-swap actually matches gets `true` back and
// proceeds; a second, overlapping worker run reading the same membership
// loses this race and simply skips it for the cycle — it can never also
// send. This is the "optimistic update with comparison" option from Fase
// 3B's own list of acceptable strategies, chosen because it needs no new
// state beyond the column that already exists.
async function claimMembershipCycle(
  admin: SupabaseClient,
  membershipId: string,
  previousLastSentAt: string | null,
  nowIso: string
): Promise<boolean> {
  let query = admin
    .from("organization_memberships")
    .update({ email_digest_last_sent_at: nowIso })
    .eq("id", membershipId);
  query =
    previousLastSentAt === null
      ? query.is("email_digest_last_sent_at", null)
      : query.eq("email_digest_last_sent_at", previousLastSentAt);

  const { data, error } = await query.select("id");
  if (error) {
    logDigestWarning("claim-failed", error);
    return false;
  }
  return (data ?? []).length > 0;
}

// Undoes a successful claim when the actual send afterward failed (Case
// D: SendGrid/lookup failure -> last_sent_at must NOT advance, so the next
// hourly run retries this membership). Guarded by comparing against the
// exact `nowIso` this same call just set, so a revert can never clobber a
// value some other process wrote in between.
async function revertClaim(
  admin: SupabaseClient,
  membershipId: string,
  previousLastSentAt: string | null,
  nowIso: string
): Promise<void> {
  const { error } = await admin
    .from("organization_memberships")
    .update({ email_digest_last_sent_at: previousLastSentAt })
    .eq("id", membershipId)
    .eq("email_digest_last_sent_at", nowIso);
  if (error) logDigestWarning("revert-claim-failed", error);
}

async function processMembership(
  admin: SupabaseClient,
  membership: MembershipRow,
  nowIso: string,
  now: Date,
  appUrl: string | null,
  summary: EmailDigestRunSummary
): Promise<void> {
  const frequency = membership.email_digest_frequency as EmailDigestFrequency;
  const previousLastSentAt = membership.email_digest_last_sent_at;

  // Case A — first-ever cycle: initialize the baseline, send nothing.
  // Never touches historical notifications; the next real cycle uses
  // `nowIso` (set here) as its own baseline.
  if (previousLastSentAt === null) {
    const claimed = await claimMembershipCycle(admin, membership.id, null, nowIso);
    if (claimed) summary.initialized += 1;
    return;
  }

  if (!isDigestDue({ frequency, lastSentAt: previousLastSentAt, now })) return;

  summary.due += 1;

  const claimed = await claimMembershipCycle(admin, membership.id, previousLastSentAt, nowIso);
  if (!claimed) return; // lost the race to another run for this exact membership/cycle

  try {
    // Canonical recipient email — resolved server-side from profiles,
    // same rule notification-email.ts already uses for immediate email.
    // A membership with no resolvable email is treated like a send
    // failure (Case D): revert, retry next cycle, never guess.
    const { data: profile } = await admin
      .from("profiles")
      .select("email")
      .eq("id", membership.profile_id)
      .maybeSingle<{ email: string | null }>();
    const recipientEmail = profile?.email?.trim();
    if (!recipientEmail) {
      logDigestWarning("recipient-has-no-email", membership.id);
      await revertClaim(admin, membership.id, previousLastSentAt, nowIso);
      summary.failed += 1;
      return;
    }

    const { notifications, totalUnreadCount } = await loadUnreadNotificationsForDigest(
      admin,
      membership.profile_id,
      membership.organization_id,
      previousLastSentAt
    );

    // Case B — due but nothing unread: no email, but last_sent_at was
    // already advanced by the successful claim above, which is exactly
    // right here — this is what stops the same empty window from being
    // re-checked forever.
    if (totalUnreadCount === 0) {
      summary.empty += 1;
      return;
    }

    // Case C — due, unread items exist: build once, one email, then done.
    const content = await buildDigestEmail({ admin, notifications, totalUnreadCount, appUrl });
    await sendTransactionalEmail({
      to: recipientEmail,
      subject: content.subject,
      text: content.text,
      html: content.html,
    });
    summary.sent += 1;
  } catch (error) {
    // Case D — SendGrid (or any other step past the claim) failed: revert
    // the claim so this membership is retried on the next hourly run,
    // rather than silently skipped until its next full interval.
    logDigestWarning("send-failed", error);
    await revertClaim(admin, membership.id, previousLastSentAt, nowIso);
    summary.failed += 1;
  }
}

// One run: scan -> process each due/uninitialized membership -> log one
// safe summary line. Never throws past this — a per-membership failure is
// caught and counted, never allowed to abort the rest of the run.
export async function runEmailDigest(): Promise<EmailDigestRunSummary> {
  const admin = getAdminClient();
  const now = new Date();
  const nowIso = now.toISOString();
  const appUrl = getAppBaseUrl();

  const summary: EmailDigestRunSummary = {
    membershipsChecked: 0,
    due: 0,
    initialized: 0,
    sent: 0,
    empty: 0,
    failed: 0,
  };

  const { data: memberships, error } = await admin
    .from("organization_memberships")
    .select("id, organization_id, profile_id, email_digest_frequency, email_digest_last_sent_at")
    .eq("status", "active")
    .eq("email_digest_enabled", true)
    .returns<MembershipRow[]>();

  if (error) {
    logDigestWarning("membership-scan-failed", error);
    return summary;
  }

  summary.membershipsChecked = (memberships ?? []).length;

  // Sequential, not Promise.all — this is an hourly batch job with a
  // small membership count (single-tenant app), not a latency-sensitive
  // request; sequential processing keeps SendGrid calls naturally
  // throttled (see Fase 3B's own trial-limit concern) rather than firing
  // a burst of concurrent sends.
  for (const membership of memberships ?? []) {
    await processMembership(admin, membership, nowIso, now, appUrl, summary);
  }

  console.info("[email-digest] completed", summary);
  return summary;
}
