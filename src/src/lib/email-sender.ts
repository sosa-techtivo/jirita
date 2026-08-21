// The one canonical "From" identity for every email JIRITA's own system
// ever sends — a single source of truth so no call site (present or
// future) hardcodes this string itself.
//
// IMPORTANT — this constant does not, by itself, change what sender any
// email actually goes out as. The only real email-sending capability in
// this codebase today is Supabase Auth's own hosted email (used by
// resetPasswordForEmail in lib/auth.ts, and by inviteUserByEmail in
// lib/server/invite-user-action.ts — currently unreachable from the UI,
// see that file's own header comment). Supabase Auth has no per-call
// "from" parameter: every hosted Auth email uses whatever Sender
// Email/Sender Name is configured under Project Settings -> Authentication
// -> SMTP Settings (Custom SMTP) in the Supabase Dashboard — that setting
// cannot be changed from this repo, via a migration, or via an environment
// variable read by this app's own server. Until Custom SMTP is configured
// there with a real, domain-verified SMTP relay, Supabase Auth emails
// (Forgot Password today; Invite-by-email if ever re-enabled) continue
// going out from Supabase's own default shared sender, not this address.
//
// A plain exported constant, not an environment variable, since this
// value doesn't vary per deployment/environment and isn't a secret — it's
// fixed branding, same category as e.g. hours-report-branding.ts's own
// logo constant.
export const JIRITA_EMAIL_SENDER_ADDRESS = "alejo+no-reply@techtivo.com";
export const JIRITA_EMAIL_SENDER_NAME = "JIRITA";
export const JIRITA_EMAIL_SENDER = `${JIRITA_EMAIL_SENDER_NAME} <${JIRITA_EMAIL_SENDER_ADDRESS}>`;
