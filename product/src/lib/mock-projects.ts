export type ProjectStatus = "active" | "on-track" | "at-risk" | "on-hold" | "archived";
export type ProjectPriority = "critical" | "high" | "medium" | "low";
export type ProjectHealth = "healthy" | "needs-attention" | "critical";

export interface ProjectSummary {
  slug: string;
  name: string;
  shortName: string;
  description: string;
  status: ProjectStatus;
  priority: ProjectPriority;
  health: ProjectHealth;
  owner: { name: string; avatar: string };
  updatedAt: string;
  targetDate: string;
  activeMilestones: number;
  openTickets: number;
  blockedTickets: number;
  overdueTickets: number;
  awaitingReviewTickets: number;
  dueThisWeekTickets: number;
  progress: number;
}

const avatar = (id: number) => `https://i.pravatar.cc/64?img=${id}`;

export const projects: ProjectSummary[] = [
  {
    slug: "mobile-banking-app",
    name: "Mobile Banking App",
    shortName: "MB",
    description: "iOS and Android banking experience for Meridian Bank.",
    status: "active",
    priority: "high",
    health: "needs-attention",
    owner: { name: "Sarah Chen", avatar: avatar(47) },
    updatedAt: "Just now",
    targetDate: "Sep 15",
    activeMilestones: 3,
    openTickets: 29,
    blockedTickets: 4,
    overdueTickets: 2,
    awaitingReviewTickets: 3,
    dueThisWeekTickets: 5,
    progress: 42,
  },
  {
    slug: "client-website-redesign",
    name: "Client Website Redesign",
    shortName: "CW",
    description: "Full marketing site rebuild for a long-standing retail client.",
    status: "on-hold",
    priority: "medium",
    health: "critical",
    owner: { name: "Elena Rossi", avatar: avatar(5) },
    updatedAt: "1 week ago",
    targetDate: "Oct 1",
    activeMilestones: 1,
    openTickets: 6,
    blockedTickets: 1,
    overdueTickets: 3,
    awaitingReviewTickets: 1,
    dueThisWeekTickets: 2,
    progress: 35,
  },
  {
    slug: "internal-platform-migration",
    name: "Internal Platform Migration",
    shortName: "IP",
    description: "Moving internal tooling off the legacy monolith onto the new platform.",
    status: "on-track",
    priority: "high",
    health: "needs-attention",
    owner: { name: "Marcus Lee", avatar: avatar(12) },
    updatedAt: "2 hours ago",
    targetDate: "Aug 30",
    activeMilestones: 2,
    openTickets: 14,
    blockedTickets: 2,
    overdueTickets: 0,
    awaitingReviewTickets: 2,
    dueThisWeekTickets: 3,
    progress: 68,
  },
  {
    slug: "customer-support-portal",
    name: "Customer Support Portal",
    shortName: "CS",
    description: "Self-service help center and ticketing for end customers.",
    status: "active",
    priority: "medium",
    health: "healthy",
    owner: { name: "David Kim", avatar: avatar(22) },
    updatedAt: "3 hours ago",
    targetDate: "Aug 20",
    activeMilestones: 2,
    openTickets: 18,
    blockedTickets: 3,
    overdueTickets: 1,
    awaitingReviewTickets: 2,
    dueThisWeekTickets: 4,
    progress: 54,
  },
  {
    slug: "data-warehouse-revamp",
    name: "Data Warehouse Revamp",
    shortName: "DW",
    description: "Consolidating analytics pipelines onto a single warehouse schema.",
    status: "on-track",
    priority: "medium",
    health: "healthy",
    owner: { name: "Priya Patel", avatar: avatar(33) },
    updatedAt: "Yesterday",
    targetDate: "Jul 31",
    activeMilestones: 1,
    openTickets: 9,
    blockedTickets: 0,
    overdueTickets: 0,
    awaitingReviewTickets: 0,
    dueThisWeekTickets: 1,
    progress: 71,
  },
  {
    slug: "marketing-site-relaunch",
    name: "Marketing Site Relaunch",
    shortName: "MS",
    description: "New brand system and CMS migration ahead of the product launch.",
    status: "at-risk",
    priority: "critical",
    health: "critical",
    owner: { name: "Elena Rossi", avatar: avatar(5) },
    updatedAt: "2 days ago",
    targetDate: "Jul 18",
    activeMilestones: 2,
    openTickets: 21,
    blockedTickets: 6,
    overdueTickets: 5,
    awaitingReviewTickets: 4,
    dueThisWeekTickets: 6,
    progress: 24,
  },
  {
    slug: "partner-api-integration",
    name: "Partner API Integration",
    shortName: "PA",
    description: "Two-way sync with a banking partner's settlement API.",
    status: "on-hold",
    priority: "low",
    health: "needs-attention",
    owner: { name: "David Kim", avatar: avatar(22) },
    updatedAt: "2 weeks ago",
    targetDate: "Nov 1",
    activeMilestones: 0,
    openTickets: 4,
    blockedTickets: 1,
    overdueTickets: 2,
    awaitingReviewTickets: 1,
    dueThisWeekTickets: 1,
    progress: 50,
  },
  {
    slug: "employee-onboarding-tool",
    name: "Employee Onboarding Tool",
    shortName: "EO",
    description: "Internal HR tool for new-hire provisioning and training tracks.",
    status: "archived",
    priority: "low",
    health: "healthy",
    owner: { name: "Marcus Lee", avatar: avatar(12) },
    updatedAt: "3 months ago",
    targetDate: "Mar 1",
    activeMilestones: 0,
    openTickets: 0,
    blockedTickets: 0,
    overdueTickets: 0,
    awaitingReviewTickets: 0,
    dueThisWeekTickets: 0,
    progress: 100,
  },
  {
    slug: "vendor-security-review",
    name: "Vendor Security Review",
    shortName: "VS",
    description: "Annual third-party vendor security and compliance audit.",
    status: "archived",
    priority: "medium",
    health: "healthy",
    owner: { name: "Priya Patel", avatar: avatar(33) },
    updatedAt: "5 months ago",
    targetDate: "Jan 15",
    activeMilestones: 0,
    openTickets: 0,
    blockedTickets: 0,
    overdueTickets: 0,
    awaitingReviewTickets: 0,
    dueThisWeekTickets: 0,
    progress: 100,
  },
];

export function getProjectBySlug(slug: string): ProjectSummary | undefined {
  return projects.find((project) => project.slug === slug);
}
