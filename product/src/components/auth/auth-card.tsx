"use client";

import { useEffect, useState, type ReactNode } from "react";
import Image from "next/image";

// Standalone page shell for the login / forgot-password / reset-password
// screens — mirrors the modal shell's fade+rise entrance (see
// invite-user-modal.tsx) but as a centered full page instead of an overlay.
export function AuthCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-background px-4 py-10">
      <div
        className={
          "w-full max-w-sm transition-all duration-300 ease-out " +
          (visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2")
        }
      >
        <div className="flex flex-col items-center mb-6">
          <Image
            src="/img/jirita-logo.png"
            alt="Jirita"
            width={217}
            height={47}
            className="h-8 w-auto"
            priority
          />
          <p className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-brand-600/70 dark:text-brand-400/80">
            Jirita
          </p>
        </div>

        <div className="bg-white dark:bg-zinc-950 rounded-2xl border border-slate-200 dark:border-zinc-800 shadow-2xl shadow-black/10 dark:shadow-black/60 px-6 py-7 sm:px-8 sm:py-8">
          <div className="mb-6">
            <h1 className="text-[19px] font-semibold text-slate-900 dark:text-zinc-50 tracking-tight">
              {title}
            </h1>
            {subtitle && (
              <div className="mt-1.5 text-[13px] text-slate-500 dark:text-zinc-400">{subtitle}</div>
            )}
          </div>
          {children}
        </div>
      </div>
    </main>
  );
}
