"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthCard } from "@/components/auth/auth-card";
import { AuthPasswordField } from "@/components/auth/password-field";
import { AuthSubmitButton } from "@/components/auth/auth-button";
import { PasswordStrengthMeter } from "@/components/auth/password-strength-meter";
import { getPasswordStrength } from "@/lib/mock-auth";
import { AuthError, acceptInvitation } from "@/lib/auth";
import { getSupabaseBrowserClient } from "@/lib/supabase-client";
import { useCurrentUser } from "@/components/current-user-provider";

interface FieldErrors {
  password?: string;
  confirmPassword?: string;
}

function validate(password: string, confirmPassword: string): FieldErrors {
  const errors: FieldErrors = {};
  if (!password) errors.password = "A password is required.";
  else if (password.length < 8) errors.password = "Password must be at least 8 characters.";
  else if (getPasswordStrength(password) < 2) errors.password = "Choose a stronger password.";

  if (!confirmPassword) errors.confirmPassword = "Please confirm your password.";
  else if (password && confirmPassword !== password) errors.confirmPassword = "Passwords do not match.";

  return errors;
}

// Lands here from either invite method. Email: Supabase's own hosted verify
// link redirects here with the session already in the URL fragment, and the
// browser client parses it automatically (detectSessionInUrl, on by
// default) — same mechanism reset-password-screen.tsx already relies on for
// its recovery session. Link: the copied URL is JIRITA's own domain
// (?token_hash=...&type=invite), never Supabase's, so no fragment session
// exists yet — verifyOtp() below is what actually establishes it, using the
// same token_hash minted by generateInviteLinkAction. Either way, once a
// session exists, this only ever needs to collect a password; First
// Name/Last Name/Role/Weekly Capacity were already written to
// profiles/organization_memberships when the invite was created (see
// src/lib/server/invite-user-action.ts) and are left untouched.
//
// verifyOtp's own returned session/error is what decides hasSession below —
// never a secondary getSession() poll, which reads whatever the client's own
// background initialization happens to have settled on and can disagree
// with the exchange that just happened. verificationRanRef guards the whole
// effect body (not just the state updates the `cancelled` flag below
// guards) so this only ever runs once per page load: React 18 Strict
// Mode's dev-only double-invoke would otherwise fire verifyOtp twice for
// the same single-use token_hash, and the second call — against a token
// already consumed by the first — is exactly what previously surfaced as
// "Auth session missing!" on submit instead of a real, load-bearing error.
export function AcceptInviteScreen() {
  const router = useRouter();
  const { retry } = useCurrentUser();
  const [checking, setChecking] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const verificationRanRef = useRef(false);

  useEffect(() => {
    if (verificationRanRef.current) return;
    verificationRanRef.current = true;

    let cancelled = false;
    const supabase = getSupabaseBrowserClient();

    async function establishSession() {
      const searchParams = new URLSearchParams(window.location.search);
      const tokenHash = searchParams.get("token_hash");
      const type = searchParams.get("type");

      // "Generate invite link" URL shape — the only case this page ever
      // needs to actively exchange a token for a session. A type that isn't
      // this page's own "invite" (malformed, or some other otp type) is
      // treated as an invalid link and never passed to verifyOtp.
      if (tokenHash) {
        if (type !== "invite") {
          if (!cancelled) {
            setHasSession(false);
            setChecking(false);
          }
          return;
        }

        const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "invite" });
        if (cancelled) return;
        const verified = !error && data.session !== null;
        setHasSession(verified);
        setChecking(false);
        // The one-time token has now been exchanged (or has already failed
        // — either way it's spent, per Supabase's own single-use
        // enforcement) — strip it from the visible URL so a page refresh,
        // or the URL being copied/shared/screenshotted, can never attempt
        // to redeem it again. A plain history replace, not a router
        // navigation: this component doesn't read the query string via
        // useSearchParams (only window.location.search, once, above), so
        // there's nothing to re-fetch or remount.
        if (verified) window.history.replaceState(null, "", window.location.pathname);
        return;
      }

      // No token_hash in the query string — either the email-invite shape
      // (session already parsed from the URL fragment by the browser
      // client's own detectSessionInUrl) or a stray visit with no
      // invitation context. A plain session check is the only signal left.
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      setHasSession(data.session !== null);
      setChecking(false);
    }

    establishSession();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (loading) return;
    setFormError(null);
    const errors = validate(password, confirmPassword);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setLoading(true);
    try {
      await acceptInvitation(password);
      // CurrentUserProvider (mounted at the root layout, never remounted by
      // this client-side navigation) already ran its own membership fetch
      // the moment this page's invite session was established — *before*
      // acceptInvitation's RPC flipped the row from invited to active, so it
      // cached a "no-membership" result for this same user (correctly: an
      // invited row isn't an active one yet). See current-user-provider.tsx's
      // own no-membership handling for why that result, left in place, is
      // more than cosmetic — retry() clears it immediately (not just
      // starting a fresh fetch in the background) so nothing here or on
      // /dashboard can act on that now-stale read again before the real,
      // now-active membership is loading or loaded.
      retry();
      router.push("/dashboard");
    } catch (err) {
      // Supabase's own "Auth session missing!" (thrown by updateUser when no
      // session is present) is never shown verbatim — if the session was
      // somehow lost between verification and submit, that's functionally
      // the same as an invalid/expired invitation to the person looking at
      // this page, so fall back to that same screen instead of a raw,
      // technical inline error.
      if (err instanceof AuthError && err.message === "Auth session missing!") {
        setHasSession(false);
        setLoading(false);
        return;
      }
      setFormError(err instanceof AuthError ? err.message : "Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  if (checking) {
    return (
      <AuthCard title="Accept invitation">
        <p className="text-[13px] text-slate-500 dark:text-zinc-400">Checking your invitation…</p>
      </AuthCard>
    );
  }

  if (!hasSession) {
    return (
      <AuthCard title="Invitation link invalid">
        <p className="text-[13px] text-slate-500 dark:text-zinc-400">
          This invitation link is invalid or has expired. Ask an administrator for a new invitation.
        </p>
        <Link href="/login" className="block w-full mt-6">
          <AuthSubmitButton>Go to Login</AuthSubmitButton>
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Set your password" subtitle="Choose a password to finish joining your Jirita workspace.">
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        {formError && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 px-3 py-2.5 text-[12.5px] text-red-700 dark:text-red-400"
          >
            <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 8v5M12 16h.01" strokeLinecap="round" />
            </svg>
            <span>{formError}</span>
          </div>
        )}

        <div>
          <AuthPasswordField
            label="Password"
            autoComplete="new-password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setFieldErrors((prev) => ({ ...prev, password: undefined }));
            }}
            error={fieldErrors.password}
          />
          <PasswordStrengthMeter password={password} />
        </div>

        <AuthPasswordField
          label="Confirm password"
          autoComplete="new-password"
          placeholder="••••••••"
          value={confirmPassword}
          onChange={(e) => {
            setConfirmPassword(e.target.value);
            setFieldErrors((prev) => ({ ...prev, confirmPassword: undefined }));
          }}
          error={fieldErrors.confirmPassword}
        />

        <AuthSubmitButton loading={loading}>{loading ? "Setting up your account…" : "Accept Invitation"}</AuthSubmitButton>
      </form>
    </AuthCard>
  );
}
