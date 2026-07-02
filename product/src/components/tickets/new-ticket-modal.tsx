"use client";

import { useEffect, useRef, useState } from "react";
import type { Ticket, TicketStatus, TicketPriority } from "@/lib/mock-tickets";
import { tickets as ALL_TICKETS, getTicketDisplayKey } from "@/lib/mock-tickets";
import { StatusBadge, STATUS_LABEL } from "@/components/tickets/ticket-ui";
import { registerTicket, nextTicketNumber, titleToTicketId } from "@/lib/pending-tickets";

// ── Constants ─────────────────────────────────────────────────────────────────

const TEAM_MEMBERS = [
  { name: "Marcus Lee",  avatar: "https://i.pravatar.cc/64?img=12" },
  { name: "Elena Rossi", avatar: "https://i.pravatar.cc/64?img=5"  },
  { name: "Sarah Chen",  avatar: "https://i.pravatar.cc/64?img=47" },
  { name: "Priya Patel", avatar: "https://i.pravatar.cc/64?img=33" },
  { name: "David Kim",   avatar: "https://i.pravatar.cc/64?img=22" },
];

const MILESTONES = ["App Store Submission", "Beta Release", "Security Audit"];

const ALL_LABELS = [
  "Accessibility", "API", "Bug", "Compliance", "Dark Mode",
  "Design", "Enhancement", "Integration", "iOS", "Marketing",
  "Notifications", "Onboarding", "Performance", "Security",
];

const PRIORITY_LABEL: Record<TicketPriority, string> = {
  high:   "High",
  normal: "Normal",
  low:    "Low",
};

const LABEL_HINTS: Array<{ words: string[]; label: string }> = [
  { words: ["security", "secure", "auth", "authentication", "password", "encrypt", "pci", "kyc", "mfa", "biometric", "token", "otp", "2fa"], label: "Security" },
  { words: ["bug", "fix", "crash", "error", "fail", "broken", "regression", "defect", "wrong", "invalid"], label: "Bug" },
  { words: ["api", "endpoint", "rest", "rate", "limit", "webhook", "graphql", "integration", "vendor", "third", "party", "external"], label: "API" },
  { words: ["notification", "push", "alert", "email", "sms", "notify", "message", "reminder"], label: "Notifications" },
  { words: ["performance", "slow", "fast", "latency", "speed", "cache", "optimize", "paginate", "pagination", "load", "memory"], label: "Performance" },
  { words: ["design", "ui", "ux", "layout", "style", "visual", "mockup", "responsive", "screen", "interface"], label: "Design" },
  { words: ["accessibility", "a11y", "aria", "wcag", "keyboard", "voiceover", "talkback", "reader"], label: "Accessibility" },
  { words: ["compliance", "regulation", "legal", "policy", "gdpr", "audit", "requirement", "standard"], label: "Compliance" },
  { words: ["onboarding", "welcome", "tutorial", "guide", "first", "setup", "walkthrough", "introduction"], label: "Onboarding" },
  { words: ["ios", "iphone", "apple", "safari", "faceid", "touchid", "biometric", "appstore"], label: "iOS" },
  { words: ["dark", "theme", "night", "color", "palette", "chart", "graph"], label: "Dark Mode" },
  { words: ["integration", "connect", "sync", "import", "export", "oauth", "sso"], label: "Integration" },
  { words: ["enhancement", "improve", "add", "new", "feature", "request", "support"], label: "Enhancement" },
  { words: ["marketing", "copy", "screenshot", "listing", "store", "promo"], label: "Marketing" },
];

function getSuggestedLabels(title: string, selected: string[]): string[] {
  if (title.trim().length < 3) return [];
  const words = title.toLowerCase().split(/\W+/).filter((w) => w.length >= 3);
  const scores = new Map<string, number>();
  for (const { words: keywords, label } of LABEL_HINTS) {
    if (selected.includes(label)) continue;
    for (const w of words) {
      if (keywords.some((k) => k.includes(w) || w.includes(k))) {
        scores.set(label, (scores.get(label) ?? 0) + 1);
      }
    }
  }
  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([label]) => label);
}

function getDuplicates(title: string): Ticket[] {
  if (title.trim().length < 3) return [];
  const words = title.toLowerCase().split(/\W+/).filter((w) => w.length >= 3);
  if (words.length === 0) return [];
  return ALL_TICKETS.map((t) => {
    const tWords = t.title.toLowerCase().split(/\W+/);
    const score = words.filter((w) => tWords.some((tw) => tw.includes(w) || w.includes(tw))).length;
    return { ticket: t, score };
  })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(({ ticket }) => ticket);
}

function formatDueDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ── Shared styles ─────────────────────────────────────────────────────────────

const INPUT =
  "w-full bg-white dark:bg-zinc-900 text-[13px] font-medium text-slate-800 dark:text-zinc-200 " +
  "border border-slate-200 dark:border-zinc-700 rounded-lg px-3 py-2 outline-none " +
  "focus:border-brand-500 dark:focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 " +
  "placeholder:text-slate-300 dark:placeholder:text-zinc-600 transition-colors";

const FIELD_LABEL =
  "block text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600 mb-1.5";

// ── Label picker (inline, avoids overflow clipping issues) ────────────────────

function LabelPicker({
  selected,
  onToggle,
}: {
  selected: string[];
  onToggle: (label: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const searchRef  = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Open/close focus management
  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const filtered = ALL_LABELS.filter((l) =>
    l.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div ref={containerRef}>
      {/* Chips + trigger */}
      <div className="flex flex-wrap items-center gap-1.5">
        {selected.map((l) => (
          <button
            key={l}
            type="button"
            onClick={() => onToggle(l)}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-brand-500 dark:bg-brand-600 text-white hover:bg-brand-600 dark:hover:bg-brand-700 transition-colors"
          >
            {l}
            <svg className="w-2.5 h-2.5 opacity-70" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
              <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
            </svg>
          </button>
        ))}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={
            "inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium transition-colors " +
            (open
              ? "bg-slate-200 dark:bg-zinc-700 text-slate-700 dark:text-zinc-200"
              : "bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400 hover:bg-slate-200 dark:hover:bg-zinc-700 hover:text-slate-700 dark:hover:text-zinc-200")
          }
        >
          <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <path d="M12 5v14M5 12h14" strokeLinecap="round" />
          </svg>
          Add label
        </button>
      </div>

      {/* Inline picker panel */}
      {open && (
        <div className="mt-2 border border-slate-200 dark:border-zinc-700 rounded-xl overflow-hidden shadow-sm">
          {/* Search */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-900/50">
            <svg className="w-3 h-3 text-slate-400 dark:text-zinc-600 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
            </svg>
            <input
              ref={searchRef}
              type="text"
              placeholder="Search labels…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") { e.stopPropagation(); setOpen(false); setSearch(""); }
              }}
              className="flex-1 bg-transparent text-[12px] text-slate-800 dark:text-zinc-200 outline-none placeholder:text-slate-400 dark:placeholder:text-zinc-600"
            />
          </div>

          {/* Label list */}
          <div className="max-h-44 overflow-y-auto py-1 bg-white dark:bg-zinc-950">
            {filtered.length === 0 ? (
              <p className="px-3 py-3 text-[12px] text-slate-400 dark:text-zinc-600">
                No labels match "{search}"
              </p>
            ) : (
              filtered.map((l) => {
                const isSelected = selected.includes(l);
                return (
                  <button
                    key={l}
                    type="button"
                    onClick={() => onToggle(l)}
                    className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[12px] text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800/60 transition-colors text-left"
                  >
                    <span
                      className={
                        "w-3.5 h-3.5 rounded border flex-shrink-0 flex items-center justify-center transition-colors " +
                        (isSelected
                          ? "bg-brand-500 border-brand-500"
                          : "border-slate-300 dark:border-zinc-600")
                      }
                    >
                      {isSelected && (
                        <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
                          <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </span>
                    {l}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function NewTicketModal({
  slug,
  onClose,
  onCreated,
  onPreviewDuplicate,
}: {
  slug:               string;
  onClose:            () => void;
  onCreated:          (ticket: Ticket) => void;
  onPreviewDuplicate: (ticket: Ticket) => void;
}) {
  // Entrance animation
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
    return () => cancelAnimationFrame(id);
  }, []);

  // Form state
  const [title, setTitle]               = useState("");
  const [description, setDescription]   = useState("");
  const [criteria, setCriteria]         = useState<string[]>([]);
  const [status, setStatus]             = useState<TicketStatus>("to-do");
  const [priority, setPriority]         = useState<TicketPriority>("normal");
  const [assigneeName, setAssigneeName] = useState("");
  const [labels, setLabels]             = useState<string[]>([]);
  const [dueDate, setDueDate]           = useState("");
  const [hours, setHours]               = useState("");
  const [moreOpen, setMoreOpen]         = useState(false);

  const titleRef      = useRef<HTMLInputElement>(null);
  const textareaRef   = useRef<HTMLTextAreaElement>(null);
  const criteriaRefs  = useRef<(HTMLInputElement | null)[]>([]);
  const justAddedCrit = useRef(false);

  // Focus title on open
  useEffect(() => { if (visible) titleRef.current?.focus(); }, [visible]);

  // Lock body scroll
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  // Focus newest criterion input after add
  useEffect(() => {
    if (justAddedCrit.current && criteria.length > 0) {
      justAddedCrit.current = false;
      criteriaRefs.current[criteria.length - 1]?.focus();
    }
  }, [criteria.length]);

  // Derived
  const duplicates      = getDuplicates(title);
  const suggestedLabels = getSuggestedLabels(title, labels);
  const canSubmit       = title.trim().length > 0;

  const toggleLabel = (label: string) =>
    setLabels((prev) =>
      prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label]
    );

  // Criteria helpers
  const addCriterion = () => {
    justAddedCrit.current = true;
    setCriteria((prev) => [...prev, ""]);
  };

  const updateCriterion = (i: number, value: string) =>
    setCriteria((prev) => prev.map((c, idx) => (idx === i ? value : c)));

  const removeCriterion = (i: number) =>
    setCriteria((prev) => prev.filter((_, idx) => idx !== i));

  const buildTicket = (): Ticket => {
    const assignee = TEAM_MEMBERS.find((m) => m.name === assigneeName)
      ?? { name: "Unassigned", avatar: "https://i.pravatar.cc/64?img=0" };
    const filledCriteria = criteria.filter((c) => c.trim().length > 0);
    return {
      id:           titleToTicketId(title),
      projectSlug:  slug,
      ticketNumber: nextTicketNumber(slug),
      title:       title.trim(),
      description: description.trim(),
      status,
      priority,
      assignee,
      milestone:   MILESTONES[0],
      labels,
      acceptanceCriteria: filledCriteria.length > 0 ? filledCriteria : undefined,
      dueDate:     dueDate ? formatDueDate(dueDate) : undefined,
      hours:       hours ? (parseInt(hours, 10) >= 0 ? parseInt(hours, 10) : undefined) : undefined,
      updatedAt:   "Just now",
    };
  };

  const handleSubmit = () => {
    if (!canSubmit) { titleRef.current?.focus(); return; }
    const ticket = buildTicket();
    registerTicket(ticket);
    onCreated(ticket);
  };

  const submitRef = useRef(handleSubmit);
  submitRef.current = handleSubmit;

  const handleClose = () => {
    setVisible(false);
    setTimeout(onClose, 200);
  };

  // Esc to close modal (document-level)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") handleClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const autoResizeTextarea = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Backdrop */}
      <div
        aria-hidden
        onClick={handleClose}
        className={
          "fixed inset-0 z-50 bg-black/30 dark:bg-black/50 " +
          "transition-opacity duration-200 " +
          (visible ? "opacity-100" : "opacity-0")
        }
      />

      {/* Centering shell */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 pointer-events-none">
        <div
          role="dialog"
          aria-modal
          aria-label="New Ticket"
          className={
            "pointer-events-auto w-full max-w-2xl flex flex-col " +
            "max-h-[calc(100dvh-3rem)] " +
            "bg-white dark:bg-zinc-950 " +
            "rounded-2xl border border-slate-200 dark:border-zinc-800 " +
            "shadow-2xl shadow-black/20 dark:shadow-black/60 " +
            "transition-all duration-200 ease-out " +
            (visible ? "opacity-100 translate-y-0 scale-100" : "opacity-0 translate-y-2 scale-[0.98]")
          }
        >
          {/* ── Header ──────────────────────────────────────────────────────── */}
          <div className="flex items-center justify-between px-6 pt-5 pb-4 flex-shrink-0">
            <h2 className="text-[15px] font-semibold text-slate-900 dark:text-zinc-50">New Ticket</h2>
            <button
              onClick={handleClose}
              aria-label="Close"
              className="p-1.5 rounded-lg text-slate-400 dark:text-zinc-500 hover:text-slate-700 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* ── Scrollable body ──────────────────────────────────────────────── */}
          <div className="flex-1 overflow-y-auto px-6 pb-2 space-y-5">

            {/* Title */}
            <div>
              <label className={FIELD_LABEL}>
                Title
                <span className="ml-1.5 text-brand-500 dark:text-brand-400">*</span>
              </label>
              <input
                ref={titleRef}
                type="text"
                placeholder="What needs to be done?"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); submitRef.current(); }
                }}
                className={INPUT + " text-[15px] font-medium py-2.5"}
              />

              {/* Suggested + selected labels inline under title */}
              {(labels.length > 0 || suggestedLabels.length > 0) && (
                <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                  {labels.map((l) => (
                    <button
                      key={l}
                      type="button"
                      onClick={() => toggleLabel(l)}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-brand-500 dark:bg-brand-600 text-white hover:bg-brand-600 dark:hover:bg-brand-700 transition-colors"
                    >
                      {l}
                      <svg className="w-2.5 h-2.5 opacity-70" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
                        <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
                      </svg>
                    </button>
                  ))}

                  {labels.length > 0 && suggestedLabels.length > 0 && (
                    <span className="w-px h-3.5 bg-slate-200 dark:bg-zinc-700 mx-0.5 flex-shrink-0" />
                  )}

                  {suggestedLabels.map((l) => (
                    <button
                      key={l}
                      type="button"
                      onClick={() => toggleLabel(l)}
                      className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400 hover:bg-brand-50 hover:text-brand-700 dark:hover:bg-brand-950/40 dark:hover:text-brand-300 border border-transparent hover:border-brand-200 dark:hover:border-brand-800 transition-colors"
                    >
                      + {l}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Description */}
            <div>
              <label className={FIELD_LABEL}>
                Description
                <span className="ml-2 font-normal normal-case tracking-normal text-slate-300 dark:text-zinc-700">
                  optional
                </span>
              </label>
              <textarea
                ref={textareaRef}
                placeholder="Add context, steps to reproduce, or requirements…"
                value={description}
                onChange={(e) => { setDescription(e.target.value); autoResizeTextarea(); }}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                    e.preventDefault();
                    submitRef.current();
                  }
                }}
                rows={3}
                className={INPUT + " resize-none leading-relaxed py-2.5 overflow-hidden"}
              />
            </div>

            {/* Acceptance Criteria */}
            <div>
              <label className={FIELD_LABEL}>
                Acceptance Criteria
                <span className="ml-2 font-normal normal-case tracking-normal text-slate-300 dark:text-zinc-700">
                  optional
                </span>
              </label>

              {criteria.length > 0 && (
                <div className="mb-2 border border-slate-200 dark:border-zinc-800 rounded-lg divide-y divide-slate-100 dark:divide-zinc-800">
                  {criteria.map((c, i) => (
                    <div key={i} className="flex items-center gap-2.5 px-3 py-2 group">
                      {/* Visual checkbox */}
                      <div className="w-3.5 h-3.5 rounded border-[1.5px] border-slate-300 dark:border-zinc-600 flex-shrink-0" />
                      {/* Text input */}
                      <input
                        ref={(el) => { criteriaRefs.current[i] = el; }}
                        type="text"
                        value={c}
                        placeholder="Add a criterion…"
                        onChange={(e) => updateCriterion(i, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") { e.preventDefault(); addCriterion(); }
                          if (e.key === "Backspace" && !criteria[i]) {
                            e.preventDefault();
                            removeCriterion(i);
                            criteriaRefs.current[i - 1]?.focus();
                          }
                        }}
                        className="flex-1 bg-transparent text-[13px] text-slate-800 dark:text-zinc-200 outline-none placeholder:text-slate-300 dark:placeholder:text-zinc-600 min-w-0"
                      />
                      {/* Remove */}
                      <button
                        type="button"
                        onClick={() => removeCriterion(i)}
                        aria-label="Remove criterion"
                        className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-0.5 rounded text-slate-400 dark:text-zinc-600 hover:text-slate-700 dark:hover:text-zinc-300 transition-opacity flex-shrink-0"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                          <path d="M18 6L6 18M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <button
                type="button"
                onClick={addCriterion}
                className="flex items-center gap-1.5 text-[12px] font-medium text-slate-400 dark:text-zinc-600 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                  <path d="M12 5v14M5 12h14" strokeLinecap="round" />
                </svg>
                Add criterion
              </button>
            </div>

            {/* Hours */}
            <div>
              <label className={FIELD_LABEL}>
                Hours
                <span className="ml-2 font-normal normal-case tracking-normal text-slate-300 dark:text-zinc-700">
                  optional
                </span>
              </label>
              <div className="relative flex items-center w-36">
                <input
                  type="number"
                  min="0"
                  step="1"
                  placeholder="8"
                  value={hours}
                  onChange={(e) => setHours(e.target.value)}
                  className={INPUT + " pr-8"}
                />
                <span className="absolute right-3 text-[12px] text-slate-400 dark:text-zinc-600 pointer-events-none select-none">
                  h
                </span>
              </div>
            </div>

            {/* Possible Duplicates */}
            {duplicates.length > 0 && (
              <div className="rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50/60 dark:bg-amber-950/15 overflow-hidden">
                <div className="flex items-center gap-1.5 px-3.5 py-2.5 border-b border-amber-100 dark:border-amber-900/40">
                  <svg className="w-3 h-3 text-amber-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                  </svg>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-amber-600 dark:text-amber-400">
                    Possible Duplicates
                  </p>
                </div>
                <div className="divide-y divide-amber-100 dark:divide-amber-900/30">
                  {duplicates.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => { onPreviewDuplicate(t); onClose(); }}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2.5 hover:bg-amber-100/60 dark:hover:bg-amber-950/30 transition-colors text-left"
                    >
                      <span className="font-mono text-[10px] font-semibold text-amber-700 dark:text-amber-500 flex-shrink-0">
                        {getTicketDisplayKey(t)}
                      </span>
                      <StatusBadge status={t.status} />
                      <span className="text-[12px] text-slate-700 dark:text-zinc-300 truncate min-w-0">
                        {t.title}
                      </span>
                      <svg className="w-3 h-3 text-amber-400 dark:text-amber-600 flex-shrink-0 ml-auto" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path d="M9 18l6-6-6-6" />
                      </svg>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* More Options (collapsible) */}
            <div>
              <button
                type="button"
                onClick={() => setMoreOpen((v) => !v)}
                className="flex items-center gap-3 w-full group focus:outline-none focus-visible:ring-1 focus-visible:ring-brand-500/40 rounded"
              >
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-300 dark:text-zinc-700 flex-shrink-0 group-hover:text-slate-400 dark:group-hover:text-zinc-500 transition-colors">
                  More Options
                </p>
                <div className="flex-1 h-px bg-slate-100 dark:bg-zinc-800" />
                <svg
                  className={
                    "w-3 h-3 text-slate-300 dark:text-zinc-700 group-hover:text-slate-400 dark:group-hover:text-zinc-500 " +
                    "transition-all duration-200 flex-shrink-0 " +
                    (moreOpen ? "rotate-0" : "-rotate-90")
                  }
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  viewBox="0 0 24 24"
                  aria-hidden
                >
                  <path d="M19 9l-7 7-7-7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>

              {/* Animated content */}
              <div
                className={
                  "grid transition-all duration-200 ease-in-out " +
                  (moreOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]")
                }
              >
                <div className="overflow-hidden">
                  <div className="pt-4 space-y-3">

                    {/* Status + Priority */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={FIELD_LABEL}>Status</label>
                        <select value={status} onChange={(e) => setStatus(e.target.value as TicketStatus)} className={INPUT}>
                          {(Object.keys(STATUS_LABEL) as TicketStatus[]).map((k) => (
                            <option key={k} value={k}>{STATUS_LABEL[k]}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className={FIELD_LABEL}>Priority</label>
                        <select value={priority} onChange={(e) => setPriority(e.target.value as TicketPriority)} className={INPUT}>
                          {(Object.keys(PRIORITY_LABEL) as TicketPriority[]).map((k) => (
                            <option key={k} value={k}>{PRIORITY_LABEL[k]}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Assignee */}
                    <div>
                      <label className={FIELD_LABEL}>Assignee</label>
                      <select value={assigneeName} onChange={(e) => setAssigneeName(e.target.value)} className={INPUT}>
                        <option value="">— Unassigned</option>
                        {TEAM_MEMBERS.map((m) => (
                          <option key={m.name} value={m.name}>{m.name}</option>
                        ))}
                      </select>
                    </div>

                    {/* Labels — searchable inline picker */}
                    <div>
                      <label className={FIELD_LABEL}>Labels</label>
                      <LabelPicker selected={labels} onToggle={toggleLabel} />
                    </div>

                    {/* Due Date */}
                    <div className="pb-1">
                      <label className={FIELD_LABEL}>
                        Due Date
                        <span className="ml-2 font-normal normal-case tracking-normal text-slate-300 dark:text-zinc-700">
                          optional
                        </span>
                      </label>
                      <input
                        type="date"
                        value={dueDate}
                        onChange={(e) => setDueDate(e.target.value)}
                        className={INPUT}
                      />
                    </div>

                  </div>
                </div>
              </div>
            </div>

          </div>

          {/* ── Footer ──────────────────────────────────────────────────────── */}
          <div className="flex items-center justify-between gap-3 px-6 py-4 mt-1 border-t border-slate-100 dark:border-zinc-800 flex-shrink-0 rounded-b-2xl bg-slate-50/40 dark:bg-zinc-900/20">
            <button
              onClick={handleClose}
              className="px-4 py-2 text-[13px] font-medium text-slate-500 dark:text-zinc-500 hover:text-slate-800 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
            >
              Cancel
            </button>

            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className={
                "inline-flex items-center gap-2 px-6 py-2.5 text-[13px] font-semibold rounded-lg transition-all " +
                (canSubmit
                  ? "bg-brand-600 hover:bg-brand-700 dark:bg-brand-500 dark:hover:bg-brand-600 text-white shadow-md shadow-brand-600/25 dark:shadow-brand-500/20 hover:shadow-lg hover:shadow-brand-600/30"
                  : "bg-slate-100 dark:bg-zinc-800 text-slate-400 dark:text-zinc-600 cursor-not-allowed")
              }
            >
              Create Ticket
              {canSubmit && (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                  <path d="M5 12h14M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
