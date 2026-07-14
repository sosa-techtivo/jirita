"use client";

import { useEffect, useState, type FormEvent } from "react";
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
// (?token_hash=...&type=...), never Supabase's, so no fragment session
// exists yet — verifyOtp() below is what actually establishes it, using the
// same token_hash minted by generateInviteLinkAction. Either way, once a
// session exists, this only ever needs to collect a password; First
// Name/Last Name/Role/Weekly Capacity were already written to
// profiles/organization_memberships when the invite was created (see
// src/lib/server/invite-user-action.ts) and are left untouched.
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

  useEffect(() => {
    let cancelled = false;
    const supabase = getSupabaseBrowserClient();

    async function establishSession() {
      const searchParams = new URLSearchParams(window.location.search);
      const tokenHash = searchParams.get("token_hash");
      const type = searchParams.get("type");
      // Only present for the "Generate invite link" URL shape — the email
      // flow's link never carries these (its session arrives via the URL
      // fragment instead, already handled by detectSessionInUrl below).
      if (tokenHash && type) {
        await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
      }

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
      // acceptInvitation's RPC flipped the row from invited to active, so
      // it cached a stale "no-membership" result for this same user. authUser
      // itself doesn't change here, so nothing would otherwise re-trigger
      // that fetch. Without this, /dashboard would render with that stale
      // status (a neutral placeholder here, or the wrong screen entirely)
      // until something unrelated happened to refetch. retry() invalidates
      // it immediately, so by the time /dashboard mounts the real,
      // now-active membership is already loading or loaded.
      retry();
      router.push("/dashboard");
    } catch (err) {
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
          This invitation link is invalid or has expired. Ask a workspace admin to send a new one.
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
