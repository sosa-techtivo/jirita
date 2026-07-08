"use client";

import { createContext, useContext, useMemo, useState } from "react";
import type { KeyboardEvent, MouseEvent, ReactNode } from "react";
import { resolveTeamMember } from "@/lib/mock-team";
import type { MemberIdentity } from "@/lib/mock-team";
import { MemberProfileModal } from "@/components/member-profile-modal";

// The single mechanism every "click a member" interaction in the app goes
// through. Mounted once at the root (see app/layout.tsx) so any component,
// anywhere, can open the shared Member Profile Modal without local modal
// state of its own — the same way a browser has one address bar regardless
// of how many tabs link to it.
//
// UX rule: clicking a ticket (card/title/ID) opens Ticket Detail; clicking a
// member (avatar or name) opens this modal. Nothing else should improvise a
// different "view this person" affordance.

interface MemberProfileContextValue {
  openMemberProfile: (identity: MemberIdentity) => void;
}

const MemberProfileContext = createContext<MemberProfileContextValue | null>(null);

export function MemberProfileProvider({ children }: { children: ReactNode }) {
  const [identity, setIdentity] = useState<MemberIdentity | null>(null);

  const value = useMemo<MemberProfileContextValue>(
    () => ({ openMemberProfile: setIdentity }),
    []
  );

  const member = identity ? resolveTeamMember(identity) : null;

  return (
    <MemberProfileContext.Provider value={value}>
      {children}
      {member && (
        <MemberProfileModal
          member={member}
          slug={member.projectSlug}
          onClose={() => setIdentity(null)}
        />
      )}
    </MemberProfileContext.Provider>
  );
}

export function useMemberProfile(): MemberProfileContextValue {
  const ctx = useContext(MemberProfileContext);
  if (!ctx) throw new Error("useMemberProfile must be used within a MemberProfileProvider");
  return ctx;
}

// ── Shared clickable wrapper ──────────────────────────────────────────────────
//
// Wraps whatever avatar/name markup a call site already has and makes it
// open the profile modal on click, preserving that site's existing layout —
// callers pass their own className (gap/flex/etc.) plus children unchanged,
// this just adds the interaction and a subtle hover state.

export function MemberTrigger({
  name,
  avatar,
  role,
  projectSlug,
  children,
  className,
  nested = false,
}: {
  name: string;
  avatar: string;
  role?: string;
  projectSlug?: string;
  children: ReactNode;
  className?: string;
  /** True when this sits inside another clickable element (a ticket row,
   *  card, or Link) — renders a non-<button> wrapper with stopPropagation
   *  so the two click targets don't fight, instead of an invalid nested
   *  <button>/<a>. */
  nested?: boolean;
}) {
  const { openMemberProfile } = useMemberProfile();
  const identity: MemberIdentity = { name, avatar, role, projectSlug };

  function handleClick(e: MouseEvent) {
    if (nested) e.stopPropagation();
    openMemberProfile(identity);
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    if (nested) e.stopPropagation();
    openMemberProfile(identity);
  }

  const hoverClass = "cursor-pointer transition-opacity hover:opacity-70";
  const fullClassName = className ? `${className} ${hoverClass}` : hoverClass;

  if (nested) {
    return (
      <span
        role="button"
        tabIndex={0}
        aria-label={`View ${name}'s profile`}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        className={fullClassName}
      >
        {children}
      </span>
    );
  }

  return (
    <button
      type="button"
      aria-label={`View ${name}'s profile`}
      onClick={handleClick}
      className={fullClassName}
    >
      {children}
    </button>
  );
}
