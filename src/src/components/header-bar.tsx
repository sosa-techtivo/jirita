"use client";

import type { ReactNode } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { RoleSwitcher } from "@/components/role-switcher";
import { AccountMenu } from "@/components/account-menu";
import { NotificationBell } from "@/components/notification-bell";
import { useCurrentUser } from "@/components/current-user-provider";

export function HeaderBar({ breadcrumb }: { breadcrumb: ReactNode }) {
  const { isDevFallback, errorMessage } = useCurrentUser();

  return (
    <header className="h-14 flex items-center justify-between px-8 border-b border-slate-200 bg-white flex-shrink-0 dark:border-zinc-800 dark:bg-[var(--background)]">
      <div className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-zinc-400 min-w-0 overflow-x-auto whitespace-nowrap">
        {breadcrumb}
      </div>
      <div className="flex items-center gap-3 flex-shrink-0">
        {isDevFallback && (
          <>
            <span
              title={
                errorMessage
                  ? `Membership lookup failed, showing a local mock role for development only: ${errorMessage}`
                  : "No real organization membership found — showing a local mock role for development only."
              }
              className="text-[10px] font-semibold uppercase tracking-wide text-amber-600 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 dark:text-amber-400 dark:bg-amber-500/10 dark:border-amber-500/30"
            >
              {errorMessage ? "Dev fallback (lookup error)" : "Dev fallback"}
            </span>
            <RoleSwitcher />
          </>
        )}
        <ThemeToggle />
        <NotificationBell />
        <AccountMenu />
      </div>
    </header>
  );
}
