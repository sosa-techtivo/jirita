// Server-only transactional email sender, backed by the SendGrid Web API
// (never SMTP). Never import this from a "use client" file — the guard
// below throws immediately if this module ever ends up evaluated in a
// browser bundle, as a defense-in-depth backstop (this project adds no new
// dependencies beyond @sendgrid/mail, so there's no `server-only` package
// to enforce this at build time). Same pattern as
// src/lib/server/github-token-crypto.ts.
//
// Supabase Auth's own hosted email (Forgot Password today) is a separate
// delivery path entirely, controlled by Project Settings -> Authentication
// -> SMTP Settings in the Supabase Dashboard — this file's exported
// sendTransactionalEmail is never called for it. That Dashboard SMTP
// setting should still point at this same sender identity/SendGrid account
// (JIRITA_EMAIL_FROM_ADDRESS/JIRITA_EMAIL_FROM_NAME below), never a second
// provider — see docs/SUPABASE_AUTH_EMAIL_SETUP.md for the exact
// Dashboard steps (Custom SMTP + the JIRITA-branded Reset Password
// template).

import sgMail from "@sendgrid/mail";

if (typeof window !== "undefined") {
  throw new Error("email-sender.ts must never be imported by client-side code.");
}

let initialized = false;

// Fixed branding fallback only — never a secret, never an address. See
// JIRITA_EMAIL_FROM_NAME below for the one field allowed to default.
const DEFAULT_FROM_NAME = "JIRITA";

function getSendGridClient(): typeof sgMail {
  if (initialized) return sgMail;

  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey) {
    throw new Error("Missing SENDGRID_API_KEY. Set it in .env.local (see .env.example).");
  }

  sgMail.setApiKey(apiKey);
  initialized = true;
  return sgMail;
}

function getFromAddress(): { email: string; name: string } {
  const email = process.env.JIRITA_EMAIL_FROM_ADDRESS;
  if (!email) {
    throw new Error("Missing JIRITA_EMAIL_FROM_ADDRESS. Set it in .env.local (see .env.example).");
  }

  const name = process.env.JIRITA_EMAIL_FROM_NAME || DEFAULT_FROM_NAME;

  return { email, name };
}

export interface SendTransactionalEmailInput {
  /** One or more recipient addresses. */
  to: string | string[];
  subject: string;
  text: string;
  html: string;
}

export interface SendTransactionalEmailResult {
  /** HTTP status code returned by the SendGrid Web API. */
  statusCode: number;
  /** The `x-message-id` response header, when SendGrid provides one. */
  messageId: string | null;
}

// The sender is always the configured JIRITA identity — callers cannot
// override it. Errors from the SendGrid API propagate to the caller after
// being re-wrapped with a message that never includes the API key.
export async function sendTransactionalEmail(
  input: SendTransactionalEmailInput
): Promise<SendTransactionalEmailResult> {
  const client = getSendGridClient();
  const from = getFromAddress();

  try {
    const [response] = await client.send({
      to: input.to,
      from,
      subject: input.subject,
      text: input.text,
      html: input.html,
    });

    return {
      statusCode: response.statusCode,
      messageId: response.headers["x-message-id"] ?? null,
    };
  } catch (error) {
    // SendGrid errors can carry response bodies with request details;
    // never let a raw error object (or its body) surface API-key material
    // — there is none in these errors, but we still log/rethrow only a
    // plain message.
    const message = error instanceof Error ? error.message : "Unknown SendGrid error.";
    throw new Error(`Failed to send transactional email via SendGrid: ${message}`);
  }
}
