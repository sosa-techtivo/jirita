export type AvailabilityStatus = "Available" | "Busy" | "Away";

// Fired on `window` (see member-profile-modal.tsx's MemberMenu) the moment
// a project_membership delete is actually confirmed by the server —
// team-screen.tsx listens for it to update its own local roster
// immediately. A plain window CustomEvent rather than a shared
// provider/context: MemberProfileModal is mounted once at the app root
// (member-profile.tsx), fully decoupled from whichever page opened it, so
// there's no existing prop/context path between the two — this is the
// smallest glue that doesn't require standing up new shared state just for
// one cross-component notification.
export const TEAM_MEMBER_REMOVED_EVENT = "jirita:project-member-removed";

export interface TeamMemberRemovedEventDetail {
  slug: string;
  profileId: string;
}

export interface TeamMember {
  id: string;
  projectSlug: string;
  name: string;
  role: string;
  email: string;
  avatar: string;
  status: AvailabilityStatus;
  weeklyCapacity: number;
  assignedHours: number;
  /** References Ticket.id in mock-tickets.ts */
  activeTicketIds: string[];
}

const avatar = (id: number) => `https://i.pravatar.cc/64?img=${id}`;

export const teamMembers: TeamMember[] = [
  {
    id: "team-mba-sarah",
    projectSlug: "mobile-banking-app",
    name: "Sarah Chen",
    role: "Project Lead",
    email: "sarah.chen@techtivo.com",
    avatar: avatar(47),
    status: "Available",
    weeklyCapacity: 40,
    assignedHours: 30,
    activeTicketIds: ["session-timeout", "pci-compliance-gap"],
  },
  {
    id: "team-mba-marcus",
    projectSlug: "mobile-banking-app",
    name: "Marcus Lee",
    role: "Senior Engineer",
    email: "marcus.lee@techtivo.com",
    avatar: avatar(12),
    status: "Busy",
    weeklyCapacity: 40,
    assignedHours: 38,
    activeTicketIds: ["offline-mode", "transaction-history-pagination"],
  },
  {
    id: "team-mba-priya",
    projectSlug: "mobile-banking-app",
    name: "Alejo Cadavid",
    role: "Admin",
    email: "alejo@techtivo.com",
    avatar: avatar(33),
    status: "Available",
    weeklyCapacity: 40,
    assignedHours: 24,
    activeTicketIds: ["accessibility-audit", "push-notification-setup", "api-rate-limiting"],
  },
  {
    id: "team-mba-david",
    projectSlug: "mobile-banking-app",
    name: "David Kim",
    role: "QA Engineer",
    email: "david.kim@techtivo.com",
    avatar: avatar(22),
    status: "Away",
    weeklyCapacity: 32,
    assignedHours: 18,
    activeTicketIds: ["kyc-vendor-outage"],
  },
  {
    id: "team-mba-elena",
    projectSlug: "mobile-banking-app",
    name: "Elena Rossi",
    role: "Designer",
    email: "elena.rossi@techtivo.com",
    avatar: avatar(5),
    status: "Busy",
    weeklyCapacity: 40,
    assignedHours: 46,
    activeTicketIds: ["dark-mode-charts", "redesign-account-settings", "app-store-screenshots"],
  },
  {
    id: "team-cwd-elena",
    projectSlug: "client-website-redesign",
    name: "Elena Rossi",
    role: "Designer",
    email: "elena.rossi@techtivo.com",
    avatar: avatar(5),
    status: "Busy",
    weeklyCapacity: 10,
    assignedHours: 8,
    activeTicketIds: [],
  },
  {
    id: "team-ipm-jordan",
    projectSlug: "internal-platform-migration",
    name: "Jordan Wu",
    role: "Engineer",
    email: "jordan.wu@techtivo.com",
    avatar: avatar(15),
    status: "Available",
    weeklyCapacity: 40,
    assignedHours: 26,
    activeTicketIds: ["db-export", "read-replicas"],
  },
  {
    id: "team-ipm-marcus",
    projectSlug: "internal-platform-migration",
    name: "Marcus Lee",
    role: "Tech Lead",
    email: "marcus.lee@techtivo.com",
    avatar: avatar(12),
    status: "Busy",
    weeklyCapacity: 40,
    assignedHours: 41,
    activeTicketIds: ["cutover-plan", "admin-panel-routing"],
  },
];

export function getTeamByProjectSlug(slug: string): TeamMember[] {
  return teamMembers.filter((member) => member.projectSlug === slug);
}

/** Loosely-known identity for someone referenced as a member somewhere in the
 *  UI — a ticket assignee, a comment author, an activity-feed actor, etc.
 *  Only `name`/`avatar` are guaranteed; the rest are hints. */
export interface MemberIdentity {
  name: string;
  avatar: string;
  role?: string;
  projectSlug?: string;
  /** Real profiles.id, only ever set by team-screen.tsx (whose roster is
   *  real project_memberships rows, so it already knows it) — lets
   *  resolveTeamMember skip the name-matching heuristic below entirely for
   *  member actions that need the real id (e.g. Remove from Project's
   *  history check in member-profile-modal.tsx). Every other existing
   *  caller never sets this and is unaffected. */
  profileId?: string;
}

// The single lookup every "click a member" trigger goes through before
// opening the shared Member Profile Modal. A real profileId (see above)
// always wins outright — it's authoritative, unlike the name-matching
// below, which is only ever a best-effort guess and could otherwise
// coincidentally match an unrelated mock entry with the same name. Absent
// that, prefers an exact project-scoped match (the same person can be
// staffed on multiple projects with different hours/role), falls back to
// matching by name alone, and — since plenty of places only ever had a
// name+avatar to begin with (comment authors, PR authors, activity-feed
// actors) — synthesizes a minimal read-only record rather than refusing to
// open the modal at all.
export function resolveTeamMember(identity: MemberIdentity): TeamMember {
  if (identity.profileId) {
    return {
      id: identity.profileId,
      projectSlug: identity.projectSlug ?? "",
      name: identity.name,
      role: identity.role ?? "Team Member",
      email: "",
      avatar: identity.avatar,
      status: "Available",
      weeklyCapacity: 40,
      assignedHours: 0,
      activeTicketIds: [],
    };
  }

  if (identity.projectSlug) {
    const scoped = teamMembers.find(
      (m) => m.name === identity.name && m.projectSlug === identity.projectSlug
    );
    if (scoped) return scoped;
  }

  const anyMatch = teamMembers.find((m) => m.name === identity.name);
  if (anyMatch) return anyMatch;

  return {
    id: `unknown-${identity.name.toLowerCase().replace(/\s+/g, "-")}`,
    projectSlug: identity.projectSlug ?? "",
    name: identity.name,
    role: identity.role ?? "Team Member",
    email: "",
    avatar: identity.avatar,
    status: "Available",
    weeklyCapacity: 40,
    assignedHours: 0,
    activeTicketIds: [],
  };
}
