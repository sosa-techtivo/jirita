import type { ReactNode } from "react";
import { Sidebar } from "@/components/sidebar";
import { HeaderBar } from "@/components/header-bar";

export function AppShell({
  activeSlug,
  activeSection,
  activePage,
  breadcrumb,
  children,
}: {
  activeSlug?: string;
  activeSection?: "overview" | "tickets" | "notes";
  activePage?: string;
  breadcrumb: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 text-slate-900 antialiased dark:bg-[var(--background)] dark:text-zinc-100">
      <Sidebar activeSlug={activeSlug} activeSection={activeSection} activePage={activePage} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <HeaderBar breadcrumb={breadcrumb} />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
