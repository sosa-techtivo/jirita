import { AppShell } from "@/components/app-shell";
import { ReportsScreen } from "@/components/reports-screen";

export const metadata = {
  title: "Reports — Jirita",
};

export default function ReportsPage() {
  return (
    <AppShell
      activePage="reports"
      breadcrumb={
        <span className="text-slate-800 font-medium dark:text-zinc-200">Reports</span>
      }
    >
      <ReportsScreen />
    </AppShell>
  );
}
