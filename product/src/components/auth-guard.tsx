"use client";

import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { isAuthenticated } from "@/lib/mock-auth";

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

// No session on the server (no localStorage) — the client re-checks on
// mount/hydration, same as any client-only auth check.
function getServerSnapshot() {
  return false;
}

const emptySubscribe = () => () => {};

// True only once hydrated on the client. Needed *in addition to* the
// authenticated flag below: on a hard reload of an already-authenticated
// page, the very first client render must still match the server's
// getServerSnapshot()-driven `false` (no localStorage there) before
// useSyncExternalStore corrects it — if the redirect effect only checked
// `!authenticated`, that transient false would fire router.replace("/login")
// on every refresh even for a logged-in user. Gating the effect on `mounted`
// too means it can't act until the corrected, real value is in.
function useMounted(): boolean {
  return useSyncExternalStore(emptySubscribe, () => true, () => false);
}

// Gates every AppShell-wrapped route behind the mock auth session — there's
// no real backend/middleware yet, so this is a client-side check against
// localStorage (see mock-auth.ts) rather than a server-verified session.
export function AuthGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const mounted = useMounted();
  const authenticatedRaw = useSyncExternalStore(subscribe, isAuthenticated, getServerSnapshot);
  const authenticated = mounted && authenticatedRaw;

  useEffect(() => {
    if (mounted && !authenticated) router.replace("/login");
  }, [mounted, authenticated, router]);

  if (!authenticated) return null;
  return <>{children}</>;
}
