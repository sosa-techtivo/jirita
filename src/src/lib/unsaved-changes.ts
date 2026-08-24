"use client";

// Shared "unsaved changes" primitives — the one reusable answer to "a form
// must never lose local edits to a background refresh/refetch/remount."
// See CLAUDE.md/PROJECT_STATUS.md for the incident this exists to prevent:
// project-settings-screen.tsx used to resync every field from the server
// (applyProject) whenever `organization`'s object reference changed, which
// happens on every window-focus regain (current-user-provider.tsx's own
// session-revalidation effect) — not just on a real navigation or an actual
// data change. Any caller that fetches fresh data into an editable form
// should route the "should I overwrite local state right now" decision
// through here instead of re-deriving its own ad hoc guard.

import { useEffect } from "react";

/**
 * Shows the browser's own native "leave site?" prompt only on a real
 * unload attempt (tab close, hard navigation, reload) — never on a tab
 * switch, window-focus/blur, or visibilitychange, since `beforeunload`
 * simply doesn't fire for those.
 */
export function useUnsavedChangesWarning(isDirty: boolean) {
  useEffect(() => {
    if (!isDirty) return;
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      // Chrome/legacy: a truthy returnValue is what actually triggers the
      // native prompt — the string itself is never shown (browsers supply
      // their own fixed copy).
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty]);
}

// ── sessionStorage draft persistence ────────────────────────────────────────
// Second-layer protection for the highest-value forms (Create/Edit Ticket):
// if the component ever does get unmounted/remounted unexpectedly within the
// same browser session, the draft survives that. Only ever holds
// JSON-serializable fields — never File/Blob objects (see each caller's own
// "what's excluded" note).

function readDraft<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeDraft<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Best-effort only (private browsing/storage-full can throw) — losing
    // the draft-recovery safety net is never worse than the status quo.
  }
}

function clearDraft(key: string) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // see writeDraft
  }
}

/** Reads a previously-saved draft once — call this from a lazy `useState`
 *  initializer (or similar mount-time-only read) on the entity's own key,
 *  never from an effect that could re-run mid-session. */
export function loadDraft<T>(key: string): T | null {
  return readDraft<T>(key);
}

/**
 * Keeps sessionStorage[key] in sync with `value` while `enabled` (i.e. the
 * form is actually dirty) — call `clear()` after a successful Save or an
 * explicit Discard so a stale draft never resurfaces on the next visit.
 *
 * Also clears the key itself the moment `enabled` goes false while content
 * still exists there (e.g. the user manually deletes everything they'd
 * typed, back to blank) — otherwise a stale, no-longer-true draft from
 * before that edit would keep sitting in storage and could resurface on
 * the next mount even though the user never confirmed a Discard.
 */
export function useDraftAutosave<T>(key: string | null, value: T, enabled: boolean) {
  useEffect(() => {
    if (!key) return;
    if (enabled) {
      writeDraft(key, value);
    } else {
      clearDraft(key);
    }
  }, [key, value, enabled]);

  // A fresh closure each render (over the current `key`) rather than a
  // ref — this hook already re-renders whenever `key` changes, so there's
  // no stale-closure risk, and it keeps every read of `key` a plain render
  // value instead of a ref access.
  return {
    clear: () => { if (key) clearDraft(key); },
  };
}
