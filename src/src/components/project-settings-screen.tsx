"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CLIENT_NAMES } from "@/lib/mock-projects";
import type { ProjectCategory, ProjectStatus } from "@/lib/mock-projects";
import { statusMeta, ProjectCategoryBadge } from "@/components/status-badge";
import { SettingGroup, SettingRow, TextField, NumberField, SelectField } from "@/components/settings-ui";
import { useCurrentUser } from "@/components/current-user-provider";
import { useOrganizationProjects } from "@/components/organization-projects-provider";
import { useRefreshOnFocusAndVisibility } from "@/components/member-profile-modal";
import { loadProjectDetail, loadOrganizationClients, createOrganizationClient, validateRepositoryUrl } from "@/lib/projects";
import type { ProjectDetail, EditableProjectStatus, Client, RepositoryProvider } from "@/lib/projects";
import { getSupabaseBrowserClient } from "@/lib/supabase-client";
import {
  loadGitHubConnectionStatusAction,
  disconnectGitHubProjectConnectionAction,
  type GitHubConnectionStatus,
} from "@/lib/server/github-repository-connection-actions";
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

// ── Repository Integration ──────────────────────────────────────────────────
// No OAuth, no sync, no commit reads, no webhooks — just which provider (if
// any) this project links to, and its URL. validateRepositoryUrl is the
// same pure function lib/projects.ts's updateProjectSettings validates
// with server-side — one implementation, never two that could drift.
//
// Native <select> options must be strings, but RepositoryProvider is
// `"github" | "gitlab" | null` — "" is the sentinel for null/"None" here,
// same convention the Client field's "Select a client" option already uses
// two fields down.
const REPOSITORY_PROVIDER_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "None" },
  { value: "github", label: "GitHub" },
  { value: "gitlab", label: "GitLab" },
];

function repositoryProviderFromSelectValue(value: string): RepositoryProvider | null {
  return value === "github" || value === "gitlab" ? value : null;
}

// ── GitHub OAuth session bridge ─────────────────────────────────────────────
// This app's Supabase session lives in the browser's own localStorage (see
// lib/supabase-client.ts), not a cookie — so neither a plain top-level
// navigation to a Route Handler nor a Server Action call (whose own
// arguments are visible in Next.js's dev-time Server Action logging/network
// payloads — the access token must never be one of them) carries proof of
// identity on its own. This bridges the already-verified session token into
// a short-lived (30s) cookie right before each such call; the server side
// (consumeBridgeSessionToken() in lib/server/github-repository-connection.ts)
// reads it once and clears it immediately. One mechanism, reused by Connect/
// Reconnect's navigation and by the status/Disconnect Server Actions below
// — never a second authentication strategy. Name must match
// OAUTH_COOKIE_NAMES.bridge exactly; path is "/" (not scoped to
// /api/integrations/github) since a Server Action call originates from
// whatever page path the caller is currently on, not that route.
async function bridgeGithubSession(): Promise<boolean> {
  const supabase = getSupabaseBrowserClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return false; // no real session to bridge — nothing to do

  const isSecureContext = window.location.protocol === "https:";
  document.cookie = [
    `jirita_gh_bridge=${encodeURIComponent(session.access_token)}`,
    "Path=/",
    "Max-Age=30",
    "SameSite=Lax",
    isSecureContext ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");
  return true;
}

// Never a popup, never window.open — window.location.href is a normal
// top-level navigation. The actual OAuth logic (state/PKCE/redirect
// construction) is never started here; it all happens server-side in
// /api/integrations/github/connect once it verifies the bridged session.
async function startGithubConnect(projectId: string): Promise<void> {
  const bridged = await bridgeGithubSession();
  if (!bridged) return;
  window.location.href = `/api/integrations/github/connect?projectId=${encodeURIComponent(projectId)}`;
}

// Safe, short copy for the small set of reason codes the connect/callback
// routes can redirect back with — never the raw GitHub error/response body.
const GITHUB_INTEGRATION_ERROR_MESSAGES: Record<string, string> = {
  not_authorized: "You don't have permission to connect GitHub for this project.",
  not_found: "Project not found.",
  not_configured: "GitHub integration isn't configured on this server.",
  session_expired: "Your session expired before the connection could complete. Please try again.",
  provider_mismatch: "Repository Provider must be GitHub with a valid saved URL before connecting.",
  state_mismatch: "The connection request couldn't be verified. Please try again.",
  cancelled: "GitHub authorization was cancelled.",
  invalid_authorization: "GitHub rejected the authorization. Please try again.",
  forbidden: "GitHub access is restricted for this account or repository.",
  repo_not_found: "The configured repository couldn't be found or isn't accessible.",
  repo_mismatch: "The authorized GitHub account doesn't have access to the configured repository.",
  insufficient_scope: "The GitHub authorization doesn't grant read access to this repository.",
  network_error: "Couldn't reach GitHub. Please try again.",
  github_error: "GitHub returned an unexpected error. Please try again.",
};

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
  const router = useRouter();
  const searchParams = useSearchParams();

  // Dev-only fallback: derived synchronously from the already-reactive mock
  // list (no fetch involved) — never reached once a real organization
  // exists. Computed once at mount for the initial state below; refreshed
  // explicitly (from event handlers, not an effect) via refreshAfterSave.
  const initialDevProject: ProjectDetail | null = isDevFallback
    ? (() => {
        const mock = sharedProjects.find((p) => p.slug === slug);
        return mock
          ? {
              ...mock,
              // Dev fallback never calls a real Server Action/API route (no
              // real organization to authorize against), so this never
              // needs to resolve to an actual projects.id row — only used
              // as a stable, non-empty placeholder.
              id: `dev-${mock.slug}`,
              ownerProfileId: null,
              createdAt: "—",
              createdAtISO: new Date(0).toISOString(),
              targetDateISO: null,
              repositoryProvider: null,
              repositoryUrl: null,
            }
          : null;
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
  // Raw ISO `yyyy-mm-dd` (native <input type="date"> format), never the
  // "Jul 16"-formatted ProjectSummary.targetDate display string — empty
  // string when unset, same "no value" convention as Description/Client
  // above.
  const [targetDate, setTargetDate] = useState(initialDevProject?.targetDateISO ?? "");
  const [repositoryProvider, setRepositoryProvider] = useState<RepositoryProvider | null>(
    initialDevProject?.repositoryProvider ?? null
  );
  const [repositoryUrl, setRepositoryUrl] = useState(initialDevProject?.repositoryUrl ?? "");

  // Real GitHub OAuth connection status — "loading" only while the very
  // first check for this project is in flight; never shown as "connected"
  // from stale local data (see refreshGithubStatus below, which always
  // re-derives from the real Server Action result). Only ever fetched when
  // repositoryProvider is actually "github" — GitLab has no OAuth in this
  // feature at all.
  const [githubStatus, setGithubStatus] = useState<GitHubConnectionStatus | "loading">("loading");
  const [disconnectingGithub, setDisconnectingGithub] = useState(false);
  const githubStatusRequestIdRef = useRef(0);

  const [showArchiveModal, setShowArchiveModal] = useState(false);
  const [showAddClientModal, setShowAddClientModal] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // The connect/callback API routes redirect back with ?integration=
  // connected|error&reason=... — a transient banner only, cleared from the
  // URL right after being read so a refresh/back-navigation never re-shows
  // a stale result.
  const integrationResult = searchParams.get("integration");
  const integrationErrorReason = searchParams.get("reason");

  useEffect(() => {
    if (!integrationResult) return;
    router.replace(`/projects/${slug}/settings`);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: only strip the query params once, on whichever render first sees them; re-running on every router/slug identity change would fight the very replace() this effect performs
  }, [integrationResult]);

  const requestIdRef = useRef(0);

  const applyProject = useCallback((project: ProjectDetail) => {
    setName(project.name);
    setDescription(project.description);
    setProjectCode(project.projectCode);
    setStatus(project.status);
    setCategory(project.category);
    setClient(project.client ?? "");
    setBillingRate(project.defaultHourlyRate ?? 0);
    setTargetDate(project.targetDateISO ?? "");
    setRepositoryProvider(project.repositoryProvider);
    setRepositoryUrl(project.repositoryUrl ?? "");
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
        const updated: ProjectDetail = {
          ...mock,
          id: `dev-${mock.slug}`,
          ownerProfileId: null,
          createdAt: "—",
          createdAtISO: new Date(0).toISOString(),
          targetDateISO: targetDate || null,
          repositoryProvider,
          repositoryUrl: repositoryProvider === null ? null : repositoryUrl.trim() || null,
        };
        setDetail({ status: "ready", project: updated });
        applyProject(updated);
      }
      return;
    }
    runFetch();
  }, [isDevFallback, sharedProjects, slug, runFetch, applyProject, targetDate, repositoryProvider, repositoryUrl]);

  // Plain const, not a hook — safe to read before the early-return checks
  // below, so refreshGithubStatus/the effects that follow can depend on the
  // real, loaded project without ever calling a hook conditionally.
  const readyProject = detail.status === "ready" ? detail.project : null;

  // Real GitHub connection check — only ever runs when this project's
  // persisted provider is actually "github" (GitLab has no OAuth here).
  // loadGitHubConnectionStatusAction itself enforces the "15 minutes"
  // cache/dedup rule server-side, so calling this on mount/focus-regain is
  // safe and never turns into polling.
  const refreshGithubStatus = useCallback(() => {
    if (isDevFallback || !organization || !readyProject || readyProject.repositoryProvider !== "github") {
      setGithubStatus({ state: "not-connected" });
      return;
    }
    const projectId = readyProject.id;
    const requestId = ++githubStatusRequestIdRef.current;
    // Bridges the session into a short-lived cookie instead of passing the
    // access token as a Server Action argument (see bridgeGithubSession's
    // own comment above) — the token is never part of a serializable
    // argument, response, log, or persisted React state.
    bridgeGithubSession().then((bridged) => {
      if (!bridged || githubStatusRequestIdRef.current !== requestId) return;
      loadGitHubConnectionStatusAction({ projectId }).then((result) => {
        if (githubStatusRequestIdRef.current !== requestId) return;
        setGithubStatus(result);
      });
    });
  }, [isDevFallback, organization, readyProject]);

  // Real check whenever the project itself, its provider, or its URL
  // actually changes — never on every render, never polling. The URL has
  // to be a dependency too: keeping Provider on "github" but changing the
  // URL still invalidates the old connection (the DB trigger in
  // 20260821000000_add_project_repository_connections.sql deletes it), so
  // a same-provider URL edit has to re-check just as much as a provider
  // change does — the persisted repositoryProvider alone wouldn't catch it.
  //
  // The dependency array is a fixed, statically-written 4-tuple — same
  // length and order on every render, never a spread/filter/ternary that
  // could add or remove an entry (React requires the array's size to stay
  // identical across renders; letting it vary is what previously triggered
  // "The final argument passed to useEffect changed size between renders").
  // refreshGithubStatus is included for real, not suppressed — its own
  // identity already only changes when readyProject (or isDevFallback/
  // organization) does, so including it here doesn't add any spurious
  // re-runs beyond what those already-necessary dependencies cause.
  useEffect(() => {
    // Reads only readyProject?.repositoryProvider (already a dependency
    // below), never the bare readyProject object itself — undefined !==
    // "github" is true, so a null project still correctly falls into this
    // branch without a separate !readyProject check.
    if (readyProject?.repositoryProvider !== "github") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: resets to the real baseline whenever this effect's own dependencies say the project genuinely isn't (or is no longer) github-connected — the same "reset triggered by a real dependency change" pattern this file's other effects already use
      setGithubStatus({ state: "not-connected" });
      return;
    }
    setGithubStatus("loading");
    refreshGithubStatus();
  }, [readyProject?.id, readyProject?.repositoryProvider, readyProject?.repositoryUrl, refreshGithubStatus]);

  // Real refresh on window focus / tab-visibility regain — same shared
  // hook the Member Profile Modal/Users list already use. The 15-minute
  // cache lives inside the Server Action itself, so this can never turn
  // into polling or hammer GitHub on every tab switch.
  useRefreshOnFocusAndVisibility(refreshGithubStatus);

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
    const repositoryError = validateRepositoryUrl(repositoryProvider, repositoryUrl);
    if (repositoryError) {
      setSaveError(repositoryError);
      return;
    }

    setSaving(true);
    setSaveError(null);
    setSaved(false);

    const result = await updateProjectSettings(project.slug, {
      name,
      description,
      projectCode,
      status: status as EditableProjectStatus,
      category,
      targetDate: targetDate || null,
      repositoryProvider,
      repositoryUrl: repositoryProvider === null ? null : repositoryUrl.trim(),
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

  // Removes only the local OAuth connection (project_repository_connections)
  // — repository_provider/repository_url are untouched, and GitHub's own
  // OAuth App authorization is never revoked. Disabled while in flight to
  // avoid a duplicate submit.
  async function handleDisconnectGithub() {
    if (disconnectingGithub || isDevFallback) return;
    setDisconnectingGithub(true);
    // Same session bridge as Connect/status — never the access token as a
    // Server Action argument.
    const bridged = await bridgeGithubSession();
    if (!bridged) {
      setDisconnectingGithub(false);
      return;
    }
    const result = await disconnectGitHubProjectConnectionAction({ projectId: project.id });
    setDisconnectingGithub(false);
    if (result.status === "error") {
      setSaveError(result.message);
      return;
    }
    setGithubStatus({ state: "not-connected" });
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
          <SettingRow label="Target Date" hint="Optional — used as the project's planned delivery date">
            <input
              type="date"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
              className="text-[13px] text-slate-800 dark:text-zinc-200 bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-700 rounded-lg px-2.5 py-1.5 outline-none focus:border-brand-500 dark:focus:border-brand-400 disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-slate-50 dark:disabled:bg-zinc-900 w-40"
            />
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

        <SettingGroup title="Repository Integration">
          <SettingRow label="Repository Provider">
            <SelectField
              value={repositoryProvider ?? ""}
              onChange={(next) => {
                const provider = repositoryProviderFromSelectValue(next);
                setRepositoryProvider(provider);
                // Selecting None clears the local URL draft immediately,
                // not just at Save — it never lingers hidden behind the
                // Select once the field it belongs to disappears.
                if (provider === null) setRepositoryUrl("");
              }}
              options={REPOSITORY_PROVIDER_OPTIONS}
            />
          </SettingRow>
          {repositoryProvider !== null && (
            <SettingRow
              label="Repository URL"
              hint={
                repositoryProvider === "github"
                  ? "e.g. https://github.com/company/project"
                  : "e.g. https://gitlab.com/company/project"
              }
            >
              <TextField value={repositoryUrl} onChange={setRepositoryUrl} width="w-72" />
            </SettingRow>
          )}

          {integrationResult && (
            <div
              className={`mb-3.5 mt-1 text-[12px] font-medium rounded-lg px-3 py-2 ${
                integrationResult === "connected"
                  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"
                  : "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400"
              }`}
            >
              {integrationResult === "connected"
                ? "GitHub connected successfully."
                : GITHUB_INTEGRATION_ERROR_MESSAGES[integrationErrorReason ?? ""] ??
                  "Something went wrong connecting GitHub."}
            </div>
          )}

          {/* Not connected at all — the "Not connected" baseline for None,
              and for a provider that's configured but never checked
              (GitLab, which has no OAuth here at all). */}
          {project.repositoryProvider === null && (
            <div className="py-3.5 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-slate-300 dark:bg-zinc-600" />
              <p className="text-[12px] font-semibold text-slate-600 dark:text-zinc-400">Not connected</p>
            </div>
          )}

          {/* GitLab: link-only, on purpose — no OAuth exists for GitLab in
              this feature, so it can never claim to be "connected". */}
          {project.repositoryProvider === "gitlab" && (
            <div className="py-3.5 flex items-center justify-between gap-4">
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-emerald-500" />
                <p className="text-[12px] font-semibold text-slate-600 dark:text-zinc-400">Repository configured</p>
              </div>
              {project.repositoryUrl && (
                <a
                  href={project.repositoryUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-shrink-0 text-[13px] font-medium text-brand-600 dark:text-brand-400 border border-brand-200 dark:border-brand-500/30 px-3 py-1.5 rounded-lg hover:bg-brand-50 dark:hover:bg-brand-500/5 transition-colors"
                >
                  Open Repository
                </a>
              )}
            </div>
          )}

          {/* GitHub: real OAuth status — never inferred from provider+URL
              alone. Only a verified project_repository_connections row
              (via loadGitHubConnectionStatusAction) ever shows "GitHub
              connected". */}
          {project.repositoryProvider === "github" && (
            <div className="py-3.5">
              {githubStatus === "loading" && (
                <p className="text-[12px] text-slate-400 dark:text-zinc-500">Checking GitHub connection…</p>
              )}

              {githubStatus !== "loading" && githubStatus.state === "connected" && (
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-emerald-500" />
                      <p className="text-[12px] font-semibold text-slate-600 dark:text-zinc-400">GitHub connected</p>
                    </div>
                    <p className="text-[11px] text-slate-400 dark:text-zinc-600 mt-0.5">
                      Connected as @{githubStatus.username} · {githubStatus.repositoryFullName}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <a
                      href={githubStatus.repositoryHtmlUrl ?? project.repositoryUrl ?? undefined}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[13px] font-medium text-brand-600 dark:text-brand-400 border border-brand-200 dark:border-brand-500/30 px-3 py-1.5 rounded-lg hover:bg-brand-50 dark:hover:bg-brand-500/5 transition-colors"
                    >
                      Open Repository
                    </a>
                    <button
                      type="button"
                      onClick={handleDisconnectGithub}
                      disabled={disconnectingGithub}
                      className="text-[13px] font-medium text-slate-500 dark:text-zinc-400 border border-slate-200 dark:border-zinc-700 px-3 py-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-zinc-800/50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {disconnectingGithub ? "Disconnecting…" : "Disconnect"}
                    </button>
                  </div>
                </div>
              )}

              {githubStatus !== "loading" && githubStatus.state === "needs-reconnect" && (
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-amber-500" />
                    <p className="text-[12px] font-semibold text-slate-600 dark:text-zinc-400">Connection expired</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => startGithubConnect(project.id)}
                    className="flex-shrink-0 text-[13px] font-medium text-white bg-brand-600 hover:bg-brand-700 px-3 py-1.5 rounded-lg shadow-sm shadow-brand-600/20 transition-colors dark:bg-brand-500 dark:hover:bg-brand-600"
                  >
                    Reconnect GitHub
                  </button>
                </div>
              )}

              {githubStatus !== "loading" && (githubStatus.state === "not-connected" || githubStatus.state === "error") && (
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-slate-300 dark:bg-zinc-600" />
                    <p className="text-[12px] font-semibold text-slate-600 dark:text-zinc-400">Repository configured</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => startGithubConnect(project.id)}
                      className="text-[13px] font-medium text-white bg-brand-600 hover:bg-brand-700 px-3 py-1.5 rounded-lg shadow-sm shadow-brand-600/20 transition-colors dark:bg-brand-500 dark:hover:bg-brand-600"
                    >
                      Connect GitHub
                    </button>
                    {project.repositoryUrl && (
                      <a
                        href={project.repositoryUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[13px] font-medium text-brand-600 dark:text-brand-400 border border-brand-200 dark:border-brand-500/30 px-3 py-1.5 rounded-lg hover:bg-brand-50 dark:hover:bg-brand-500/5 transition-colors"
                      >
                        Open Repository
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
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
