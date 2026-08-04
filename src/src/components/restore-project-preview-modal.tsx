"use client";

import { useEffect, useRef, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase-client";
import { formatAbsoluteDateTime } from "@/lib/date-format";
import { SettingGroup, SettingRow } from "@/components/settings-ui";
import { loadOrganizationMembers, type OrgMember } from "@/lib/projects";
import type { ProjectRestorePreview } from "@/lib/server/preview-project-restore";
import type { ParsedProjectBackup } from "@/lib/server/parse-project-backup-zip";
import type { ExportedProjectSummary } from "@/lib/server/export-project";

// Modal shell (backdrop, centered dialog, visible-transition, Escape-to-
// close, body-scroll-lock) mirrors add-client-modal.tsx's own shell —
// wider (max-w-xl instead of max-w-sm) since this one shows a diagnostic
// report, not a single field.
//
// The .zip is sent directly in this request's own multipart/form-data
// body — a direct-to-Storage upload path was built and discarded (Supabase
// Free's project-wide Storage upload limit is a hard 50MB, and Restore
// isn't meant to require a paid plan). Instead, oversized backups are
// avoided at the source: Export Project's "Data Only" mode omits
// attachment files, so any realistically-sized project's backup comfortably
// fits under Vercel's own ~4.5MB Serverless Function request body limit —
// this figure mirrors that limit directly, with a small safety margin.
const MAX_ZIP_BYTES = 4.4 * 1024 * 1024;

// Same style constants as add-team-member-modal.tsx's own INPUT/LABEL —
// this is the project's one established pattern for "pick 1 of N profiles"
// (a plain <select>, no combobox exists anywhere in the codebase) and for
// labeled text fields, reused here rather than inventing new styling.
const LABEL = "block text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600 mb-1.5";
const INPUT =
  "w-full bg-white dark:bg-zinc-900 text-[16px] sm:text-[13px] font-medium text-slate-800 dark:text-zinc-200 " +
  "border border-slate-200 dark:border-zinc-700 rounded-lg px-3 py-2 outline-none " +
  "focus:border-brand-500 dark:focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 " +
  "transition-colors";
const INPUT_ERROR = "border-red-400 dark:border-red-500 focus:border-red-500 dark:focus:border-red-500 focus:ring-red-500/20";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface RestorePreviewResponse {
  preview: ProjectRestorePreview;
  exportedAt: string;
  attachmentsIncluded: boolean;
  attachmentBytes: number;
  /** The full parsed backup, minus physical attachment bytes — kept in
   *  memory only (this component's own state), echoed back unmodified to
   *  /api/projects/restore/plan when building the plan. Never persisted
   *  anywhere (Storage, disk, database, cache). */
  backup: Omit<ParsedProjectBackup, "attachmentFiles">;
}

// Mirrors the ProjectRestorePlanSummary shape /api/projects/restore/plan
// actually returns (see that route's own header comment) — deliberately
// far narrower than a ProjectRestorePlan: no tickets/comments/activity/
// time entries/attachment rows, no id maps, no attachment bytes. That
// endpoint builds a real plan internally purely to validate the
// configuration, then discards it and returns only this summary.
interface RestorePlanSummary {
  project: {
    id: string;
    name: string;
    slug: string;
    projectCode: string;
  };
  summary: ExportedProjectSummary;
  attachmentsIncluded: boolean;
  attachmentBytes: number;
  mappedProfiles: number;
  omittedProfiles: number;
  warnings: string[];
  readyToRestore: boolean;
}

// The only shape /api/projects/restore/execute ever returns on success —
// mirrors ExecuteProjectRestoreResult exactly (see execute-project-
// restore.ts): no plan, no restored rows, no attachment bytes, no
// mappings, just the new project's identity and per-collection counts.
interface RestoreExecuteResponse {
  status: "success";
  project: {
    id: string;
    name: string;
    slug: string;
    projectCode: string;
  };
  restored: {
    members: number;
    tickets: number;
    comments: number;
    activity: number;
    timeEntries: number;
    attachments: number;
    attachmentFiles: number;
    attachmentBytes: number;
    relations: number;
    notes: number;
    noteActivity: number;
  };
}

const SUMMARY_ROWS: { key: keyof ProjectRestorePreview["summary"]; label: string }[] = [
  { key: "members", label: "Members" },
  { key: "statuses", label: "Statuses" },
  { key: "tickets", label: "Tickets" },
  { key: "comments", label: "Comments" },
  { key: "activity", label: "Activity" },
  { key: "timeEntries", label: "Time Entries" },
  { key: "attachments", label: "Attachments" },
  { key: "relations", label: "Relations" },
  { key: "notes", label: "Notes" },
  { key: "noteActivity", label: "Note Activity" },
];

type ProfileRefCategory = "resolvable" | "missing" | "outsideOrganization";

function categoryLabel(category: ProfileRefCategory): string {
  if (category === "resolvable") return "Resolvable";
  if (category === "missing") return "Missing";
  return "Outside Organization";
}

function categoryBadgeClass(category: ProfileRefCategory): string {
  if (category === "resolvable") return "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400";
  return "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400";
}

// "Physical Files Included: Yes/No" (this feature's original wording) told
// a developer whether Phase 3 has bytes to upload; it didn't tell an Admin
// what that means for them. Same attachmentsIncluded boolean, presented as
// a plain outcome instead — shown identically at every stage that already
// surfaces this fact (initial preview, plan summary, final confirmation),
// so a Data Only backup never quietly looks like a Full one two screens
// later. attachmentBytes itself is untouched — this only changes how
// attachmentsIncluded is labeled.
function AttachmentFilesRow({ included }: { included: boolean }) {
  return (
    <SettingRow
      label="Attachment Files"
      hint={
        included
          ? "Physical attachment files are included in this backup."
          : "This backup contains attachment metadata only. Physical files were intentionally excluded from the backup."
      }
    >
      <span className={"text-[12px] font-semibold " + (included ? "text-emerald-600 dark:text-emerald-400" : "text-slate-500 dark:text-zinc-400")}>
        {included ? "Included" : "Not Included (Data Only Backup)"}
      </span>
    </SettingRow>
  );
}

// previewProjectRestore() (untouched) still generates the same warning
// strings it always has — this only changes how the three
// developer-oriented ones among them are *displayed*, matching them by
// their own stable, known prefixes rather than reparsing arbitrary text.
// Any warning that doesn't match one of these (slug/project code
// conflicts, the already-plain "does not include attachment files", or a
// rare backend-error-path string) passes through unchanged — nothing here
// invents wording for a warning it doesn't specifically recognize.
const LEGACY_STATUSES_PREFIX = "statuses.json is empty";
const MISSING_PROFILES_PATTERN = /^(\d+) referenced profile id\(s\) do not exist and cannot be resolved:/;
const OUTSIDE_ORG_PATTERN = /^(\d+) referenced profile id\(s\) exist but are not members of the destination organization:/;

function pluralUsers(count: string): string {
  return count === "1" ? "user" : "users";
}

function humanizeWarning(warning: string): string {
  if (warning.startsWith(LEGACY_STATUSES_PREFIX)) {
    return (
      "This project was created under Jirita's original ticket status system, before per-project custom statuses " +
      "existed. This is expected — its tickets will keep their current statuses after restoring. No action is needed."
    );
  }

  const missingMatch = warning.match(MISSING_PROFILES_PATTERN);
  if (missingMatch) {
    const count = missingMatch[1];
    return `${count} ${pluralUsers(count)} referenced by this backup no longer exist and can't be resolved automatically. You'll be able to choose how to handle them in the next step.`;
  }

  const outsideOrgMatch = warning.match(OUTSIDE_ORG_PATTERN);
  if (outsideOrgMatch) {
    const count = outsideOrgMatch[1];
    return `${count} ${pluralUsers(count)} referenced by this backup are not active members of the destination organization. You'll be able to choose how to map them in the next step.`;
  }

  return warning;
}

export function RestoreProjectPreviewModal({
  onClose,
  onAnalysisError,
  organizationId,
  organizationName,
  onRestored,
}: {
  onClose: () => void;
  /** Reported up so the caller can show it via the app's own ErrorToast,
   *  same as every other backend-call failure in this screen. */
  onAnalysisError: (message: string) => void;
  /** The caller's own organization (from useCurrentUser()) — used only to
   *  load its member list for the profile-mapping picker below and to
   *  label the destination in the plan summary. The backend never trusts
   *  this value for anything security-relevant: /api/projects/restore/plan
   *  and /api/projects/restore/execute always re-derive organizationId
   *  themselves from the caller's own verified Admin session (see
   *  require-admin-caller.ts). */
  organizationId: string;
  organizationName: string;
  /** Called once /api/projects/restore/execute reports success — the
   *  caller is expected to close this modal, refresh its own project
   *  list, and navigate to the new project (see project-settings-screen.tsx).
   *  This component never navigates itself. */
  onRestored: (project: { id: string; name: string; slug: string; projectCode: string }) => void;
}) {
  const [visible, setVisible] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [buildingPlan, setBuildingPlan] = useState(false);
  const [executing, setExecuting] = useState(false);
  const busy = analyzing || buildingPlan || executing;
  const [fileError, setFileError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [result, setResult] = useState<RestorePreviewResponse | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // The Admin's originally-selected .zip — kept in memory (this state
  // variable, nothing more: no Storage, no disk, no database, no
  // localStorage/cache) for exactly as long as this modal instance stays
  // open with this same file active. The plan-building step only ever
  // sends `result.backup` (already-parsed JSON, never this File) — this
  // File is read only once, by executeRestore() below, and re-submitted
  // as-is to /api/projects/restore/execute, which re-parses it completely
  // from scratch server-side (never trusts anything built earlier in this
  // flow). Cleared whenever the file changes, the flow resets, execution
  // succeeds, or this component unmounts (modal close).
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // ── Stage 2: destination project fields + profile mappings + built plan ──
  const [orgMembers, setOrgMembers] = useState<OrgMember[] | null>(null);
  const [showConfigure, setShowConfigure] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [projectSlug, setProjectSlug] = useState("");
  const [projectCode, setProjectCode] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ projectSlug?: string; projectCode?: string }>({});
  const [profileMappings, setProfileMappings] = useState<Record<string, string | null>>({});
  const [planResult, setPlanResult] = useState<RestorePlanSummary | null>(null);

  // ── Stage 3: confirmation + real execution ──
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  // Loaded once up front (not lazily on "Configure Restore") so the
  // mapping selects always have real candidates the moment Stage 2 opens.
  useEffect(() => {
    let cancelled = false;
    loadOrganizationMembers(organizationId).then((r) => {
      if (cancelled) return;
      if (r.status === "ready") setOrgMembers(r.members);
      else onAnalysisError(r.message);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId]);

  function handleClose() {
    if (busy) return;
    setVisible(false);
    setTimeout(onClose, 200);
  }

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy]);

  // /preview and /plan use {error}; /execute uses {stage, message} (the
  // shape the task explicitly asked for, so structured stage/cleanup info
  // survives) — this checks both rather than assuming one.
  function extractErrorMessage(body: unknown, fallback: string): string {
    if (body && typeof body === "object") {
      const obj = body as Record<string, unknown>;
      if (typeof obj.error === "string") return obj.error;
      if (typeof obj.message === "string") return obj.message;
    }
    return fallback;
  }

  function extractField(body: unknown): string | undefined {
    if (body && typeof body === "object" && "field" in body && typeof (body as { field: unknown }).field === "string") {
      return (body as { field: string }).field;
    }
    return undefined;
  }

  function extractStage(body: unknown): string | undefined {
    if (body && typeof body === "object" && "stage" in body && typeof (body as { stage: unknown }).stage === "string") {
      return (body as { stage: string }).stage;
    }
    return undefined;
  }

  async function analyze(file: File) {
    setAnalyzing(true);
    setResult(null);
    setShowConfigure(false);
    setPlanResult(null);
    setShowConfirm(false);
    setFieldErrors({});
    try {
      const supabase = getSupabaseBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        onAnalysisError("Your session has expired. Please sign in again.");
        return;
      }

      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/projects/restore/preview", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: formData,
      });

      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        onAnalysisError(extractErrorMessage(body, `Could not analyze this backup (${response.status}).`));
        return;
      }
      setResult(body as RestorePreviewResponse);
    } catch (err) {
      onAnalysisError(err instanceof Error ? err.message : "Something went wrong analyzing this backup.");
    } finally {
      setAnalyzing(false);
    }
  }

  function handleFileSelected(file: File) {
    setFileError(null);
    setResult(null);
    setSelectedFile(null);
    if (!file.name.toLowerCase().endsWith(".zip")) {
      setFileError("Please choose a .zip file.");
      return;
    }
    if (file.size === 0) {
      setFileError("That file is empty.");
      return;
    }
    if (file.size > MAX_ZIP_BYTES) {
      setFileError(
        `That file is too large (${formatBytes(file.size)}) to analyze here — this screen only accepts backups up to ${formatBytes(MAX_ZIP_BYTES)}. ` +
          `A large Full Backup can't be restored from this screen yet; export a Data Only Backup instead (excludes attachment files, keeps everything else) ` +
          `— your Full Backup is still saved as a complete archive for later.`
      );
      return;
    }
    setFileName(file.name);
    setSelectedFile(file);
    void analyze(file);
  }

  // Discards the selected File and every derived Stage 2 value — reached
  // whenever the Admin changes the file or explicitly restarts the flow
  // ("Choose a different file"). Closing the modal discards everything
  // just by unmounting (this component keeps no state outside React's own
  // lifecycle), which covers that case without any extra code here.
  function resetToFilePicker() {
    setResult(null);
    setFileName(null);
    setFileError(null);
    setSelectedFile(null);
    setShowConfigure(false);
    setPlanResult(null);
    setShowConfirm(false);
    setFieldErrors({});
  }

  // Step 3-4 of the flow: reveals the destination-project fields and
  // profile-mapping pickers once the Admin decides to continue past a
  // canRestore=true preview. Initial values are always the backup's own
  // originals (requirement: "usar los originales del backup") — a
  // resolvable reference is preselected to itself (it's already a real
  // member of the destination organization); missing/outsideOrganization
  // references start unmapped, never auto-selected.
  function openConfigure() {
    if (!result) return;
    setProjectName(result.preview.sourceProject.name);
    setProjectSlug(result.preview.sourceProject.slug);
    setProjectCode(result.preview.sourceProject.projectCode);
    const initialMappings: Record<string, string | null> = {};
    for (const ref of result.preview.profileReferences.resolvable) initialMappings[ref.profileId] = ref.profileId;
    for (const ref of result.preview.profileReferences.missing) initialMappings[ref.profileId] = null;
    for (const ref of result.preview.profileReferences.outsideOrganization) initialMappings[ref.profileId] = null;
    setProfileMappings(initialMappings);
    setFieldErrors({});
    setPlanResult(null);
    setShowConfirm(false);
    setShowConfigure(true);
  }

  // Step 5 of the flow: hands the already-parsed backup (never the .zip
  // itself, never physical attachment bytes) plus the Admin's chosen
  // destination values to /api/projects/restore/plan, which re-validates
  // everything server-side (slug/code availability, profile mapping
  // ownership, canRestore) and internally calls buildProjectRestorePlan()
  // purely to confirm the configuration is buildable — the response is
  // only ever the narrow RestorePlanSummary below, never the full plan
  // (see that route's own header comment for why).
  async function buildPlan() {
    if (!result) return;
    if (!projectName.trim() || !projectSlug.trim() || !projectCode.trim()) {
      onAnalysisError("Project Name, Slug, and Project Code are all required.");
      return;
    }
    setFieldErrors({});
    setBuildingPlan(true);
    setPlanResult(null);
    setShowConfirm(false);
    try {
      const supabase = getSupabaseBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        onAnalysisError("Your session has expired. Please sign in again.");
        return;
      }

      const response = await fetch("/api/projects/restore/plan", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          backup: result.backup,
          projectName: projectName.trim(),
          projectSlug: projectSlug.trim(),
          projectCode: projectCode.trim(),
          profileMappings,
        }),
      });

      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const field = extractField(body);
        if (field === "projectSlug" || field === "projectCode") {
          setFieldErrors({ [field]: extractErrorMessage(body, "This value is already in use.") });
          return;
        }
        onAnalysisError(extractErrorMessage(body, `Could not build the restore plan (${response.status}).`));
        return;
      }
      setPlanResult(body as RestorePlanSummary);
    } catch (err) {
      onAnalysisError(err instanceof Error ? err.message : "Something went wrong building the restore plan.");
    } finally {
      setBuildingPlan(false);
    }
  }

  // Step 6-7 of the flow: the ONLY function in this component that writes
  // anything. Re-submits the original .zip (selectedFile — never anything
  // derived from `result`/`planResult`) plus the same destination values
  // to /api/projects/restore/execute, which re-runs the entire pipeline
  // from scratch server-side (parseProjectBackupZip -> previewProjectRestore
  // -> fresh slug/code/profile validation -> buildProjectRestorePlan ->
  // executeProjectRestore) — nothing built earlier in this component is
  // reused or trusted by the backend for the actual write.
  async function executeRestore() {
    if (!selectedFile || executing) return; // guards against a double click firing two writes
    setExecuting(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        onAnalysisError("Your session has expired. Please sign in again.");
        return;
      }

      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("projectName", projectName.trim());
      formData.append("projectSlug", projectSlug.trim());
      formData.append("projectCode", projectCode.trim());
      formData.append("profileMappings", JSON.stringify(profileMappings));

      const response = await fetch("/api/projects/restore/execute", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: formData,
      });

      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const field = extractField(body);
        if (field === "projectSlug" || field === "projectCode") {
          // Discovered stale right at the moment of writing (someone else
          // took it since the plan was built) — send the Admin back to fix
          // the exact field, same as the earlier /plan-stage conflict.
          setFieldErrors({ [field]: extractErrorMessage(body, "This value is already in use.") });
          setShowConfirm(false);
          setShowConfigure(true);
          setPlanResult(null);
          return;
        }
        const stage = extractStage(body);
        onAnalysisError(
          `Restore failed${stage ? ` during ${stage}` : ""}: ${extractErrorMessage(body, `Could not restore this project (${response.status}).`)}`
        );
        // Deliberately no other state reset here: the File and the whole
        // configuration stay exactly as they are so the Admin can correct
        // something and retry, or just click Restore Project again — the
        // orchestrator's own cleanup (execute-project-restore.ts, untouched)
        // already guarantees nothing partial was left behind server-side.
        return;
      }

      const success = body as RestoreExecuteResponse;
      // Success — discard the File and every derived value now that it's
      // genuinely done, same as any other reset path.
      setSelectedFile(null);
      setResult(null);
      setFileName(null);
      setShowConfigure(false);
      setPlanResult(null);
      setShowConfirm(false);
      setFieldErrors({});
      onRestored(success.project);
    } catch (err) {
      onAnalysisError(err instanceof Error ? err.message : "Something went wrong restoring this project.");
    } finally {
      setExecuting(false);
    }
  }

  const allProfileRefs: { profileId: string; referencedIn: string[]; category: ProfileRefCategory }[] = result
    ? [
        ...result.preview.profileReferences.resolvable.map((r) => ({ ...r, category: "resolvable" as const })),
        ...result.preview.profileReferences.missing.map((r) => ({ ...r, category: "missing" as const })),
        ...result.preview.profileReferences.outsideOrganization.map((r) => ({ ...r, category: "outsideOrganization" as const })),
      ]
    : [];

  return (
    <>
      <div
        aria-hidden
        onClick={handleClose}
        className={
          "fixed inset-0 z-50 bg-black/30 dark:bg-black/50 transition-opacity duration-200 " +
          (visible ? "opacity-100" : "opacity-0")
        }
      />

      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 pointer-events-none">
        <div
          role="dialog"
          aria-modal
          aria-label="Restore Project"
          className={
            "pointer-events-auto w-full max-w-xl max-h-[85vh] flex flex-col " +
            "bg-white dark:bg-zinc-950 rounded-2xl border border-slate-200 dark:border-zinc-800 " +
            "shadow-2xl shadow-black/20 dark:shadow-black/60 " +
            "transition-all duration-200 ease-out " +
            (visible ? "opacity-100 translate-y-0 scale-100" : "opacity-0 translate-y-2 scale-[0.98]")
          }
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 pt-5 pb-4 flex-shrink-0">
            <h2 className="text-[15px] font-semibold text-slate-900 dark:text-zinc-50">Restore Project</h2>
            <button
              onClick={handleClose}
              disabled={busy}
              aria-label="Close"
              className="p-1.5 rounded-lg text-slate-400 dark:text-zinc-500 hover:text-slate-700 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Body */}
          <div className="px-6 pb-2 space-y-4 overflow-y-auto">
            <input
              ref={fileInputRef}
              type="file"
              accept=".zip"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileSelected(file);
                e.target.value = "";
              }}
            />

            {!result && (
              <div className="py-2">
                <p className="text-[13px] text-slate-500 dark:text-zinc-400 mb-1">
                  Choose a project backup .zip to see what it contains before restoring anything. Nothing is
                  restored yet — this only analyzes the file.
                </p>
                <p className="text-[12px] text-slate-400 dark:text-zinc-500 mb-3">
                  This screen accepts backups up to {formatBytes(MAX_ZIP_BYTES)}. A Data Only Backup easily fits regardless
                  of project size; a Full Backup only fits here while the project&apos;s attachments stay small.
                </p>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={busy}
                  className="text-[13px] font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-lg px-3.5 py-2 shadow-sm shadow-brand-600/20 transition-colors dark:bg-brand-500 dark:hover:bg-brand-600 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {analyzing ? "Analyzing backup…" : "Choose .zip file"}
                </button>
                {fileName && !fileError && (
                  <p className="text-[12px] text-slate-400 dark:text-zinc-500 mt-2">{fileName}</p>
                )}
                {fileError && <p className="text-[13px] text-red-600 dark:text-red-400 mt-2">{fileError}</p>}
              </div>
            )}

            {result && (
              <div className="pb-2">
                <SettingGroup title="Source Project">
                  <SettingRow label="Name">
                    <span className="text-[13px] text-slate-700 dark:text-zinc-300">{result.preview.sourceProject.name}</span>
                  </SettingRow>
                  <SettingRow label="Slug">
                    <span className="text-[13px] text-slate-700 dark:text-zinc-300 font-mono">{result.preview.sourceProject.slug}</span>
                  </SettingRow>
                  <SettingRow label="Project Code">
                    <span className="text-[13px] text-slate-700 dark:text-zinc-300 font-mono">{result.preview.sourceProject.projectCode}</span>
                  </SettingRow>
                  <SettingRow label="Exported">
                    <span className="text-[13px] text-slate-700 dark:text-zinc-300">{formatAbsoluteDateTime(result.exportedAt)}</span>
                  </SettingRow>
                </SettingGroup>

                <SettingGroup title="Contents">
                  {SUMMARY_ROWS.map(({ key, label }) => (
                    <SettingRow key={key} label={label}>
                      <span className="text-[13px] text-slate-700 dark:text-zinc-300">{result.preview.summary[key]}</span>
                    </SettingRow>
                  ))}
                  <AttachmentFilesRow included={result.attachmentsIncluded} />
                  <SettingRow label="Attachment Bytes">
                    <span className="text-[13px] text-slate-700 dark:text-zinc-300">{formatBytes(result.attachmentBytes)}</span>
                  </SettingRow>
                </SettingGroup>

                <SettingGroup title="Conflicts">
                  <SettingRow label="Slug already in use">
                    <span className={"text-[12px] font-semibold " + (result.preview.conflicts.slugInUse ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400")}>
                      {result.preview.conflicts.slugInUse ? "Yes" : "No"}
                    </span>
                  </SettingRow>
                  <SettingRow label="Project code already in use">
                    <span className={"text-[12px] font-semibold " + (result.preview.conflicts.projectCodeInUse ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400")}>
                      {result.preview.conflicts.projectCodeInUse ? "Yes" : "No"}
                    </span>
                  </SettingRow>
                </SettingGroup>

                <SettingGroup title="Profile References">
                  <SettingRow label="Resolvable">
                    <span className="text-[13px] text-slate-700 dark:text-zinc-300">{result.preview.profileReferences.resolvable.length}</span>
                  </SettingRow>
                  <SettingRow label="Missing">
                    <span className={"text-[13px] " + (result.preview.profileReferences.missing.length > 0 ? "text-amber-600 dark:text-amber-400 font-semibold" : "text-slate-700 dark:text-zinc-300")}>
                      {result.preview.profileReferences.missing.length}
                    </span>
                  </SettingRow>
                  <SettingRow label="Outside Organization">
                    <span className={"text-[13px] " + (result.preview.profileReferences.outsideOrganization.length > 0 ? "text-amber-600 dark:text-amber-400 font-semibold" : "text-slate-700 dark:text-zinc-300")}>
                      {result.preview.profileReferences.outsideOrganization.length}
                    </span>
                  </SettingRow>
                </SettingGroup>

                {result.preview.warnings.length > 0 && (
                  <SettingGroup title="Warnings">
                    <div className="py-3.5 space-y-1.5">
                      {result.preview.warnings.map((warning, i) => (
                        <p key={i} className="text-[12px] text-amber-700 dark:text-amber-400 leading-snug">
                          {humanizeWarning(warning)}
                        </p>
                      ))}
                    </div>
                  </SettingGroup>
                )}

                <div
                  className={
                    "rounded-lg px-3.5 py-2.5 text-[13px] font-medium mb-2 " +
                    (result.preview.canRestore
                      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"
                      : "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400")
                  }
                >
                  {result.preview.canRestore
                    ? "This backup can be restored. Continue to configure the destination and build a restore plan."
                    : "This backup cannot be restored yet — see warnings above."}
                </div>

                {/* ── Stage 2: destination project + profile mappings ── */}
                {showConfigure && !planResult && (
                  <div className="pb-2">
                    <SettingGroup title="Destination Project">
                      <div className="py-3.5 space-y-3">
                        <div>
                          <label className={LABEL}>Project Name</label>
                          <input
                            type="text"
                            value={projectName}
                            onChange={(e) => setProjectName(e.target.value)}
                            className={INPUT}
                          />
                        </div>
                        <div>
                          <label className={LABEL}>Slug</label>
                          <input
                            type="text"
                            value={projectSlug}
                            onChange={(e) => {
                              setProjectSlug(e.target.value);
                              setFieldErrors((f) => ({ ...f, projectSlug: undefined }));
                            }}
                            className={INPUT + (fieldErrors.projectSlug ? " " + INPUT_ERROR : "")}
                          />
                          {fieldErrors.projectSlug && (
                            <p className="text-[12px] text-red-600 dark:text-red-400 mt-1">{fieldErrors.projectSlug}</p>
                          )}
                        </div>
                        <div>
                          <label className={LABEL}>Project Code</label>
                          <input
                            type="text"
                            value={projectCode}
                            onChange={(e) => {
                              setProjectCode(e.target.value);
                              setFieldErrors((f) => ({ ...f, projectCode: undefined }));
                            }}
                            className={INPUT + (fieldErrors.projectCode ? " " + INPUT_ERROR : "")}
                          />
                          {fieldErrors.projectCode && (
                            <p className="text-[12px] text-red-600 dark:text-red-400 mt-1">{fieldErrors.projectCode}</p>
                          )}
                        </div>
                      </div>
                    </SettingGroup>

                    {allProfileRefs.length > 0 && (
                      <SettingGroup title="Profile Mappings" >
                        <div className="py-3.5 space-y-3">
                          {orgMembers === null && (
                            <p className="text-[13px] text-slate-400 dark:text-zinc-500">Loading organization members…</p>
                          )}
                          {orgMembers !== null &&
                            allProfileRefs.map((ref) => {
                              // "No permitir 'Do not map' cuando el profileId sea
                              // requerido por una membership" — members.profile_id
                              // is the only NOT NULL profile reference
                              // (resolveProfileRef's own required=true, see
                              // build-project-restore-plan.ts) — the backend
                              // enforces this too (ProjectRestorePlanError), this
                              // is just the UI reflecting the same rule up front.
                              const isRequired = ref.referencedIn.includes("members.profile_id");
                              return (
                                <div key={ref.profileId} className="border border-slate-100 dark:border-zinc-800 rounded-lg p-3">
                                  <div className="flex items-center justify-between gap-2 mb-1">
                                    <p className="text-[11px] font-mono text-slate-500 dark:text-zinc-500 truncate">{ref.profileId}</p>
                                    <span className={"flex-shrink-0 text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded " + categoryBadgeClass(ref.category)}>
                                      {categoryLabel(ref.category)}
                                    </span>
                                  </div>
                                  <p className="text-[11px] text-slate-400 dark:text-zinc-600 mb-2">{ref.referencedIn.join(", ")}</p>
                                  <select
                                    value={profileMappings[ref.profileId] ?? ""}
                                    onChange={(e) =>
                                      setProfileMappings((m) => ({ ...m, [ref.profileId]: e.target.value === "" ? null : e.target.value }))
                                    }
                                    className={INPUT}
                                  >
                                    {!isRequired && <option value="">Do not map</option>}
                                    {orgMembers.map((m) => (
                                      <option key={m.id} value={m.id}>
                                        {m.name}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              );
                            })}
                        </div>
                      </SettingGroup>
                    )}

                    <div className="flex items-center gap-3 py-3">
                      <button
                        type="button"
                        onClick={buildPlan}
                        disabled={busy || orgMembers === null}
                        className="text-[13px] font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-lg px-3.5 py-2 shadow-sm shadow-brand-600/20 transition-colors dark:bg-brand-500 dark:hover:bg-brand-600 disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        {buildingPlan ? "Building plan…" : "Build Restore Plan"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowConfigure(false)}
                        disabled={busy}
                        className="text-[13px] font-medium text-slate-500 dark:text-zinc-400 border border-slate-200 dark:border-zinc-700 px-3 py-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-zinc-800/50 transition-colors disabled:opacity-60"
                      >
                        Back
                      </button>
                    </div>
                  </div>
                )}

                {/* ── Stage 2 result: final plan summary — a safe, narrow
                     summary from the backend, never the full ProjectRestorePlan
                     (no ticket/comment/activity/time-entry rows, no id maps,
                     no attachment bytes ever reach this component). ── */}
                {planResult && !showConfirm && (
                  <div className="pb-2">
                    <SettingGroup title="Restore Plan">
                      <SettingRow label="Project Name">
                        <span className="text-[13px] text-slate-700 dark:text-zinc-300">{planResult.project.name}</span>
                      </SettingRow>
                      <SettingRow label="Slug">
                        <span className="text-[13px] text-slate-700 dark:text-zinc-300 font-mono">{planResult.project.slug}</span>
                      </SettingRow>
                      <SettingRow label="Project Code">
                        <span className="text-[13px] text-slate-700 dark:text-zinc-300 font-mono">{planResult.project.projectCode}</span>
                      </SettingRow>
                      <SettingRow label="Destination Organization">
                        <span className="text-[13px] text-slate-700 dark:text-zinc-300">{organizationName}</span>
                      </SettingRow>
                    </SettingGroup>

                    <SettingGroup title="Plan Contents">
                      {SUMMARY_ROWS.map(({ key, label }) => (
                        <SettingRow key={key} label={label}>
                          <span className="text-[13px] text-slate-700 dark:text-zinc-300">{planResult.summary[key]}</span>
                        </SettingRow>
                      ))}
                      <AttachmentFilesRow included={planResult.attachmentsIncluded} />
                      <SettingRow label="Attachment Bytes">
                        <span className="text-[13px] text-slate-700 dark:text-zinc-300">{formatBytes(planResult.attachmentBytes)}</span>
                      </SettingRow>
                    </SettingGroup>

                    <SettingGroup title="Profiles">
                      <SettingRow label="Mapped">
                        <span className="text-[13px] text-slate-700 dark:text-zinc-300">{planResult.mappedProfiles}</span>
                      </SettingRow>
                      <SettingRow label="Omitted (Do not map)">
                        <span className="text-[13px] text-slate-700 dark:text-zinc-300">{planResult.omittedProfiles}</span>
                      </SettingRow>
                    </SettingGroup>

                    {planResult.warnings.length > 0 && (
                      <SettingGroup title="Warnings">
                        <div className="py-3.5 space-y-1.5">
                          {planResult.warnings.map((warning, i) => (
                            <p key={i} className="text-[12px] text-amber-700 dark:text-amber-400 leading-snug">
                              {humanizeWarning(warning)}
                            </p>
                          ))}
                        </div>
                      </SettingGroup>
                    )}

                    <div className="flex items-center gap-3 py-3">
                      <button
                        type="button"
                        onClick={() => setShowConfirm(true)}
                        className="text-[13px] font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-lg px-3.5 py-2 shadow-sm shadow-brand-600/20 transition-colors dark:bg-brand-500 dark:hover:bg-brand-600"
                      >
                        Restore Project
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowConfigure(true)}
                        className="text-[13px] font-medium text-slate-500 dark:text-zinc-400 border border-slate-200 dark:border-zinc-700 px-3 py-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-zinc-800/50 transition-colors"
                      >
                        Edit Configuration
                      </button>
                    </div>
                  </div>
                )}

                {/* ── Stage 3: final confirmation before the only real write
                     in this entire feature. Re-states the same safe summary
                     already shown above — no new data fetch — plus the
                     required disclaimers, and only Cancel/Restore Project;
                     no other option. ── */}
                {planResult && showConfirm && (
                  <div className="pb-2">
                    <SettingGroup title="Confirm Restore">
                      <SettingRow label="Project Name">
                        <span className="text-[13px] text-slate-700 dark:text-zinc-300">{planResult.project.name}</span>
                      </SettingRow>
                      <SettingRow label="Slug">
                        <span className="text-[13px] text-slate-700 dark:text-zinc-300 font-mono">{planResult.project.slug}</span>
                      </SettingRow>
                      <SettingRow label="Project Code">
                        <span className="text-[13px] text-slate-700 dark:text-zinc-300 font-mono">{planResult.project.projectCode}</span>
                      </SettingRow>
                      <SettingRow label="Tickets">
                        <span className="text-[13px] text-slate-700 dark:text-zinc-300">{planResult.summary.tickets}</span>
                      </SettingRow>
                      <SettingRow label="Members">
                        <span className="text-[13px] text-slate-700 dark:text-zinc-300">{planResult.summary.members}</span>
                      </SettingRow>
                      <SettingRow label="Comments">
                        <span className="text-[13px] text-slate-700 dark:text-zinc-300">{planResult.summary.comments}</span>
                      </SettingRow>
                      <SettingRow label="Time Entries">
                        <span className="text-[13px] text-slate-700 dark:text-zinc-300">{planResult.summary.timeEntries}</span>
                      </SettingRow>
                      <SettingRow label="Attachments (metadata)">
                        <span className="text-[13px] text-slate-700 dark:text-zinc-300">{planResult.summary.attachments}</span>
                      </SettingRow>
                      <AttachmentFilesRow included={planResult.attachmentsIncluded} />
                    </SettingGroup>

                    {planResult.warnings.length > 0 && (
                      <SettingGroup title="Warnings">
                        <div className="py-3.5 space-y-1.5">
                          {planResult.warnings.map((warning, i) => (
                            <p key={i} className="text-[12px] text-amber-700 dark:text-amber-400 leading-snug">
                              {humanizeWarning(warning)}
                            </p>
                          ))}
                        </div>
                      </SettingGroup>
                    )}

                    <div className="rounded-lg px-3.5 py-3 text-[12px] leading-relaxed bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300 space-y-1 mb-2">
                      <p>Restoring always creates a brand-new project — it never replaces or modifies the original.</p>
                      <p>GitHub repository connections are not restored.</p>
                      {!planResult.attachmentsIncluded && <p>This is a Data Only Backup — attachment files won&apos;t be available after restoring.</p>}
                    </div>

                    <div className="flex items-center gap-3 py-3">
                      <button
                        type="button"
                        onClick={executeRestore}
                        disabled={executing}
                        className="text-[13px] font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-lg px-3.5 py-2 shadow-sm shadow-brand-600/20 transition-colors dark:bg-brand-500 dark:hover:bg-brand-600 disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        {executing ? "Restoring project…" : "Restore Project"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowConfirm(false)}
                        disabled={executing}
                        className="text-[13px] font-medium text-slate-500 dark:text-zinc-400 border border-slate-200 dark:border-zinc-700 px-3 py-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-zinc-800/50 transition-colors disabled:opacity-60"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {!showConfigure && !planResult && (
                  <div className="flex items-center gap-3">
                    {result.preview.canRestore && (
                      <button
                        type="button"
                        onClick={openConfigure}
                        disabled={busy}
                        className="text-[13px] font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-lg px-3.5 py-2 shadow-sm shadow-brand-600/20 transition-colors dark:bg-brand-500 dark:hover:bg-brand-600 disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        Configure Restore
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={resetToFilePicker}
                      disabled={busy}
                      className="text-[13px] font-medium text-slate-500 dark:text-zinc-400 border border-slate-200 dark:border-zinc-700 px-3 py-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-zinc-800/50 transition-colors disabled:opacity-60"
                    >
                      Choose a different file
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 px-6 py-4 mt-1 border-t border-slate-100 dark:border-zinc-800 flex-shrink-0 rounded-b-2xl bg-slate-50/40 dark:bg-zinc-900/20">
            <button
              onClick={handleClose}
              disabled={busy}
              className="px-4 py-2 text-[13px] font-medium text-slate-500 dark:text-zinc-500 hover:text-slate-800 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-lg transition-colors disabled:opacity-50"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
