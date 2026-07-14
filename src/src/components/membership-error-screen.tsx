"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AuthCard } from "@/components/auth/auth-card";
import { AuthSubmitButton, AuthSecondaryButton } from "@/components/auth/auth-button";
import { logout } from "@/lib/auth";

// Shown by AuthGuard in place of the app shell when a signed-in Supabase
// user has no active organization membership yet, or the membership lookup
// itself failed — never a fake role, per CLAUDE.md Backend Integration
// Status. The dev-only fallback that would otherwise mask this lives in
// current-user-provider.tsx and never applies in production.
export function MembershipErrorScreen({
  status,
  errorMessage,
  onRetry,
}: {
  status: "no-membership" | "error";
  errorMessage: string | null;
  onRetry: () => void;
}) {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    await logout();
    router.push("/login");
  }

  const isError = status === "error";

  return (
    <AuthCard
      title={isError ? "Couldn't load your workspace" : "No active workspace access"}
      subtitle={
        isError
          ? "Something went wrong while loading your profile and organization membership."
          // Deliberately neutral: this also covers an account whose access
          // was just turned off (not only one that was never added), so it
          // never claims a cause that isn't actually known here — see
          // current-user-provider.tsx's sign-out effect for why a real,
          // signed-in session can still land here.
          : "Your account doesn't have active access to a Jirita organization right now."
      }
    >
      <div className="space-y-4">
        {isError && errorMessage && (
          <div
            role="alert"
            className="rounded-lg border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 px-3 py-2.5 text-[12.5px] text-red-700 dark:text-red-400"
          >
            {errorMessage}
          </div>
        )}
        {!isError && (
          <p className="text-[13px] text-slate-500 dark:text-zinc-400">
            Ask an admin about your access, then try again.
          </p>
        )}

        <AuthSubmitButton onClick={onRetry} type="button">
          Try again
        </AuthSubmitButton>
        <AuthSecondaryButton onClick={handleLogout} loading={loggingOut}>
          {loggingOut ? "Signing out…" : "Log out"}
        </AuthSecondaryButton>
      </div>
    </AuthCard>
  );
}
