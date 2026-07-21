import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { WorkHistoryScreen, WorkHistoryBreadcrumb } from "@/components/work-history-screen";

// Global counterpart to /projects/[slug]/team/[userId]/work-history — used
// only by the Project Lead's own Timesheets "View →" action (Time Tracking)
// when a row consolidates hours across more than one of that Lead's real
// led projects, so no single project slug applies. No `slug` param here;
// WorkHistoryScreen/WorkHistoryBreadcrumb resolve the real scope themselves
// (the authenticated Project Lead's own led projects), never a guess.

export default async function TeamWorkHistoryPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;

  return (
    <AppShell activePage="time-tracking" breadcrumb={<WorkHistoryBreadcrumb userId={userId} />}>
      {/* useSearchParams() (for ?page=) requires a Suspense boundary */}
      <Suspense fallback={null}>
        <WorkHistoryScreen userId={userId} />
      </Suspense>
    </AppShell>
  );
}
