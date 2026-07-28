"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";

// Same backdrop/animation/Escape/body-scroll-lock shell as the existing
// modals (see invite-user-modal.tsx), bottom-anchored instead of centered
// so it reads as a mobile sheet. Mobile-only in practice — only ever
// triggered from MobileTabBar's "More" tab (Admin or Project Lead,
// `md:hidden`) — but kept `md:hidden` here too as a defensive no-op if a
// viewport resize happens while it's open.
//
// Fully role-agnostic: the caller (MobileTabBar) computes both `extraLinks`
// (any main-nav item not already a direct tab bar entry — My Work for
// Admin, none for Project Lead, since all five of theirs are already
// direct tabs) and `projectLinks` (Admin's pinned Projects list, or a
// Project Lead's own led-projects list) and passes them in, so this
// component never needs to know which role opened it. Profile/Log out are
// deliberately never here — those live exclusively in the header avatar's
// own AccountMenu dropdown (already reused as-is).
export interface MobileMoreLink {
  href: string;
  label: string;
  icon: ReactNode;
}

export interface MobileMoreProjectLink {
  slug: string;
  name: string;
  dotClassName: string;
}

const ROW_CLASS =
  "w-full flex items-center gap-3 px-4 py-3 text-[14px] text-left text-slate-700 dark:text-zinc-300 " +
  "hover:bg-slate-50 dark:hover:bg-zinc-800/60 transition-colors";

function SectionLabel({ children }: { children: string }) {
  return (
    <p className="px-4 pt-3 pb-1 text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600">
      {children}
    </p>
  );
}

export function MobileMoreSheet({
  onClose,
  extraLinks,
  projectLinks,
}: {
  onClose: () => void;
  extraLinks: MobileMoreLink[];
  projectLinks: MobileMoreProjectLink[];
}) {
  const [visible, setVisible] = useState(false);

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

  function handleClose() {
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
  }, []);

  const isEmpty = extraLinks.length === 0 && projectLinks.length === 0;

  return (
    <div className="md:hidden">
      <div
        aria-hidden
        onClick={handleClose}
        className={
          "fixed inset-0 z-50 bg-black/30 dark:bg-black/50 transition-opacity duration-200 " +
          (visible ? "opacity-100" : "opacity-0")
        }
      />

      <div className="fixed inset-0 z-50 flex items-end justify-center pointer-events-none">
        <div
          role="dialog"
          aria-modal
          aria-label="More"
          className={
            "pointer-events-auto w-full flex flex-col max-h-[75vh] bg-white dark:bg-zinc-950 " +
            "rounded-t-2xl border-t border-slate-200 dark:border-zinc-800 " +
            "shadow-2xl shadow-black/20 dark:shadow-black/60 " +
            "pb-[env(safe-area-inset-bottom)] " +
            "transition-transform duration-200 ease-out " +
            (visible ? "translate-y-0" : "translate-y-full")
          }
        >
          <div className="flex items-center justify-between px-4 pt-4 pb-2 flex-shrink-0">
            <h2 className="text-[15px] font-semibold text-slate-900 dark:text-zinc-50">More</h2>
            <button
              type="button"
              onClick={handleClose}
              aria-label="Close"
              className="p-1.5 rounded-lg text-slate-400 dark:text-zinc-500 hover:text-slate-700 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {extraLinks.length > 0 && (
              <div className="pb-1">
                {extraLinks.map((link) => (
                  <Link key={link.href} href={link.href} onClick={handleClose} className={ROW_CLASS}>
                    {link.icon}
                    {link.label}
                  </Link>
                ))}
              </div>
            )}

            {projectLinks.length > 0 && (
              <div className="border-t border-slate-100 dark:border-zinc-800 pb-1 first:border-t-0">
                <SectionLabel>Projects</SectionLabel>
                {projectLinks.map((project) => (
                  <Link
                    key={project.slug}
                    href={`/projects/${project.slug}`}
                    onClick={handleClose}
                    className={ROW_CLASS}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${project.dotClassName}`} />
                    <span className="truncate">{project.name}</span>
                  </Link>
                ))}
              </div>
            )}

            {isEmpty && (
              <p className="px-4 py-6 text-xs text-slate-400 dark:text-zinc-600 text-center">
                No additional options right now.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
