// Server-only. Centralized read of a recipient's email notification
// preferences (organization_memberships.email_immediate_enabled/
// email_digest_enabled/email_digest_frequency/email_digest_last_sent_at)
// — the one place that reads these columns for the immediate-email
// pipeline (notification-email.ts) and, later, a digest worker (Fase 3B —
// not built yet; see the migration's own note on email_digest_last_sent_at
// never triggering anything on its own). Never import this from a
// "use client" file — same window guard as every other server-only module
// in this directory.

import type { SupabaseClient } from "@supabase/supabase-js";

if (typeof window !== "undefined") {
  throw new Error("email-preferences.ts must never be imported by client-side code.");
}

export type EmailDigestFrequency = "1h" | "4h" | "8h" | "daily";

export interface RecipientEmailPreferences {
  immediateEnabled: boolean;
  digestEnabled: boolean;
  digestFrequency: EmailDigestFrequency;
  digestLastSentAt: string | null;
}

interface MembershipPreferencesRow {
  email_immediate_enabled: boolean;
  email_digest_enabled: boolean;
  email_digest_frequency: string;
  email_digest_last_sent_at: string | null;
}

// Returns null when no active membership row exists for this
// profile/organization — callers must treat that as "preferences could
// not be resolved," never as "every preference is false." The immediate-
// email caller (notification-email.ts) already does the right thing with
// that: skip the email, log a warning, never touch the in-app notification
// that already exists.
export async function getEmailPreferencesForRecipient(
  admin: SupabaseClient,
  profileId: string,
  organizationId: string
): Promise<RecipientEmailPreferences | null> {
  const { data, error } = await admin
    .from("organization_memberships")
    .select("email_immediate_enabled, email_digest_enabled, email_digest_frequency, email_digest_last_sent_at")
    .eq("profile_id", profileId)
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .maybeSingle<MembershipPreferencesRow>();

  if (error || !data) return null;

  return {
    immediateEnabled: data.email_immediate_enabled,
    digestEnabled: data.email_digest_enabled,
    digestFrequency: data.email_digest_frequency as EmailDigestFrequency,
    digestLastSentAt: data.email_digest_last_sent_at,
  };
}
