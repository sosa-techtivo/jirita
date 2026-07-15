import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { OrganizationActivityHistoryScreen } from "@/components/organization-activity-history-screen";

export const metadata = {
  title: "Activity — Jirita",
};

export default function ActivityPage() {
  return (
    <AppShell
      activePage="dashboard"
      breadcrumb={
        <span className="text-slate-800 font-medium dark:text-zinc-200">Activity</span>
      }
    >
      {/* useSearchParams() (for ?page=) requires a Suspense boundary */}
      <Suspense fallback={null}>
        <OrganizationActivityHistoryScreen />
      </Suspense>
    </AppShell>
  );
}
