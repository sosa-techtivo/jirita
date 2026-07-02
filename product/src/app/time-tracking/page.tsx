import { AppShell } from "@/components/app-shell";
import { TimeTrackingScreen } from "@/components/time-tracking-screen";

export const metadata = {
  title: "Time Tracking — Jirita",
};

export default function TimeTrackingPage() {
  return (
    <AppShell
      activePage="time-tracking"
      breadcrumb={
        <span className="text-slate-800 font-medium dark:text-zinc-200">Time Tracking</span>
      }
    >
      <TimeTrackingScreen />
    </AppShell>
  );
}
