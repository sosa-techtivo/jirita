// Client-side read/write for a user's own email notification preferences
// (organization_memberships.email_immediate_enabled/email_digest_enabled/
// email_digest_frequency). Read via a plain select — organization_memberships
// already grants select to `authenticated` plus is_org_member RLS, and a
// profile reading its own row always passes that. Written via the
// update_own_email_preferences RPC, not a direct update — same reasoning
// as lib/membership.ts's updateOwnWeeklyCapacity: organization_memberships_update
// RLS is admin-only by design, so a plain member changing their own
// preferences needs the narrow security-definer function from
// 20260930040000_add_organization_membership_email_preferences.sql.

import { getSupabaseBrowserClient } from "./supabase-client";

export type EmailDigestFrequency = "1h" | "4h" | "8h" | "daily";

export interface OwnEmailPreferences {
  immediateEnabled: boolean;
  digestEnabled: boolean;
  digestFrequency: EmailDigestFrequency;
}

function logDev(...args: unknown[]): void {
  if (process.env.NODE_ENV !== "production") console.warn("[email-preferences]", ...args);
}

interface MembershipPreferencesRow {
  email_immediate_enabled: boolean;
  email_digest_enabled: boolean;
  email_digest_frequency: string;
}

export type LoadOwnEmailPreferencesResult =
  | { status: "ready"; preferences: OwnEmailPreferences }
  | { status: "error"; message: string };

export async function loadOwnEmailPreferences(profileId: string): Promise<LoadOwnEmailPreferencesResult> {
  const supabase = getSupabaseBrowserClient();

  const { data, error } = await supabase
    .from("organization_memberships")
    .select("email_immediate_enabled, email_digest_enabled, email_digest_frequency")
    .eq("profile_id", profileId)
    .eq("status", "active")
    .maybeSingle<MembershipPreferencesRow>();

  if (error) {
    logDev("load failed", error);
    return { status: "error", message: error.message };
  }
  if (!data) {
    return { status: "error", message: "No active membership found." };
  }

  return {
    status: "ready",
    preferences: {
      immediateEnabled: data.email_immediate_enabled,
      digestEnabled: data.email_digest_enabled,
      digestFrequency: data.email_digest_frequency as EmailDigestFrequency,
    },
  };
}

export type SaveOwnEmailPreferencesResult = { status: "success" } | { status: "error"; message: string };

export async function updateOwnEmailPreferences(preferences: OwnEmailPreferences): Promise<SaveOwnEmailPreferencesResult> {
  const supabase = getSupabaseBrowserClient();

  const { error } = await supabase.rpc("update_own_email_preferences", {
    new_immediate_enabled: preferences.immediateEnabled,
    new_digest_enabled: preferences.digestEnabled,
    new_digest_frequency: preferences.digestFrequency,
  });

  if (error) {
    logDev("update_own_email_preferences rpc failed", error);
    return { status: "error", message: error.message };
  }
  return { status: "success" };
}
