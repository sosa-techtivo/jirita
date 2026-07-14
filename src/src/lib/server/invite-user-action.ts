"use server";

// Server Action — the only place SUPABASE_SERVICE_ROLE_KEY is ever read.
// "use server" guarantees Next.js never bundles this module (or the env
// var reads inside it) into client JS; combined with the key not being
// NEXT_PUBLIC_-prefixed, it's unreachable from the browser by construction,
// not just by convention.
//
// There's no cookie-based SSR session in this app (no @supabase/ssr,
// no middleware — every existing real data call already goes straight from
// a "use client" component to the browser Supabase client). So identity is
// established the way any other authenticated write in this app already
// proves who's calling: the browser's own access token, passed in as a
// parameter (see src/lib/users.ts's inviteOrganizationUser /
// generateOrganizationInviteLink, which read it from
// getSupabaseBrowserClient().auth.getSession() before calling into here).
//
// Two distinct clients, used for two distinct purposes — this is the fix
// for "Could not verify your permissions.": identification + authorization
// must run as the caller (getCallerClient below: anon key + the caller's
// own bearer token), so organization_memberships' real RLS
// (organization_memberships_select: is_org_member) is what decides whether
// a row is visible — never the all-access service-role client. Service
// role (getAdminClient) is constructed and used only *after* that
// authorization has already succeeded, and only for the privileged writes
// an ordinary member could never do on someone else's behalf (sending the
// invite email or generating an invite link, writing another person's
// profiles/organization_memberships rows).
//
// Two ways to invite share everything except the last step:
// inviteUserAction sends a real email via inviteUserByEmail;
// generateInviteLinkAction never sends mail — it uses generateLink to mint
// a single-use token and hands the admin a JIRITA-domain URL to copy
// instead. Both funnel through prepareInvite (validation + auth +
// idempotency) and finalizeInviteRecords (profiles/organization_memberships
// writes) so the two flows can never drift on what counts as a duplicate,
// who's allowed to invite, or what gets written.

import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient, User as SupabaseAuthUser } from "@supabase/supabase-js";
import type { Role } from "@/lib/current-user";

export type InviteUserResult = { status: "success" } | { status: "error"; message: string };
export type GenerateInviteLinkResult =
  | { status: "success"; inviteLink: string }
  | { status: "error"; message: string };
export type GeneratePasswordResetLinkResult =
  | { status: "success"; resetLink: string }
  | { status: "error"; message: string };

const ROLE_TO_DB: Record<Role, string> = {
  ADMIN: "admin",
  PROJECT_LEAD: "project_lead",
  MEMBER: "member",
};

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Never logs params/tokens/keys — only the operation that failed plus an
// upstream error's own code/status/message/details/hint. These are all
// plain Postgres/PostgREST error metadata (e.g. {code:"42501",
// message:"permission denied for table profiles", hint:"Grant the
// required privileges..."}) — never a token or secret. details/hint are
// what actually diagnosed a real production bug here (a missing
// service_role GRANT — see 20260806000000_grant_service_role_public_schema.sql),
// so they stay in the permanent, safe logging rather than a throwaway
// temporary block.
function logServerError(operation: string, detail?: unknown): void {
  if (!detail) {
    console.error(`[invite-user] ${operation}`);
    return;
  }
  const err = detail instanceof Error
    ? { message: detail.message }
    : (detail as {
        message?: string;
        code?: string | number;
        status?: number;
        details?: string | null;
        hint?: string | null;
      });
  console.error(`[invite-user] ${operation}`, {
    code: "code" in err ? err.code : undefined,
    status: "status" in err ? err.status : undefined,
    message: err.message,
    details: "details" in err ? err.details : undefined,
    hint: "hint" in err ? err.hint : undefined,
  });
}

function requireSupabaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL.");
  return url;
}

// Public app URL used to build the "Generate invite link" link — deliberately
// never Supabase's own domain (see GenerateLinkProperties.action_link, which
// points at the Supabase project itself and is never used for the copyable
// link below). Only read by generateInviteLinkAction; inviteUserAction's
// email redirect keeps using the caller's own origin exactly as before.
function requireAppUrl(): string {
  const url = process.env.NEXT_PUBLIC_APP_URL;
  if (!url) throw new Error("Missing NEXT_PUBLIC_APP_URL.");
  return url.replace(/\/+$/, "");
}

// Authenticated-as-the-caller client — identification + authorization only,
// never a privileged write. Uses the anon key (same one the browser already
// uses) with the caller's own access token as the request Authorization
// header, so every query runs under Postgres role `authenticated` with
// auth.uid() = the real caller, exactly like a request from their own
// browser session would.
function getCallerClient(accessToken: string): SupabaseClient {
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!anonKey) throw new Error("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  return createClient(requireSupabaseUrl(), anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
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

function isAlreadyRegisteredError(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  if (error.code === "email_exists") return true;
  return /already registered|already exists/i.test(error.message ?? "");
}

// Admin API has no direct "get user by email" — page through listUsers.
// Fine at this app's scale (a single internal workspace), and only ever
// reached on the rare retry-after-partial-failure path below, never the
// common invite path.
async function findAuthUserByEmail(admin: SupabaseClient, email: string): Promise<SupabaseAuthUser | null> {
  const perPage = 200;
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error || !data) return null;
    const found = data.users.find((u) => u.email?.toLowerCase() === email);
    if (found) return found;
    if (data.users.length < perPage) return null;
  }
}

type PreparedInvite =
  | { status: "error"; message: string }
  | {
      status: "ready";
      admin: SupabaseClient;
      firstName: string;
      lastName: string;
      email: string;
      weeklyCapacity: number;
    };

// Shared by both invite methods: field validation, caller identity, admin
// authorization (active org admin only), and the "is this email already a
// pending/active member of this org" idempotency check. Returns a ready
// admin (service-role) client once all of that has passed — neither flow
// escalates to service role before authorization succeeds.
async function prepareInvite(params: {
  accessToken: string;
  organizationId: string;
  firstName: string;
  lastName: string;
  email: string;
  weeklyCapacity: number;
}): Promise<PreparedInvite> {
  const firstName = params.firstName.trim();
  const lastName = params.lastName.trim();
  const email = params.email.trim().toLowerCase();
  const weeklyCapacity = Math.min(168, Math.max(0, Math.round(params.weeklyCapacity)));

  if (!firstName || !lastName || !email) {
    return { status: "error", message: "First name, last name, and email are required." };
  }
  if (!isValidEmail(email)) {
    return { status: "error", message: "Enter a valid email address." };
  }
  if (!params.organizationId) {
    logServerError("org-not-resolved");
    return { status: "error", message: "Could not verify your permissions." };
  }

  let caller: SupabaseClient;
  try {
    caller = getCallerClient(params.accessToken);
  } catch (err) {
    logServerError("caller-client-init-failed", err);
    return { status: "error", message: "Could not verify your permissions." };
  }

  // Identity: who is actually calling this, independent of anything the
  // client claims. getUser(token) verifies the token itself against
  // GoTrue — it doesn't depend on any session state on `caller`.
  const { data: callerData, error: callerAuthError } = await caller.auth.getUser(params.accessToken);
  if (callerAuthError) {
    logServerError("no-session", callerAuthError);
    return { status: "error", message: "Your session has expired. Please sign in again." };
  }
  if (!callerData.user) {
    logServerError("user-not-found");
    return { status: "error", message: "Your session has expired. Please sign in again." };
  }

  // Authorization: queried *as the caller* (Postgres role `authenticated`,
  // auth.uid() = callerData.user.id), so organization_memberships_select's
  // real RLS (is_org_member) is the thing deciding what's visible — not a
  // service-role client that would see every organization's rows
  // regardless of who's asking. A caller who isn't a member of
  // organizationId at all simply gets no row back here, the same as
  // querying it from their own browser session would.
  const { data: callerMembership, error: callerMembershipError } = await caller
    .from("organization_memberships")
    .select("role, status")
    .eq("organization_id", params.organizationId)
    .eq("profile_id", callerData.user.id)
    .maybeSingle();

  if (callerMembershipError) {
    logServerError("caller-membership-lookup", callerMembershipError);
    return { status: "error", message: "Could not verify your permissions." };
  }
  if (!callerMembership) {
    logServerError("membership-not-found");
    return { status: "error", message: "Only active organization admins can invite users." };
  }
  if (callerMembership.role !== "admin" || callerMembership.status !== "active") {
    logServerError("role-not-authorized");
    return { status: "error", message: "Only active organization admins can invite users." };
  }

  // Only now — authorization already proven above — escalate to service
  // role for the privileged operations an ordinary member could never do
  // on someone else's behalf.
  let admin: SupabaseClient;
  try {
    admin = getAdminClient();
  } catch (err) {
    logServerError("admin-client-init-failed", err);
    return { status: "error", message: "Server configuration error." };
  }

  // Idempotency: does this email already belong to this org (any status),
  // checked against JIRITA's own tables — never auth.users, never
  // listUsers(). email is already trim()+toLowerCase()'d above, and
  // profiles.email is written lowercase by finalizeInviteRecords below, so
  // a plain equality match is reliable for anything this flow itself
  // created. Uses an array select + take-first rather than maybeSingle():
  // profiles.email has no unique constraint in the schema, so a duplicate
  // row (however it got there) must not turn a legitimate lookup into a
  // thrown "multiple rows" error.
  const { data: existingProfileRows, error: existingProfileError } = await admin
    .from("profiles")
    .select("id")
    .eq("email", email)
    .limit(1);

  if (existingProfileError) {
    logServerError("profiles-email-lookup", existingProfileError);
    return { status: "error", message: "Could not check for an existing account." };
  }

  const existingProfile = existingProfileRows?.[0] ?? null;

  // organization_id + profile_id is the table's real unique constraint, so
  // maybeSingle() here can never see more than one row.
  if (existingProfile) {
    const { data: existingMembership, error: existingMembershipError } = await admin
      .from("organization_memberships")
      .select("status")
      .eq("organization_id", params.organizationId)
      .eq("profile_id", existingProfile.id)
      .maybeSingle();

    if (existingMembershipError) {
      logServerError("org-membership-lookup-for-existing-profile", existingMembershipError);
      return { status: "error", message: "Could not check for an existing membership." };
    }
    if (existingMembership) {
      // active or disabled: already a member either way. invited: a
      // pending invite already exists. Either way, stop here — no write,
      // no invite of either kind.
      return {
        status: "error",
        message:
          existingMembership.status === "invited"
            ? "An invitation is already pending for this email."
            : "This user already belongs to the organization.",
      };
    }
    // A profiles row exists but not in *this* org (e.g. invited to another
    // organization previously) — not a duplicate for this org, so this
    // falls through to the normal invite flow below like any other email.
  }

  return { status: "ready", admin, firstName, lastName, email, weeklyCapacity };
}

// Completes the profiles + organization_memberships rows once an auth.users
// account exists (whether just created by inviteUserByEmail/generateLink, or
// recovered from a prior partial failure). Shared by both invite methods —
// neither one ever writes these rows a different way.
async function finalizeInviteRecords(
  admin: SupabaseClient,
  invitedUserId: string,
  firstName: string,
  lastName: string,
  email: string,
  organizationId: string,
  role: Role,
  weeklyCapacity: number
): Promise<{ status: "error"; message: string } | null> {
  // Never overwrites an unrelated existing profile (onConflict targets this
  // exact id, which is either brand new from the invite/link above or the
  // recovered account from the retry path).
  const { error: profileError } = await admin
    .from("profiles")
    .upsert({ id: invitedUserId, first_name: firstName, last_name: lastName, email }, { onConflict: "id" });

  if (profileError) {
    logServerError("profile-upsert", profileError);
    return { status: "error", message: `The profile couldn't be saved: ${profileError.message}` };
  }

  // Workspace membership only — never project_memberships, never touching
  // the inviting admin's own row.
  const { error: membershipError } = await admin.from("organization_memberships").insert({
    organization_id: organizationId,
    profile_id: invitedUserId,
    role: ROLE_TO_DB[role],
    status: "invited",
    weekly_capacity: weeklyCapacity,
  });

  if (membershipError) {
    // 23505 = unique_violation on (organization_id, profile_id) — a
    // concurrent retry already created it. The desired end state already
    // exists, so this isn't a real failure.
    if (membershipError.code !== "23505") {
      logServerError("org-membership-insert", membershipError);
      return { status: "error", message: `The workspace membership couldn't be saved: ${membershipError.message}` };
    }
  }

  return null;
}

export async function inviteUserAction(params: {
  accessToken: string;
  organizationId: string;
  redirectOrigin: string;
  firstName: string;
  lastName: string;
  email: string;
  role: Role;
  weeklyCapacity: number;
}): Promise<InviteUserResult> {
  const prepared = await prepareInvite(params);
  if (prepared.status === "error") return prepared;
  const { admin, firstName, lastName, email, weeklyCapacity } = prepared;

  // A profiles row with no matching organization_memberships row (the
  // fallthrough in prepareInvite) may or may not still have a real
  // auth.users account — rather than pre-checking Auth with listUsers()
  // (which has no email filter) or querying auth.users directly (not
  // exposed via PostgREST), this relies on inviteUserByEmail's own
  // response: it succeeds for a genuinely new email, and fails with an
  // "already registered"-shaped error for one that already has an auth
  // account, which is handled explicitly right below.
  const redirectTo = `${params.redirectOrigin}/accept-invite`;
  let invitedUserId: string;

  const { data: inviteData, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo,
    data: { first_name: firstName, last_name: lastName },
  });

  if (inviteError) {
    if (isAlreadyRegisteredError(inviteError)) {
      // Auth account exists but isn't tied to this org yet (or a prior
      // invite attempt got this far and then failed before the
      // profiles/organization_memberships writes below) — reuse that
      // account's id instead of erroring, so this converges to the same
      // end state on a retry rather than getting stuck.
      logServerError("invite-user-by-email:already-registered", inviteError);
      const recovered = await findAuthUserByEmail(admin, email);
      if (!recovered) {
        logServerError("find-auth-user-by-email:not-found");
        return {
          status: "error",
          message: "A user with this email already exists, but their account couldn't be found.",
        };
      }
      invitedUserId = recovered.id;
    } else {
      // A genuinely unexpected Auth error (rate limit, invalid email
      // rejected by GoTrue, provider misconfiguration, etc.) — full detail
      // goes to the server log; the user gets a general message rather
      // than a raw upstream string.
      logServerError("invite-user-by-email", inviteError);
      return { status: "error", message: "Could not send the invitation. Please try again." };
    }
  } else if (inviteData?.user) {
    invitedUserId = inviteData.user.id;
  } else {
    logServerError("invite-user-by-email:no-user-returned");
    return { status: "error", message: "Could not send the invitation. Please try again." };
  }

  const finalizeError = await finalizeInviteRecords(
    admin,
    invitedUserId,
    firstName,
    lastName,
    email,
    params.organizationId,
    params.role,
    weeklyCapacity
  );
  if (finalizeError) {
    return { status: "error", message: `Invitation sent, but ${finalizeError.message.charAt(0).toLowerCase()}${finalizeError.message.slice(1)}` };
  }

  return { status: "success" };
}

// Mints a single-use invite link instead of sending mail. generateLink
// (unlike inviteUserByEmail) never sends anything — it only creates the
// pending auth.users row and hands back a hashed_token, which is exactly
// what "Generate invite link" needs. The token is single-use and expires
// per the project's configured Auth settings, both enforced by GoTrue
// itself. The link handed back to the admin is built from NEXT_PUBLIC_APP_URL
// + the token — never GenerateLinkProperties.action_link, which points at
// the Supabase project's own domain — so a copied link always starts with
// JIRITA's own URL. Opening it lands on /accept-invite, which calls
// verifyOtp with this same token_hash to establish the session and then
// continues through the exact same "set your password" flow as the email
// invite.
export async function generateInviteLinkAction(params: {
  accessToken: string;
  organizationId: string;
  firstName: string;
  lastName: string;
  email: string;
  role: Role;
  weeklyCapacity: number;
}): Promise<GenerateInviteLinkResult> {
  const prepared = await prepareInvite(params);
  if (prepared.status === "error") return prepared;
  const { admin, firstName, lastName, email, weeklyCapacity } = prepared;

  let appUrl: string;
  try {
    appUrl = requireAppUrl();
  } catch (err) {
    logServerError("app-url-missing", err);
    return { status: "error", message: "Server configuration error." };
  }
  const redirectTo = `${appUrl}/accept-invite`;
  const linkData = { data: { first_name: firstName, last_name: lastName } };

  let invitedUserId: string;
  let result = await admin.auth.admin.generateLink({
    type: "invite",
    email,
    options: { redirectTo, ...linkData },
  });

  if (result.error) {
    if (isAlreadyRegisteredError(result.error)) {
      // Same retry-after-partial-failure case as inviteUserAction, except a
      // link — not just the record writes — must still be produced here.
      // "invite" can't relink an account GoTrue already knows about, so
      // magiclink is used instead: it works for any existing, unconfirmed
      // account and is just as single-use/expiring.
      logServerError("generate-link:already-registered", result.error);
      const recovered = await findAuthUserByEmail(admin, email);
      if (!recovered) {
        logServerError("find-auth-user-by-email:not-found");
        return {
          status: "error",
          message: "A user with this email already exists, but their account couldn't be found.",
        };
      }
      invitedUserId = recovered.id;
      result = await admin.auth.admin.generateLink({
        type: "magiclink",
        email,
        options: { redirectTo, ...linkData },
      });
      if (result.error) {
        logServerError("generate-link:magiclink-fallback", result.error);
        return { status: "error", message: "Could not generate the invite link. Please try again." };
      }
    } else {
      logServerError("generate-link", result.error);
      return { status: "error", message: "Could not generate the invite link. Please try again." };
    }
  } else if (result.data?.user) {
    invitedUserId = result.data.user.id;
  } else {
    logServerError("generate-link:no-user-returned");
    return { status: "error", message: "Could not generate the invite link. Please try again." };
  }

  const properties = result.data?.properties;
  if (!properties) {
    logServerError("generate-link:no-properties-returned");
    return { status: "error", message: "Could not generate the invite link. Please try again." };
  }

  const finalizeError = await finalizeInviteRecords(
    admin,
    invitedUserId,
    firstName,
    lastName,
    email,
    params.organizationId,
    params.role,
    weeklyCapacity
  );
  if (finalizeError) return finalizeError;

  const inviteLink = `${appUrl}/accept-invite?token_hash=${encodeURIComponent(properties.hashed_token)}&type=${encodeURIComponent(properties.verification_type)}`;
  return { status: "success", inviteLink };
}

// "Reset Password" (Users → row menu, Active users only) — mints a
// single-use password recovery link instead of sending mail, the same
// generateLink + NEXT_PUBLIC_APP_URL + token_hash mechanics as
// generateInviteLinkAction above, just type: "recovery" and a different
// destination route. Deliberately doesn't go through prepareInvite: that
// function's whole job is deciding whether a *new* invite would collide
// with an existing profile/membership, which doesn't apply here — the
// target is expected to already be a real member of this org, so
// authorization only needs "caller is an active admin of this org" +
// "target belongs to this org" (the same shape disable-user-action.ts's
// setMembershipStatusAction already uses for Disable/Enable), not an
// idempotency check. No profile/membership row is read or written here —
// this only ever touches Supabase Auth, and only for the one account the
// link is generated for.
export async function generatePasswordResetLinkAction(params: {
  accessToken: string;
  organizationId: string;
  targetProfileId: string;
}): Promise<GeneratePasswordResetLinkResult> {
  if (!params.organizationId || !params.targetProfileId) {
    logServerError("missing-params");
    return { status: "error", message: "Could not verify your permissions." };
  }

  let caller: SupabaseClient;
  try {
    caller = getCallerClient(params.accessToken);
  } catch (err) {
    logServerError("caller-client-init-failed", err);
    return { status: "error", message: "Could not verify your permissions." };
  }

  const { data: callerData, error: callerAuthError } = await caller.auth.getUser(params.accessToken);
  if (callerAuthError || !callerData.user) {
    logServerError("no-session", callerAuthError);
    return { status: "error", message: "Your session has expired. Please sign in again." };
  }

  // Authorization: queried *as the caller*, so organization_memberships_select's
  // real RLS (is_org_member) decides what's visible — never the service-role
  // client. Only an active admin of this exact organization may proceed.
  const { data: callerMembership, error: callerMembershipError } = await caller
    .from("organization_memberships")
    .select("role, status")
    .eq("organization_id", params.organizationId)
    .eq("profile_id", callerData.user.id)
    .maybeSingle();

  if (callerMembershipError) {
    logServerError("caller-membership-lookup", callerMembershipError);
    return { status: "error", message: "Could not verify your permissions." };
  }
  if (!callerMembership || callerMembership.role !== "admin" || callerMembership.status !== "active") {
    logServerError("role-not-authorized");
    return { status: "error", message: "Only active organization admins can generate a password reset link." };
  }

  // Only now — authorization already proven above — escalate to service
  // role for the privileged operations an ordinary member could never do
  // on someone else's behalf.
  let admin: SupabaseClient;
  try {
    admin = getAdminClient();
  } catch (err) {
    logServerError("admin-client-init-failed", err);
    return { status: "error", message: "Server configuration error." };
  }

  // Confirm the target actually belongs to *this* organization using the
  // service-role client (which bypasses RLS) — never trust an
  // organization claim from the browser. This is what stops a caller from
  // generating a reset link for a profile that belongs to a different
  // organization.
  const { data: targetMembership, error: targetLookupError } = await admin
    .from("organization_memberships")
    .select("profile_id")
    .eq("organization_id", params.organizationId)
    .eq("profile_id", params.targetProfileId)
    .maybeSingle();

  if (targetLookupError) {
    logServerError("target-membership-lookup", targetLookupError);
    return { status: "error", message: "Could not verify this user's membership." };
  }
  if (!targetMembership) {
    logServerError("target-not-in-org");
    return { status: "error", message: "This user does not belong to your organization." };
  }

  // The target's email is resolved here from profiles — never trusted from
  // the browser — since generateLink needs an email, not a profile id.
  const { data: targetProfile, error: targetProfileError } = await admin
    .from("profiles")
    .select("email")
    .eq("id", params.targetProfileId)
    .maybeSingle();

  if (targetProfileError || !targetProfile?.email) {
    logServerError("target-profile-lookup", targetProfileError);
    return { status: "error", message: "Could not find this user's account." };
  }

  let appUrl: string;
  try {
    appUrl = requireAppUrl();
  } catch (err) {
    logServerError("app-url-missing", err);
    return { status: "error", message: "Server configuration error." };
  }

  // type: "recovery" is Supabase Auth's own password-recovery link type —
  // the same official mechanism resetPasswordForEmail (auth.ts) uses,
  // except generateLink never sends mail; it only mints the token. The
  // resulting link still redirects into /reset-password, the app's
  // existing "set a new password" screen (reset-password-screen.tsx),
  // which already knows how to finish this via confirmPasswordReset.
  const { data, error } = await admin.auth.admin.generateLink({
    type: "recovery",
    email: targetProfile.email,
    options: { redirectTo: `${appUrl}/reset-password` },
  });

  if (error || !data?.properties) {
    logServerError("generate-link:recovery", error ?? undefined);
    return { status: "error", message: "Could not generate the password reset link. Please try again." };
  }

  const { hashed_token, verification_type } = data.properties;
  const resetLink = `${appUrl}/reset-password?token_hash=${encodeURIComponent(hashed_token)}&type=${encodeURIComponent(verification_type)}`;
  return { status: "success", resetLink };
}
