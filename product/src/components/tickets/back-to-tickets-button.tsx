"use client";

import { useRouter } from "next/navigation";

export function BackToTicketsButton() {
  const router = useRouter();
  return (
    <button
      onClick={() => router.back()}
      className="inline-flex items-center gap-1.5 text-[12px] text-slate-400 dark:text-zinc-600 hover:text-slate-600 dark:hover:text-zinc-400 transition-colors"
    >
      <svg
        className="w-3.5 h-3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        viewBox="0 0 24 24"
      >
        <path d="M15 18l-6-6 6-6" />
      </svg>
      Back to Tickets
    </button>
  );
}
