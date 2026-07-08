// Login/logout/session now go through real Supabase Auth — see lib/auth.ts.
// Change Password remains mock (out of scope for that pass) until it's
// wired to supabase.auth.updateUser() too; the password-strength helpers
// below are shared by both the mock and real auth screens.

const MOCK_LATENCY_MS = 900;
const MOCK_PASSWORD = "password123";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class AuthError extends Error {}

// Every mock account shares this same password, so "current password"
// verification just checks against that one constant.
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
