"use client";

import { useId, useMemo, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { useRouter } from "next/navigation";
import { getTeamByProjectSlug } from "@/lib/mock-team";
import type { TeamMember } from "@/lib/mock-team";
import { FilterDropdown } from "@/components/tickets/filter-dropdown";
import type { DropdownGroup } from "@/components/tickets/filter-dropdown";
import { useCurrentUser } from "@/components/current-user-provider";
import { canManage } from "@/lib/current-user";
import {
  StatusBadge,
  utilizationOf,
  capacityTextColor,
  CapacityBar,
  remainingAvailabilityLabel,
} from "@/components/member-profile-modal";
import { useMemberProfile } from "@/components/member-profile";

function assigneeQueryValue(name: string): string {
  return name.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
}

// ── Main screen ───────────────────────────────────────────────────────────────

export function TeamScreen({ slug }: { slug: string }) {
  const { user } = useCurrentUser();
  const canAddMember = canManage(user.role);
  const members = useMemo(() => getTeamByProjectSlug(slug), [slug]);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const { openMemberProfile } = useMemberProfile();
  const searchId = useId();

  const roleGroups: DropdownGroup[] = useMemo(() => {
    const roles = Array.from(new Set(members.map((m) => m.role)));
    return [{ options: roles.map((role) => ({ value: role, label: role })) }];
  }, [members]);

  const statusGroups: DropdownGroup[] = [{
    options: [
      { value: "Available", label: "Available" },
      { value: "Busy", label: "Busy" },
      { value: "Away", label: "Away" },
    ],
  }];

  const query = search.trim().toLowerCase();
  const filtered = members.filter((member) => {
    const matchesSearch =
      query === "" ||
      member.name.toLowerCase().includes(query) ||
      member.role.toLowerCase().includes(query) ||
      member.email.toLowerCase().includes(query);
    const matchesRole = roleFilter.length === 0 || roleFilter.includes(member.role);
    const matchesStatus = statusFilter.length === 0 || statusFilter.includes(member.status);
    return matchesSearch && matchesRole && matchesStatus;
  });

  const hasAnyMembers = members.length > 0;

  const totalWeeklyCapacity = members.reduce((sum, m) => sum + m.weeklyCapacity, 0);
  const totalAssignedHours = members.reduce((sum, m) => sum + m.assignedHours, 0);
  const teamUtilization = totalWeeklyCapacity === 0 ? 0 : Math.round((totalAssignedHours / totalWeeklyCapacity) * 100);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-8 py-10">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight dark:text-zinc-50">Team</h1>
          <p className="text-sm text-slate-500 mt-1 dark:text-zinc-400">
            Monitor team members, workload and capacity.
          </p>
        </div>
        {canAddMember && (
          <button
            type="button"
            className="text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-lg px-3.5 py-2 shadow-sm shadow-brand-600/20 transition-colors flex-shrink-0 dark:bg-brand-500 dark:hover:bg-brand-600 dark:shadow-brand-500/20"
          >
            + Add Member
          </button>
        )}
      </div>

      <div className="mt-6 flex items-stretch divide-x divide-slate-100 dark:divide-zinc-800 rounded-xl border border-slate-200 dark:border-zinc-700/70 bg-white dark:bg-zinc-900 shadow-sm shadow-slate-200/40 dark:shadow-black/20 overflow-hidden">
        <div className="flex-1 px-5 py-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600">Team Members</p>
          <p className="text-2xl font-bold text-slate-900 dark:text-zinc-50 mt-1 leading-none">{members.length}</p>
        </div>
        <div className="flex-1 px-5 py-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600">Weekly Capacity</p>
          <p className="text-2xl font-bold text-slate-900 dark:text-zinc-50 mt-1 leading-none">
            {totalWeeklyCapacity}
            <span className="text-base font-medium text-slate-400 dark:text-zinc-600 ml-0.5">h</span>
          </p>
        </div>
        <div className="flex-1 px-5 py-4 bg-brand-50/30 dark:bg-brand-950/10">
          <p className="text-[10px] font-bold uppercase tracking-widest text-brand-500 dark:text-brand-400">Assigned Hours</p>
          <p className="text-2xl font-bold text-brand-700 dark:text-brand-300 mt-1 leading-none">
            {totalAssignedHours}
            <span className="text-base font-medium text-brand-400 dark:text-brand-500 ml-0.5">h</span>
          </p>
        </div>
        <div className="flex-1 px-5 py-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600">Team Utilization</p>
          <p className={`text-2xl font-bold mt-1 leading-none tabular-nums ${capacityTextColor(teamUtilization)}`}>
            {teamUtilization}%
          </p>
        </div>
      </div>

      <div className="mt-6 flex flex-col sm:flex-row sm:items-center gap-3">
        <label htmlFor={searchId} className="relative w-full sm:w-64 flex-shrink-0">
          <svg
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-zinc-500"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            viewBox="0 0 24 24"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3" />
          </svg>
          <input
            id={searchId}
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search team..."
            className="w-full text-sm bg-slate-100 placeholder:text-slate-400 rounded-md pl-8 pr-3 py-1.5 outline-none focus:ring-2 focus:ring-brand-500/30 transition-colors dark:bg-zinc-900 dark:placeholder:text-zinc-500 dark:text-zinc-100"
          />
        </label>

        <div className="flex items-center gap-1 flex-wrap">
          <FilterDropdown label="Role" mode="multi" groups={roleGroups} selected={roleFilter} onChange={setRoleFilter} />
          <FilterDropdown label="Status" mode="multi" groups={statusGroups} selected={statusFilter} onChange={setStatusFilter} />
        </div>
      </div>

      <div className="mt-6">
        {filtered.length === 0 ? (
          <EmptyState hasAnyMembers={hasAnyMembers} />
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((member) => (
              <MemberCard
                key={member.id}
                member={member}
                slug={slug}
                onOpen={() => openMemberProfile({
                  name: member.name,
                  avatar: member.avatar,
                  role: member.role,
                  projectSlug: member.projectSlug,
                })}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Member card ───────────────────────────────────────────────────────────────

function MemberCard({ member, slug, onOpen }: { member: TeamMember; slug: string; onOpen: () => void }) {
  const router = useRouter();
  const pct = utilizationOf(member);

  function handleViewTickets(e: ReactMouseEvent) {
    e.stopPropagation();
    router.push(`/projects/${slug}/tickets?assignee=${encodeURIComponent(assigneeQueryValue(member.name))}`);
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/40 cursor-pointer outline-none transition-all duration-150 hover:-translate-y-px hover:bg-slate-50/60 hover:shadow-md focus-visible:ring-2 focus-visible:ring-brand-500/40 dark:border-zinc-700/70 dark:bg-zinc-900 dark:shadow-black/20 dark:hover:bg-zinc-800/40"
    >
      <div className="flex items-start gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={member.avatar} alt={member.name} className="w-10 h-10 rounded-full flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-zinc-100 truncate">{member.name}</h3>
          <p className="text-xs text-slate-400 dark:text-zinc-500 truncate">{member.role}</p>
        </div>
        <StatusBadge status={member.status} />
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-400 dark:text-zinc-500">This Week</span>
          <span className="font-semibold text-slate-700 dark:text-zinc-200 tabular-nums">
            {member.assignedHours}h <span className="font-normal text-slate-400 dark:text-zinc-600">/ {member.weeklyCapacity}h</span>
          </span>
        </div>
        <div className="mt-1.5">
          <CapacityBar pct={pct} />
        </div>
        <p className={`mt-1.5 text-[11px] font-medium ${capacityTextColor(pct)}`}>
          {remainingAvailabilityLabel(member)}
        </p>
      </div>

      <div className="mt-3 pt-3 border-t border-slate-100 dark:border-zinc-800 flex items-center justify-between text-xs">
        <button
          type="button"
          onClick={handleViewTickets}
          onKeyDown={(e) => e.stopPropagation()}
          className="text-slate-400 dark:text-zinc-500 hover:text-brand-600 dark:hover:text-brand-400 underline-offset-2 hover:underline transition-colors"
        >
          {member.activeTicketIds.length} active ticket{member.activeTicketIds.length === 1 ? "" : "s"}
        </button>
        <span className={`font-semibold tabular-nums ${capacityTextColor(pct)}`}>{pct}% utilized</span>
      </div>
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ hasAnyMembers }: { hasAnyMembers: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-20 px-4">
      <div className="w-10 h-10 rounded-lg border border-slate-200 flex items-center justify-center text-slate-400 mb-4 dark:border-zinc-700 dark:text-zinc-500">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
        </svg>
      </div>
      <h3 className="text-sm font-semibold text-slate-700 dark:text-zinc-200">
        {hasAnyMembers ? "No matching team members" : "No team members yet"}
      </h3>
      <p className="text-sm text-slate-400 mt-1 max-w-xs dark:text-zinc-500">
        {hasAnyMembers ? "Try adjusting your search or filters." : "Invite people to start tracking workload and capacity."}
      </p>
    </div>
  );
}

