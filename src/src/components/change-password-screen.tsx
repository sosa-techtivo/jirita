"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { AuthPasswordField } from "@/components/auth/password-field";
import { PasswordStrengthMeter } from "@/components/auth/password-strength-meter";
import { AuthSubmitButton } from "@/components/auth/auth-button";
import { AuthError, getPasswordStrength, mockChangePassword } from "@/lib/mock-auth";

interface FieldErrors {
  currentPassword?: string;
  newPassword?: string;
  confirmPassword?: string;
}

function validate(currentPassword: string, newPassword: string, confirmPassword: string): FieldErrors {
  const errors: FieldErrors = {};
  if (!currentPassword) errors.currentPassword = "Current password is required.";

  if (!newPassword) errors.newPassword = "New password is required.";
  else if (newPassword.length < 8) errors.newPassword = "Password must be at least 8 characters.";
  else if (getPasswordStrength(newPassword) < 2) errors.newPassword = "Choose a stronger password.";

  if (!confirmPassword) errors.confirmPassword = "Please confirm your new password.";
  else if (newPassword && confirmPassword !== newPassword) errors.confirmPassword = "Passwords do not match.";

  return errors;
}

export function ChangePasswordScreen() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);

    const errors = validate(currentPassword, newPassword, confirmPassword);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setLoading(true);
    try {
      await mockChangePassword(currentPassword, newPassword);
      setLoading(false);
      setDone(true);
    } catch (err) {
      setFormError(err instanceof AuthError ? err.message : "Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div className="max-w-md mx-auto px-6 py-8 pb-16">
      <div className="mb-6">
        <h1 className="text-[18px] font-bold text-slate-900 dark:text-zinc-50 tracking-tight">Change Password</h1>
        <p className="text-[13px] text-slate-400 dark:text-zinc-500 mt-1">
          Update the password for your Jirita account.
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-zinc-700/70 bg-white dark:bg-zinc-900 shadow-sm shadow-slate-200/40 dark:shadow-black/20 p-6">
        {done ? (
          <div className="flex flex-col items-center text-center py-2">
            <div className="w-11 h-11 rounded-full bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center mb-4">
              <svg className="w-5 h-5 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M5 12l5 5L20 7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <p className="text-[14px] font-semibold text-slate-800 dark:text-zinc-200">Password updated successfully.</p>
            <p className="mt-1.5 text-[13px] text-slate-500 dark:text-zinc-400">
              Use your new password next time you sign in.
            </p>
            <Link href="/profile" className="block w-full mt-6">
              <AuthSubmitButton>Go to Profile</AuthSubmitButton>
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            {formError && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-lg border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 px-3 py-2.5 text-[12.5px] text-red-700 dark:text-red-400"
              >
                <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 8v5M12 16h.01" strokeLinecap="round" />
                </svg>
                <span>{formError}</span>
              </div>
            )}

            <AuthPasswordField
              label="Current Password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={currentPassword}
              onChange={(e) => {
                setCurrentPassword(e.target.value);
                setFieldErrors((prev) => ({ ...prev, currentPassword: undefined }));
                setFormError(null);
              }}
              error={fieldErrors.currentPassword}
            />

            <div>
              <AuthPasswordField
                label="New Password"
                autoComplete="new-password"
                placeholder="••••••••"
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value);
                  setFieldErrors((prev) => ({ ...prev, newPassword: undefined }));
                  setFormError(null);
                }}
                error={fieldErrors.newPassword}
              />
              <PasswordStrengthMeter password={newPassword} />
            </div>

            <AuthPasswordField
              label="Confirm New Password"
              autoComplete="new-password"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                setFieldErrors((prev) => ({ ...prev, confirmPassword: undefined }));
                setFormError(null);
              }}
              error={fieldErrors.confirmPassword}
            />

            <AuthSubmitButton loading={loading}>{loading ? "Updating…" : "Update Password"}</AuthSubmitButton>
          </form>
        )}
      </div>
    </div>
  );
}
