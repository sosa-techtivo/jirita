"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { SETTINGS_SECTIONS, DANGER_SECTION } from "./settings-screen";
import { useCurrentUser } from "@/components/current-user-provider";
import { Toggle, SelectField, TextField, NumberField, SettingRow, SettingGroup } from "@/components/settings-ui";
import { SkeletonBlock } from "@/components/dashboard-shared";
import { ROLE_LABELS, type Role } from "@/lib/current-user";
import type { Organization } from "@/lib/membership";
import { getSupabaseBrowserClient } from "@/lib/supabase-client";
import { updateOrganizationSettingsAction } from "@/lib/server/update-organization-settings-action";

// ── Section content components ─────────────────────────────────────────────────

// ISO weekday numbers (1 = Monday .. 7 = Sunday), same convention
// organizations.active_days is stored/validated in
// (20260815000000_add_organization_settings_defaults.sql) — reused for both
// the real day-picker below and its loading skeleton, so they can never
// drift out of sync with each other.
const WEEKDAYS: { value: number; label: string }[] = [
  { value: 1, label: "Mo" },
  { value: 2, label: "Tu" },
  { value: 3, label: "We" },
  { value: 4, label: "Th" },
  { value: 5, label: "Fr" },
  { value: 6, label: "Sa" },
  { value: 7, label: "Su" },
];

const GENERAL_ROLE_OPTIONS: Role[] = ["ADMIN", "PROJECT_LEAD", "MEMBER"];

interface GeneralDraft {
  name: string;
  defaultRole: Role;
  defaultWeeklyCapacity: number;
  activeDays: number[];
}

function toDraft(organization: Organization): GeneralDraft {
  return {
    name: organization.name,
    defaultRole: organization.defaultRole,
    defaultWeeklyCapacity: organization.defaultWeeklyCapacity,
    activeDays: organization.activeDays,
  };
}

// Same three real, functional rules the Server Action itself re-validates
// (update-organization-settings-action.ts) — checked here first so an
// invalid value never even reaches the network, surfaced through the same
// saveError display a real rejection from the action would use.
function validateGeneralDraft(draft: GeneralDraft): string | null {
  if (!draft.name.trim()) return "Workspace name is required.";
  if (draft.activeDays.length === 0) return "Select at least one active day.";
  if (!Number.isFinite(draft.defaultWeeklyCapacity) || draft.defaultWeeklyCapacity <= 0) {
    return "Default capacity must be greater than 0.";
  }
  return null;
}

// Mirrors GeneralContent's own real layout (title/groups/rows/inputs) below
// — only the still-loading *values* are placeholders, same convention every
// other real skeleton in this app already uses (never a generic "Loading…"
// text, never the old hardcoded mock values flashing first).
function GeneralSkeleton() {
  return (
    <>
      <SettingGroup title="Workspace">
        <SettingRow label="Workspace Name">
          <SkeletonBlock className="h-8 w-52 rounded-lg" />
        </SettingRow>
      </SettingGroup>

      <SettingGroup title="Working Days">
        <SettingRow label="Active Days" hint="Days counted in capacity calculations">
          <div className="flex gap-1">
            {WEEKDAYS.map((weekday) => (
              <SkeletonBlock key={weekday.value} className="w-8 h-8 rounded-lg" />
            ))}
          </div>
        </SettingRow>
      </SettingGroup>

      <SettingGroup title="Defaults">
        <SettingRow label="Default Role" hint="Applied when inviting new users">
          <SkeletonBlock className="h-8 w-40 rounded-lg" />
        </SettingRow>
        <SettingRow label="Default Capacity" hint="Weekly hour limit per person">
          <SkeletonBlock className="h-8 w-28 rounded-lg" />
        </SettingRow>
      </SettingGroup>
    </>
  );
}

// Real Workspace/Active Days/Defaults — reads from organizations.name/
// default_role/default_weekly_capacity/active_days via useCurrentUser()'s
// real `organization` (see lib/membership.ts's loadMembership). Logo/
// Timezone/Language are gone outright (not disabled, not placeholders —
// see the audit this is based on: no schema, no consumer anywhere in the
// app, out of MVP scope).
//
// `draft` is a locally-controlled copy of the real organization row, only
// ever synced back from context while there are no unsaved local edits
// (`isDirty`) — see the effect below — so a background refresh (tab-regain
// focus, route change; both already handled by CurrentUserProvider's
// existing mechanisms, no new listener added here) can never silently
// clobber an in-progress edit, and a failed save never discards what the
// admin typed.
function GeneralContent() {
  const { organization, user, retry } = useCurrentUser();
  const isAdmin = user.role === "ADMIN";

  const [draft, setDraft] = useState<GeneralDraft | null>(() => (organization ? toDraft(organization) : null));
  const [isDirty, setIsDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!organization || isDirty) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: resyncs the local draft the instant a genuinely new `organization` reference arrives (mount, or after a successful save's own retry() refetch resolves), same "reset before/because of an external data change" pattern used elsewhere in this app.
    setDraft(toDraft(organization));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: only resync from a genuinely new `organization` reference — `isDirty` is read but deliberately excluded from the deps so this doesn't re-run (and revert the just-saved draft back to a still-stale `organization`) the instant a save flips isDirty from true to false, before that refetch has actually completed.
  }, [organization]);

  if (!organization || !draft) {
    return <GeneralSkeleton />;
  }

  function updateDraft<K extends keyof GeneralDraft>(key: K, value: GeneralDraft[K]) {
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
    setIsDirty(true);
    setSaveError(null);
    setSaved(false);
  }

  function toggleDay(day: number) {
    setDraft((prev) => {
      if (!prev) return prev;
      const activeDays = prev.activeDays.includes(day)
        ? prev.activeDays.filter((d) => d !== day)
        : [...prev.activeDays, day];
      return { ...prev, activeDays };
    });
    setIsDirty(true);
    setSaveError(null);
    setSaved(false);
  }

  async function handleSave() {
    if (saving || !isDirty || !organization || !draft) return; // no-op saves and duplicate submits both bail out here
    const validationError = validateGeneralDraft(draft);
    if (validationError) {
      setSaveError(validationError);
      return;
    }

    setSaving(true);
    setSaveError(null);
    setSaved(false);

    const supabase = getSupabaseBrowserClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      setSaving(false);
      setSaveError("Your session has expired. Please sign in again.");
      return;
    }

    const result = await updateOrganizationSettingsAction({
      accessToken: session.access_token,
      organizationId: organization.id,
      name: draft.name.trim(),
      defaultRole: draft.defaultRole,
      defaultWeeklyCapacity: draft.defaultWeeklyCapacity,
      activeDays: draft.activeDays,
    });

    setSaving(false);

    if (result.status === "error") {
      setSaveError(result.message); // keep the edited values on screen — never reset to a default
      return;
    }

    setIsDirty(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    retry(); // refreshes useCurrentUser().organization with the real persisted row
  }

  return (
    <>
      <SettingGroup title="Workspace">
        <SettingRow label="Workspace Name">
          <TextField value={draft.name} onChange={(v) => updateDraft("name", v)} disabled={!isAdmin} />
        </SettingRow>
      </SettingGroup>

      <SettingGroup title="Working Days">
        <SettingRow label="Active Days" hint="Days counted in capacity calculations">
          <div className="flex gap-1">
            {WEEKDAYS.map((weekday) => {
              const active = draft.activeDays.includes(weekday.value);
              return (
                <button
                  key={weekday.value}
                  type="button"
                  disabled={!isAdmin}
                  onClick={() => toggleDay(weekday.value)}
                  className={`w-8 h-8 rounded-lg text-[12px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                    active
                      ? "bg-brand-500 text-white hover:bg-brand-600"
                      : "bg-slate-100 text-slate-400 hover:bg-slate-200 dark:bg-zinc-800 dark:text-zinc-600 dark:hover:bg-zinc-700"
                  }`}
                >
                  {weekday.label}
                </button>
              );
            })}
          </div>
        </SettingRow>
      </SettingGroup>

      {/* Defaults applied when inviting a new user from the Users page
          (/users) — kept here rather than on that page since these are
          workspace-wide policy, not something set per-invite. */}
      <SettingGroup title="Defaults">
        <SettingRow label="Default Role" hint="Applied when inviting new users">
          <SelectField
            value={draft.defaultRole}
            onChange={(v) => updateDraft("defaultRole", v as Role)}
            options={GENERAL_ROLE_OPTIONS.map((r) => ({ value: r, label: ROLE_LABELS[r] }))}
            disabled={!isAdmin}
          />
        </SettingRow>
        <SettingRow label="Default Capacity" hint="Weekly hour limit per person">
          <NumberField
            value={draft.defaultWeeklyCapacity}
            suffix="h / week"
            onChange={(v) => updateDraft("defaultWeeklyCapacity", v)}
            disabled={!isAdmin}
          />
        </SettingRow>
      </SettingGroup>

      {/* Save Changes — same pattern (button label/disabled state, "Changes
          saved" checkmark, inline red error text) as Project Settings'
          own save button, the closest existing precedent for a real save
          in this app's Settings-style screens. */}
      <div className="flex items-center gap-3 mt-2 mb-6">
        <button
          type="button"
          onClick={handleSave}
          disabled={!isAdmin || saving || !isDirty}
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
    </>
  );
}

function TimeTrackingContent() {
  return (
    <>
      <SettingGroup title="Working Hours">
        <SettingRow label="Hours per Day" hint="Standard workday length">
          <NumberField value={8} suffix="h / day" />
        </SettingRow>
        <SettingRow label="Weekly Capacity" hint="Max billable hours per person per week">
          <NumberField value={40} suffix="h / week" />
        </SettingRow>
      </SettingGroup>

      <SettingGroup title="Estimation">
        <SettingRow label="Default Estimation Unit">
          <SelectField value="Hours" />
        </SettingRow>
        <SettingRow label="Show Estimated Hours on Tickets" hint="Displays the estimation field in ticket view">
          <Toggle on />
        </SettingRow>
        <SettingRow label="Require Estimation on New Tickets">
          <Toggle on={false} />
        </SettingRow>
      </SettingGroup>

      <SettingGroup title="Rounding">
        <SettingRow label="Hour Rounding" hint="Log entries are rounded to this increment">
          <SelectField value="0.5h increments" />
        </SettingRow>
        <SettingRow label="Round Up by Default">
          <Toggle on={false} />
        </SettingRow>
      </SettingGroup>
    </>
  );
}

function NotificationsContent() {
  return (
    <>
      <SettingGroup title="Email Notifications">
        <SettingRow label="Ticket assigned to you">
          <Toggle on />
        </SettingRow>
        <SettingRow label="Mentioned in a comment">
          <Toggle on />
        </SettingRow>
        <SettingRow label="Ticket status changes" hint="Only for tickets you're watching">
          <Toggle on={false} />
        </SettingRow>
        <SettingRow label="Weekly digest">
          <Toggle on />
        </SettingRow>
      </SettingGroup>

      <SettingGroup title="Desktop Notifications">
        <SettingRow label="Enable desktop notifications">
          <Toggle on />
        </SettingRow>
        <SettingRow label="Mentions only" hint="Suppress all non-mention desktop alerts">
          <Toggle on={false} />
        </SettingRow>
      </SettingGroup>

      <SettingGroup title="Weekly Digest">
        <SettingRow label="Send on">
          <SelectField value="Friday" />
        </SettingRow>
        <SettingRow label="Delivery time">
          <SelectField value="9:00 AM" />
        </SettingRow>
      </SettingGroup>
    </>
  );
}

function IntegrationsContent() {
  return (
    <>
      <SettingGroup title="Connected">
        <div className="py-3">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-slate-900 dark:bg-white flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-white dark:text-slate-900" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                </svg>
              </div>
              <div>
                <p className="text-[13px] font-semibold text-slate-900 dark:text-zinc-100">GitHub</p>
                <p className="text-[11px] text-slate-400 dark:text-zinc-500 mt-0.5">3 repositories connected</p>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {["Techtivo/mobile-app", "Techtivo/api-gateway", "Techtivo/design-system"].map((r) => (
                    <span key={r} className="text-[10px] font-medium bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-zinc-500 px-1.5 py-0.5 rounded">{r}</span>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                Connected
              </span>
              <button className="text-[12px] text-slate-400 dark:text-zinc-600 hover:text-red-500 dark:hover:text-red-400">Disconnect</button>
            </div>
          </div>
        </div>
      </SettingGroup>

      <SettingGroup title="Available">
        {[
          { name: "Slack",           hint: "Post updates to channels",         soon: false },
          { name: "Google Calendar", hint: "Sync due dates to your calendar",  soon: false },
          { name: "Jira Import",     hint: "One-time migration from Jira",     soon: true  },
        ].map((item) => (
          <div key={item.name} className="flex items-center justify-between gap-4 py-3.5 border-b border-slate-100 dark:border-zinc-800/70 last:border-0">
            <div>
              <p className="text-[13px] font-medium text-slate-800 dark:text-zinc-200">{item.name}</p>
              <p className="text-[11px] text-slate-400 dark:text-zinc-500 mt-0.5">{item.hint}</p>
            </div>
            {item.soon ? (
              <span className="text-[11px] font-semibold bg-slate-100 dark:bg-zinc-800 text-slate-400 dark:text-zinc-600 px-2.5 py-1 rounded-full">
                Coming soon
              </span>
            ) : (
              <button className="text-[13px] font-medium text-brand-600 dark:text-brand-400 border border-brand-200 dark:border-brand-500/30 px-3 py-1.5 rounded-lg hover:bg-brand-50 dark:hover:bg-brand-500/5 transition-colors">
                Connect
              </button>
            )}
          </div>
        ))}
      </SettingGroup>
    </>
  );
}

function DangerZoneContent() {
  return (
    <>
      <div className="mb-4 flex items-start gap-3 p-4 rounded-xl bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-700/30">
        <svg className="w-4.5 h-4.5 text-amber-500 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
        </svg>
        <p className="text-[12px] text-amber-700 dark:text-amber-300/80">
          These actions affect your entire workspace. Proceed with caution — some cannot be undone.
        </p>
      </div>

      <SettingGroup title="Archive">
        <div className="py-4">
          <div className="flex items-start justify-between gap-6">
            <div>
              <p className="text-[13px] font-semibold text-slate-800 dark:text-zinc-200">Archive Workspace</p>
              <p className="text-[12px] text-slate-400 dark:text-zinc-500 mt-0.5 max-w-xs">
                All activity is paused. Members lose access. You can reactivate the workspace at any time.
              </p>
            </div>
            <button className="flex-shrink-0 text-[13px] font-medium text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-600/40 bg-amber-50 dark:bg-amber-500/5 px-3 py-1.5 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-500/10 transition-colors">
              Archive Workspace
            </button>
          </div>
        </div>
      </SettingGroup>

      <SettingGroup title="Delete">
        <div className="py-4">
          <div className="flex items-start justify-between gap-6">
            <div>
              <p className="text-[13px] font-semibold text-red-700 dark:text-red-400">Delete Workspace</p>
              <p className="text-[12px] text-slate-400 dark:text-zinc-500 mt-0.5 max-w-xs">
                Permanently deletes all projects, tickets, members and data. <strong className="font-semibold text-slate-600 dark:text-zinc-400">This action cannot be undone.</strong>
              </p>
            </div>
            <button className="flex-shrink-0 text-[13px] font-medium text-white bg-red-600 hover:bg-red-700 px-3 py-1.5 rounded-lg transition-colors">
              Delete Workspace
            </button>
          </div>
        </div>
      </SettingGroup>
    </>
  );
}

// ── Section content dispatch ───────────────────────────────────────────────────

function SectionContent({ slug }: { slug: string }) {
  switch (slug) {
    case "general":       return <GeneralContent />;
    case "time-tracking": return <TimeTrackingContent />;
    case "notifications": return <NotificationsContent />;
    case "integrations":  return <IntegrationsContent />;
    case "danger-zone":   return <DangerZoneContent />;
    default:
      return (
        <div className="flex items-center justify-center h-40 text-slate-400 dark:text-zinc-600 text-sm">
          Section not found.
        </div>
      );
  }
}

// ── Section meta lookup ────────────────────────────────────────────────────────

const ALL_SECTIONS = [...SETTINGS_SECTIONS, DANGER_SECTION];

function sectionMeta(slug: string) {
  return ALL_SECTIONS.find((s) => s.slug === slug) ?? ALL_SECTIONS[0];
}

// ── Left nav ───────────────────────────────────────────────────────────────────

function SettingsNav({ active }: { active: string }) {
  const { user } = useCurrentUser();
  // Only ADMIN has the Settings nav item; other roles reach this screen via
  // the Time Tracking nav link only, so they shouldn't see the rest of the
  // admin settings area from here.
  const sections = user.role === "ADMIN" ? ALL_SECTIONS : ALL_SECTIONS.filter((s) => s.slug === "time-tracking");

  return (
    <nav className="space-y-0.5 sticky top-4">
      {sections.map((s) => {
        const isActive = s.slug === active;
        const isDanger = s.slug === "danger-zone";
        return (
          <Link
            key={s.slug}
            href={`/settings/${s.slug}`}
            className={[
              "flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors",
              isActive
                ? isDanger
                  ? "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400"
                  : "bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-400"
                : isDanger
                  ? "text-red-500 hover:bg-red-50 dark:text-red-500/70 dark:hover:bg-red-500/5"
                  : "text-slate-600 hover:bg-slate-100 dark:text-zinc-400 dark:hover:bg-zinc-900",
            ].join(" ")}
          >
            <span className={`flex-shrink-0 ${
              isActive
                ? isDanger ? "text-red-500 dark:text-red-400" : "text-brand-500 dark:text-brand-400"
                : isDanger ? "text-red-400/70 dark:text-red-600" : "text-slate-400 dark:text-zinc-600"
            }`}>
              {s.icon}
            </span>
            {s.title}
          </Link>
        );
      })}
    </nav>
  );
}

// ── Breadcrumb ─────────────────────────────────────────────────────────────────

export function SettingsBreadcrumb({ section, title }: { section: string; title: string }) {
  const { user } = useCurrentUser();
  // Non-admins only ever reach here via the Time Tracking nav item, so the
  // "Settings" crumb shouldn't link them into the admin-only settings hub.
  if (section === "time-tracking" && user.role !== "ADMIN") {
    return <span className="text-slate-800 font-medium dark:text-zinc-200">{title}</span>;
  }
  return (
    <>
      <Link
        href="/settings"
        className="text-slate-400 hover:text-slate-600 dark:text-zinc-500 dark:hover:text-zinc-300"
      >
        Settings
      </Link>
      <span className="text-slate-300 dark:text-zinc-700">/</span>
      <span className="text-slate-800 font-medium dark:text-zinc-200">{title}</span>
    </>
  );
}

// ── Main exported component ────────────────────────────────────────────────────

export function SettingsSectionScreen({ section }: { section: string }) {
  const meta = sectionMeta(section);
  const isDanger = section === "danger-zone";

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 pb-16">

      {/* Two-column layout */}
      <div className="grid grid-cols-[180px_1fr] gap-10">

        {/* Left nav */}
        <div>
          <SettingsNav active={section} />
        </div>

        {/* Right content */}
        <div className="min-w-0">
          {/* Section header */}
          <div className="mb-6">
            <div className="flex items-center gap-3 mb-1">
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${meta.iconBg} ${meta.iconColor}`}>
                {meta.icon}
              </div>
              <h1 className={`text-[18px] font-bold tracking-tight ${isDanger ? "text-red-700 dark:text-red-300" : "text-slate-900 dark:text-zinc-50"}`}>
                {meta.title}
              </h1>
            </div>
            <p className="text-[13px] text-slate-400 dark:text-zinc-500 ml-11">
              {meta.description}
            </p>
          </div>

          {/* Section-specific content */}
          <SectionContent slug={section} />
        </div>
      </div>
    </div>
  );
}
