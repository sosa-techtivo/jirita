"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { AuthCard } from "@/components/auth/auth-card";
import { AuthTextField } from "@/components/auth/text-field";
import { AuthSubmitButton, AuthSecondaryButton } from "@/components/auth/auth-button";
import { isValidEmail, requestPasswordReset } from "@/lib/auth";

export function ForgotPasswordScreen() {
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim()) {
      setEmailError("Email is required.");
      return;
    }
    if (!isValidEmail(email)) {
      setEmailError("Enter a valid email address.");
      return;
    }
    setEmailError(null);
    setLoading(true);
    await requestPasswordReset(email);
    setLoading(false);
    setSent(true);
  }

  async function handleResend() {
    setResending(true);
    await requestPasswordReset(email);
    setResending(false);
  }

  if (sent) {
    return (
      <AuthCard title="Check your email">
        <div className="flex flex-col items-center text-center">
          <div className="w-11 h-11 rounded-full bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center mb-4">
            <svg className="w-5 h-5 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M5 12l5 5L20 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <p className="text-[14px] font-semibold text-slate-800 dark:text-zinc-200">Recovery email sent.</p>
          <p className="mt-1.5 text-[13px] text-slate-500 dark:text-zinc-400">
            We sent a password recovery link to <span className="font-medium text-slate-700 dark:text-zinc-300">{email}</span>.
          </p>

          <div className="mt-6 w-full space-y-2.5">
            <AuthSecondaryButton loading={resending} onClick={handleResend}>
              {resending ? "Resending…" : "Resend email"}
            </AuthSecondaryButton>
            <Link href="/login" className="block">
              <AuthSubmitButton>Back to login</AuthSubmitButton>
            </Link>
          </div>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Forgot password?"
      subtitle="Enter the email associated with your account and we'll send you a link to reset your password."
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <AuthTextField
          label="Email"
          type="email"
          autoComplete="email"
          autoFocus
          placeholder="you@techtivo.com"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setEmailError(null);
          }}
          error={emailError ?? undefined}
        />

        <AuthSubmitButton loading={loading}>{loading ? "Sending…" : "Send recovery email"}</AuthSubmitButton>

        <p className="text-center text-[12.5px] text-slate-500 dark:text-zinc-400">
          <Link href="/login" className="font-medium text-brand-600 dark:text-brand-400 hover:underline">
            Back to login
          </Link>
        </p>
      </form>
    </AuthCard>
  );
}
