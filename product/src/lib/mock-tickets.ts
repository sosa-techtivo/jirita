export type TicketStatus = "backlog" | "to-do" | "in-progress" | "review" | "blocked" | "done";
export type TicketPriority = "high" | "normal" | "low";

export interface Ticket {
  id: string;
  issueKey: string;
  title: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  assignee: { name: string; avatar: string };
  milestone: string;
  labels: string[];
  acceptanceCriteria?: string[];
  storyPoints?: number;
  dueDate?: string;
  commentCount?: number;
  attachmentCount?: number;
  updatedAt: string;
}

const avatar = (id: number) => `https://i.pravatar.cc/64?img=${id}`;

export const tickets: Ticket[] = [
  // ── BACKLOG ──────────────────────────────────────────────
  {
    id: "offline-mode",
    issueKey: "MBA-15",
    title: "Offline mode for balance viewing",
    description: "Allow users to view their last cached balance and recent transactions without a network connection.",
    status: "backlog",
    priority: "normal",
    assignee: { name: "Marcus Lee", avatar: avatar(12) },
    milestone: "App Store Submission",
    labels: ["Enhancement"],
    storyPoints: 8,
    dueDate: "Jul 20",
    commentCount: 3,
    updatedAt: "Updated 3 days ago",
  },
  {
    id: "dark-mode-charts",
    issueKey: "MBA-14",
    title: "Dark mode for spend analytics charts",
    description: "Update chart color palette so graphs look polished in dark mode.",
    status: "backlog",
    priority: "low",
    assignee: { name: "Elena Rossi", avatar: avatar(5) },
    milestone: "App Store Submission",
    labels: ["Design", "Dark Mode"],
    storyPoints: 3,
    dueDate: "Aug 3",
    updatedAt: "Updated 4 days ago",
  },
  {
    id: "session-timeout",
    issueKey: "MBA-13",
    title: "Configurable session timeout",
    description: "Let users choose how long before the app locks after inactivity.",
    status: "backlog",
    priority: "low",
    assignee: { name: "Sarah Chen", avatar: avatar(47) },
    milestone: "Security Audit",
    labels: ["Security"],
    storyPoints: 5,
    dueDate: "Jul 15",
    commentCount: 1,
    updatedAt: "Updated 5 days ago",
  },

  // ── TO DO ────────────────────────────────────────────────
  {
    id: "redesign-account-settings",
    issueKey: "MBA-9",
    title: "Redesign account settings screen",
    description: "Simplify the settings layout and surface security controls more clearly.",
    status: "to-do",
    priority: "normal",
    assignee: { name: "Elena Rossi", avatar: avatar(5) },
    milestone: "App Store Submission",
    labels: ["Design"],
    storyPoints: 5,
    dueDate: "Jul 8",
    commentCount: 2,
    updatedAt: "Updated today",
  },
  {
    id: "app-store-screenshots",
    issueKey: "MBA-11",
    title: "Prepare App Store screenshots and listing copy",
    description: "Finalize localized screenshots and metadata ahead of submission.",
    status: "to-do",
    priority: "normal",
    assignee: { name: "Elena Rossi", avatar: avatar(5) },
    milestone: "App Store Submission",
    labels: ["Marketing"],
    storyPoints: 3,
    dueDate: "Jul 25",
    updatedAt: "Updated 2 days ago",
  },
  {
    id: "accessibility-audit",
    issueKey: "MBA-12",
    title: "Accessibility audit and fixes",
    description: "Ensure VoiceOver and TalkBack compatibility for WCAG 2.1 AA compliance.",
    status: "to-do",
    priority: "high",
    assignee: { name: "Priya Patel", avatar: avatar(33) },
    milestone: "Beta Release",
    labels: ["Accessibility", "Compliance"],
    storyPoints: 8,
    dueDate: "Jul 10",
    commentCount: 4,
    updatedAt: "Updated 1 day ago",
  },

  // ── IN PROGRESS (includes blocked) ───────────────────────
  {
    id: "transaction-history-pagination",
    issueKey: "MBA-4",
    title: "Implement transaction history pagination",
    description: "Paginate the transaction list to keep load times fast for high-volume accounts.",
    status: "in-progress",
    priority: "normal",
    assignee: { name: "Marcus Lee", avatar: avatar(12) },
    milestone: "Beta Release",
    labels: ["Performance"],
    storyPoints: 5,
    dueDate: "Jun 30",
    commentCount: 3,
    updatedAt: "Updated yesterday",
  },
  {
    id: "pci-compliance-gap",
    issueKey: "MBA-1",
    title: "Resolve PCI compliance gap",
    description: "Card storage flow needs to meet updated PCI-DSS encryption requirements.",
    status: "blocked",
    priority: "high",
    assignee: { name: "Sarah Chen", avatar: avatar(47) },
    milestone: "Security Audit",
    labels: ["Security", "Compliance"],
    storyPoints: 13,
    dueDate: "Jun 28",
    commentCount: 7,
    attachmentCount: 2,
    updatedAt: "Updated 2h ago",
  },
  {
    id: "kyc-vendor-outage",
    issueKey: "MBA-8",
    title: "Third-party KYC vendor API outage",
    description: "Vendor integration has been failing intermittently for the past week.",
    status: "blocked",
    priority: "high",
    assignee: { name: "David Kim", avatar: avatar(22) },
    milestone: "Security Audit",
    labels: ["Integration"],
    storyPoints: 8,
    dueDate: "Jun 27",
    commentCount: 5,
    updatedAt: "Updated 6 days ago",
  },

  // ── IN REVIEW ────────────────────────────────────────────
  {
    id: "push-notification-setup",
    issueKey: "MBA-3",
    title: "Push notification setup",
    description: "Wire up push notification delivery for transaction and security alerts.",
    status: "review",
    priority: "normal",
    assignee: { name: "Priya Patel", avatar: avatar(33) },
    milestone: "Beta Release",
    labels: ["Notifications"],
    storyPoints: 5,
    dueDate: "Jun 26",
    commentCount: 2,
    updatedAt: "Updated 3 hours ago",
  },
  {
    id: "api-rate-limiting",
    issueKey: "MBA-7",
    title: "API rate limiting",
    description: "Add per-client rate limits to protect the transfers API from abuse.",
    status: "review",
    priority: "normal",
    assignee: { name: "Priya Patel", avatar: avatar(33) },
    milestone: "Security Audit",
    labels: ["Security", "API"],
    storyPoints: 3,
    dueDate: "Jun 30",
    attachmentCount: 1,
    updatedAt: "Updated 3 hours ago",
  },

  // ── DONE ─────────────────────────────────────────────────
  {
    id: "mfa-onboarding",
    issueKey: "MBA-5",
    title: "Add MFA onboarding",
    description: "Guide new users through enabling multi-factor authentication on first login.",
    status: "done",
    priority: "normal",
    assignee: { name: "David Kim", avatar: avatar(22) },
    milestone: "Beta Release",
    labels: ["Security", "Onboarding"],
    storyPoints: 5,
    dueDate: "Jun 20",
    commentCount: 4,
    updatedAt: "Updated yesterday",
  },
  {
    id: "biometric-login-crash",
    issueKey: "MBA-6",
    title: "Fix biometric login crash",
    description: "Face ID login intermittently crashes the app on iOS 18 devices.",
    status: "done",
    priority: "high",
    assignee: { name: "Marcus Lee", avatar: avatar(12) },
    milestone: "Beta Release",
    labels: ["Bug", "iOS"],
    storyPoints: 3,
    dueDate: "Jun 18",
    commentCount: 6,
    updatedAt: "Updated 12 minutes ago",
  },
];

export function getTicketById(id: string): Ticket | undefined {
  return tickets.find((ticket) => ticket.id === id);
}
