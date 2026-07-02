"use client";

import { useState } from "react";
import { getProjectBySlug } from "@/lib/mock-projects";
import type { ProjectCategory } from "@/lib/mock-projects";
import { statusMeta, ProjectCategoryBadge } from "@/components/status-badge";
import { SettingGroup, SettingRow, TextField, NumberField, SelectField } from "@/components/settings-ui";

// Same segmented-pill styling as PeriodSelector/ViewSwitcher elsewhere in the
// app, repurposed as a two-way toggle. This is the one control on the page
// that actually drives behavior: switching category live shows/hides Client
// + Billing Rate and flips the Billable-by-default note below. The badge next
// to the page title keeps the longer "Client Project"/"Internal Project"
// wording — only this toggle's labels are shortened.
function CategoryToggle({ value, onChange }: { value: ProjectCategory; onChange: (category: ProjectCategory) => void }) {
  const options: { key: ProjectCategory; label: string }[] = [
    { key: "client", label: "Client" },
    { key: "internal", label: "Internal" },
  ];
  return (
    <div className="inline-flex items-center gap-0.5 rounded-lg border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800/60 p-1">
      {options.map((option) => {
        const active = option.key === value;
        return (
          <button
            key={option.key}
            type="button"
            onClick={() => onChange(option.key)}
            className={[
              "text-xs font-medium px-2.5 py-1 rounded-md transition-colors duration-150 whitespace-nowrap",
              active
                ? "bg-white dark:bg-zinc-900 text-slate-900 dark:text-zinc-50 shadow-sm"
                : "text-slate-500 dark:text-zinc-400 hover:text-slate-700 dark:hover:text-zinc-200",
            ].join(" ")}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function ProjectSettingsScreen({ slug }: { slug: string }) {
  const project = getProjectBySlug(slug);
  const [category, setCategory] = useState<ProjectCategory>(project?.category ?? "internal");

  if (!project) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-8 py-10">
        <p className="text-sm text-slate-400 dark:text-zinc-600">Project not found.</p>
      </div>
    );
  }

  const isClient = category === "client";

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-8 py-10 pb-16">
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-xl font-bold text-slate-900 tracking-tight dark:text-zinc-50">Project Settings</h1>
        <ProjectCategoryBadge category={category} />
      </div>
      <p className="text-sm text-slate-500 mt-1 max-w-xl dark:text-zinc-400">
        Manage project details, billing behavior and project-level configuration.
      </p>

      <div className="mt-8">
        <SettingGroup title="General">
          <SettingRow label="Project Name">
            <TextField value={project.name} width="w-64" />
          </SettingRow>
          <SettingRow label="Description" hint="Shown on the project overview">
            <TextField value={project.description} width="w-64" />
          </SettingRow>
          <SettingRow label="Project Code" hint="Prefix for this project's ticket IDs (e.g. MBA-123). Must be unique across the workspace.">
            <TextField value={project.projectCode} width="w-24" />
          </SettingRow>
          <SettingRow label="Status">
            <SelectField value={statusMeta[project.status].label} />
          </SettingRow>
          <SettingRow label="Project Lead">
            <div className="flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={project.owner.avatar} alt={project.owner.name} className="w-6 h-6 rounded-full flex-shrink-0" />
              <SelectField value={project.owner.name} />
            </div>
          </SettingRow>
        </SettingGroup>

        <SettingGroup title="Billing">
          <SettingRow label="Project Category" hint="Determines whether time logged on this project is billable">
            <CategoryToggle value={category} onChange={setCategory} />
          </SettingRow>
          <SettingRow
            label="Client"
            hint={isClient ? "Required for client projects" : "Not applicable — this project is internal"}
          >
            <SelectField value={isClient ? project.client ?? "Select a client" : "—"} disabled={!isClient} />
          </SettingRow>
          <SettingRow
            label="Billing Rate"
            hint={isClient ? "Used to estimate billing in Time Tracking" : "Not applicable — this project is internal"}
          >
            <NumberField value={isClient ? project.defaultHourlyRate ?? 0 : 0} suffix="$ / hour" disabled={!isClient} />
          </SettingRow>

          <div className="py-3.5">
            <p
              className={`text-[12px] font-semibold ${
                isClient ? "text-emerald-600 dark:text-emerald-400" : "text-slate-500 dark:text-zinc-400"
              }`}
            >
              {isClient
                ? "Time entries on this project are Billable by default."
                : "Time entries on this project are Non-Billable by default."}
            </p>
            <p className="text-[11px] text-slate-400 dark:text-zinc-600 mt-1 max-w-md">
              Billable status is always inherited from the project — nobody chooses it per time entry.
            </p>
          </div>
        </SettingGroup>

        <SettingGroup title="Danger Zone">
          <div className="py-4">
            <div className="flex items-start justify-between gap-6">
              <div>
                <p className="text-[13px] font-semibold text-slate-800 dark:text-zinc-200">Archive Project</p>
                <p className="text-[12px] text-slate-400 dark:text-zinc-500 mt-0.5 max-w-sm">
                  Hides {project.name} from the active Projects list. Tickets, notes, and reports remain intact, and
                  the project can be restored later.
                </p>
              </div>
              <button className="flex-shrink-0 text-[13px] font-medium text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-600/40 bg-amber-50 dark:bg-amber-500/5 px-3 py-1.5 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-500/10 transition-colors">
                Archive Project
              </button>
            </div>
          </div>
        </SettingGroup>
      </div>
    </div>
  );
}
