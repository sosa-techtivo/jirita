"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { AuthCard } from "@/components/auth/auth-card";
import { AuthPasswordField } from "@/components/auth/password-field";
import { AuthSubmitButton } from "@/components/auth/auth-button";
import { PasswordStrengthMeter } from "@/components/auth/password-strength-meter";
import { getPasswordStrength, mockResetPassword } from "@/lib/mock-auth";

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
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const errors = validate(password, confirmPassword);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setLoading(true);
    await mockResetPassword(password);
    setLoading(false);
    setDone(true);
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
