// GET /api/cron/email-digest — the single entry point for the email digest
// worker (Fase 3B). Triggered hourly by a Supabase pg_cron + pg_net job
// (see 20260930060000_add_email_digest_cron_scheduler.sql), which simply
// calls this URL over plain HTTP — not by Vercel Cron (moved off it: the
// Hobby plan only allows once-daily schedules, incompatible with the
// 1h/4h/8h digest frequencies), and never by any in-app UI or user
// action.
//
// One worker, one schedule: this endpoint runs every hour and
// runEmailDigest() itself decides per-membership whether a digest is
// actually due (1h/4h/8h/daily) — there is deliberately no separate
// cron entry per frequency.
//
// Security: the calling job sends `Authorization: Bearer ${CRON_SECRET}`
// (the Supabase pg_cron job reads that value from Supabase Vault at run
// time — see the migration above for exactly how). Fails CLOSED — if
// CRON_SECRET isn't configured at all, every request is rejected rather
// than accepted unauthenticated; a misconfigured deployment must never be
// able to fan out real emails to anyone who finds this URL. This check
// itself is unchanged from before the trigger moved off Vercel Cron —
// it's a plain bearer-token comparison, indifferent to who calls it.
import { NextResponse, type NextRequest } from "next/server";
import { runEmailDigest } from "@/lib/server/run-email-digest";

export const runtime = "nodejs";

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization");
  return header === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const summary = await runEmailDigest();
    return NextResponse.json({ status: "completed", ...summary });
  } catch (error) {
    // Never include the raw error object (could carry Supabase/SendGrid
    // response internals) — only a plain message, same convention as
    // every other server module's logging in this codebase.
    const message = error instanceof Error ? error.message : "Unknown error.";
    console.error("[email-digest] run-failed", message);
    return NextResponse.json({ status: "error", message }, { status: 500 });
  }
}
