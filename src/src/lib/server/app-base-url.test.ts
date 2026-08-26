import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getAppBaseUrl, requireAppBaseUrl } from "./app-base-url";

// The real path shape notification-email.ts's ticketUrl actually builds —
// `${appUrl}/projects/${project.slug}/tickets/${ticket.code}` — kept here
// as a literal so a test can prove that only the origin changes, never
// this path.
const REAL_TICKET_PATH = "/projects/jirita/tickets/JIR-51";

const ORIGINAL_ENV = { ...process.env };

function resetEnv() {
  for (const key of ["NEXT_PUBLIC_APP_URL", "VERCEL_ENV", "NODE_ENV"]) {
    delete process.env[key];
  }
  Object.assign(process.env, ORIGINAL_ENV);
  delete process.env.NEXT_PUBLIC_APP_URL;
  delete process.env.VERCEL_ENV;
}

beforeEach(resetEnv);
afterEach(resetEnv);

describe("getAppBaseUrl / requireAppBaseUrl", () => {
  it("local: uses the explicitly configured NEXT_PUBLIC_APP_URL as-is", () => {
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";

    expect(getAppBaseUrl()).toBe("http://localhost:3000");
    expect(`${getAppBaseUrl()}${REAL_TICKET_PATH}`).toBe("http://localhost:3000/projects/jirita/tickets/JIR-51");
  });

  it("production: uses the explicitly configured canonical domain, never a guess", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://jirita.techtivo.com";
    process.env.VERCEL_ENV = "production";

    expect(getAppBaseUrl()).toBe("https://jirita.techtivo.com");
    expect(`${getAppBaseUrl()}${REAL_TICKET_PATH}`).toBe("https://jirita.techtivo.com/projects/jirita/tickets/JIR-51");
  });

  it("trailing slash: normalizes a configured trailing slash so joining a path never produces a double slash", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://jirita.techtivo.com/";
    process.env.VERCEL_ENV = "production";

    expect(getAppBaseUrl()).toBe("https://jirita.techtivo.com");
    const joined = `${getAppBaseUrl()}${REAL_TICKET_PATH}`;
    expect(joined).toBe("https://jirita.techtivo.com/projects/jirita/tickets/JIR-51");
    expect(joined).not.toContain("//projects");
  });

  it("existing ticket URL: the real route is preserved verbatim, only the origin varies", () => {
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    const localUrl = `${getAppBaseUrl()}${REAL_TICKET_PATH}`;

    process.env.NEXT_PUBLIC_APP_URL = "https://jirita.techtivo.com";
    process.env.VERCEL_ENV = "production";
    const prodUrl = `${getAppBaseUrl()}${REAL_TICKET_PATH}`;

    expect(localUrl.replace("http://localhost:3000", "")).toBe(REAL_TICKET_PATH);
    expect(prodUrl.replace("https://jirita.techtivo.com", "")).toBe(REAL_TICKET_PATH);
    expect(localUrl.replace("http://localhost:3000", "")).toBe(prodUrl.replace("https://jirita.techtivo.com", ""));
  });

  it("genuine local dev runtime (no NEXT_PUBLIC_APP_URL, not on Vercel) falls back to localhost:3000", () => {
    expect(getAppBaseUrl()).toBe("http://localhost:3000");
  });

  it("a real Vercel deployment (preview or production) with no configured URL never guesses a domain", () => {
    process.env.VERCEL_ENV = "preview";
    expect(getAppBaseUrl()).toBeNull();

    process.env.VERCEL_ENV = "production";
    expect(getAppBaseUrl()).toBeNull();
    expect(() => requireAppBaseUrl()).toThrow(/NEXT_PUBLIC_APP_URL/);
  });

  it("requireAppBaseUrl returns the same value as getAppBaseUrl when configured", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://jirita.techtivo.com";
    expect(requireAppBaseUrl()).toBe(getAppBaseUrl());
  });
});
