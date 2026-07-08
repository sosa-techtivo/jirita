"use client";

import { useEffect, useRef, useState, type ChangeEvent, type DragEvent, type FormEvent } from "react";
import Link from "next/link";
import { ROLE_LABELS, type CurrentUser } from "@/lib/current-user";
import { useCurrentUser } from "@/components/current-user-provider";
import { SettingRow, SettingGroup } from "@/components/settings-ui";
import { ThemeToggle } from "@/components/theme-toggle";
import { getDefaultTicketView, setDefaultTicketView, type DefaultTicketView } from "@/lib/user-preferences";
import { ALLOWED_AVATAR_TYPES, validateAvatarFile } from "@/lib/avatar-upload";

const NAME_INPUT =
  "text-[13px] text-slate-800 dark:text-zinc-200 bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-700 " +
  "rounded-lg px-2.5 py-1.5 outline-none focus:border-brand-500 dark:focus:border-brand-400 transition-colors w-44";

const CHANGE_PASSWORD_LINK =
  "flex-shrink-0 text-[13px] font-medium text-brand-600 dark:text-brand-400 border border-brand-200 dark:border-brand-500/30 " +
  "px-3 py-1.5 rounded-lg hover:bg-brand-50 dark:hover:bg-brand-500/5 transition-colors";

function ListIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M9 6H5v3h4V6zM9 15H5v3h4v-3zM21 8H13M21 12H13M21 17H13" />
    </svg>
  );
}

function BoardIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <rect x="3" y="3" width="7" height="18" rx="1.5" />
      <rect x="14" y="3" width="7" height="11" rx="1.5" />
    </svg>
  );
}

const TICKET_VIEW_OPTIONS: { value: DefaultTicketView; label: string; icon: React.ReactNode }[] = [
  { value: "board", label: "Board", icon: <BoardIcon /> },
  { value: "list", label: "List", icon: <ListIcon /> },
];

function TicketViewToggle({ value, onChange }: { value: DefaultTicketView; onChange: (v: DefaultTicketView) => void }) {
  return (
    <div
      className="inline-flex items-center gap-0.5 rounded-md border border-slate-200 bg-slate-50 p-0.5 dark:border-zinc-700 dark:bg-zinc-800"
      role="radiogroup"
      aria-label="Default Ticket View"
    >
      {TICKET_VIEW_OPTIONS.map((opt) => {
        const isActive = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={isActive}
            onClick={() => onChange(opt.value)}
            className={`flex items-center gap-1.5 rounded-[5px] px-2.5 py-1.5 text-xs font-medium transition-colors ${
              isActive
                ? "bg-white text-slate-700 shadow-sm dark:bg-zinc-700 dark:text-zinc-100"
                : "text-slate-400 hover:text-slate-600 dark:text-zinc-500 dark:hover:text-zinc-300"
            }`}
          >
            {opt.icon}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

// Wraps the existing avatar <img> (unchanged size/shape/position) with
// click-to-upload and drag & drop. Resting appearance is pixel-identical to
// before; the overlay only ever appears on hover/drag/upload.
function AvatarPicker({ user }: { user: CurrentUser }) {
  const { uploadAvatar } = useCurrentUser();
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewUrlRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

  async function handleFile(file: File) {
    setUploadError(null);
    const validationError = validateAvatarFile(file);
    if (validationError) {
      setUploadError(validationError);
      return;
    }

    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    const objectUrl = URL.createObjectURL(file);
    previewUrlRef.current = objectUrl;
    setPreview(objectUrl);

    setUploading(true);
    const result = await uploadAvatar(file);
    setUploading(false);

    if (!result.success) {
      setUploadError(result.message ?? "Something went wrong. Please try again.");
      setPreview(null);
    }
  }

  function handleInputChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file later
    if (file) void handleFile(file);
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  }

  return (
    <div className="flex-shrink-0">
      <div
        role="button"
        tabIndex={0}
        aria-label="Change profile photo"
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            fileInputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className="relative w-14 h-14 flex-shrink-0 rounded-full cursor-pointer group"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={preview || user.avatar}
          alt={user.name}
          className="w-14 h-14 rounded-full flex-shrink-0"
        />
        <div
          className={`absolute inset-0 rounded-full flex items-center justify-center bg-black/50 transition-opacity ${
            uploading || dragOver ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          }`}
        >
          {uploading ? (
            <svg className="w-4 h-4 animate-spin text-white" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M4 7h3l2-2h6l2 2h3a1 1 0 011 1v11a1 1 0 01-1 1H4a1 1 0 01-1-1V8a1 1 0 011-1z" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="12" cy="13" r="3.5" />
            </svg>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept={ALLOWED_AVATAR_TYPES.join(",")}
          onChange={handleInputChange}
          className="hidden"
        />
      </div>
      {uploadError && (
        <p className="mt-1.5 text-[11px] text-red-600 dark:text-red-400 max-w-[7rem]">{uploadError}</p>
      )}
    </div>
  );
}

// Profile is only ever mounted client-side (AuthGuard blanks out AppShell's
// children until the auth check resolves), so reading localStorage in a
// lazy useState initializer below is safe — this never runs during SSR.
export function ProfileScreen() {
  const { user } = useCurrentUser();
  // Remounts the form (resetting its local draft state) whenever the
  // underlying mock identity changes — e.g. the dev-only RoleSwitcher swaps
  // to a different mock user — instead of syncing it back with an effect.
  return <ProfileForm key={user.email} user={user} />;
}

function ProfileForm({ user }: { user: CurrentUser }) {
  const { updateProfile } = useCurrentUser();

  const [firstName, setFirstName] = useState(user.firstName);
  const [lastName, setLastName] = useState(user.lastName);
  const [weeklyCapacity, setWeeklyCapacity] = useState(String(user.weeklyCapacity));
  const [defaultView, setDefaultViewState] = useState<DefaultTicketView>(() => getDefaultTicketView());
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const parsedCapacity = Number(weeklyCapacity);
    const result = await updateProfile({
      firstName: firstName.trim() || user.firstName,
      lastName: lastName.trim() || user.lastName,
      weeklyCapacity: Number.isFinite(parsedCapacity) && parsedCapacity >= 0 ? parsedCapacity : user.weeklyCapacity,
    });
    setDefaultTicketView(defaultView);

    setSaving(false);
    if (result.success) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } else {
      setError(result.message ?? "Something went wrong. Please try again.");
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-8 pb-16">
      <div className="mb-8">
        <h1 className="text-[22px] font-bold text-slate-900 dark:text-zinc-50 tracking-tight leading-none mb-1.5">
          Profile
        </h1>
        <p className="text-sm text-slate-400 dark:text-zinc-500">
          Manage your personal information and preferences.
        </p>
      </div>

      <form onSubmit={handleSave}>
        {error && (
          <div
            role="alert"
            className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 px-3 py-2.5 text-[12.5px] text-red-700 dark:text-red-400"
          >
            <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 8v5M12 16h.01" strokeLinecap="round" />
            </svg>
            <span>{error}</span>
          </div>
        )}

        <SettingGroup title="Profile Information">
          <div className="flex items-center gap-3.5 py-4">
            <AvatarPicker user={user} />
            <div>
              <p className="text-[15px] font-semibold text-slate-900 dark:text-zinc-50">{user.name}</p>
              <p className="text-[12px] text-slate-400 dark:text-zinc-500 mt-0.5">{ROLE_LABELS[user.role]}</p>
            </div>
          </div>

          <SettingRow label="First Name">
            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className={NAME_INPUT}
            />
          </SettingRow>
          <SettingRow label="Last Name">
            <input
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className={NAME_INPUT}
            />
          </SettingRow>
          <SettingRow label="Email" hint="Contact an admin to change your email">
            <span className="text-[13px] text-slate-500 dark:text-zinc-400">{user.email}</span>
          </SettingRow>
          <SettingRow label="Role">
            <span className="text-[13px] text-slate-500 dark:text-zinc-400">{ROLE_LABELS[user.role]}</span>
          </SettingRow>
          <SettingRow label="Weekly Capacity">
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                step="1"
                value={weeklyCapacity}
                onChange={(e) => setWeeklyCapacity(e.target.value)}
                className={`${NAME_INPUT} w-20`}
              />
              <span className="text-[13px] text-slate-500 dark:text-zinc-400">h / week</span>
            </div>
          </SettingRow>
        </SettingGroup>

        <SettingGroup title="Preferences">
          <SettingRow label="Theme" hint="Applies immediately across the app">
            <ThemeToggle />
          </SettingRow>
          <SettingRow label="Default Ticket View" hint="Used when you open a project's Tickets tab">
            <TicketViewToggle value={defaultView} onChange={setDefaultViewState} />
          </SettingRow>
        </SettingGroup>

        <SettingGroup title="Account">
          <SettingRow label="Member Since">
            <span className="text-[13px] text-slate-500 dark:text-zinc-400">{user.memberSince}</span>
          </SettingRow>
          <SettingRow label="Last Login">
            <span className="text-[13px] text-slate-500 dark:text-zinc-400">{user.lastLogin}</span>
          </SettingRow>
        </SettingGroup>

        <SettingGroup title="Security">
          <SettingRow label="Password" hint="Change the password for your account">
            <Link href="/change-password" className={CHANGE_PASSWORD_LINK}>
              Change Password
            </Link>
          </SettingRow>
        </SettingGroup>

        <div className="flex items-center gap-3 mt-2">
          <button
            type="submit"
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
        </div>
      </form>
    </div>
  );
}
