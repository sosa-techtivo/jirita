// Server-only. The one, single source of truth for JIRITA's own public
// base URL — used to build every absolute link this app generates outside
// a browser's own window.location: email CTAs (notification-email.ts) and
// Supabase Auth invite/reset links (invite-user-action.ts). Both used to
// read process.env.NEXT_PUBLIC_APP_URL and normalize it themselves,
// slightly differently (one threw on missing, one didn't) — this module
// replaces both of those local implementations. Never import this from a
// "use client" file — same window guard as every other server-only module
// in this directory (e.g. github-token-crypto.ts).
//
// Still reads NEXT_PUBLIC_APP_URL specifically — despite the NEXT_PUBLIC_
// prefix (a naming leftover from before every real usage of this value
// became server-side only), it's the variable already established and
// documented for this purpose (see .env.example), and every real read of
// it in this codebase is server-only.
//
// Deliberately never infers a domain from the incoming request (headers,
// origin) or from Vercel's own VERCEL_URL: both can resolve to a Preview
// deployment's ephemeral *.vercel.app domain, which must never leak into a
// real link sent to a user. The only fallback this module ever produces is
// a hardcoded localhost default, and only when this code clearly isn't
// running on any real Vercel deployment at all — a genuine Preview or
// Production deployment with a missing NEXT_PUBLIC_APP_URL gets no silent
// guess, ever; see requireAppBaseUrl/getAppBaseUrl below.

if (typeof window !== "undefined") {
  throw new Error("app-base-url.ts must never be imported by client-side code.");
}

const LOCAL_DEV_FALLBACK_URL = "http://localhost:3000";

function normalize(url: string): string {
  return url.replace(/\/+$/, "");
}

// True only when this process clearly isn't a real Vercel deployment of
// any kind — VERCEL_ENV is unset locally, and always one of
// "development" | "preview" | "production" on Vercel itself. NODE_ENV is
// checked too, defensively, in case this ever runs in a production build
// off Vercel. This is the one gate that decides whether a localhost
// fallback is ever appropriate — it never looks at VERCEL_URL or any
// request data, so it can never resolve to a Preview domain.
function isLocalDevRuntime(): boolean {
  if (process.env.VERCEL_ENV) return false;
  if (process.env.NODE_ENV === "production") return false;
  return true;
}

// Returns null — never a guessed domain — when NEXT_PUBLIC_APP_URL isn't
// explicitly configured and this isn't a genuine local dev runtime. Use
// this directly wherever a missing/omitted link is an acceptable
// degradation (e.g. an email CTA button that can just not render).
export function getAppBaseUrl(): string | null {
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  if (configured) return normalize(configured);
  return isLocalDevRuntime() ? LOCAL_DEV_FALLBACK_URL : null;
}

// Same resolution as getAppBaseUrl, but throws a clear, identifiable error
// when no URL could be resolved at all — for callers that need a real,
// usable URL to do their job (e.g. minting an invite/reset link that's
// about to be emailed or handed to an admin to copy).
export function requireAppBaseUrl(): string {
  const url = getAppBaseUrl();
  if (!url) {
    throw new Error(
      "Missing NEXT_PUBLIC_APP_URL. Set it in .env.local for development, or as a Production Environment Variable in Vercel (see .env.example)."
    );
  }
  return url;
}
