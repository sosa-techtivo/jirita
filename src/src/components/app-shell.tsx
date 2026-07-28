"use client";

import type { ReactNode } from "react";
import { Sidebar } from "@/components/sidebar";
import { HeaderBar } from "@/components/header-bar";
import { AuthGuard } from "@/components/auth-guard";
import { MobileTabBar } from "@/components/mobile-tab-bar";
import { useCurrentUser } from "@/components/current-user-provider";

export function AppShell({
  activeSlug,
  activeSection,
  activePage,
  breadcrumb,
  children,
}: {
  activeSlug?: string;
  activeSection?: "overview" | "tickets" | "notes" | "team" | "reports" | "settings";
  activePage?: string;
  breadcrumb: ReactNode;
  children: ReactNode;
}) {
  const { user } = useCurrentUser();
  // The bottom tab bar now covers every role, Mobile-only
  // (mobile-tab-bar.tsx) — this is the one place deciding that, so
  // Desktop's <main> stays pixel-identical to before (`md:pb-0` cancels
  // the extra clearance above the `md` breakpoint regardless of role).
  const hasMobileTabBar =
    user.role === "ADMIN" || user.role === "PROJECT_LEAD" || user.role === "MEMBER";

  return (
    <AuthGuard>
      <div className="flex h-screen overflow-hidden bg-slate-50 text-slate-900 antialiased dark:bg-[var(--background)] dark:text-zinc-100">
        <Sidebar activeSlug={activeSlug} activeSection={activeSection} activePage={activePage} />
        <div className="flex-1 flex flex-col overflow-hidden">
          <HeaderBar breadcrumb={breadcrumb} />
          <main
            className={`flex-1 overflow-y-auto ${
              hasMobileTabBar ? "pb-[calc(3.5rem+env(safe-area-inset-bottom))] md:pb-0" : ""
            }`}
          >
            {children}
          </main>
        </div>
        {hasMobileTabBar && <MobileTabBar activePage={activePage} />}
      </div>
    </AuthGuard>
  );
}
