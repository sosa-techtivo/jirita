"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { AuthCard } from "@/components/auth/auth-card";
import { AuthPasswordField } from "@/components/auth/password-field";
import { AuthSubmitButton } from "@/components/auth/auth-button";
import { PasswordStrengthMeter } from "@/components/auth/password-strength-meter";
import { getPasswordStrength } from "@/lib/mock-auth";
import { AuthError, confirmPasswordReset } from "@/lib/auth";

interface FieldErrors {
  password?: string;
  confirmPassword?: string;
}

function validate(password: string, confirmPassword: string): FieldErrors {
  const errors: FieldErrors = {};
  if (!password) errors.password = "New password is required.";
  else if (password.length < 8) errors.password = "Password must be at least 8 characters.";
  else if (getPasswordStrength(password) < 2) errors.password = "Choose a stronger password.";

  if (!confirmPassword) errors.confirmPassword = "Please confirm your new password.";
  else if (password && confirmPassword !== password) errors.confirmPassword = "Passwords do not match.";

  return errors;
}

export function ResetPasswordScreen() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const errors = validate(password, confirmPassword);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setLoading(true);
    try {
      await confirmPasswordReset(password);
      setLoading(false);
      setDone(true);
    } catch (err) {
      setFormError(err instanceof AuthError ? err.message : "Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  if (done) {
    return (
      <AuthCard title="All set">
        <div className="flex flex-col items-center text-center">
          <div className="w-11 h-11 rounded-full bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center mb-4">
            <svg className="w-5 h-5 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M5 12l5 5L20 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <p className="text-[14px] font-semibold text-slate-800 dark:text-zinc-200">Password updated successfully.</p>
          <p className="mt-1.5 text-[13px] text-slate-500 dark:text-zinc-400">
            You can now sign in with your new password.
          </p>

          <Link href="/login" className="block w-full mt-6">
            <AuthSubmitButton>Go to Login</AuthSubmitButton>
          </Link>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Reset your password" subtitle="Choose a new password for your account.">
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

        <div>
          <AuthPasswordField
            label="New password"
            autoComplete="new-password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setFieldErrors((prev) => ({ ...prev, password: undefined }));
            }}
            error={fieldErrors.password}
          />
          <PasswordStrengthMeter password={password} />
        </div>

        <AuthPasswordField
          label="Confirm password"
          autoComplete="new-password"
          placeholder="••••••••"
          value={confirmPassword}
          onChange={(e) => {
            setConfirmPassword(e.target.value);
            setFieldErrors((prev) => ({ ...prev, confirmPassword: undefined }));
          }}
          error={fieldErrors.confirmPassword}
        />

        <AuthSubmitButton loading={loading}>{loading ? "Updating…" : "Update password"}</AuthSubmitButton>
      </form>
    </AuthCard>
  );
}
