import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { TicketsScreen } from "@/components/tickets-screen";

// The org-wide "all projects" ticket list — reached only via the Admin
// Dashboard's "Assigned Tickets" KPI card (never a Sidebar nav item, same
// "link-only" precedent as /activity and Work History). Reuses the exact
// same TicketsScreen component every per-project Tickets page already
// renders, just without a `slug`, so it loads every accessible project's
// tickets instead of one.
export const metadata = {
  title: "Tickets — Jirita",
};

export default function AllTicketsPage() {
  return (
    <AppShell
      activePage="dashboard"
      breadcrumb={
        <span className="text-slate-800 font-medium dark:text-zinc-200">Tickets</span>
      }
    >
      {/* useSearchParams() (for ?alerts=) requires a Suspense boundary */}
      <Suspense fallback={null}>
        <TicketsScreen />
      </Suspense>
    </AppShell>
  );
}
