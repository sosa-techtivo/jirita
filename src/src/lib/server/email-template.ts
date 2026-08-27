// Server-only shared chrome for every JIRITA transactional email — the
// logo/header wrapper, HTML escaping, and CTA button markup. Extracted
// from notification-email.ts (immediate email, Fase 2) so digest-email.ts
// (Fase 3B) renders with the exact same header/branding instead of a
// second, drifting copy. Never import this from a "use client" file — same
// window guard as every other server-only module in this directory.

if (typeof window !== "undefined") {
  throw new Error("email-template.ts must never be imported by client-side code.");
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Fixed absolute URL, not built from NEXT_PUBLIC_APP_URL (which is
// currently "http://localhost:3000" in this environment — not publicly
// reachable, so an email client could never load it). jirita.techtivo.com
// is the same domain already authenticated for SendGrid sending (SPF/DKIM/
// DMARC, see Fase 1), so it's a real, stable, publicly-resolvable host for
// this static asset regardless of where the app itself is deployed.
const LOGO_URL = "https://jirita.techtivo.com/img/jirita-logo.png";

// ~110px wide, height held to the source PNG's own aspect ratio
// (217x47 -> 24px) so it never stretches; explicit width/height attributes
// (not just CSS) are what keeps email clients — Outlook in particular —
// from reserving the wrong box before the image loads.
const LOGO_HEADER_HTML = `<img src="${LOGO_URL}" width="110" height="24" alt="JIRITA" style="display:block;width:110px;height:24px;border:0;outline:none;text-decoration:none;">`;

export function wrapEmailHtml(bodyHtml: string): string {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" style="max-width:480px;" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding-bottom:20px;">
                ${LOGO_HEADER_HTML}
              </td>
            </tr>
            <tr>
              <td style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:24px;">
                ${bodyHtml}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function ctaHtml(href: string | null, label: string): string {
  if (!href) return "";
  return `<p style="margin:20px 0 0;"><a href="${href}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:14px;font-weight:600;">${escapeHtml(label)}</a></p>`;
}
