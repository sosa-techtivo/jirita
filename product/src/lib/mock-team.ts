export type AvailabilityStatus = "Available" | "Busy" | "Away";

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
    name: "Priya Patel",
    role: "Engineer",
    email: "priya.patel@techtivo.com",
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
