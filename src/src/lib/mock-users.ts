import type { Role } from "@/lib/current-user";

// Org-wide account list for the Users management module (/users, Admin
// only). Distinct from mock-team.ts's TeamMember: a TeamMember is one row
// per person *per project* (workload/capacity in that project's context —
// the same person can have several rows), while a User here is the single
// canonical account record for that person across the whole workspace
// (role, login/invite state, which projects they're staffed on at all).

export type UserStatus = "Active" | "Invited" | "Disabled";

export interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  avatar: string;
  role: Role;
  status: UserStatus;
  /** Total hours/week this person is available for, across all projects. */
  weeklyCapacity: number;
  /** References ProjectSummary.slug in mock-projects.ts. */
  projectSlugs: string[];
  /** Display string; null means never logged in (e.g. still pending an invite). */
  lastLogin: string | null;
  /** Display string — reads "Invited <date>" for pending accounts rather than
   *  modeling a separate invited-vs-joined timeline, consistent with how the
   *  rest of this prototype uses plain display strings instead of real dates. */
  joinedAt: string;
  /** Session info from their last login — undefined when lastLogin is null. */
  browser?: string;
  os?: string;
  device?: string;
}

const avatar = (id: number) => `https://i.pravatar.cc/64?img=${id}`;

export const users: User[] = [
  {
    id: "user-priya",
    firstName: "Priya",
    lastName: "Patel",
    email: "alejo@techtivo.com",
    avatar: avatar(33),
    role: "ADMIN",
    status: "Active",
    weeklyCapacity: 40,
    projectSlugs: ["data-warehouse-revamp", "vendor-security-review"],
    lastLogin: "Just now",
    joinedAt: "Jan 8, 2025",
    browser: "Chrome",
    os: "macOS",
    device: "MacBook Pro",
  },
  {
    id: "user-sarah",
    firstName: "Sarah",
    lastName: "Chen",
    email: "sarah.chen@techtivo.com",
    avatar: avatar(47),
    role: "PROJECT_LEAD",
    status: "Active",
    weeklyCapacity: 40,
    projectSlugs: ["mobile-banking-app"],
    lastLogin: "2 hours ago",
    joinedAt: "Mar 3, 2025",
    browser: "Safari",
    os: "macOS",
    device: "MacBook Air",
  },
  {
    id: "user-marcus",
    firstName: "Marcus",
    lastName: "Lee",
    email: "marcus.lee@techtivo.com",
    avatar: avatar(12),
    role: "MEMBER",
    status: "Active",
    weeklyCapacity: 40,
    projectSlugs: ["mobile-banking-app", "internal-platform-migration", "employee-onboarding-tool"],
    lastLogin: "Yesterday",
    joinedAt: "Feb 14, 2025",
    browser: "Chrome",
    os: "Windows",
    device: "ThinkPad X1",
  },
  {
    id: "user-david",
    firstName: "David",
    lastName: "Kim",
    email: "david.kim@techtivo.com",
    avatar: avatar(22),
    role: "MEMBER",
    status: "Active",
    weeklyCapacity: 32,
    projectSlugs: ["mobile-banking-app", "customer-support-portal", "partner-api-integration"],
    lastLogin: "3 hours ago",
    joinedAt: "Jun 2, 2025",
    browser: "Chrome",
    os: "macOS",
    device: "MacBook Pro",
  },
  {
    id: "user-elena",
    firstName: "Elena",
    lastName: "Rossi",
    email: "elena.rossi@techtivo.com",
    avatar: avatar(5),
    role: "MEMBER",
    status: "Active",
    weeklyCapacity: 40,
    projectSlugs: ["mobile-banking-app", "client-website-redesign", "marketing-site-relaunch"],
    lastLogin: "5 hours ago",
    joinedAt: "Sep 20, 2025",
    browser: "Safari",
    os: "macOS",
    device: "iMac",
  },
  {
    id: "user-jordan",
    firstName: "Jordan",
    lastName: "Wu",
    email: "jordan.wu@techtivo.com",
    avatar: avatar(15),
    role: "MEMBER",
    status: "Active",
    weeklyCapacity: 40,
    projectSlugs: ["internal-platform-migration"],
    lastLogin: "1 day ago",
    joinedAt: "Nov 11, 2025",
    browser: "Firefox",
    os: "Linux",
    device: "ThinkPad T14",
  },
  {
    id: "user-noah",
    firstName: "Noah",
    lastName: "Bennett",
    email: "noah.bennett@techtivo.com",
    avatar: avatar(51),
    role: "MEMBER",
    status: "Invited",
    weeklyCapacity: 40,
    projectSlugs: ["data-warehouse-revamp"],
    lastLogin: null,
    joinedAt: "Invited Jun 28, 2026",
  },
  {
    id: "user-lena",
    firstName: "Lena",
    lastName: "Ortiz",
    email: "lena.ortiz@techtivo.com",
    avatar: avatar(44),
    role: "PROJECT_LEAD",
    status: "Invited",
    weeklyCapacity: 40,
    projectSlugs: ["marketing-site-relaunch"],
    lastLogin: null,
    joinedAt: "Invited Jun 30, 2026",
  },
  {
    id: "user-owen",
    firstName: "Owen",
    lastName: "Price",
    email: "owen.price@techtivo.com",
    avatar: avatar(60),
    role: "MEMBER",
    status: "Disabled",
    weeklyCapacity: 0,
    projectSlugs: [],
    lastLogin: "2 months ago",
    joinedAt: "Apr 4, 2024",
    browser: "Chrome",
    os: "Windows",
    device: "Dell XPS",
  },
];

export function getUserById(id: string): User | undefined {
  return users.find((u) => u.id === id);
}

export function fullName(user: User): string {
  return `${user.firstName} ${user.lastName}`;
}
