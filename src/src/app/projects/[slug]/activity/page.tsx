import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { ProjectActivityHistoryScreen, ProjectActivityBreadcrumb } from "@/components/project-activity-history-screen";

// No generateStaticParams — project activity is real, per-organization data
// (see loadProjectActivityPage), so there's no meaningful mock/static page
// to pre-render against; this route renders on demand, same as Work
// History's own equivalent page.

export default async function ProjectActivityPage(props: PageProps<"/projects/[slug]/activity">) {
  const { slug } = await props.params;

  return (
    <AppShell
      activeSlug={slug}
      activeSection="overview"
      breadcrumb={<ProjectActivityBreadcrumb slug={slug} />}
    >
      {/* useSearchParams() (for ?page=) requires a Suspense boundary */}
      <Suspense fallback={null}>
        <ProjectActivityHistoryScreen slug={slug} />
      </Suspense>
    </AppShell>
  );
}
