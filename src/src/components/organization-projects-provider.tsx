"use client";

// Real replacement data source for src/lib/mock-projects.ts on the Sidebar
// and the /projects page — mirrors current-user-provider.tsx's fetch
// pattern so both surfaces read the exact same fetched list instead of two
// independently-consistent queries. Tickets/Dashboard/Reports/Project
// Overview are out of scope and keep importing mock-projects.ts directly.

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useCurrentUser } from "@/components/current-user-provider";
import {
  loadOrganizationProjects,
  createProject as createProjectRemote,
  updateProject as updateProjectRemote,
  archiveProject as archiveProjectRemote,
  restoreProject as restoreProjectRemote,
  updateProjectSettings as updateProjectSettingsRemote,
  slugify,
  generateProjectCode,
  formatTargetDate,
} from "@/lib/projects";
import type { ProjectSettingsUpdate } from "@/lib/projects";
import { projects as MOCK_PROJECTS } from "@/lib/mock-projects";
import type { ClientName, ProjectSummary } from "@/lib/mock-projects";
import { FALLBACK_AVATAR } from "@/lib/current-user";

export type OrganizationProjectsStatus = "loading" | "ready" | "error";

export interface CreateProjectFields {
  name: string;
  description: string;
}

export interface UpdateProjectFields {
  slug: string;
  name: string;
  description: string;
}

export interface CreateProjectWriteResult {
  success: boolean;
  message?: string;
}

interface OrganizationProjectsContextValue {
  status: OrganizationProjectsStatus;
  projects: ProjectSummary[];
  errorMessage: string | null;
  retry: () => void;
  createProject: (fields: CreateProjectFields) => Promise<CreateProjectWriteResult>;
  updateProject: (fields: UpdateProjectFields) => Promise<CreateProjectWriteResult>;
  archiveProject: (slug: string) => Promise<CreateProjectWriteResult>;
  restoreProject: (slug: string) => Promise<CreateProjectWriteResult>;
  updateProjectSettings: (slug: string, updates: ProjectSettingsUpdate) => Promise<CreateProjectWriteResult>;
}

const OrganizationProjectsContext = createContext<OrganizationProjectsContextValue | null>(null);

type FetchState =
  | { status: "ready"; forOrgId: string; projects: ProjectSummary[] }
  | { status: "error"; forOrgId: string; message: string };

export function OrganizationProjectsProvider({ children }: { children: ReactNode }) {
  const { organization, isDevFallback } = useCurrentUser();
  const [fetchState, setFetchState] = useState<FetchState | null>(null);
  // Dev-only fallback list: local, in-memory only (never persisted, never
  // in production) so a tester without a real Supabase membership can still
  // exercise the create flow, mirroring CurrentUserProvider's dev fallback
  // for profile edits/avatar uploads.
  const [devProjects, setDevProjects] = useState<ProjectSummary[]>(MOCK_PROJECTS);
  const requestIdRef = useRef(0);

  const runFetch = useCallback((organizationId: string) => {
    const requestId = ++requestIdRef.current;
    loadOrganizationProjects(organizationId).then((result) => {
      if (requestIdRef.current !== requestId) return; // superseded by a newer org/retry
      setFetchState(
        result.status === "ready"
          ? { status: "ready", forOrgId: organizationId, projects: result.projects }
          : { status: "error", forOrgId: organizationId, message: result.message }
      );
    });
  }, []);

  useEffect(() => {
    if (!organization) return;
    runFetch(organization.id);
  }, [organization, runFetch]);

  const retry = useCallback(() => {
    if (organization) runFetch(organization.id);
  }, [organization, runFetch]);

  const createProject = useCallback(
    async (fields: CreateProjectFields): Promise<CreateProjectWriteResult> => {
      const name = fields.name.trim();
      if (!name) return { success: false, message: "Project name is required." };

      if (isDevFallback) {
        const slug = slugify(name);
        if (devProjects.some((project) => project.slug === slug)) {
          return { success: false, message: "A project with this name already exists in your organization." };
        }
        const newProject: ProjectSummary = {
          slug,
          name,
          shortName: name.slice(0, 2).toUpperCase(),
          projectCode: generateProjectCode(name),
          description: fields.description.trim(),
          status: "active",
          health: "healthy",
          owner: { name: "Unassigned", avatar: FALLBACK_AVATAR },
          updatedAt: "Just now",
          targetDate: "—",
          activeMilestones: 0,
          openTickets: 0,
          blockedTickets: 0,
          overdueTickets: 0,
          awaitingReviewTickets: 0,
          dueThisWeekTickets: 0,
          progress: 0,
          category: "internal",
        };
        setDevProjects((prev) => [newProject, ...prev]);
        return { success: true };
      }

      if (!organization) return { success: false, message: "No active organization." };

      const result = await createProjectRemote({
        organizationId: organization.id,
        name,
        description: fields.description,
      });
      if (result.status === "error") return { success: false, message: result.message };
      runFetch(organization.id); // reflect the real persisted row
      return { success: true };
    },
    [isDevFallback, devProjects, organization, runFetch]
  );

  const updateProject = useCallback(
    async (fields: UpdateProjectFields): Promise<CreateProjectWriteResult> => {
      const name = fields.name.trim();
      if (!name) return { success: false, message: "Project name is required." };

      if (isDevFallback) {
        if (!devProjects.some((project) => project.slug === fields.slug)) {
          return { success: false, message: "Could not save — this project couldn't be found." };
        }
        setDevProjects((prev) =>
          prev.map((project) =>
            project.slug === fields.slug ? { ...project, name, description: fields.description.trim() } : project
          )
        );
        return { success: true };
      }

      if (!organization) return { success: false, message: "No active organization." };

      const result = await updateProjectRemote({
        organizationId: organization.id,
        slug: fields.slug,
        name,
        description: fields.description,
      });
      if (result.status === "error") return { success: false, message: result.message };
      runFetch(organization.id); // reflect the real persisted row
      return { success: true };
    },
    [isDevFallback, devProjects, organization, runFetch]
  );

  const archiveProject = useCallback(
    async (slug: string): Promise<CreateProjectWriteResult> => {
      if (isDevFallback) {
        if (!devProjects.some((project) => project.slug === slug)) {
          return { success: false, message: "Could not archive — this project couldn't be found." };
        }
        setDevProjects((prev) =>
          prev.map((project) => (project.slug === slug ? { ...project, status: "archived" } : project))
        );
        return { success: true };
      }

      if (!organization) return { success: false, message: "No active organization." };

      const result = await archiveProjectRemote({ organizationId: organization.id, slug });
      if (result.status === "error") return { success: false, message: result.message };
      runFetch(organization.id); // reflect the real persisted row
      return { success: true };
    },
    [isDevFallback, devProjects, organization, runFetch]
  );

  const restoreProject = useCallback(
    async (slug: string): Promise<CreateProjectWriteResult> => {
      if (isDevFallback) {
        if (!devProjects.some((project) => project.slug === slug)) {
          return { success: false, message: "Could not restore — this project couldn't be found." };
        }
        setDevProjects((prev) =>
          prev.map((project) => (project.slug === slug ? { ...project, status: "active" } : project))
        );
        return { success: true };
      }

      if (!organization) return { success: false, message: "No active organization." };

      const result = await restoreProjectRemote({ organizationId: organization.id, slug });
      if (result.status === "error") return { success: false, message: result.message };
      runFetch(organization.id); // reflect the real persisted row
      return { success: true };
    },
    [isDevFallback, devProjects, organization, runFetch]
  );

  const updateProjectSettings = useCallback(
    async (slug: string, updates: ProjectSettingsUpdate): Promise<CreateProjectWriteResult> => {
      if (isDevFallback) {
        if (!devProjects.some((project) => project.slug === slug)) {
          return { success: false, message: "Could not save — this project couldn't be found." };
        }
        // No real org roster to resolve a name from in dev fallback, so
        // ownerProfileId changes are a no-op here — every other Settings
        // field maps directly onto ProjectSummary's own shape.
        setDevProjects((prev) =>
          prev.map((project) => {
            if (project.slug !== slug) return project;
            return {
              ...project,
              ...(updates.name !== undefined ? { name: updates.name.trim() } : {}),
              ...(updates.description !== undefined ? { description: updates.description.trim() } : {}),
              ...(updates.projectCode !== undefined ? { projectCode: updates.projectCode.trim() } : {}),
              ...(updates.status !== undefined ? { status: updates.status } : {}),
              ...(updates.category !== undefined ? { category: updates.category } : {}),
              ...(updates.client !== undefined ? { client: (updates.client as ClientName) ?? undefined } : {}),
              ...(updates.defaultHourlyRate !== undefined
                ? { defaultHourlyRate: updates.defaultHourlyRate ?? undefined }
                : {}),
              ...(updates.targetDate !== undefined ? { targetDate: formatTargetDate(updates.targetDate ?? null) } : {}),
            };
          })
        );
        return { success: true };
      }

      if (!organization) return { success: false, message: "No active organization." };

      const result = await updateProjectSettingsRemote(organization.id, slug, updates);
      if (result.status === "error") return { success: false, message: result.message };
      runFetch(organization.id); // reflect the real persisted row
      return { success: true };
    },
    [isDevFallback, devProjects, organization, runFetch]
  );

  // Dev-only fallback: no real organization membership (never true in a
  // production build — see current-user-provider.tsx) keeps local dev on
  // the same mock projects list used before this feature was wired up,
  // exactly like CurrentUserProvider falls back to a mock identity.
  let value: OrganizationProjectsContextValue;
  if (isDevFallback) {
    value = { status: "ready", projects: devProjects, errorMessage: null, retry: () => {}, createProject, updateProject, archiveProject, restoreProject, updateProjectSettings };
  } else if (!organization) {
    value = { status: "loading", projects: [], errorMessage: null, retry: () => {}, createProject, updateProject, archiveProject, restoreProject, updateProjectSettings };
  } else {
    const currentFetch = fetchState?.forOrgId === organization.id ? fetchState : null;
    if (!currentFetch) {
      value = { status: "loading", projects: [], errorMessage: null, retry, createProject, updateProject, archiveProject, restoreProject, updateProjectSettings };
    } else if (currentFetch.status === "error") {
      value = { status: "error", projects: [], errorMessage: currentFetch.message, retry, createProject, updateProject, archiveProject, restoreProject, updateProjectSettings };
    } else {
      value = { status: "ready", projects: currentFetch.projects, errorMessage: null, retry, createProject, updateProject, archiveProject, restoreProject, updateProjectSettings };
    }
  }

  return <OrganizationProjectsContext.Provider value={value}>{children}</OrganizationProjectsContext.Provider>;
}

export function useOrganizationProjects(): OrganizationProjectsContextValue {
  const ctx = useContext(OrganizationProjectsContext);
  if (!ctx) throw new Error("useOrganizationProjects must be used within an OrganizationProjectsProvider");
  return ctx;
}
