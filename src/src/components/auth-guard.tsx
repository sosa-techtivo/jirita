"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useCurrentUser } from "@/components/current-user-provider";
import { MembershipErrorScreen } from "@/components/membership-error-screen";

// Gates every AppShell-wrapped route on CurrentUserProvider's combined
// session + membership status: "loading"/"unauthenticated" render nothing
// (never a fake role — see current-user-provider.tsx), and only "ready" (a
// real, active membership) renders the actual app. "no-membership"/"error"
// both get MembershipErrorScreen — a real, accurate status, never fake
// data — instead of the app shell. "no-membership" isn't shown for long:
// CurrentUserProvider signs the session out as soon as it sees that
// status (in the background, not gated on anything here), which flips
// `status` to "unauthenticated", redirecting to /login — but the message
// is still visible for that window rather than a silent, unexplained
// bounce straight back to the login screen.
export function AuthGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { status, errorMessage, retry } = useCurrentUser();

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
  }, [status, router]);

  if (status === "loading" || status === "unauthenticated") return null;

  if (status === "no-membership" || status === "error") {
    return <MembershipErrorScreen status={status} errorMessage={errorMessage} onRetry={retry} />;
  }

  return <>{children}</>;
}
