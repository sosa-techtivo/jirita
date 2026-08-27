# Supabase Auth Email Setup — Forgot Password Sender + Template

How to point Supabase Auth's own hosted email (Forgot Password today; the
email-invite path if it's ever re-enabled) at the exact same SendGrid
account/sender JIRITA's own transactional email already uses
(`src/lib/email-sender.ts`), and replace the default Supabase template
copy on the Reset Password email with JIRITA/Techtivo branding.

This is a **Supabase Dashboard configuration change only** — there is
nothing in this repo's code to edit for it. Confirmed by inspection:

- `resetPasswordForEmail()` (`src/lib/auth.ts`) takes no `from`/sender
  parameter — Supabase Auth email always uses whatever Sender Email/Name
  is configured under **Project Settings → Authentication → SMTP
  Settings** in the Dashboard.
- No `supabase/config.toml` exists in this repo (this project isn't
  scaffolded with the Supabase CLI's local config), so there's no
  git-tracked file that governs Auth SMTP settings or Auth email template
  content either — both live entirely in the Dashboard.
- This session has no Supabase Management API access, so the steps below
  must be applied by hand by whoever has Dashboard access to the project.

Nothing here changes `/forgot-password`, `/reset-password`,
`resetPasswordForEmail`'s tokens/redirect, or any other code path — only
*who sends* the recovery email and *what it says*.

---

## 1. Reuse — do not create a second email provider

Every value below is already defined for JIRITA's own SendGrid sending
(`.env.example` / your `.env.local` / the Vercel Production env vars):

| Value | Source |
|---|---|
| SendGrid API key | `SENDGRID_API_KEY` |
| Sender email | `JIRITA_EMAIL_FROM_ADDRESS` — `no-reply@jirita.techtivo.com` |
| Sender name | `JIRITA_EMAIL_FROM_NAME` — `JIRITA` |

`jirita.techtivo.com` is already authenticated with SendGrid (SPF, DKIM,
and DMARC all confirmed PASS — see `PROJECT_STATUS.md` → "Email
Notifications" for how that was verified) — no new domain, no new
SendGrid account, no new API key. Do not create a second sender identity
or a second SendGrid account for this.

---

## 2. Custom SMTP (Supabase Dashboard)

**Project Settings → Authentication → SMTP Settings**

1. Toggle **Enable Custom SMTP** on.
2. Fill in:
   - **Sender email**: `no-reply@jirita.techtivo.com` (same as
     `JIRITA_EMAIL_FROM_ADDRESS`)
   - **Sender name**: `JIRITA` (same as `JIRITA_EMAIL_FROM_NAME`)
   - **Host**: `smtp.sendgrid.net`
   - **Port**: `587`
   - **Username**: `apikey` (this literal string — SendGrid's own SMTP
     convention, not a real username)
   - **Password**: the same value as `SENDGRID_API_KEY`
3. Save, then use the Dashboard's own "Send test email" action (if
   offered) or trigger a real Forgot Password request from
   `/forgot-password` against a test address to confirm delivery arrives
   from `JIRITA <no-reply@jirita.techtivo.com>` — not Supabase's default
   sender.

---

## 3. Reset Password email template (Supabase Dashboard)

**Authentication → Email Templates → Reset Password**

Replace the default Subject and Message body with the JIRITA-branded
versions below. The one required piece from Supabase's own template
syntax is `{{ .ConfirmationURL }}` — it must stay exactly as-is; it's how
Supabase injects the real recovery link/token, and removing or renaming
it will break the reset flow.

**Subject:**

```
Reset your JIRITA password
```

**Message body (HTML)** — reuses the same logo, colors, and card/button
chrome as JIRITA's own transactional email (`src/lib/server/email-template.ts`),
so a Reset Password email looks like it came from the same product as
every other JIRITA email, not Supabase's default template:

```html
<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" style="max-width:480px;" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding-bottom:20px;">
                <img src="https://jirita.techtivo.com/img/jirita-logo.png" width="110" height="24" alt="JIRITA" style="display:block;width:110px;height:24px;border:0;outline:none;text-decoration:none;">
              </td>
            </tr>
            <tr>
              <td style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:24px;">
                <p style="margin:0 0 12px;font-size:15px;line-height:1.5;">We received a request to reset the password for your JIRITA account.</p>
                <p style="margin:0 0 12px;font-size:15px;line-height:1.5;">Click the button below to choose a new password. This link expires soon and can only be used once.</p>
                <p style="margin:20px 0 0;"><a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:14px;font-weight:600;">Reset password</a></p>
                <p style="margin:20px 0 0;font-size:13px;line-height:1.5;color:#64748b;">If you didn't request this, you can safely ignore this email — your password won't change.</p>
              </td>
            </tr>
            <tr>
              <td style="padding-top:16px;font-size:12px;color:#94a3b8;text-align:center;">
                JIRITA · a Techtivo product
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
```

Save the template.

---

## 4. Verify

1. From `/forgot-password`, request a reset for a real test account.
2. Confirm the email arrives from `JIRITA <no-reply@jirita.techtivo.com>`
   (not a `*.supabase.co`/`mail.app.supabase.io` sender) with the subject
   and body above.
3. Click the link in the email and confirm it still lands on
   `/reset-password` and completes the password change normally — this
   step only changes the sender/branding, not the token or redirect
   behavior `src/lib/auth.ts` already implements.

If step 2 or 3 fails, double-check the SMTP credentials in §2 before
suspecting the template — a template edit alone can't affect deliverability
or the reset link, only what the email says.
