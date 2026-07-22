import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { NotificationsScreen } from "@/components/notifications-screen";

export const metadata = {
  title: "Notifications — Jirita",
};

export default function NotificationsPage() {
  return (
    <AppShell
      breadcrumb={<span className="text-slate-800 font-medium dark:text-zinc-200">Notifications</span>}
    >
      {/* useSearchParams() (for ?page=) requires a Suspense boundary */}
      <Suspense fallback={null}>
        <NotificationsScreen />
      </Suspense>
    </AppShell>
  );
}
