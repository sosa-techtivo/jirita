"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { ROLE_LABELS, type CurrentUser } from "@/lib/current-user";
import { useCurrentUser } from "@/components/current-user-provider";
import { SettingRow, SettingGroup } from "@/components/settings-ui";
import { ThemeToggle } from "@/components/theme-toggle";
import { getDefaultTicketView, setDefaultTicketView, type DefaultTicketView } from "@/lib/user-preferences";

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
  const [defaultView, setDefaultViewState] = useState<DefaultTicketView>(() => getDefaultTicketView());
  const [saved, setSaved] = useState(false);

  function handleSave(e: FormEvent) {
    e.preventDefault();
    updateProfile({
      firstName: firstName.trim() || user.firstName,
      lastName: lastName.trim() || user.lastName,
    });
    setDefaultTicketView(defaultView);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
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
        <SettingGroup title="Profile Information">
          <div className="flex items-center gap-3.5 py-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={user.avatar} alt={user.name} className="w-14 h-14 rounded-full flex-shrink-0" />
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
            <span className="text-[13px] text-slate-500 dark:text-zinc-400">{user.weeklyCapacity}h / week</span>
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
            className="text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-lg px-3.5 py-2 shadow-sm shadow-brand-600/20 transition-colors dark:bg-brand-500 dark:hover:bg-brand-600 dark:shadow-brand-500/20"
          >
            Save Changes
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
