"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthCard } from "@/components/auth/auth-card";
import { AuthTextField } from "@/components/auth/text-field";
import { AuthPasswordField } from "@/components/auth/password-field";
import { AuthSubmitButton } from "@/components/auth/auth-button";
import { AuthError, isValidEmail, login } from "@/lib/auth";

interface FieldErrors {
  email?: string;
  password?: string;
}

function validate(email: string, password: string): FieldErrors {
  const errors: FieldErrors = {};
  if (!email.trim()) errors.email = "Email is required.";
  else if (!isValidEmail(email)) errors.email = "Enter a valid email address.";
  if (!password) errors.password = "Password is required.";
  return errors;
}

export function LoginScreen() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);

    const errors = validate(email, password);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setLoading(true);
    try {
      await login(email, password);
      window.localStorage.setItem("jirita:remember-me", rememberMe ? "true" : "false");
      router.push("/dashboard");
    } catch (err) {
      setFormError(err instanceof AuthError ? err.message : "Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  return (
    <AuthCard title="Welcome back" subtitle="Sign in to your Jirita workspace.">
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

        <AuthTextField
          label="Email"
          type="email"
          autoComplete="email"
          autoFocus
          placeholder="you@techtivo.com"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setFieldErrors((prev) => ({ ...prev, email: undefined }));
            setFormError(null);
          }}
          error={fieldErrors.email}
        />

        <div>
          <AuthPasswordField
            label="Password"
            autoComplete="current-password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setFieldErrors((prev) => ({ ...prev, password: undefined }));
              setFormError(null);
            }}
            error={fieldErrors.password}
            showCapsLockWarning
          />
          <div className="mt-1.5 text-right">
            <Link href="/forgot-password" className="text-[12.5px] font-medium text-brand-600 dark:text-brand-400 hover:underline">
              Forgot password?
            </Link>
          </div>
        </div>

        <label className="flex items-center gap-2.5 cursor-pointer select-none">
          <span
            className={[
              "flex-shrink-0 w-4 h-4 rounded border flex items-center justify-center transition-colors",
              rememberMe
                ? "bg-brand-600 border-brand-600 dark:bg-brand-500 dark:border-brand-500"
                : "border-slate-300 dark:border-zinc-600",
            ].join(" ")}
          >
            {rememberMe && (
              <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path d="M5 12l5 5L20 7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </span>
          <input
            type="checkbox"
            checked={rememberMe}
            onChange={() => setRememberMe((v) => !v)}
            className="sr-only"
          />
          <span className="text-[13px] text-slate-600 dark:text-zinc-400">Remember me</span>
        </label>

        <AuthSubmitButton loading={loading}>
          {loading ? "Signing in…" : "Sign In"}
        </AuthSubmitButton>
      </form>
    </AuthCard>
  );
}
