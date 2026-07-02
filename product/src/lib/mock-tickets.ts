import { getProjectBySlug } from "@/lib/mock-projects";

export type TicketStatus = "backlog" | "to-do" | "in-progress" | "review" | "blocked" | "done";
export type TicketPriority = "high" | "normal" | "low";
export type TicketType = "TASK" | "BUG";

export const TICKET_TYPE_LABEL: Record<TicketType, string> = {
  TASK: "Task",
  BUG:  "Bug",
};

export interface Ticket {
  /** Internal id — stable, never shown to users. Everything (routing, lookups, links) keys off this. */
  id: string;
  /** References ProjectSummary.slug in mock-projects.ts — the project this ticket belongs to. */
  projectSlug: string;
  /** Sequential within its project. The visible ticket ID is derived, never stored: see getTicketDisplayKey. */
  ticketNumber: number;
  title: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  /** Task vs Bug — defaults to "TASK" for anything created without an explicit choice. */
  type: TicketType;
  assignee: { name: string; avatar: string };
  milestone: string;
  labels: string[];
  acceptanceCriteria?: string[];
  storyPoints?: number;
  hours?: number;
  dueDate?: string;
  commentCount?: number;
  attachmentCount?: number;
  updatedAt: string;
}

// The one place that builds a visible ticket ID. The prefix always comes
// from the ticket's project (Project Settings → General → Project Code),
// never hardcoded or derived from a project's name — every screen that
// shows a ticket ID should call this instead of reading a stored key.
export function getTicketDisplayKey(ticket: Ticket): string {
  const code = getProjectBySlug(ticket.projectSlug)?.projectCode ?? "TKT";
  return `${code}-${ticket.ticketNumber}`;
}

const avatar = (id: number) => `https://i.pravatar.cc/64?img=${id}`;

export const tickets: Ticket[] = [
  // ── BACKLOG ──────────────────────────────────────────────
  {
    id: "offline-mode",
    projectSlug: "mobile-banking-app",
    ticketNumber: 15,
    title: "Offline mode for balance viewing",
    description: "Allow users to view their last cached balance and recent transactions without a network connection.",
    status: "backlog",
    priority: "normal",
    type: "TASK",
    assignee: { name: "Marcus Lee", avatar: avatar(12) },
    milestone: "App Store Submission",
    labels: ["Enhancement"],
    storyPoints: 8,
    hours: 16,
    dueDate: "Jul 20",
    commentCount: 3,
    updatedAt: "Updated 3 days ago",
  },
  {
    id: "dark-mode-charts",
    projectSlug: "mobile-banking-app",
    ticketNumber: 14,
    title: "Dark mode for spend analytics charts",
    description: "Update chart color palette so graphs look polished in dark mode.",
    status: "backlog",
    priority: "low",
    type: "TASK",
    assignee: { name: "Elena Rossi", avatar: avatar(5) },
    milestone: "App Store Submission",
    labels: ["Design", "Dark Mode"],
    storyPoints: 3,
    hours: 6,
    dueDate: "Aug 3",
    updatedAt: "Updated 4 days ago",
  },
  {
    id: "session-timeout",
    projectSlug: "mobile-banking-app",
    ticketNumber: 13,
    title: "Configurable session timeout",
    description: "Let users choose how long before the app locks after inactivity.",
    status: "backlog",
    priority: "low",
    type: "TASK",
    assignee: { name: "Sarah Chen", avatar: avatar(47) },
    milestone: "Security Audit",
    labels: ["Security"],
    storyPoints: 5,
    hours: 8,
    dueDate: "Jul 15",
    commentCount: 1,
    updatedAt: "Updated 5 days ago",
  },

  // ── TO DO ────────────────────────────────────────────────
  {
    id: "redesign-account-settings",
    projectSlug: "mobile-banking-app",
    ticketNumber: 9,
    title: "Redesign account settings screen",
    description: "Simplify the settings layout and surface security controls more clearly.",
    status: "to-do",
    priority: "normal",
    type: "TASK",
    assignee: { name: "Elena Rossi", avatar: avatar(5) },
    milestone: "App Store Submission",
    labels: ["Design"],
    storyPoints: 5,
    hours: 8,
    dueDate: "Jul 8",
    commentCount: 2,
    updatedAt: "Updated today",
  },
  {
    id: "app-store-screenshots",
    projectSlug: "mobile-banking-app",
    ticketNumber: 11,
    title: "Prepare App Store screenshots and listing copy",
    description: "Finalize localized screenshots and metadata ahead of submission.",
    status: "to-do",
    priority: "normal",
    type: "TASK",
    assignee: { name: "Elena Rossi", avatar: avatar(5) },
    milestone: "App Store Submission",
    labels: ["Marketing"],
    storyPoints: 3,
    hours: 4,
    dueDate: "Jul 25",
    updatedAt: "Updated 2 days ago",
  },
  {
    id: "accessibility-audit",
    projectSlug: "mobile-banking-app",
    ticketNumber: 12,
    title: "Accessibility audit and fixes",
    description: "Ensure VoiceOver and TalkBack compatibility for WCAG 2.1 AA compliance.",
    status: "to-do",
    priority: "high",
    type: "TASK",
    assignee: { name: "Priya Patel", avatar: avatar(33) },
    milestone: "Beta Release",
    labels: ["Accessibility", "Compliance"],
    storyPoints: 8,
    hours: 12,
    dueDate: "Jul 10",
    commentCount: 4,
    updatedAt: "Updated 1 day ago",
  },

  // ── IN PROGRESS ──────────────────────────────────────────
  {
    id: "transaction-history-pagination",
    projectSlug: "mobile-banking-app",
    ticketNumber: 4,
    title: "Implement transaction history pagination",
    description: "Paginate the transaction list to keep load times fast for high-volume accounts.",
    status: "in-progress",
    priority: "normal",
    type: "TASK",
    assignee: { name: "Marcus Lee", avatar: avatar(12) },
    milestone: "Beta Release",
    labels: ["Performance"],
    storyPoints: 5,
    hours: 8,
    dueDate: "Jun 30",
    commentCount: 3,
    updatedAt: "Updated yesterday",
  },
  {
    id: "pci-compliance-gap",
    projectSlug: "mobile-banking-app",
    ticketNumber: 1,
    title: "Resolve PCI compliance gap",
    description: "Card storage flow needs to meet updated PCI-DSS encryption requirements.",
    status: "blocked",
    priority: "high",
    type: "TASK",
    assignee: { name: "Sarah Chen", avatar: avatar(47) },
    milestone: "Security Audit",
    labels: ["Security", "Compliance"],
    storyPoints: 13,
    hours: 24,
    dueDate: "Jun 28",
    commentCount: 7,
    attachmentCount: 2,
    updatedAt: "Updated 2h ago",
  },
  {
    id: "kyc-vendor-outage",
    projectSlug: "mobile-banking-app",
    ticketNumber: 8,
    title: "Third-party KYC vendor API outage",
    description: "Vendor integration has been failing intermittently for the past week.",
    status: "blocked",
    priority: "high",
    type: "BUG",
    assignee: { name: "David Kim", avatar: avatar(22) },
    milestone: "Security Audit",
    labels: ["Integration"],
    storyPoints: 8,
    hours: 16,
    dueDate: "Jun 27",
    commentCount: 5,
    updatedAt: "Updated 6 days ago",
  },

  // ── IN REVIEW ────────────────────────────────────────────
  {
    id: "push-notification-setup",
    projectSlug: "mobile-banking-app",
    ticketNumber: 3,
    title: "Push notification setup",
    description: "Wire up push notification delivery for transaction and security alerts.",
    status: "review",
    priority: "normal",
    type: "TASK",
    assignee: { name: "Priya Patel", avatar: avatar(33) },
    milestone: "Beta Release",
    labels: ["Notifications"],
    storyPoints: 5,
    hours: 8,
    dueDate: "Jun 26",
    commentCount: 2,
    updatedAt: "Updated 3 hours ago",
  },
  {
    id: "api-rate-limiting",
    projectSlug: "mobile-banking-app",
    ticketNumber: 7,
    title: "API rate limiting",
    description: "Add per-client rate limits to protect the transfers API from abuse.",
    status: "review",
    priority: "normal",
    type: "TASK",
    assignee: { name: "Priya Patel", avatar: avatar(33) },
    milestone: "Security Audit",
    labels: ["Security", "API"],
    storyPoints: 3,
    hours: 4,
    dueDate: "Jun 30",
    attachmentCount: 1,
    updatedAt: "Updated 3 hours ago",
  },

  // ── DONE ─────────────────────────────────────────────────
  {
    id: "mfa-onboarding",
    projectSlug: "mobile-banking-app",
    ticketNumber: 5,
    title: "Add MFA onboarding",
    description: "Guide new users through enabling multi-factor authentication on first login.",
    status: "done",
    priority: "normal",
    type: "TASK",
    assignee: { name: "David Kim", avatar: avatar(22) },
    milestone: "Beta Release",
    labels: ["Security", "Onboarding"],
    storyPoints: 5,
    hours: 6,
    dueDate: "Jun 20",
    commentCount: 4,
    updatedAt: "Updated yesterday",
  },
  {
    id: "biometric-login-crash",
    projectSlug: "mobile-banking-app",
    ticketNumber: 6,
    title: "Fix biometric login crash",
    description: "Face ID login intermittently crashes the app on iOS 18 devices.",
    status: "done",
    priority: "high",
    type: "BUG",
    assignee: { name: "Marcus Lee", avatar: avatar(12) },
    milestone: "Beta Release",
    labels: ["Bug", "iOS"],
    storyPoints: 3,
    hours: 4,
    dueDate: "Jun 18",
    commentCount: 6,
    updatedAt: "Updated 12 minutes ago",
  },

  // ── INTERNAL PLATFORM MIGRATION ────────────────────────────
  {
    id: "db-export",
    projectSlug: "internal-platform-migration",
    ticketNumber: 1,
    title: "Legacy database export",
    description: "Export the legacy monolith database in preparation for migration to the new platform.",
    status: "in-progress",
    priority: "normal",
    type: "TASK",
    assignee: { name: "Jordan Wu", avatar: avatar(15) },
    milestone: "Platform Cutover",
    labels: ["Migration"],
    storyPoints: 8,
    hours: 16,
    dueDate: "Jul 5",
    commentCount: 2,
    updatedAt: "Updated 1 day ago",
  },
  {
    id: "read-replicas",
    projectSlug: "internal-platform-migration",
    ticketNumber: 2,
    title: "Provision new read replicas",
    description: "Stand up read replicas on the new platform ahead of the database cutover.",
    status: "to-do",
    priority: "high",
    type: "TASK",
    assignee: { name: "Jordan Wu", avatar: avatar(15) },
    milestone: "Platform Cutover",
    labels: ["Infrastructure"],
    storyPoints: 5,
    hours: 10,
    dueDate: "Jul 8",
    updatedAt: "Updated 2 days ago",
  },
  {
    id: "cutover-plan",
    projectSlug: "internal-platform-migration",
    ticketNumber: 3,
    title: "Migration cutover plan",
    description: "Document the staged cutover plan and rollback runbook for the platform migration.",
    status: "in-progress",
    priority: "high",
    type: "TASK",
    assignee: { name: "Marcus Lee", avatar: avatar(12) },
    milestone: "Platform Cutover",
    labels: ["Planning"],
    storyPoints: 5,
    hours: 8,
    dueDate: "Jul 1",
    commentCount: 1,
    updatedAt: "Updated 3 hours ago",
  },
  {
    id: "admin-panel-routing",
    projectSlug: "internal-platform-migration",
    ticketNumber: 4,
    title: "Route admin panels to new platform",
    description: "Update internal routing so admin tooling resolves against the new platform endpoints.",
    status: "to-do",
    priority: "normal",
    type: "TASK",
    assignee: { name: "Marcus Lee", avatar: avatar(12) },
    milestone: "Platform Cutover",
    labels: ["Migration"],
    storyPoints: 3,
    hours: 6,
    dueDate: "Jul 12",
    updatedAt: "Updated yesterday",
  },
];

export function getTicketById(id: string): Ticket | undefined {
  return tickets.find((ticket) => ticket.id === id);
}
