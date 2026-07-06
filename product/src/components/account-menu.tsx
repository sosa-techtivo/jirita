"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { clearAuthSession } from "@/lib/mock-auth";
import { useCurrentUser } from "@/components/current-user-provider";

// Header avatar → small account popover with a Logout action. Modeled on
// FilterDropdown's trigger/popover shell (outside-click + Escape to close)
// but scoped down to a single menu, no selection state.
export function AccountMenu() {
  const router = useRouter();
  const { user } = useCurrentUser();
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    function onMouseDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setIsOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen]);

  function handleLogout() {
    clearAuthSession();
    router.push("/login");
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-label="Account menu"
        className="block rounded-full ring-offset-2 ring-offset-white dark:ring-offset-[var(--background)] focus:outline-none focus:ring-2 focus:ring-brand-500/50"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={user.avatar} alt={user.name} className="w-7 h-7 rounded-full" />
      </button>

      <div
        role="menu"
        aria-label="Account"
        className={[
          "absolute top-full right-0 mt-1.5 z-50 w-56",
          "rounded-xl border bg-white dark:bg-zinc-900",
          "shadow-lg shadow-black/10 dark:shadow-black/40",
          "border-slate-200 dark:border-zinc-700/60",
          "transition-all duration-150 origin-top-right",
          isOpen
            ? "opacity-100 scale-100 pointer-events-auto"
            : "opacity-0 scale-95 pointer-events-none",
        ].join(" ")}
      >
        <div className="px-3.5 pt-3 pb-2.5 border-b border-slate-100 dark:border-zinc-800">
          <p className="text-[13px] font-semibold text-slate-800 dark:text-zinc-200 truncate">{user.name}</p>
          <p className="text-[12px] text-slate-400 dark:text-zinc-500 truncate">{user.email}</p>
        </div>
        <div className="py-1.5">
          <Link
            href="/profile"
            role="menuitem"
            onClick={() => setIsOpen(false)}
            className="w-full flex items-center gap-2.5 px-3.5 py-1.5 text-[13px] text-left text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800/60 transition-colors"
          >
            <svg className="w-4 h-4 text-slate-400 dark:text-zinc-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <circle cx="12" cy="8" r="4" />
              <path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
            </svg>
            My Profile
          </Link>
          <Link
            href="/change-password"
            role="menuitem"
            onClick={() => setIsOpen(false)}
            className="w-full flex items-center gap-2.5 px-3.5 py-1.5 text-[13px] text-left text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800/60 transition-colors"
          >
            <svg className="w-4 h-4 text-slate-400 dark:text-zinc-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <rect x="5" y="11" width="14" height="9" rx="1.5" />
              <path d="M8 11V7a4 4 0 118 0v4" />
            </svg>
            Change Password
          </Link>
        </div>
        <div className="py-1.5 border-t border-slate-100 dark:border-zinc-800">
          <button
            type="button"
            role="menuitem"
            onClick={handleLogout}
            className="w-full flex items-center gap-2.5 px-3.5 py-1.5 text-[13px] text-left text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800/60 transition-colors"
          >
            <svg className="w-4 h-4 text-slate-400 dark:text-zinc-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M16 17l5-5-5-5M21 12H9" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Log out
          </button>
        </div>
      </div>
    </div>
  );
}
