import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { DashboardScreen } from "@/components/dashboard-screen";

export const metadata = {
  title: "Dashboard — Jirita",
};

export default function Home() {
  return (
    <AppShell
      activePage="dashboard"
      breadcrumb={
        <span className="text-slate-800 font-medium dark:text-zinc-200">Dashboard</span>
      }
    >
      {/* useSearchParams() (for the Admin project scope selector) requires a Suspense boundary */}
      <Suspense fallback={null}>
        <DashboardScreen />
      </Suspense>
    </AppShell>
  );
}
