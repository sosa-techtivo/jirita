// Simulated auth layer for the frontend UX prototype — no backend/Supabase
// wired up yet. Swap the bodies of these functions for real API calls later;
// call sites (login/forgot-password/reset-password screens) shouldn't need
// to change shape when that happens.

import { MOCK_USERS } from "./current-user";

const MOCK_LATENCY_MS = 900;
const MOCK_PASSWORD = "password123";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export class AuthError extends Error {}

export interface MockAuthUser {
  name: string;
  email: string;
  avatar: string;
}

// Surfaced in the login screen's "Prototype credentials" box and "Use demo
// account" button — single source of truth so it can't drift from the
// values mockLogin actually accepts.
export const DEMO_CREDENTIALS = {
  email: MOCK_USERS.ADMIN.email,
  password: MOCK_PASSWORD,
};

export async function mockLogin(email: string, password: string): Promise<MockAuthUser> {
  await delay(MOCK_LATENCY_MS);
  const account = Object.values(MOCK_USERS).find(
    (user) => user.email.toLowerCase() === email.trim().toLowerCase()
  );
  if (!account || password !== MOCK_PASSWORD) {
    throw new AuthError("Invalid email or password.");
  }
  return { name: account.name, email: account.email, avatar: account.avatar };
}

// Mock authenticated-session state for the prototype — a real backend would
// use httpOnly cookies/JWTs; localStorage is a stand-in until Supabase (or
// similar) is wired up.
const SESSION_STORAGE_KEY = "jirita:mock-auth-session";

export function saveAuthSession(user: MockAuthUser): void {
  window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(user));
}

export function getAuthSession(): MockAuthUser | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as MockAuthUser;
  } catch {
    return null;
  }
}

export function isAuthenticated(): boolean {
  return getAuthSession() !== null;
}

export function clearAuthSession(): void {
  window.localStorage.removeItem(SESSION_STORAGE_KEY);
}

// Always resolves — a real backend wouldn't reveal whether an email has an
// account, so the UI can't branch on that either.
export async function mockRequestPasswordReset(email: string): Promise<void> {
  void email;
  await delay(MOCK_LATENCY_MS);
}

export async function mockResetPassword(newPassword: string): Promise<void> {
  void newPassword;
  await delay(MOCK_LATENCY_MS);
}

// Every mock account shares MOCK_PASSWORD (see DEMO_CREDENTIALS above), so
// "current password" verification just checks against that same constant.
export async function mockChangePassword(currentPassword: string, newPassword: string): Promise<void> {
  await delay(MOCK_LATENCY_MS);
  void newPassword;
  if (currentPassword !== MOCK_PASSWORD) {
    throw new AuthError("Current password is incorrect.");
  }
}

export type PasswordStrength = 0 | 1 | 2 | 3 | 4;

export function getPasswordStrength(password: string): PasswordStrength {
  if (!password) return 0;
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  return Math.min(score, 4) as PasswordStrength;
}

export const PASSWORD_STRENGTH_LABEL: Record<PasswordStrength, string> = {
  0: "Very weak",
  1: "Weak",
  2: "Fair",
  3: "Good",
  4: "Strong",
};
