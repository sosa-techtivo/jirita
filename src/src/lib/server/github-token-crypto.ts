// Server-only AES-256-GCM helper for GitHub OAuth access tokens. Never
// import this from a "use client" file — the guard below throws
// immediately if this module ever ends up evaluated in a browser bundle,
// as a defense-in-depth backstop (this project adds no new dependencies,
// so there's no `server-only` package to enforce this at build time).
//
// A token is never stored, logged, or returned in plain text anywhere —
// see project_repository_connections' own three-column split
// (access_token_ciphertext/_iv/_auth_tag, migration
// 20260821000000_add_project_repository_connections.sql). Only this file
// ever calls decryptGitHubToken, and only to make a GitHub API call
// server-side (see github-repository-connection.ts) — the decrypted value
// itself is never assigned to anything returned from a Server Action.

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

if (typeof window !== "undefined") {
  throw new Error("github-token-crypto.ts must never be imported by client-side code.");
}

const ALGORITHM = "aes-256-gcm";
// 96-bit IV — the size AES-GCM is designed and recommended for; using a
// different length is legal but weakens the construction's guarantees.
const IV_LENGTH_BYTES = 12;
const KEY_LENGTH_BYTES = 32; // AES-256 requires exactly a 32-byte key.

let cachedKey: Buffer | null = null;

// Decoded once, validated to be exactly 32 bytes (not just 32 *characters*
// — a base64 string of the wrong length silently produces a key of the
// wrong byte length, which node:crypto would otherwise reject with a much
// less clear error deep inside createCipheriv).
function getEncryptionKey(): Buffer {
  if (cachedKey) return cachedKey;

  const raw = process.env.GITHUB_TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("Missing GITHUB_TOKEN_ENCRYPTION_KEY. Set it in .env.local (see .env.example).");
  }

  const key = Buffer.from(raw, "base64");
  if (key.length !== KEY_LENGTH_BYTES) {
    throw new Error(
      `GITHUB_TOKEN_ENCRYPTION_KEY must decode (base64) to exactly ${KEY_LENGTH_BYTES} bytes for AES-256-GCM.`
    );
  }

  cachedKey = key;
  return key;
}

export interface EncryptedGitHubToken {
  /** base64 */
  ciphertext: string;
  /** base64 */
  iv: string;
  /** base64 */
  authTag: string;
}

// A random IV per call — never reused across encryptions, which is what
// AES-GCM's security depends on.
export function encryptGitHubToken(plainToken: string): EncryptedGitHubToken {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plainToken, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
  };
}

// Throws if the auth tag doesn't verify (tampered/corrupted ciphertext, or
// the wrong key) — never returns a partially-decrypted value.
export function decryptGitHubToken(encrypted: EncryptedGitHubToken): string {
  const key = getEncryptionKey();
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(encrypted.iv, "base64"));
  decipher.setAuthTag(Buffer.from(encrypted.authTag, "base64"));

  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(encrypted.ciphertext, "base64")),
    decipher.final(),
  ]);

  return plaintext.toString("utf8");
}
