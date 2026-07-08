"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useCurrentUser } from "@/components/current-user-provider";
import { MembershipErrorScreen } from "@/components/membership-error-screen";

// Gates every AppShell-wrapped route on CurrentUserProvider's combined
// session + membership status: "loading"/"unauthenticated" render nothing
// (redirecting to /login for the latter), "no-membership"/"error" render a
// dedicated screen instead of the app shell (never a fake role — see
// current-user-provider.tsx), and only "ready" (a real membership, or the
// dev-only fallback) renders the actual app.
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
