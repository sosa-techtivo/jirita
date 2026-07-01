"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { useRouter } from "next/navigation";
import { getTeamByProjectSlug } from "@/lib/mock-team";
import type { AvailabilityStatus, TeamMember } from "@/lib/mock-team";
import { getTicketById } from "@/lib/mock-tickets";
import type { Ticket } from "@/lib/mock-tickets";
import { StatusBadge as TicketStatusBadge, PriorityBadge } from "@/components/tickets/ticket-ui";
import { TicketPreviewPanel } from "@/components/tickets/ticket-preview-panel";
import { FilterDropdown } from "@/components/tickets/filter-dropdown";
import type { DropdownGroup } from "@/components/tickets/filter-dropdown";

// ── Status & capacity styling ───────────────────────────────────────────────────

const STATUS_STYLE: Record<AvailabilityStatus, { dot: string; text: string; bg: string }> = {
  Available: { dot: "bg-emerald-500", text: "text-emerald-700 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-500/10" },
  Busy:      { dot: "bg-amber-500",   text: "text-amber-700 dark:text-amber-400",     bg: "bg-amber-50 dark:bg-amber-500/10" },
  Away:      { dot: "bg-slate-400 dark:bg-zinc-600", text: "text-slate-500 dark:text-zinc-400", bg: "bg-slate-100 dark:bg-zinc-800" },
};

function StatusBadge({ status }: { status: AvailabilityStatus }) {
  const style = STATUS_STYLE[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold flex-shrink-0 ${style.bg} ${style.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
      {status}
    </span>
  );
}

function utilizationOf(member: TeamMember): number {
  return Math.round((member.assignedHours / member.weeklyCapacity) * 100);
}

function capacityBarColor(pct: number): string {
  return pct > 100 ? "bg-red-500" : pct > 80 ? "bg-amber-400" : "bg-emerald-500";
}

function capacityTextColor(pct: number): string {
  return pct > 100
    ? "text-red-600 dark:text-red-400"
    : pct > 80
    ? "text-amber-600 dark:text-amber-400"
    : "text-emerald-600 dark:text-emerald-400";
}

function CapacityBar({ pct }: { pct: number }) {
  return (
    <div className="h-1.5 rounded-full bg-slate-100 dark:bg-zinc-800 overflow-hidden">
      <div className={`h-full rounded-full ${capacityBarColor(pct)}`} style={{ width: `${Math.min(pct, 100)}%` }} />
    </div>
  );
}

function remainingAvailabilityLabel(member: TeamMember): string {
  const remaining = member.weeklyCapacity - member.assignedHours;
  return remaining >= 0 ? `${remaining}h available` : `${Math.abs(remaining)}h over capacity`;
}

function assigneeQueryValue(name: string): string {
  return name.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
}

// ── Main screen ───────────────────────────────────────────────────────────────

export function TeamScreen({ slug }: { slug: string }) {
  const members = useMemo(() => getTeamByProjectSlug(slug), [slug]);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [activeMember, setActiveMember] = useState<TeamMember | null>(null);
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
        <button
          type="button"
          className="text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-lg px-3.5 py-2 shadow-sm shadow-brand-600/20 transition-colors flex-shrink-0 dark:bg-brand-500 dark:hover:bg-brand-600 dark:shadow-brand-500/20"
        >
          + Add Member
        </button>
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
              <MemberCard key={member.id} member={member} slug={slug} onOpen={() => setActiveMember(member)} />
            ))}
          </div>
        )}
      </div>

      {activeMember && <MemberModal member={activeMember} slug={slug} onClose={() => setActiveMember(null)} />}
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

// ── Member modal ──────────────────────────────────────────────────────────────

function MemberModal({ member, slug, onClose }: { member: TeamMember; slug: string; onClose: () => void }) {
  const [visible, setVisible] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const pct = utilizationOf(member);
  const memberTickets = member.activeTicketIds
    .map((id) => getTicketById(id))
    .filter((t): t is Ticket => t !== undefined);

  function handleClose() {
    setVisible(false);
    setTimeout(onClose, 200);
  }

  useEffect(() => {
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // While the ticket panel is open, let its own Escape handler close just
      // that layer instead of closing both at once.
      if (selectedTicket) return;
      handleClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTicket]);

  return (
    <>
      <div
        aria-hidden
        onClick={() => (selectedTicket ? setSelectedTicket(null) : handleClose())}
        className={
          "fixed inset-0 z-50 bg-black/30 dark:bg-black/50 transition-opacity duration-200 " +
          (visible ? "opacity-100" : "opacity-0")
        }
      />

      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 pointer-events-none">
        <div
          role="dialog"
          aria-modal
          aria-label={member.name}
          className={
            "pointer-events-auto w-full max-w-2xl flex flex-col " +
            "max-h-[calc(100dvh-3rem)] bg-white dark:bg-zinc-950 " +
            "rounded-2xl border border-slate-200 dark:border-zinc-800 " +
            "shadow-2xl shadow-black/20 dark:shadow-black/60 " +
            "transition-all duration-200 ease-out " +
            (visible ? "opacity-100 translate-y-0 scale-100" : "opacity-0 translate-y-2 scale-[0.98]")
          }
        >
          <div className="flex items-center justify-end gap-1.5 px-6 pt-5 flex-shrink-0">
            <MemberMenu />
            <CloseButton onClick={handleClose} />
          </div>

          <div className="flex-1 overflow-y-auto px-6 sm:px-8 pb-8">
            <div className="flex items-start gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={member.avatar} alt={member.name} className="w-14 h-14 rounded-full flex-shrink-0" />
              <div className="flex-1 min-w-0 pt-0.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-2xl font-bold text-slate-900 tracking-tight dark:text-zinc-50">{member.name}</h1>
                  <StatusBadge status={member.status} />
                </div>
                <p className="text-sm text-slate-500 mt-0.5 dark:text-zinc-400">{member.role}</p>
                <p className="flex items-center gap-1.5 text-xs text-slate-400 mt-1.5 dark:text-zinc-500">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <rect x="3" y="5" width="18" height="14" rx="2" />
                    <path d="M3 7l9 6 9-6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {member.email}
                </p>
              </div>
            </div>

            <div className="mt-6 flex items-stretch divide-x divide-slate-100 dark:divide-zinc-800 rounded-xl border border-slate-200 dark:border-zinc-700/70 bg-white dark:bg-zinc-900 shadow-sm shadow-slate-200/40 dark:shadow-black/20 overflow-hidden">
              <div className="flex-1 px-4 py-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600">Weekly Capacity</p>
                <p className="text-lg font-bold text-slate-900 dark:text-zinc-50 mt-0.5 leading-none">{member.weeklyCapacity}h</p>
              </div>
              <div className="flex-1 px-4 py-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600">Assigned Hours</p>
                <p className="text-lg font-bold text-slate-900 dark:text-zinc-50 mt-0.5 leading-none">{member.assignedHours}h</p>
              </div>
              <div className="flex-1 px-4 py-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600">Utilization</p>
                <p className={`text-lg font-bold mt-0.5 leading-none tabular-nums ${capacityTextColor(pct)}`}>{pct}%</p>
              </div>
              <div className="flex-1 px-4 py-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600">Active Tickets</p>
                <p className="text-lg font-bold text-slate-900 dark:text-zinc-50 mt-0.5 leading-none">{memberTickets.length}</p>
              </div>
            </div>

            <div className="mt-7">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-zinc-400 mb-2">
                Current Workload
              </h2>
              <CapacityBar pct={pct} />
              <p className={`mt-1.5 text-[13px] font-medium ${capacityTextColor(pct)}`}>
                {remainingAvailabilityLabel(member)}
              </p>
            </div>

            <div className="mt-7 pt-6 border-t border-slate-100 dark:border-zinc-800">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-zinc-400 mb-1">
                Active Tickets
              </h2>
              {memberTickets.length === 0 ? (
                <p className="text-sm text-slate-400 dark:text-zinc-500 mt-2">No active tickets.</p>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-zinc-800">
                  {memberTickets.map((ticket) => (
                    <button
                      key={ticket.id}
                      type="button"
                      onClick={() => setSelectedTicket(ticket)}
                      className="w-full flex items-center gap-3 py-2.5 px-2 -mx-2 rounded-lg text-left hover:bg-slate-50 dark:hover:bg-zinc-800/50 transition-colors"
                    >
                      <span className="text-xs font-mono text-slate-400 dark:text-zinc-500 flex-shrink-0 w-14">
                        {ticket.issueKey}
                      </span>
                      <span className="flex-1 min-w-0 text-sm text-slate-700 dark:text-zinc-300 truncate">
                        {ticket.title}
                      </span>
                      <PriorityBadge priority={ticket.priority} />
                      <TicketStatusBadge status={ticket.status} />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {selectedTicket && (
        <TicketPreviewPanel
          ticket={selectedTicket}
          slug={slug}
          onClose={() => setSelectedTicket(null)}
        />
      )}
    </>
  );
}

function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label="Close"
      className="p-1.5 rounded-lg text-slate-400 dark:text-zinc-500 hover:text-slate-700 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path d="M18 6L6 18M6 6l12 12" />
      </svg>
    </button>
  );
}

function MemberMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open]);

  const items: { label: string; danger?: boolean }[] = [
    { label: "Send Message" },
    { label: "View Ticket History" },
    { label: "Remove from Project", danger: true },
  ];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Member actions"
        className={
          "p-1.5 rounded-lg text-slate-400 dark:text-zinc-500 hover:text-slate-700 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors " +
          (open ? "text-slate-700 dark:text-zinc-200 bg-slate-100 dark:bg-zinc-800" : "")
        }
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path d="M6 10a2 2 0 11-4 0 2 2 0 014 0zm6 0a2 2 0 11-4 0 2 2 0 014 0zm6 0a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      </button>

      <div
        className={
          "absolute right-0 top-full mt-1.5 z-10 w-44 rounded-lg border bg-white dark:bg-zinc-900 " +
          "shadow-lg shadow-black/10 dark:shadow-black/40 border-slate-200 dark:border-zinc-700/60 " +
          "transition-all duration-150 origin-top-right " +
          (open ? "opacity-100 scale-100 pointer-events-auto" : "opacity-0 scale-95 pointer-events-none")
        }
      >
        <div className="py-1">
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => setOpen(false)}
              className={
                "w-full px-3 py-1.5 text-[13px] text-left transition-colors duration-150 " +
                (item.danger
                  ? "text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10"
                  : "text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800/60")
              }
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
