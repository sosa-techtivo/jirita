export type TicketStatus = "to-do" | "in-progress" | "review" | "blocked" | "done";
export type TicketPriority = "high" | "normal";

export interface Ticket {
  id: string;
  title: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  assignee: { name: string; avatar: string };
  milestone: string;
  updatedAt: string;
}

const avatar = (id: number) => `https://i.pravatar.cc/64?img=${id}`;

export const tickets: Ticket[] = [
  {
    id: "pci-compliance-gap",
    title: "Resolve PCI compliance gap",
    description: "Card storage flow needs to meet updated PCI-DSS encryption requirements.",
    status: "blocked",
    priority: "high",
    assignee: { name: "Sarah Chen", avatar: avatar(47) },
    milestone: "Security Audit",
    updatedAt: "Updated 2h ago",
  },
  {
    id: "transaction-history-pagination",
    title: "Implement transaction history pagination",
    description: "Paginate the transaction list to keep load times fast for high-volume accounts.",
    status: "in-progress",
    priority: "normal",
    assignee: { name: "Marcus Lee", avatar: avatar(12) },
    milestone: "Beta Release",
    updatedAt: "Updated yesterday",
  },
  {
    id: "push-notification-setup",
    title: "Push notification setup",
    description: "Wire up push notification delivery for transaction and security alerts.",
    status: "review",
    priority: "normal",
    assignee: { name: "Priya Patel", avatar: avatar(33) },
    milestone: "Beta Release",
    updatedAt: "Updated 3 hours ago",
  },
  {
    id: "redesign-account-settings",
    title: "Redesign account settings screen",
    description: "Simplify the settings layout and surface security controls more clearly.",
    status: "to-do",
    priority: "normal",
    assignee: { name: "Elena Rossi", avatar: avatar(5) },
    milestone: "App Store Submission",
    updatedAt: "Updated today",
  },
  {
    id: "mfa-onboarding",
    title: "Add MFA onboarding",
    description: "Guide new users through enabling multi-factor authentication on first login.",
    status: "done",
    priority: "normal",
    assignee: { name: "David Kim", avatar: avatar(22) },
    milestone: "Beta Release",
    updatedAt: "Updated yesterday",
  },
  {
    id: "biometric-login-crash",
    title: "Fix biometric login crash",
    description: "Face ID login intermittently crashes the app on iOS 18 devices.",
    status: "done",
    priority: "high",
    assignee: { name: "Marcus Lee", avatar: avatar(12) },
    milestone: "Beta Release",
    updatedAt: "Updated 12 minutes ago",
  },
  {
    id: "api-rate-limiting",
    title: "API rate limiting",
    description: "Add per-client rate limits to protect the transfers API from abuse.",
    status: "review",
    priority: "normal",
    assignee: { name: "Priya Patel", avatar: avatar(33) },
    milestone: "Security Audit",
    updatedAt: "Updated 3 hours ago",
  },
  {
    id: "kyc-vendor-outage",
    title: "Third-party KYC vendor API outage",
    description: "Vendor integration has been failing intermittently for the past week.",
    status: "blocked",
    priority: "high",
    assignee: { name: "David Kim", avatar: avatar(22) },
    milestone: "Security Audit",
    updatedAt: "Updated 6 days ago",
  },
  {
    id: "app-store-screenshots",
    title: "Prepare App Store screenshots and listing copy",
    description: "Finalize localized screenshots and metadata ahead of submission.",
    status: "to-do",
    priority: "normal",
    assignee: { name: "Elena Rossi", avatar: avatar(5) },
    milestone: "App Store Submission",
    updatedAt: "Updated 2 days ago",
  },
];

export function getTicketById(id: string): Ticket | undefined {
  return tickets.find((ticket) => ticket.id === id);
}
