"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CLIENT_NAMES } from "@/lib/mock-projects";
import type { ProjectCategory, ProjectStatus } from "@/lib/mock-projects";
import { statusMeta, ProjectCategoryBadge } from "@/components/status-badge";
import { SettingGroup, SettingRow, TextField, NumberField, SelectField } from "@/components/settings-ui";
import { useCurrentUser } from "@/components/current-user-provider";
import { useOrganizationProjects } from "@/components/organization-projects-provider";
import { loadProjectDetail, loadOrganizationClients, createOrganizationClient } from "@/lib/projects";
import type { ProjectDetail, EditableProjectStatus, Client } from "@/lib/projects";
import { ArchiveProjectModal } from "@/components/archive-project-modal";
import { AddClientModal } from "@/components/add-client-modal";

// Breadcrumb for /projects/[slug]/settings — a client component (rather
// than the page.tsx Server Component computing it) so it reads the same
// live project name every other connected surface (Sidebar, /projects)
// shows, instead of a static server-rendered snapshot. Falls back to the
// raw slug while the list is still loading.
export function ProjectSettingsBreadcrumb({ slug }: { slug: string }) {
  const { projects } = useOrganizationProjects();
  const projectName = projects.find((p) => p.slug === slug)?.name ?? slug;
  return (
    <>
      <Link href="/projects" className="text-slate-400 hover:text-slate-600 dark:text-zinc-500 dark:hover:text-zinc-300">
        Projects
      </Link>
      <span className="text-slate-300 dark:text-zinc-700">/</span>
      <Link
        href={`/projects/${slug}`}
        className="text-slate-400 hover:text-slate-600 dark:text-zinc-500 dark:hover:text-zinc-300"
      >
        {projectName}
      </Link>
      <span className="text-slate-300 dark:text-zinc-700">/</span>
      <span className="text-slate-800 font-medium dark:text-zinc-200">Settings</span>
    </>
  );
}

// Same segmented-pill styling as PeriodSelector/ViewSwitcher elsewhere in the
// app, repurposed as a two-way toggle. This is the one control on the page
// that actually drives behavior: switching category live shows/hides Client
// + Billing Rate and flips the Billable-by-default note below. The badge next
// to the page title keeps the longer "Client Project"/"Internal Project"
// wording — only this toggle's labels are shortened.
function CategoryToggle({ value, onChange }: { value: ProjectCategory; onChange: (category: ProjectCategory) => void }) {
  const options: { key: ProjectCategory; label: string }[] = [
    { key: "client", label: "Client" },
    { key: "internal", label: "Internal" },
  ];
  return (
    <div className="inline-flex items-center gap-0.5 rounded-lg border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800/60 p-1">
      {options.map((option) => {
        const active = option.key === value;
        return (
          <button
            key={option.key}
            type="button"
            onClick={() => onChange(option.key)}
            className={[
              "text-xs font-medium px-2.5 py-1 rounded-md transition-colors duration-150 whitespace-nowrap",
              active
                ? "bg-white dark:bg-zinc-900 text-slate-900 dark:text-zinc-50 shadow-sm"
                : "text-slate-500 dark:text-zinc-400 hover:text-slate-700 dark:hover:text-zinc-200",
            ].join(" ")}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

// Status options this screen can write — "archived" is deliberately
// excluded (see EditableProjectStatus): that transition only ever happens
// through the Danger Zone's Archive/Restore action below, reusing
// ArchiveProjectModal/restoreProject exactly as-is, never a parallel path.
const EDITABLE_STATUSES: EditableProjectStatus[] = ["planning", "active", "on-hold", "completed"];
const ADD_NEW_CLIENT = "__add_new_client__";

// Dev-only fallback roster (no real organization to query `clients` from)
// — seeded from the same placeholder names the Client selector always used
// before this feature existed, so local dev without Supabase credentials
// still has something to pick from.
const DEV_CLIENTS: Client[] = CLIENT_NAMES.map((name) => ({ id: name, name }));

type DetailState =
  | { status: "loading" }
  | { status: "ready"; project: ProjectDetail }
  | { status: "not-found" }
  | { status: "error"; message: string };

function toDetail(project: ProjectDetail | null): DetailState {
  return project ? { status: "ready", project } : { status: "not-found" };
}

export function ProjectSettingsScreen({ slug }: { slug: string }) {
  const { organization, isDevFallback } = useCurrentUser();
  const { projects: sharedProjects, updateProjectSettings, restoreProject } = useOrganizationProjects();

  // Dev-only fallback: derived synchronously from the already-reactive mock
  // list (no fetch involved) — never reached once a real organization
  // exists. Computed once at mount for the initial state below; refreshed
  // explicitly (from event handlers, not an effect) via refreshAfterSave.
  const initialDevProject: ProjectDetail | null = isDevFallback
    ? (() => {
        const mock = sharedProjects.find((p) => p.slug === slug);
        return mock ? { ...mock, ownerProfileId: null, createdAt: "—", createdAtISO: new Date(0).toISOString() } : null;
      })()
    : null;

  const [detail, setDetail] = useState<DetailState>(
    isDevFallback ? toDetail(initialDevProject) : { status: "loading" }
  );
  const [clients, setClients] = useState<Client[]>(isDevFallback ? DEV_CLIENTS : []);

  const [name, setName] = useState(initialDevProject?.name ?? "");
  const [description, setDescription] = useState(initialDevProject?.description ?? "");
  const [projectCode, setProjectCode] = useState(initialDevProject?.projectCode ?? "");
  const [status, setStatus] = useState<ProjectStatus>(initialDevProject?.status ?? "active");
  const [category, setCategory] = useState<ProjectCategory>(initialDevProject?.category ?? "internal");
  const [client, setClient] = useState(initialDevProject?.client ?? "");
  const [billingRate, setBillingRate] = useState(initialDevProject?.defaultHourlyRate ?? 0);

  const [showArchiveModal, setShowArchiveModal] = useState(false);
  const [showAddClientModal, setShowAddClientModal] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const requestIdRef = useRef(0);

  const applyProject = useCallback((project: ProjectDetail) => {
    setName(project.name);
    setDescription(project.description);
    setProjectCode(project.projectCode);
    setStatus(project.status);
    setCategory(project.category);
    setClient(project.client ?? "");
    setBillingRate(project.defaultHourlyRate ?? 0);
  }, []);

  // Refetches just this project — every setState lives inside its .then()
  // callback, never synchronously in the caller, so this is safe to call
  // directly from a mount effect. Used both for the initial load and for
  // refreshAfterSave below: a settings save never changes the org's member
  // or client roster, so re-fetching those on every Save/Archive/Restore
  // would just be unnecessary traffic.
  const runFetch = useCallback(() => {
    if (!organization) return;
    const requestId = ++requestIdRef.current;
    loadProjectDetail(organization.id, slug).then((result) => {
      if (requestIdRef.current !== requestId) return;
      if (result.status === "ready") {
        setDetail({ status: "ready", project: result.project });
        applyProject(result.project);
      } else if (result.status === "not-found") {
        setDetail({ status: "not-found" });
      } else {
        setDetail({ status: "error", message: result.message });
      }
    });
  }, [organization, slug, applyProject]);

  useEffect(() => {
    if (isDevFallback || !organization) return; // dev fallback handled synchronously above — no fetch needed
    runFetch();
    // Clients only need loading once — they don't change as a side effect
    // of saving this project's settings.
    loadOrganizationClients(organization.id).then((result) => {
      if (result.status === "ready") setClients(result.clients);
    });
  }, [isDevFallback, organization, runFetch]);

  // Called after Save/Archive/Restore (always from an event handler, never
  // from an effect) so the on-screen data — and, via the shared
  // updateProjectSettings/restoreProject calls' own runFetch, Sidebar and
  // /projects — reflect what was actually persisted.
  const refreshAfterSave = useCallback(() => {
    if (isDevFallback) {
      const mock = sharedProjects.find((p) => p.slug === slug);
      if (mock) {
        const updated: ProjectDetail = { ...mock, ownerProfileId: null, createdAt: "—", createdAtISO: new Date(0).toISOString() };
        setDetail({ status: "ready", project: updated });
        applyProject(updated);
      }
      return;
    }
    runFetch();
  }, [isDevFallback, sharedProjects, slug, runFetch, applyProject]);

  if (detail.status === "loading") {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-8 py-20 text-center text-sm text-slate-400 dark:text-zinc-500">
        Loading project…
      </div>
    );
  }

  if (detail.status === "error") {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-8 py-10">
        <p className="text-sm text-red-600 dark:text-red-400">{detail.message}</p>
      </div>
    );
  }

  if (detail.status === "not-found") {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-8 py-10">
        <p className="text-sm text-slate-400 dark:text-zinc-600">Project not found.</p>
      </div>
    );
  }

  const project = detail.project;
  const isClient = category === "client";
  const isArchived = project.status === "archived";

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    setSaved(false);

    const result = await updateProjectSettings(project.slug, {
      name,
      description,
      projectCode,
      status: status as EditableProjectStatus,
      category,
      ...(isClient ? { client: client || null, defaultHourlyRate: billingRate } : {}),
    });

    setSaving(false);
    if (!result.success) {
      setSaveError(result.message ?? "Something went wrong.");
      return;
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    refreshAfterSave();
  }

  async function handleRestore() {
    setRestoring(true);
    await restoreProject(project.slug);
    setRestoring(false);
    refreshAfterSave();
  }

  // Creates the client immediately in Supabase (or, in dev fallback, a
  // local in-memory-only entry) and selects it in the form right away —
  // it's only written to this project's client_name once the user clicks
  // Save Changes, same as every other field on this screen.
  async function handleCreateClient(rawName: string): Promise<{ success: boolean; message?: string }> {
    const trimmed = rawName.trim();

    if (isDevFallback) {
      if (clients.some((c) => c.name.toLowerCase() === trimmed.toLowerCase())) {
        return { success: false, message: "A client with this name already exists in your organization." };
      }
      const newClient: Client = { id: `dev-${Date.now()}`, name: trimmed };
      setClients((prev) => [...prev, newClient].sort((a, b) => a.name.localeCompare(b.name)));
      setClient(newClient.name);
      return { success: true };
    }

    if (!organization) return { success: false, message: "No active organization." };

    const result = await createOrganizationClient(organization.id, trimmed);
    if (result.status === "error") return { success: false, message: result.message };
    setClients((prev) => [...prev, result.client].sort((a, b) => a.name.localeCompare(b.name)));
    setClient(result.client.name);
    return { success: true };
  }

  function handleClientChange(value: string) {
    if (value === ADD_NEW_CLIENT) {
      setShowAddClientModal(true);
      return;
    }
    setClient(value);
  }

  const clientOptions = [
    { value: "", label: "Select a client" },
    ...clients.map((c) => ({ value: c.name, label: c.name })),
    // The project's current client may predate this org's real roster
    // (e.g. set before any client had been created) — keep it selectable
    // so saving never silently changes it.
    ...(project.client && !clients.some((c) => c.name === project.client)
      ? [{ value: project.client, label: project.client }]
      : []),
    { value: ADD_NEW_CLIENT, label: "+ Add new client" },
  ];

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-8 py-10 pb-16">
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-xl font-bold text-slate-900 tracking-tight dark:text-zinc-50">Project Settings</h1>
        <ProjectCategoryBadge category={category} />
      </div>
      <p className="text-sm text-slate-500 mt-1 max-w-xl dark:text-zinc-400">
        Manage project details, billing behavior and project-level configuration.
      </p>

      <div className="mt-8">
        <SettingGroup title="General">
          <SettingRow label="Project Name">
            <TextField value={name} onChange={setName} width="w-64" />
          </SettingRow>
          <SettingRow label="Description" hint="Shown on the project overview">
            <TextField value={description} onChange={setDescription} width="w-64" />
          </SettingRow>
          <SettingRow label="Project Code" hint="Prefix for this project's ticket IDs (e.g. MBA-123). Must be unique across the workspace.">
            <TextField value={projectCode} onChange={setProjectCode} width="w-24" />
          </SettingRow>
          <SettingRow label="Status">
            {isArchived ? (
              <SelectField value={statusMeta[project.status].label} disabled />
            ) : (
              <SelectField
                value={status}
                onChange={(next) => setStatus(next as ProjectStatus)}
                options={EDITABLE_STATUSES.map((s) => ({ value: s, label: statusMeta[s].label }))}
              />
            )}
          </SettingRow>
        </SettingGroup>

        <SettingGroup title="Billing">
          <SettingRow label="Project Category" hint="Determines whether time logged on this project is billable">
            <CategoryToggle value={category} onChange={setCategory} />
          </SettingRow>
          <SettingRow
            label="Client"
            hint={isClient ? "Required for client projects" : "Not applicable — this project is internal"}
          >
            <SelectField
              value={isClient ? client : ""}
              onChange={handleClientChange}
              options={clientOptions}
              disabled={!isClient}
            />
          </SettingRow>
          <SettingRow
            label="Billing Rate"
            hint={isClient ? "Used to estimate billing in Time Tracking" : "Not applicable — this project is internal"}
          >
            <NumberField
              value={isClient ? billingRate : 0}
              onChange={setBillingRate}
              suffix="$ / hour"
              disabled={!isClient}
            />
          </SettingRow>

          <div className="py-3.5">
            <p
              className={`text-[12px] font-semibold ${
                isClient ? "text-emerald-600 dark:text-emerald-400" : "text-slate-500 dark:text-zinc-400"
              }`}
            >
              {isClient
                ? "Time entries on this project are Billable by default."
                : "Time entries on this project are Non-Billable by default."}
            </p>
            <p className="text-[11px] text-slate-400 dark:text-zinc-600 mt-1 max-w-md">
              Billable status is always inherited from the project — nobody chooses it per time entry.
            </p>
          </div>
        </SettingGroup>

        <div className="flex items-center gap-3 mt-2 mb-6">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-lg px-3.5 py-2 shadow-sm shadow-brand-600/20 transition-colors dark:bg-brand-500 dark:hover:bg-brand-600 dark:shadow-brand-500/20 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {saving ? "Saving…" : "Save Changes"}
          </button>
          {saved && (
            <span className="flex items-center gap-1.5 text-[13px] font-medium text-emerald-600 dark:text-emerald-400">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path d="M5 12l5 5L20 7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Changes saved
            </span>
          )}
          {saveError && <span className="text-[13px] font-medium text-red-600 dark:text-red-400">{saveError}</span>}
        </div>

        <SettingGroup title="Danger Zone">
          <div className="py-4">
            <div className="flex items-start justify-between gap-6">
              <div>
                <p className="text-[13px] font-semibold text-slate-800 dark:text-zinc-200">
                  {isArchived ? "Restore Project" : "Archive Project"}
                </p>
                <p className="text-[12px] text-slate-400 dark:text-zinc-500 mt-0.5 max-w-sm">
                  {isArchived
                    ? `${project.name} is archived and hidden from the active Projects list. Restoring brings it back.`
                    : `Hides ${project.name} from the active Projects list. Tickets, notes, and reports remain intact, and the project can be restored later.`}
                </p>
              </div>
              {isArchived ? (
                <button
                  type="button"
                  onClick={handleRestore}
                  disabled={restoring}
                  className="flex-shrink-0 text-[13px] font-medium text-white bg-brand-600 hover:bg-brand-700 px-3 py-1.5 rounded-lg shadow-sm shadow-brand-600/20 transition-colors dark:bg-brand-500 dark:hover:bg-brand-600 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {restoring ? "Restoring…" : "Restore Project"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowArchiveModal(true)}
                  className="flex-shrink-0 text-[13px] font-medium text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-600/40 bg-amber-50 dark:bg-amber-500/5 px-3 py-1.5 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-500/10 transition-colors"
                >
                  Archive Project
                </button>
              )}
            </div>
          </div>
        </SettingGroup>
      </div>

      {showArchiveModal && (
        <ArchiveProjectModal
          project={project}
          onClose={() => {
            setShowArchiveModal(false);
            refreshAfterSave();
          }}
        />
      )}

      {showAddClientModal && (
        <AddClientModal onClose={() => setShowAddClientModal(false)} onCreate={handleCreateClient} />
      )}
    </div>
  );
}
