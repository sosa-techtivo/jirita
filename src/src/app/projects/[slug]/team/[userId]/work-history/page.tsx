import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { WorkHistoryScreen, WorkHistoryBreadcrumb } from "@/components/work-history-screen";

// No generateStaticParams — team rosters are real, per-organization data
// (see loadProjectTeam), so there's no meaningful mock/static userId to
// pre-render against; this route renders on demand, same as any other
// dynamic-params page Next.js serves without a static param list.

export default async function WorkHistoryPage(
  props: PageProps<"/projects/[slug]/team/[userId]/work-history">
) {
  const { slug, userId } = await props.params;

  return (
    <AppShell
      activeSlug={slug}
      activeSection="team"
      breadcrumb={<WorkHistoryBreadcrumb slug={slug} userId={userId} />}
    >
      {/* useSearchParams() (for ?page=) requires a Suspense boundary */}
      <Suspense fallback={null}>
        <WorkHistoryScreen slug={slug} userId={userId} />
      </Suspense>
    </AppShell>
  );
}
