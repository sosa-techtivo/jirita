"use client";

import { getPasswordStrength, PASSWORD_STRENGTH_LABEL, type PasswordStrength } from "@/lib/mock-auth";

const BAR_COLOR: Record<PasswordStrength, string> = {
  0: "bg-red-400 dark:bg-red-500",
  1: "bg-red-400 dark:bg-red-500",
  2: "bg-amber-400 dark:bg-amber-500",
  3: "bg-emerald-400 dark:bg-emerald-500",
  4: "bg-emerald-500 dark:bg-emerald-400",
};

const LABEL_COLOR: Record<PasswordStrength, string> = {
  0: "text-red-500 dark:text-red-400",
  1: "text-red-500 dark:text-red-400",
  2: "text-amber-600 dark:text-amber-400",
  3: "text-emerald-600 dark:text-emerald-400",
  4: "text-emerald-600 dark:text-emerald-400",
};

export function PasswordStrengthMeter({ password }: { password: string }) {
  if (!password) return null;
  const strength = getPasswordStrength(password);

  return (
    <div className="mt-2">
      <div className="flex gap-1">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-colors ${i < strength ? BAR_COLOR[strength] : "bg-slate-100 dark:bg-zinc-800"}`}
          />
        ))}
      </div>
      <p className={`mt-1 text-[11px] font-medium ${LABEL_COLOR[strength]}`}>
        {PASSWORD_STRENGTH_LABEL[strength]}
      </p>
    </div>
  );
}
