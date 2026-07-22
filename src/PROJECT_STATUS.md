> Last Updated: July 22, 2026

---

# Project Status

## Overall Progress

JIRITA is currently in the UI/UX MVP phase.

The application now includes the full shell, a role-based UX layer (Admin / Project Lead / Member), projects listing, role-specific project overviews, a five-view Tickets experience with Task/Bug ticket types and real search/filters, an editable Quick Ticket Preview, Full Ticket Detail with Time Tracking, real Related Tickets, and a real Attachments flow (upload/rename/delete/download/Preview), role-specific Dashboards, role-specific Projects/Reports/Time Tracking screens, a personal My Work workspace, an editable Notes experience, a Settings section, a per-project Settings screen, a per-project Team screen with a dedicated Work History page, a dedicated Admin-only Users management module, a real Supabase Auth flow (Login/Logout/Forgot/Reset/Change Password) with a Profile page that saves real data, and a single shared Member Profile Modal (now with real per-project ticket metrics, real Activity/Security tabs in user mode, and real project-membership actions in project mode) used everywhere a person is referenced. Auth/Profile, Projects (Sidebar, the `/projects` list, and per-project Settings — whose General section no longer has its own "Project Lead" field, since Team's `project_memberships.project_role` is the only real place a project's lead is set), Tickets (all five list views with real filtering, New Ticket creation, the full Ticket Detail page, Related Tickets, and the editable Quick Ticket Preview), Project → Team (roster, project-scoped Lead/Member role, Make Project Lead, auto-membership on contribution, Add/Remove Member, paginated Work History), Project Notes (list, search, create, edit, Duplicate, delete), the Dashboard for the Admin, Project Lead, and Member roles (Admin's now also with a real "View all activity →" action and a new, dedicated org-wide Activity History page), company-wide Reports for the Admin role (`/reports` — both the Delivery and Finance tabs, with real filters, Health Alerts, and Export), the **Admin** role's Project Overview (`/projects/[slug]` — real header/Health Alerts/KPIs/Active Work/Team/Project Health, plus a new dedicated, paginated Project Activity history page), per-project Reports (`/projects/[slug]/reports`, every role), and Time Tracking for the Admin and Member roles (`/time-tracking` — real KPIs, filters, Timesheets, Missing Hours, Weekly Utilization, and Billing by Client) are confirmed backed by a live Supabase project end-to-end. Users (list, Invite by email/link, Disable/Enable, Edit, Reset Password link, Activity/Security tabs) is also fully wired to the same Supabase schema, but not yet confirmed against a live project or in a browser — see Architecture Status; the same "implemented and type/build-clean, not yet clicked through live" status now also applies to the Admin Project Overview, per-project Reports, Time Tracking (Admin/Member), and the Dashboard's new org-wide Activity History page just described. Since then, the same not-yet-confirmed status was reached by the Project Lead's and Member's own Project Overview (both now real, no longer mock — see Current Sprint → Completed → Project Overview), a project scope selector on all three Dashboards, My Work (Member role, fully real), ticket-assignment restriction to a project's own active members, the Member's own `/projects` ("My Projects," fully real, plus a real avatar-`src` bug fix), and JIRITA's global Search (real data layer, results popover, navigation, and keyboard shortcuts). Every other screen (the rest of Settings) is still navigable and connected using mock data — see Architecture Status.

The current objective is to complete the remaining frontend experience while continuing backend integration. Auth, profile/organization-membership data, avatar upload, and change password are confirmed working end-to-end against a live Supabase project. Projects has followed the same path: Sidebar, the `/projects` list, and `/projects/[slug]/settings` now read and write real project rows (create, edit, archive/restore, and per-project Settings' General/Billing fields, including a minimal real Clients roster). Tickets has now followed the same path too and gone further: the five list views (with real search, Assigned/Priority/Status filters, quick-filter chips, and the "Add Filter" menu — Labels/Due Date/Reporter/Created Date/Updated Date — all combining with AND), New Ticket creation, the full Ticket Detail page (inline edits, Labels, Acceptance Criteria, Attachments including rename/delete/download/Preview, Time Tracking, Comments, Related Tickets, and a real trigger-driven Activity Log), and the Quick Ticket Preview panel (now editable when opened from the Tickets board) all read and write real ticket rows. Ticket priority is a 4-value scale (Highest/High/Medium/Low) — the old "Normal" value was fully migrated and removed from the database, not just hidden in the UI. Every Ticket write path now surfaces failures to the user (a shared error toast) instead of only logging to the console, and rolls back optimistic edits that didn't actually save. Users and Project → Team followed the same real-data path — Users' list, Invite (email or generated link), Disable/Enable, Edit, a generated Reset Password link, and the Member Profile Modal's Activity/Security tabs all read/write real Supabase data via Server Actions (`organization_memberships` has no direct `authenticated` grant, so every privileged write goes through a service-role Server Action that re-verifies the caller server-side); Team's roster, project-scoped Lead/Member role (`project_memberships.project_role`, with a Make Project Lead action), auto-membership-on-contribution, Add/Remove Member (with a database-level history guard), and a server-side-paginated Work History page do the same — Team has since been clicked through against a live project and is confirmed; Users has not and is still "should work, not yet verified." Project Notes (list, search, create, edit, Duplicate, delete), the Admin, Project Lead, and Member Dashboards (every KPI, list, and quick action), and company-wide Reports for the Admin role (both the Delivery and Finance tabs — KPIs, Health Alerts, Project Health, Hours by Person, Workload, Hours Distribution, Recent Changes, filters, and Export) have also since been built and confirmed live, reusing the same query/RLS/Server-Action patterns established above rather than inventing new ones. The **Admin** Project Overview and per-project Reports (all roles) have since followed the same path too, both explicitly reusing Delivery Reports' own real health/KPI calculations rather than a second one, and Project Overview gained a new, fully paginated Project Activity history page. Tickets also gained a real, URL-persisted status/alert filter (`?alerts=...`), shared by both the Project Overview Health Alert banner and Project Reports' Delivery Progress cards, and survives a refresh or browser back/forward since it's real query-state, not the older sessionStorage handoff. Time Tracking for the Admin and Member roles has since followed the same path too: real KPIs, real Member/Project/Client/Billing/Date-Range filters (URL-persisted, same `?alerts=`-style precedent as Tickets), and a real Timesheets table, explicitly reusing Reports → Finance's own billing-calculation functions (exported for this reuse) rather than a second implementation, with capacity-based metrics (Hours Missing — relabeled "Members Missing Hours" since it counts members, not hours, then relabeled again to simply "Missing Hours" — Weekly Utilization, Capacity %, Status) kept structurally independent of the Billing filter so they always reflect total logged hours. The Dashboard's Recent Activity widget gained a real "View all activity →" action (same cap-plus-probe pattern Project Overview's own Project Activity widget already used) pointing at a new, dedicated, real, server-side-paginated org-wide Activity History page — the org-wide sibling of the existing per-project one, reusing its exact query/pagination shape. Project Settings' General section had its "Project Lead" picker removed outright — it was the only writer of the older `projects.owner_profile_id`, unrelated to Team's own real `project_memberships.project_role`, which remains the sole source of truth for a project's lead. The rest of Settings is still mock data — see Architecture Status.

Since that pass, all three Dashboards (Admin/Project Lead/Member) gained a real `?project=<slug>`-driven project scope selector (Admin's defaults to "All Projects" org-wide; the Project Lead's and Member's only render when that role is actually scoped to more than one project, auto-scoping silently otherwise), the Project Lead's and Member's own Project Overview are now real end-to-end — reusing the exact data loading, KPI/health formulas, and building-block components the **Admin** Project Overview already established rather than a second implementation — My Work (Member role) lost every remaining mock array, ticket Assignee selection is now restricted (both in the UI and, independently, at the write layer) to a project's own real active members, the Member's own `/projects` ("My Projects") screen is fully real (and a real `<img src="">` bug — an empty avatar `src` whenever a project had no lead — was fixed along the way), and JIRITA's global Search (the Sidebar's Search field) gained a real, permission-scoped Supabase data layer, a results popover, click-to-navigate, and full keyboard navigation including a global `⌘K`/`Ctrl+K` shortcut. All of this is implemented and type/build-clean (`tsc`/`eslint`/`next build` all pass), not yet clicked through in a live browser — same "should work, not yet verified" status as Users/the Admin Project Overview/per-project Reports/Time Tracking (Admin/Member) below. See Current Sprint → Completed for each feature's own detail.

After that, the Admin Dashboard's own KPI cards (Assigned Tickets, Hours Burn, Blocked, Due Today), its Organization Health insight band, and its Projects at Risk rows all became real, independent click targets — each navigating to a destination showing exactly the same real ticket/hour set the card itself already displays, reusing the existing `?alerts=` ticket-filter query-state and Time Tracking's own Custom Range params rather than a second filtering mechanism. This required one genuinely new surface: a real, org-wide "all projects" Tickets view at `/tickets` (reusing the same `TicketsScreen` component every per-project Tickets page already renders, just with its `slug` prop made optional), since the existing Tickets page can only ever show one project — it also gained its own Project filter, and the global `?alerts=` mechanism gained two new pseudo-types (`due-today`, `completed-this-month`). The Projects list similarly gained a real `?blocked=<slug,...>` filter for the "projects currently blocked" insight. Alongside this, a real, pre-existing bug in the shared Member Profile Modal was found and fixed for two entry points (Team Workload and Recent Activity, both Admin Dashboard): it had never resolved real data for anyone without a mock-roster name match, showing zeroed Assigned Hours/Utilization/Active Tickets and building `unknown-*` Work History URLs. The modal now fetches its own real data from a real `profileId` + optional project scope — but this fix is intentionally scoped to those two entry points, not the rest of the app's `MemberTrigger` callers (Project Overview, Reports, ticket assignees/comments/attachments, Time Tracking, My Work); see Architecture Status → Member Profile Modal and Technical Debt for the exact boundary and what's left. All of the above is implemented and type/build-clean, not yet clicked through in a live browser — same "should work, not yet verified" status as everything else in this list.

After that, the Project Lead's own scoped Time Tracking view (`project-lead-time-tracking-screen.tsx`) became real — the last remaining fully-mock Time Tracking surface — scoped strictly to the projects this profile leads and reusing the Admin/Member screen's own real calculations/loaders (exported for this reuse) rather than a second implementation; see Current Sprint → Completed → Hours & Time Tracking → Project Lead. Separately, the Project Lead Dashboard's Current Delivery card (Completed Tickets, Remaining Work (renamed from "Remaining Hours"), Blocked Tickets) and its Attention Required cards (Blocked Tickets, Due Today, Over Capacity, Awaiting Review) all became real, independent click targets, following the same "0 → not clickable, 1 → open the Ticket Preview panel / Member Profile Modal directly, more than 1 → navigate to a filtered Tickets/Team view" pattern established by the Admin Dashboard's own KPI cards above — each reusing its own already-real source of truth, never a second query. A real, pre-existing bug was also found and fixed along the way: the Current Delivery card's "Target Date" had never actually read the real `projects.target_date` column (already being fetched, silently discarded) — it showed the nearest due date among the project's own open tickets instead, a different real field with a superficially similar value. `projects.target_date` is now also directly editable, via a new optional Target Date field on Project Settings' General section. All of the above is implemented and type/build-clean, not yet clicked through in a live browser — same "should work, not yet verified" status as everything else in this list.

Most recently, the Member Dashboard's own Assigned Tickets and Due Today hero stats became real, independent click targets too, following the exact same "0 → not clickable, 1 → open the Ticket Preview panel directly, more than 1 → navigate to a filtered Tickets view" pattern already established above — reusing `activeWork`/the existing due-today filter, plus a real `?assignee=me` URL-driven initializer newly added to Tickets' own pre-existing "Assigned" filter (`tickets-screen.tsx`, previously FilterBar-only). Two real, pre-existing bugs in the shared Member Profile Modal were found and fixed along the way: `TicketListRow`'s assignee avatar (rendered by Member Dashboard's own "My Active Work" list, among others) never passed a real `profileId`, so a member's own active-work tickets resolved through the mock-name-matching fallback and showed 0 Active Tickets/Assigned Hours/Utilization instead of their real numbers — now fixed with the same real `profileId`-keyed fetch every other confirmed-real trigger already uses; separately, clicking "Expand" on a ticket opened *from inside* the Member Profile Modal navigated to the real Ticket Detail page but left both that inner ticket preview and the Member Profile Modal itself open on top of it (the modal's provider is mounted above the router and survives client-side navigation) — now closes both via its own already-existing local close callbacks. All three dashboards' loading states also gained a structural skeleton (a new shared `SkeletonBlock` primitive in `dashboard-shared.tsx`) in place of the old plain "Loading dashboard…" text, and a real bug found along the way — the Admin Dashboard's own data-loading effect never visibly reset to "loading" on a background refetch (e.g. after returning to a backgrounded browser tab, via `current-user-provider.tsx`'s existing focus-regain revalidation), unlike Project Lead's and Member's own effects — was fixed by applying that same existing reset there too. All of the above is implemented and type/build-clean, not yet clicked through in a live browser — same "should work, not yet verified" status as everything else in this list.

Separately, the `/projects` list (Admin/Project Lead) had its own real Project Lead column/filter wired up — `ProjectSummary.lead` is now sourced from `project_memberships.project_role = 'lead'` (the same authoritative signal Team/the Dashboards already key off), not the older `owner_profile_id`-backed `ProjectSummary.owner` — reconciling a gap this file had been carrying since Project Settings' own "Project Lead" picker was removed. Most recently, a four-part pass unified the rest of that same list's remaining stale metrics onto real per-ticket data, then added a real tab-regain refresh for them: (1) the Health badge/filter and the "At Risk" KPI now read `buildProjectHealthRows`'s (`reports-screen.tsx`) real `risk`, never the stale, never-updated `projects.health` column, and the Admin Dashboard's own "Projects at Risk"/blocked-projects insight now reuses that exact same function instead of a second, duplicated blocked/overdue classification; (2) each row's progress bar/percentage reuses a new `computeProjectProgressPct` (also exported from `reports-screen.tsx`) — the same real done/total ticket-count formula Project Overview's own progress bar already used — instead of the always-`0` persisted `progress` field; (3) each row's Open/Blocked/Overdue counters read straight off that same `buildProjectHealthRows` result (extended with new `open`/`overdueOpen` fields alongside the pre-existing `blocked`) instead of the always-`0` persisted `openTickets`/`blockedTickets`/`overdueTickets` fields; (4) the list now refreshes all of the above on returning to a backgrounded browser tab, reusing the exact same mechanism the three Dashboards already rely on (`current-user-provider.tsx`'s existing window-focus-regain revalidation hands back a new `organization` reference, which this screen's own ticket-metrics effect already depended on — no new listener/polling added), and shows the same kind of `SkeletonBlock`-built structural skeleton the Dashboards already use (replacing the old plain "Loading projects…" text) both on first load and on every tab return. All of this is implemented and type/build-clean, not yet clicked through in a live browser — same "should work, not yet verified" status as everything else in this list.

Most recently, that same Projects list's Project Lead KPI band (Blocked Tickets, Due This Week, Over Capacity) and each row's team-size chip were reconciled onto real data too (`buildProjectHealthRows`, a real Monday–Sunday ticket filter, and `loadProjectTeam` deduped by `profileId` across projects), replacing always-`0` persisted fields or `mock-team.ts`; My Work's own Assigned Tickets KPI became an independent click target following the same 0/1/2+ rule as every other real KPI card. After that, the Project Lead's own scoped Reports view (`project-lead-reports-screen.tsx`) — the last remaining fully-mock Reports surface — was rebuilt end-to-end onto real Supabase data: both its Delivery tab and its Team tab (converted in full, by explicit choice, rather than patched around) now read real tickets/team/activity data scoped to this profile's own led projects, reusing the Admin Reports' own `buildProjectHealthRows`/`computeProjectProgressPct` rather than a second calculation, and its top KPI band (My Projects, Team Capacity, Blocked Tickets, Due This Week) gained the same real, independent-click-target treatment as every other dashboard/reports KPI in this list — the Due This Week KPI's own navigation required one small, additive extension to Tickets' `?alerts=` filter mechanism (`due-this-week`). Along the way, My Work and the Admin's company-wide Reports/Time Tracking screens gained a full structural skeleton loader plus a real refresh on returning to a backgrounded browser tab (same precedent as the Dashboards), the remaining Member Profile Modal triggers on company-wide Reports and Time Tracking were fixed to pass a real `profileId`/`projectSlug`, a hydration bug in Reports' Hours Distribution was fixed, and Time Tracking's "Members Missing Hours" KPI was relabeled "Missing Hours". All of the above is implemented and type/build-clean, not yet clicked through in a live browser — same "should work, not yet verified" status as everything else in this list.

After that, the Project Lead Reports Delivery tab's alerts bar and its Project Health table rows/Upcoming Deadlines list were wired to their existing real navigation targets (Member Profile Modal, Ticket Preview, Project Overview, filtered Team/Tickets/Projects — the Projects list's own Health filter/badge now also seeds from a real `?health=` param so a multi-project Health click lands with it applied), and its plain-text loading state became a real skeleton matching the Dashboards/Projects/My Work. Alongside this, four real, pre-existing bugs were found and fixed in Project Lead Time Tracking: two Member Profile Modal triggers were missing a real `profileId`; the "Logged Hours" KPI was only totaling Finance's billable-only hours instead of every real `entriesForSelectedPeriod`; a member's weekly capacity was being *summed* across each of their own led projects instead of resolved to one canonical value (`mergeLedTeams`, `Math.max` across a member's per-project rows — the same convention `loadMemberWeeklyCapacity` already used); and "Capacity Risk"/the Timesheets Capacity column were realigned onto the same shared assigned-hours/capacity definition Team/Reports/Dashboards/Projects/the Member Profile Modal all already share. The page header's fixed date was also replaced with the real current date, and it gained the same real loading skeleton on initial load/autorefresh as the rest of Time Tracking.

Most recently, Project Lead Time Tracking's Timesheets "View →" action — previously dead (no `onClick` at all) — was wired up in stages: first to the shared Member Profile Modal with a real `profileId`, then re-pointed to Work History to match the Admin Time Tracking screen's own "Review →" convention, resolving to a single real project (the active Project filter when it selects exactly one, else the row's own single led project, else this Lead's own single led project overall) or, when a row genuinely spans more than one led project with nothing narrowing it further, to a brand-new **global** Work History page (`/time-tracking/team/[userId]/work-history`) rather than being disabled or guessing — see Confirmed working → Project → Team below for that page's own detail. The Client filter in the same screen gained a synthetic **No Client** option (frontend-only — never written to Supabase, never a fabricated client) for internal projects, determined by each project's own real `client` field being null/absent, never by `category` or project name, and only offered when at least one such project exists in the Lead's own scope. Separately, a real, pre-existing bug in the shared `CapacityBar` component (`member-profile-modal.tsx`, used by the Member Profile Modal's own "Current Workload" bar, Team's member cards, and per-project Reports' Team Workload) was found and fixed: its fill color was computed from the *width-clamped* percentage, so the `pct > 100` "over capacity" branch could never be reached and the bar stayed amber no matter how over-allocated someone was — it now colors off the real, unclamped percentage. The Admin Dashboard's own independent "Team Workload" card (`dashboard-screen.tsx`'s `WorkloadRow`, a separate, non-shared implementation) had the same symptom for a different reason — it never had a red state at all — and was fixed the same way. New Ticket's automatic keyword-based label-suggestion chips under the Title field (`LABEL_HINTS`/`getSuggestedLabels`, and the inline "+ Label" chip row) were removed outright at the user's request — Labels are now exclusively added via More Options → Labels → Add label, the same picker every other flow already used. All of the above is implemented and type/build-clean, not yet clicked through in a live browser — same "should work, not yet verified" status as everything else in this list.

Also most recently, that same new global Work History page was given a real, full filter/KPI system — Search (ticket code/title, case-insensitive), Project (single-select, real led-project slugs only, only ones this member has real history in), Period (Today/This Week [Monday–Sunday]/This Month/Custom Range, reusing Time Tracking's own `PeriodSelector`/date-range helpers verbatim), Status (the shared `STATUS_LABEL` source of truth), and Activity (Time Logged/Comments/Status Changes/Assignments/Attachments, mapped to real `ticket_activity.event_type` values audited against `buildActivityLabel`'s own full list — every one of the five had a real backing event type, none were invented) — plus a 4th "Activities" KPI alongside Tickets Worked On/Hours Logged/Last Activity, a skeleton on filter/page changes only (never on the silent focus-regain refresh), a contextual empty state, and a reset to page 1 on any filter change. The same filter/KPI system was then reused, not duplicated, for the **existing** per-project Work History page (`/projects/[slug]/team/[userId]/work-history`) when opened by an **Admin**: the page now detects the viewer's real role and, for an Admin only, renders the identical filter/KPI UI scoped to every real project in the organization (`useOrganizationProjects()`, already loaded, no new query) instead of just this Lead's own led projects, with Project pre-selected to the real `[slug]` the Admin entered from and switchable to "All Projects" or any other org project the member has real history in, without ever changing the URL. A Project Lead or Member opening this same route still sees the exact original, unfiltered single-project view, byte-for-byte unchanged. No new RPC or migration was needed for any of this — the new `loadTeamMemberWorkHistorySummaryAcrossProjects`/`loadTeamMemberWorkHistoryPageAcrossProjects`/`loadTeamMemberWorkHistoryProjectOptions` (`lib/tickets.ts`) all reuse the existing per-project `project_member_work_history_summary`/`_page` RPCs (called once per real project in scope, merged/sorted/paginated client-side), falling back to direct `ticket_time_entries`/`ticket_activity` queries — always scoped to the already-resolved real ticket-id participation set plus the real `profileId` — only when a Period or Activity filter narrows past those RPCs' own all-time aggregates. All of the above is implemented and type/build-clean, not yet clicked through in a live browser — same "should work, not yet verified" status as everything else in this list.

Separately, a read-only audit of Admin's Users → View Profile flow (all five tabs: Profile, Projects, Permissions, Security, Activity) found one real bug, since **resolved**: the Projects tab's per-project "N active tickets"/"Nh assigned" figures (the project-membership list itself was already real and correct) were computed from `lib/mock-tickets.ts`'s static dataset, matched by `assignee.name` string equality, never the real `assigneeProfileId`/`loadProjectTickets` this same modal's own non-user-mode view and Team's member cards already use two hundred lines above in the same file — so real users on real projects always showed 0 active tickets/0h assigned regardless of their actual workload, and "Project Lead" never displayed correctly for a real lead in that tab either (`getProjectBySlug` hit the same mock-only `mock-projects.ts`). Profile, Permissions, Security, and Activity were all already real (Permissions' role-description copy is intentionally static, matching its own "role-based, can't be customized per person" footer text; Security's `browser`/`os`/`device` are honestly omitted, never fabricated, when absent).

The fix: the Projects tab now resolves project name/slug/id/Lead from `useOrganizationProjects()` (the same already-loaded, real `project_memberships.project_role = 'lead'`-backed list Work History/Reports already reuse — no new query, never `mock-projects.ts`), and Active Tickets/Assigned Hours from one real `loadOrganizationTickets` call (covering every one of this user's real project memberships at once, never one query per project) filtered by `assigneeProfileId === user.id && status !== "done"` — the exact same "active" definition and hours sum Team's own member cards and this modal's own non-user-mode fetch already use, reused rather than re-derived. The `mock-tickets`/`mock-projects` imports this tab used were removed outright (`getTicketById`/`getTicketDisplayKey` from `mock-tickets.ts` stay, still used by the unrelated non-user-mode ticket-preview path). A real loading skeleton (row count matching the user's own real project count, never a guessed number) and a real error state (same red-alert-box pattern `ActivityTabContent` already used) replace what was previously an instant, always-`0` render — the tab can never show `0 active tickets`/`0h assigned` while the real data is still in flight.

Most recently, Admin → Users gained real auto-refresh and skeleton loading throughout. A new shared `useRefreshOnFocusAndVisibility` hook (`member-profile-modal.tsx`, exported for `users-screen.tsx` to reuse rather than a second implementation) listens for both window `focus` regain and `document.visibilitychange` → `"visible"` — the shared `current-user-provider.tsx` focus listener several other real screens already piggyback on (via its own `organization` reference changing) only covers the former — registering each listener exactly once per mount and collapsing the two firing together (common when revisiting a browser tab) into a single real call via a 300ms guard. The Users list, and this modal's own Projects and Activity tabs (Profile/Permissions/Security need no refresh logic of their own — they render straight from the already-loaded `user` prop, no query), all now use it. Every one of those three real fetches also gained a `hasLoadedRef`-style guard: the loading skeleton and the error state only ever appear on that surface's true first load — a background refresh (focus/visibility regain, or the existing `organization`-driven re-run) that fails now leaves the last real, valid data on screen instead of blanking it to zeros or an error box, and only the newest of several in-flight requests is ever applied (a `requestId` guard, same convention `users-screen.tsx`'s own fetch already used). Closing the loop: if View Profile is open when the Users list refreshes, it now stays open on the same real user (re-resolved by the same real `profileId`, never by name/email/avatar/array position) and the same active tab, instead of being left showing a stale snapshot. The Users list itself also gained a real structural skeleton (`SkeletonBlock`-built, mirroring its own header/search+filters/table exactly) in place of the old plain "Loading users…" text, shown only on that same true-first-load — same precedent the Dashboards/Projects list/Work History already established. No Supabase changes, no new queries — this is entirely a real-data presentation/refresh-timing pass on top of already-correct loaders. All of the above is implemented and type/build-clean, not yet clicked through in a live browser — same "should work, not yet verified" status as everything else in this list.

After that, Admin → Reports → Delivery's old "Recent Changes" block (a flat, deduped ticket-activity feed) was replaced outright by a new **Tickets by Member** block, built up over several passes: real tickets grouped by real `assigneeProfileId` (never name/avatar), excluding Done, sorted Blocked → Overdue → Priority → due date → ticket code within each group, each ticket row opening the real Ticket Preview and each group header opening the real Member Profile Modal; each ticket then gained its own real logged-hours figure (from real `ticket_time_entries`, never the `ticket.hours` estimate); the per-member cap and its "View all N →" link were then removed in favor of the full real list plus a per-group **Total Logged** summary line; and finally its inclusion rule was corrected to a real union — `(currently assigned to this member AND not Done) OR (this member logged real hours on this ticket within the active period)` — so a ticket a member has since been reassigned off of, or that's since moved to Done, still correctly shows in their group if they logged real time on it, with the Member filter re-scoped to apply *after* grouping (filtering which groups are visible, never which tickets a group's history can include) since the same ticket can now legitimately appear in more than one member's group. A follow-up **read-only audit**, run at the user's explicit request to check Workload against this new block for a coherent shared definition, found and confirmed one real, pre-existing bug: `buildWorkloadRows`' `assignedHours` computed `Σ max(ticket.hours − hours logged this period, 0)` — "remaining hours" — silently diverging from the "official" `Σ ticket.hours` assigned-hours definition every other real consumer (Team, the Dashboards, the Member Profile Modal, Project Lead Time Tracking) already shares and documents in their own code comments. The fix, applied as its own minimal, scoped change: `assignedHours` is now the same plain `Σ ticket.hours` over currently-assigned, non-Done tickets as everywhere else, never netted against logged time — Workload and Tickets by Member's own Total Logged now measure two legitimately different, clearly-separate things (current assigned load vs. real historical hours worked) instead of silently disagreeing about the same one.

After that, Delivery gained its own **Period selector** (This Month/Last Month/This Quarter/Custom Range), reusing Finance's exact `PeriodSelector` component, styling, and date-range helpers, but with fully independent state (`deliveryPeriod`/`deliveryCustomRange`, default This Month) that never overwrites or is overwritten by Finance's own Billing Period — each tab keeps its own selection for the session, and both combine correctly with Delivery's existing 7 filters. The shared data-fetch effect now also loads a Delivery-scoped logged-time range and a real completed-in-range ticket count (`loadTicketsCompletedInRange`, the same real `ticket_activity` status→done signal per-project Reports' Delivery Snapshot already uses — never `updated_at`) in parallel alongside Finance's own existing queries — no N+1, no per-ticket/per-member queries. **Responds to Delivery's period**: Hours Burn's logged-hours half, Hours by Person's Completed (and Remaining/Capacity, which already derived from Completed), Project Health's Completion column, Tickets by Member in full (hours per ticket, Total Logged, and historical inclusion), and the "Done …" KPI — now correctly relabeling itself ("Done This Month"/"Done Last Month"/"Done This Quarter"/"Done in Range") as the period changes, via a new optional 5th parameter on `buildDeliveryKpiSummary` that leaves its two existing external callers (Admin/Project Lead Project Overview, both still on the 4-arg call) byte-for-byte unchanged. **Explicitly does not respond to it** (current-state metrics): Projects, Active Tickets, Blocked, Overdue, and — reconfirming the Workload fix above — Workload, whose own `timeEntries` parameter is received but deliberately left unused by its `assignedHours` calculation. All of the above is implemented and type/build-clean, not yet clicked through in a live browser — same "should work, not yet verified" status as everything else in this list.

Most recently, Settings gained, then immediately lost, a **Time Tracking** section: a first pass made Show Estimated Hours on Tickets, Require Estimation on New Tickets, Hour Rounding, and Round Up by Default into real, Admin-configurable `organizations` columns wired into New Ticket/Ticket Detail/Ticket Preview/`logTicketTime`; a follow-up product decision then retired that section outright in favor of the same four rules as **fixed, non-configurable JIRITA behavior** instead — Estimated Hours is now always visible, estimation stays optional at ticket creation, every logged time entry rounds up to a fixed 15-minute increment (`lib/time-rounding.ts`'s `roundLoggedMinutesUp`, the one shared helper `logTicketTime` — the single real time-entry write path — applies before persisting), and a genuinely new rule was added along the way: a ticket now needs a real estimate (`hours > 0`) before it can move to In Progress, In Review, or Done, enforced once, backend-side, in `updateTicket` (the single real gateway every status change already goes through, so Ticket Detail/Ticket Preview/Board can't diverge or be bypassed) and surfaced through the same existing error-toast/rollback pattern every other inline edit already used — no new UI code. `/settings/time-tracking` no longer exists (falls through to the standard "Section not found." branch, same as `/settings/projects`); the four `organizations` columns backing the old setting were deliberately left in place, unread, for compatibility. See Architecture Status → Removed (Settings → Time Tracking) for the full before/after and exactly where each fixed rule is enforced.

Most recently, JIRITA gained a single, real, global **in-app Notifications system** — the header bell (every authenticated page, with a real unread-count badge), its 5-most-recent dropdown preview, and a full paginated `/notifications` page — backed by a new `notifications` table and one new data layer, `lib/notifications.ts`, with creation routed through a service-role Server Action (`create-notification-action.ts`) rather than a direct client insert. No email, push, desktop notifications, cron, queues, watchers, configurable preferences, or Supabase Realtime — a plain table refreshed on demand (load, focus/tab-visibility regain, after marking read). Four real events notify, each wired into the one real write path that operation already had, after it succeeds: ticket assignment and status changes (`updateTicket`), a comment on a ticket assigned to someone else (`createTicketComment`), and being added to a project (`addProjectMember`) — never a self-notification, never a fabricated mention (this schema has no structured `@mention` storage, so that event type is deliberately left uncreated rather than guessed by name). Settings → Notifications (the old mock Email/Desktop/Weekly-Digest toggles section) was retired outright in the same pass — there are no configurable notification preferences in this app at all — following the exact same "falls through to the standard 'Section not found.' branch" precedent Settings → Time Tracking/Projects already established. See Architecture Status → Removed (Settings → Notifications) for the full detail, including the RLS/authorization model.

Most recently, Settings → Integrations (the mock GitHub/Slack/Google Calendar/Jira Import section) was retired outright, and repository linking was rebuilt as a **per-project** concern instead: `/projects/[slug]/settings` gained a new **Repository Integration** section (Repository Provider — None/GitHub/GitLab — and a Repository URL, format-validated only, never connected to/synced/OAuth'd) backed by two new `projects` columns (`repository_provider`, a real Postgres enum matching the `status`/`priority`/`health`/`category` convention, and `repository_url`). No OAuth, sync, commit reads, or webhooks exist — this is intentionally just the persisted configuration, ahead of a real GitHub/GitLab integration. See Architecture Status → Removed (Settings → Integrations) for the full detail.

Most recently, that Repository Integration data model was corrected: `repository_provider` is now real-`null` (not a separate `'none'` string) when a project has no repository configured, enforced by two new `CHECK` constraints (provider can only be `null`/`github`/`gitlab`; `repository_url` must be null exactly when provider is null, never one without the other) added by a new, additive migration — nothing was reset or dropped. The GitHub/GitLab URL format validation and the trailing-slash normalization applied before saving both moved into shared, pure, exported functions in `lib/projects.ts` (`validateRepositoryUrl`/`normalizeRepositoryUrl`), so the UI's pre-Save check and `updateProjectSettings`'s own backend-side check can never drift into two different rules. See Architecture Status → Removed (Settings → Integrations) → "Data model corrected, one pass later" for the full detail.

Most recently, Repository Integration gained a **real GitHub OAuth connection** — Project Settings' "Connect GitHub" now runs an actual OAuth 2.0 + PKCE flow (`GET /api/integrations/github/connect` → github.com → `GET /api/integrations/github/callback`), verifies the authorized account can really read the exact configured repository (`GET /repos/{owner}/{repo}`, requiring `permissions.pull === true` when GitHub returns that field), and stores the resulting access token AES-256-GCM-encrypted in a new table, `project_repository_connections` (never in `projects` itself, and never in plain text — see `lib/server/github-token-crypto.ts`). `repository_provider`/`repository_url` still mean exactly what they meant before this pass (the plain configured link); this new table means "a verified, currently-working authorization for that link," and the UI now clearly separates the two: **Repository configured** (URL saved, GitHub not yet connected, or a plain GitLab link — GitLab has no OAuth in this pass), **GitHub connected** (a real, `last_verified_at`-fresh connection — "Connected as @username" + the repo's real full name), and **Connection expired** (the saved token failed a re-check — `repository_provider`/`repository_url` are never touched, only "Reconnect GitHub" is offered). Re-verification is throttled to once per 15 minutes per connection (`loadGitHubConnectionStatusAction`, with an in-process dedupe map so a focus-regain refresh and an initial load landing at the same moment share one real GitHub request instead of firing two) — never polled, never checked on every render. Changing Provider or URL on Save (including to "None") deletes any existing GitHub connection outright via a new `AFTER UPDATE` trigger on `projects` (`invalidate_github_repository_connection`, `security definer` so it fires regardless of the calling role's own — intentionally absent — grants on the connections table), so a stale token can never be silently reused against a different repository; Disconnect (`disconnectGitHubProjectConnectionAction`) only ever removes the local row, never GitHub's own OAuth App authorization. Authorization for every new server-side entry point (both API routes, both new Server Actions) mirrors `projects_update`'s own existing RLS exactly (`is_org_admin_or_lead` — Admin or Project Lead, re-verified fresh server-side every time, never trusted from a cookie/client claim) — no new permission model was introduced. See Architecture Status → "GitHub OAuth (Repository Integration)" for the full detail, including a real architecture gap this pass had to work around (this app's Supabase session lives in browser `localStorage`, not a cookie, so a plain top-level navigation to a Route Handler otherwise carries no proof of identity) and the naming mismatch between this feature's own spec and this environment's real `.env.local` (`GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET`, not `GITHUB_OAUTH_CLIENT_ID`/`_SECRET`).

Most recently, Ticket Detail gained a real **Development** section — branches, commits, and pull requests from the project's connected GitHub repository, related to that one ticket by its own real ticket code only (e.g. "JIR-8" matched case-insensitively against branch names, commit messages, and PR title/body/head branch — never the ticket's own title or any other ambiguous text). Read-only: nothing here can create a branch/PR, comment, merge, or otherwise write back to GitHub. The section only exists when there's something real to show — no connection, an expired one, a GitHub error, or simply no matches all render nothing at all (no CTA, no empty state, no technical error), and results are capped/cached (5 branches, 10 commits, 10 PRs; a 5-minute server-side cache) so it never hammers GitHub. See Architecture Status → "Ticket Detail → Development (real GitHub, read-only)" for the full detail.

After that, Development went through a short series of fixes and polish passes. A real bug was found and fixed: commits on an unmerged feature branch never appeared, because GitHub's own `/commits` endpoint without a `sha` param only returns the default branch's history — commits are now fetched per related branch (capped at 5) plus the real default branch, deduped by full SHA, via `Promise.allSettled` so one deleted/renamed ref can't fail the rest. A separate audit into a missing open Pull Request found the filter logic itself was already correct; the most likely cause was the bundled 5-minute cache serving a snapshot from before the PR existed — which motivated a real, manual **Refresh** action (bypasses that one cache entry on demand, preserves the last good data on a transient failure, never a full-page reload). Two visual polish passes followed (group headers with icon/name/count, lighter full-row-clickable rows, a real pluralized header counter, a discreet GitHub mark next to the section title), and one real UX bug was corrected along the way: the merge-commit-message fallback now leaves a commit's original GitHub message untouched when no matching PR is found, instead of substituting a fabricated "Merged Pull Request #N" label.

Most recently, Ticket Detail's plain "Loading ticket…" text was replaced with a real, full-fidelity `TicketDetailSkeleton` — shown for both the initial page load and the already-existing automatic refresh on focus/tab-visibility regain (neither trigger changed; only what renders during that state did). It mirrors the real header/Description/Attachments/Development/Time Tracking/Comments/Activity/sidebar layout exactly (same spacing rhythm as `CollapsibleSection`/`SidebarField`, so nothing shifts once real data lands), reuses the existing `SkeletonBlock` primitive rather than a new one, keeps `BackToTicketsButton` real so navigation is never blocked, and shows only a generic placeholder for Development — the real, GitHub-backed section never mounts while the skeleton is showing. See Architecture Status → "Ticket Detail → loading skeleton" for the full detail.

Most recently, the workspace-wide **Settings** screen (General, Danger Zone) was retired outright, by explicit product decision: JIRITA runs as a single-tenant solution, so workspace-level configuration (Workspace Name, Active Days, Default Role, Default Capacity) is no longer meant to be Admin-editable through the UI. "Settings" no longer appears in the sidebar for any role, and `/settings`/`/settings/[section]` (every subroute) now just redirect to the Dashboard instead of rendering the old screen. No Supabase table, column, or migration changed — the current real values (Techtivo / Monday–Friday / Member / 40h/week) remain exactly as configured, and every existing consumer of them (Invite User's defaults, Time Tracking's expected-hours calculation) keeps reading the same columns unchanged. Project Settings — a distinct, per-project screen — is completely unaffected. See Architecture Status → "Removed (Settings → General & Danger Zone)" for the full detail.

Most recently, all three **Project Overview** variants (Admin, Project Lead, Member) gained a real structural loading skeleton in place of the old plain "Loading project…" text, shown only on the true first load — no data-loading effect changed. Admin and Project Lead share one `ProjectOverviewSkeleton` (both variants render the identical layout shape), while Member — whose layout genuinely differs — gets its own `MemberProjectOverviewSkeleton`. See Architecture Status → "Project Overview → loading skeleton" for the full detail.

Most recently, **Tickets** (`tickets-screen.tsx`, every view — Board/List/Calendar/Timeline/Insights, both per-project and the org-wide `/tickets` mode) gained a real background refresh on tab focus/visibility regain, reusing the existing shared `useRefreshOnFocusAndVisibility` hook rather than a second implementation, plus a real structural loading skeleton (header, filter bar, quick-stats line, and the Board's own 6 real columns with card placeholders) in place of the old plain "Loading tickets…" text. The refresh only ever swaps in a freshly-fetched ticket list once it arrives — filters, search, the selected view, and the sessionStorage-based navigation/scroll state are untouched, and a background refresh never re-shows the skeleton or blanks the screen once real tickets already exist. See Architecture Status → "Tickets → focus/visibility auto-refresh + loading skeleton" for the full detail.

---

# Repository Structure

```
/src/           — Next.js application (the active codebase — all development happens here)
/product/       — Read-only reference copy of a prior implementation snapshot
/prototypes/    — Read-only standalone HTML prototype files
```

`/src/docs/` holds implementation-facing documentation for backend work
(`SUPABASE_MVP_SCHEMA.md`, `SUPABASE_SETUP.md`, `UNFUDDLE_IMPORT_SPECIFICATION.md`)
— distinct from this file, which lives at the `/src` root.

---

# Current Sprint

## Completed

### Role-Based UX

Completed.

Role comes from a real Supabase `organization_membership` when the signed-in user has one (Admin / Project Lead / Member, per `docs/SUPABASE_MVP_SCHEMA.md`'s `org_role` enum). `src/lib/current-user.ts`'s three mock identities now serve only as a dev-only fallback — used automatically outside production builds when no real profile/membership exists yet, so local dev isn't blocked on seeded data. No real server-side permission enforcement (RLS on `projects`/`tickets`/etc.) is wired into the UI yet; role only drives what renders.

- `CurrentUserProvider` (`src/components/current-user-provider.tsx`) holds the active `CurrentUser` (real or dev-fallback) in React context, refetched from Supabase after every profile save
- A dev-only `RoleSwitcher` in the header bar (now only rendered alongside a visible "Dev fallback" badge, and only when no real membership is loaded) lets a tester swap roles live to see the app reshape itself
- `src/lib/nav-config.ts` centralizes which main-nav and per-project-nav items each role sees, and in what order (sidebar renders in array order, not a hardcoded sequence)
- `canManage(role)` gates workspace/project management actions (New Project, New Ticket, Add Member, etc.) to Admin and Project Lead
- Dashboard, Projects, and Reports each render a **different, purpose-built screen per role** rather than a permissions-filtered version of one shared screen (see below)
- Settings and per-project Team are Admin/Project Lead only; Member's sidebar omits them
- MVP terminology pass: "Sprint / Milestone / Backlog / Story Points" language removed from live UI copy (e.g. Project Reports' "Velocity Snapshot" → "Delivery Snapshot") in favor of Delivery / Capacity / Hours vocabulary. Story Points is dropped from the ticket sidebar, preview panel, and filters.

### Application Foundation

- Next.js application configured (in `/src/`)
- Light Mode
- Dark Mode
- Global layout (`AppShell` component)
- Responsive navigation (`Sidebar` component)
- Design system foundation

### Projects

Completed, and now backed by real Supabase data (Sidebar + `/projects` list — see Architecture Status for the full read/write/RLS breakdown). `ProjectsListScreen` still branches by role rather than showing a permissions-filtered version of one table.

#### Admin

- Full workspace projects table, sourced from the real `projects` table for the signed-in user's organization
- Search input (UI only, not wired)
- Filter chips (UI only, not wired) — Status filter now doubles as the only way to bring archived projects back into view (see Archive/Restore below)
- Project cards / rows, empty states
- **+ Create Project** opens a real modal (`create-project-modal.tsx`); the row **⋯** menu's **Edit** opens the same modal pre-filled (`editingProject` prop); **Archive**/**Restore** swap based on the project's real status
- Navigation into Project Details

#### Project Lead

- Real projects scoped by RLS (`project_memberships`) rather than the old client-side `LEAD_PROJECT_SLUGS` filter — the list itself now only ever contains what the query returns, no additional filtering in the component. `LEAD_PROJECT_SLUGS` still exists and is used by `project-lead-dashboard.tsx` and by this screen's own team-capacity summary-cell math — see Technical Debt for the resulting dev-fallback mismatch. (`project-lead-reports-screen.tsx` no longer references it at all, now real end-to-end — see Reports below.)
- Block-organized instead of a flat table; team and health context surfaced per project
- Quick actions (`+ New Ticket` instead of `+ Create Project`)
- Archived status excluded from the status filter set — Project Leads never see archived projects at all, by design

#### Member — `member-projects-screen.tsx`

A dedicated "My Projects" screen, not a filtered Admin/Lead table. **Now backed by real Supabase data end-to-end — implemented and type/build-clean, not yet clicked through in a live browser** (same "should work, not yet verified" caveat as Users/the Admin Project Overview).

- Shows only projects the Member is staffed on — the card list now comes from `useOrganizationProjects()` (already real, already RLS-scoped to this Member's own active `project_memberships`), one card per project regardless of whether the Member currently has any tickets there
- Surfaces who leads each project — real, via `loadProjectTeam`'s `projectRole === "lead"` member (never the older `ProjectSummary.owner`), falling back to "Lead: Unassigned" when none exists
- Surfaces what's assigned to the Member within each project — real Assigned/Due-This-Week ticket counts from `loadProjectTickets`, filtered to this member's own `assigneeProfileId`
- **Real bug fixed**: the lead avatar `<img>` could previously render with `src=""` whenever a project had no lead; `leadAvatar` now always resolves to a real URL or `FALLBACK_AVATAR`, with a defensive guard on top so the `<img>` never renders at all without a real `src`

#### Create, Edit, Archive, Restore

- **Create**: `create-project-modal.tsx` — name + optional description; status starts `active`; slug/project code auto-derived from the name
- **Edit**: the same modal, `editingProject` prop pre-fills name/description
- **Archive**: `archive-project-modal.tsx` — confirmation modal (project hidden from the active list; tickets/comments/activity/time tracking untouched; restorable later), reused unchanged by both the Projects list row menu and Project Settings' Danger Zone
- **Restore**: no confirmation — a direct action from the row menu / Danger Zone
- Sidebar's pinned project list and the `/projects` page share one `OrganizationProjectsProvider` (`src/components/organization-projects-provider.tsx`), so any create/edit/archive/restore is reflected in both immediately

#### Project Settings — `project-settings-screen.tsx`

Route: `/projects/[slug]/settings`, Admin/Project Lead only. Previously a fully mock, non-interactive page (uncontrolled inputs, no Save button at all); now reads and writes the real project.

- **General**: Project Name, Description, Project Code, Status (excludes `archived` — that transition only ever happens via the reused Archive/Restore flow, never a parallel path here), and (**new**) **Target Date** — an optional `<input type="date">` writing the real `projects.target_date` column directly (the same column the Project Lead Dashboard's own "Target Date" reads, see Dashboard above); `ProjectDetail` gained a raw-ISO `targetDateISO` field alongside its existing formatted `targetDate` display string specifically so this input can round-trip `yyyy-mm-dd` without reusing the "Jul 16"-formatted value or guessing a year back out of it
- **Billing**: Project Category (Client/Internal toggle), Client (a real per-organization roster — see "+ Add new client" below), Billing Rate. The Billable/Non-Billable-by-default note stays derived from Category, not a stored field
- A single **Save Changes** button (didn't exist before) persists only the fields this screen manages; the breadcrumb (`ProjectSettingsBreadcrumb`) reads the live project name from the same shared provider Sidebar/`/projects` use, so a rename shows up there immediately too
- **+ Add new client** (`add-client-modal.tsx`): minimal name-only creation, backed by a new `clients` table (see Architecture Status) — created immediately and selected in the form; persisted to the project on the next Save like any other field. Basic per-organization duplicate names are rejected.
- Danger Zone's Archive/Restore reuses `archive-project-modal.tsx`/`restoreProject` exactly as on the Projects list — no separate implementation
- **New: Repository Integration** — Repository Provider (`repository_provider`, real and nullable on `projects`: `null` means "None", `github`/`gitlab` the only other storable values, two `CHECK` constraints enforce both that and its pairing with `repository_url`) and Repository URL (`repository_url`, hidden entirely when Provider is "None", required and format-validated — `https://github.com/owner/repository` (exactly two segments, host anchored) / `https://gitlab.com/group/project` (two or more segments — subgroups allowed) — via one shared, pure `validateRepositoryUrl` (`lib/projects.ts`) called both client-side and inside `updateProjectSettings` itself, never connected to/synced/OAuth'd). No OAuth/sync/commit-reads/webhooks/Connect-Disconnect-Test-Connection buttons exist; this is deliberately just the persisted configuration. A small status line reads the real, persisted `project.repositoryProvider`/`repositoryUrl` ("Not connected" / "GitHub connected" / "GitLab connected"), with an "Open Repository" link (new tab) shown only once a real URL is saved. Replaces the old org-wide Settings → Integrations mock section outright — see Architecture Status → Removed (Settings → Integrations).
- **Removed**: General's "Project Lead" picker (and the `loadOrganizationMembers` fetch that only existed to populate it) — it read/wrote the older `projects.owner_profile_id`, which is not the same field as Team's real `project_memberships.project_role` (see Team below). Project Lead is now set exclusively via Team's "Make Project Lead" action. **Resolved**: the `/projects` list's own Lead column/filter has since been reconciled onto `project_memberships.project_role` too (see the new subsection below) — `ProjectSummary.owner`/`owner_profile_id` no longer has any Lead-column reader anywhere in the app (Member's "My Projects" was already on `project_role`; see Architecture Status → Projects).

#### Health, Progress, Ticket Counters & Tab-Regain Refresh (real, Admin/Project Lead) — `projects-list-screen.tsx`

The `/projects` list (`ManagedProjectsScreen`, Admin/Project Lead) previously showed several real-looking numbers that were actually always stale or `0` for real projects: the Health badge read the persisted `projects.health` column (never updated from the UI), the "At Risk" KPI duplicated its own blocked/overdue classification rather than reusing the one already established for the Admin Dashboard, and Progress/Open/Blocked/Overdue all read `ProjectSummary` fields (`progress`/`openTickets`/`blockedTickets`/`overdueTickets`) that the schema derives from `tickets` but nothing re-aggregates back onto `projects` rows — always `0`/`healthy` for a real project regardless of its actual tickets. A four-part pass fixed all of it, then added a real refresh so it can't go stale again on an open tab:

- **Health/At Risk/Progress/Lead are now one real per-project computation**, reused everywhere they're shown on this screen (badge, Health filter, "At Risk" KPI) rather than parallel/duplicated rules:
  - `buildProjectHealthRows` (`reports-screen.tsx`, already the Admin Dashboard's/per-project Reports'/Project Overview's own real health function) is called once per fetch, over every project's real tickets, and its `risk` (`"on-track"`/`"at-risk"`/`"blocked"`) is mapped onto the existing `ProjectHealth` badge vocabulary (`healthy`/`needs-attention`/`critical`). A project with no real tickets yet (the function's own "nothing to show" case) defaults to `healthy`, never a fabricated risk state.
  - The Admin Dashboard's own "Projects at Risk" widget and its blocked-projects health insight (`dashboard-screen.tsx`) were refactored to call this exact same function too, replacing a second, locally-duplicated blocked-then-overdue classification — the two screens can no longer disagree about what counts as "at risk." (Each still separately computes its own row's `progressPct`/`affected`-ticket count for display, since those are presentation details `buildProjectHealthRows` doesn't return — not part of the classification rule itself.)
  - `ProjectSummary.lead` (added ahead of this pass) is now sourced from `project_memberships.project_role = 'lead'` — the same real signal Team/the Dashboards already use — via a new batched query in `loadOrganizationProjects`, replacing the older `owner_profile_id`-backed Lead column/filter entirely.
- **Progress reuses a new, exported `computeProjectProgressPct(tickets)`** (`reports-screen.tsx`) — the exact same real done/total ticket-count formula (rounded, `0%` with no tickets) Project Overview's own progress bar already used, so a project showing e.g. 17% on its own Project Overview shows the same 17% on this list, never a second/different calculation and never the always-`0` persisted `progress` column.
- **Open/Blocked/Overdue reuse the same `buildProjectHealthRows` result** computed for Health above — the function gained two additional real fields, `open` (ticket count where `status !== "done"`, the same "open" definition Project Overview uses) and `overdueOpen` (open tickets whose due date is already past `todayISO`, the same clause the function already used internally for its own `risk`), alongside the pre-existing `blocked`. The list reads all three straight off that one result per project — no second pass over tickets, no more always-`0` `openTickets`/`blockedTickets`/`overdueTickets` fields.
- **Real refresh on returning to the browser tab, with skeleton loaders** — `ManagedProjectsScreen` gained a `metricsStatus` state that resets to `"loading"` synchronously every time its ticket-fetch effect re-runs (same "reset before the async fetch resolves" pattern the Dashboards' own main effects already use). That effect already depended on `organization` (from `useCurrentUser()`), so it already re-fires whenever `current-user-provider.tsx`'s existing window `focus` listener revalidates the session on tab-regain and hands back a new `organization` reference — no new listener, no polling, nothing added while the tab stays hidden. While `metricsStatus` is `"loading"` (first load, and again on every tab return), the whole screen renders a new `ProjectsLoadingSkeleton` — built entirely from `dashboard-shared.tsx`'s existing `SkeletonBlock` primitive, matching the real header/Create Project button, KPI strip, search/filters, and row layout (both the Admin grid row and the Project Lead's stacked-block row) at approximately their real dimensions — replacing the old plain "Loading projects…" text loading state entirely.
- Deliberately out of scope, unchanged: `awaitingReviewTickets`/`dueThisWeekTickets`/`activeMilestones` (still `0`/unpopulated for real projects — the Project Lead's own info chips/summary cells still read them), and the base project list itself (name/status/category/lead/target date, from `useOrganizationProjects()`) — its own provider-level refetch-on-focus already existed and is unaffected; only this screen's own ticket-derived metrics gained the visible loading/skeleton treatment.

Separately, that same list's Project Lead KPI band (Blocked Tickets, Due This Week, Over Capacity) and each row's team-size/over-capacity chip were reconciled onto real data too, instead of always-`0` persisted `ProjectSummary` fields or `mock-team.ts` (which had no entries for real projects, always showing "0 members"): Blocked reuses the same `buildProjectHealthRows` counts the row badges already compute; Due This Week filters the same real tickets fetch by the current Monday–Sunday week; Over Capacity reuses `loadProjectTeam` (Team's own source) evaluated per project and deduped by `profileId` across projects for the KPI total; the last KPI label was renamed "Over Capacity" for clarity. The header's dead "+ New Ticket" button for Project Lead (a no-op — Projects lists multiple projects with no unambiguous one to create a ticket into) was removed; Admin's "+ Create Project" is unchanged.

Most recently, My Work's own Assigned Tickets KPI became an independent click target following the same "0 → not clickable, 1 → open the Ticket Preview panel, more than 1 → navigate to a filtered Tickets view" rule established elsewhere (reusing `myTickets`, navigating to `/tickets?assignee=me`), and gained a full structural skeleton loader plus a real refresh on returning to a backgrounded browser tab, same precedent as the Dashboards/Projects list. All of the above is implemented and type/build-clean, not yet clicked through in a live browser — same "should work, not yet verified" status as everything else in this list.

### Project Overview

Completed. Route: `/projects/[slug]`. `ProjectOverview` now branches by role rather than showing one page to everyone — Admin, Project Lead, and Member each get a purpose-built rebuild.

#### Admin — `admin-project-overview.tsx`

An executive dashboard, **now backed by real Supabase data end-to-end — implemented and type/build-clean, not yet clicked through in a live browser** (same "should work, not yet verified" caveat as Users — see Architecture Status). Real replacement for the previous mock-only version described below; the section names (Active Work, Project Activity, Team, Project Health) are unchanged.

- **Header** — real project name, description, status badge, category badge, and creation date ("Started …", from the real `projects.created_at` column). The initials badge shows the project's own real short name instead of a hardcoded "MB". The description is expandable/collapsible (clamped to 2 lines, measured by actual overflow rather than a character count, with a "View more"/"View less" toggle shown only when needed). The "Owned by" field was removed outright (not replaced).
- **Breadcrumb** — real project name, same pattern as Project Settings'/Ticket Detail's own breadcrumbs, replacing the page's old server-side mock lookup.
- **Alert Banner (Health Alerts)** — reuses company-wide Reports' own real health-alert calculation, scoped to this one project, rather than a second one. The Review action now targets every actionable alert type currently shown (never just one, and never an arbitrary ticket when more than one alert or ticket is present): exactly one alert type resolving to exactly one real ticket links straight to that ticket; every other actionable combination hands off to the Tickets page with the matching status filter(s) already applied and visible as removable chips; no actionable ticket hides the action link, and the banner itself is hidden when there's nothing real to flag.
- **KPIs** — Open Tickets, Progress (real done/total ticket-count percentage, the same formula already used by the Admin Dashboard's "Projects at Risk" widget and the Project Lead Dashboard's "Delivery Progress" KPI), Blocked, and Closed This Month (the same real signal Reports/Admin Dashboard already use for "completed this month").
- **Active Work** — real Blocked/In Progress/In Review ticket groups, with the existing empty state.
- **Project Activity** — capped at the 10 most recent real events, newest first, with a "View all activity →" link (shown only when more than 10 exist) to a brand-new, dedicated, fully paginated `/projects/[slug]/activity` page — the real, comprehensive activity trail (every event type, not just the curated few this card shows), with the same real `?page=`, 20-per-page, Previous/Next pagination pattern as Work History.
- **Team** — real roster, with the existing "View all →" link.
- **Project Health** — reuses company-wide Reports' own real per-project risk calculation for the verdict, rather than a second one. The existing Schedule/Capacity/Scope/Risks layout is unchanged; Schedule and Risks are driven by real blocked/overdue signals, Capacity by the real over-capacity team member, and Scope — which has no real signal anywhere in this schema — shows an honest "not tracked" note instead of a fabricated one.

No new database tables or columns were needed — pure application-layer query/rendering work on top of already-real `projects`/`tickets`/`ticket_activity`/`ticket_time_entries`/`project_memberships` tables.

#### Project Lead — `project-lead-project-overview.tsx`

An execution-focused rebuild, not a filtered Admin view: same KPI/Active-Work/Team baseline, but Project Health shows only the reasons (no status labels) — with the same clickable drill-downs as the Admin variant — plus a "Needs Your Attention" card — a prioritized, actionable ticket list derived from real ticket data (blocked first, then overdue review, then overdue, then due-today) — and a multi-alert banner.

#### Member — `project-overview.tsx`

Rebuilt as a personal workspace inside the project — "what do I need to work on here today?" — not a scaled-down Admin/Project Lead view. Project-wide health, capacity, and org metrics are intentionally absent.

- **KPI strip** — My Open Tickets, Due This Week, My Blocked Tickets, Completed This Month (scoped to the current member's own tickets in this project)
- **Alert banner** — member-specific only (tickets due today, review requests, mentions, blocked tickets), deep-links into Tickets pre-filtered to `Mine`/`Blocked` via `presetTicketsFilter`
- **My Project Work** — the member's own tickets in this project, with a **List**/**Board** view toggle (last-selected view persisted per project via `localStorage`); List groups by status (Blocked/In Progress/In Review/To Do/Backlog, empty groups hidden), Board reuses the same Kanban `BoardView` as Tickets/My Work; both are capped preview lists (most urgent tickets first) with a "View all project tickets →" link into Tickets pre-filtered to `Mine`
- **My Activity** — only events where the member participates (their own actions, or actions directed at them — assigned, commented on, mentioned), never general project activity
- **Needs My Attention** — personalized: blocked/overdue/due-today tickets plus review-request/mention notifications, positioned above Team since actionable content leads informational content
- **Team card** — real per-project roster via `getTeamByProjectSlug`, every avatar/name opens the Member Profile Modal
- **Quick Links** — Notes & Documentation

All data is correctly scoped to the active `slug` (tickets, team, activity) — **resolved**: the header's title/description now also come from the real project record instead of a fixed "Mobile Banking App" string, matching the Admin and Project Lead variants (see Architecture Status → Project Overview).

A cross-project "My Work" equivalent already exists (`my-work-screen.tsx`); this Member Project Overview is its single-project counterpart and deliberately does not offer a Focus view — scope is already limited to one project, and Needs My Attention already covers prioritization. Focus remains exclusive to My Work.

### Team

Completed, and now backed by real Supabase data end-to-end — **confirmed working against a live Supabase project** (see Architecture Status). Route: `/projects/[slug]/team`, Admin/Project Lead only. Real replacement for `mock-team.ts`'s `getTeamByProjectSlug` on this screen only — the Member Profile Modal's per-project single-view mode, `resolveTeamMember`, and ticket assignees/comment authors/activity-feed actors elsewhere in the app are untouched.

- **Team membership is now (mostly) automatic.** A database trigger creates a real `project_memberships` row the first time someone creates a ticket, edits one, comments, logs time, uploads an attachment, or links a ticket — never merely by viewing. It's the only way a plain Member (who has no direct `INSERT` grant on `project_memberships`) ends up staffed on a project; a backfill covers contributions that predate the trigger.
- `src/components/team-screen.tsx` — real roster (name/email/avatar/title/weekly capacity) plus real KPIs (Team Members, Weekly Capacity, Assigned Hours, Team Utilization) all derived live from the same member list, never stored/stale. "+ Add Member" opens `add-team-member-modal.tsx`, a picker over real org members not already on the team.
- **Project-scoped role (Lead vs. Member) is now a real column**, `project_memberships.project_role` — distinct from `projects.owner_profile_id` (an older, unrelated field) and from the org-wide `organization_memberships.role`. A "Project Lead" badge now shows on the real lead's card. A real bug was fixed alongside this: every member used to display `project_memberships.title` ("Member") as their role regardless of their actual org role — the roster now shows each member's real org role (Admin/Project Lead/Member) instead.
- **Make Project Lead** — an Admin-only action in the Member Profile Modal's project-mode menu, gated to members whose real org role is itself Admin or Project Lead. Promoting a new lead demotes the previous one in the same write (only one lead per project, enforced by a database unique index) and is picked up by the Team screen immediately via the same `window` `CustomEvent` pattern member removal already uses.
- **"Remove from Project" is conditional and DB-enforced.** It's only offered when the member has no real history on the project (created/assigned/commented/logged time/uploaded/related a ticket) — never rendered disabled, simply omitted — and a `BEFORE DELETE` database trigger independently blocks the delete outright if history exists, regardless of how the delete is invoked. "Send Message" was removed from the member menu (no messaging system exists).
- Removing a member from the globally-mounted Member Profile Modal is picked up by this screen immediately, without a manual reload or polling — a `window` `CustomEvent` dispatched only after the server confirms the delete, which both filters the member out of local state right away and triggers a real refetch (avoiding a stale in-flight fetch resurrecting the removed member).
- **"View Work History" is now a dedicated page**, not a modal: `/projects/[slug]/team/[userId]/work-history` — "which tickets has this person worked on in this project," with real **server-side** pagination (20/page, `?page=` in the URL, Previous/Next) via two Postgres RPCs, so a history that grows into the hundreds/thousands of tickets is never fetched whole into a modal. A requested page past the end resolves to the last real page. Clicking a ticket opens the real Ticket Detail route directly.
- Fixed a `NaN%`/`Infinity%` utilization bug: a 0-capacity member's utilization/capacity-bar math now normalizes to finite, non-negative numbers first, so it always shows `0%` instead of `NaN%`/`Infinity%` (over-100% allocation is still shown as-is in text).
- **Weekly Capacity now falls back to the member's real organization-level capacity** when the project-level value is unset — a real bug where a member added via "+ Add Member" (which never wrote a project-level capacity) displayed 0h despite having a real, configured org-level weekly capacity. An explicit 0 is never overridden, only a genuinely unset value falls back. This is the same query the Project Lead Dashboard's Team Capacity widget reads, so both stay consistent automatically (see Dashboard below).
- Per-person availability `status` (Available/Busy/Away) has no real source yet — every real member shows a fixed "Available".
- During this work, a validation script accidentally deleted every real `project_memberships` row in the live database; it was fully diagnosed and repaired (re-derived from still-intact source data, plus one hardcoded restore for a row with no derivable source, approved by the user) — see Architecture Status for the corrective migrations. No other data was affected.

---

### Tickets — All Five Views

Completed.

The Tickets experience at `/projects/[slug]/tickets` supports five views with an instant client-side toggle. Board is the default.

#### Ticket Types (Task / Bug)

Every ticket has a `type: "TASK" | "BUG"`. A shared `TicketTypeIcon` renders immediately before the ticket ID on every screen that shows one (ticket cards, Ticket Detail, Ticket Preview Panel, Calendar, Timeline, Insights, Dashboard/Reports activity rows) — one component, so the glyph and its color stay identical everywhere. A custom `TicketTypeSelect` dropdown (not a native `<select>`) is used in the New Ticket form and Ticket Detail sidebar so the picker itself can render the icon inside each option.

#### View Switcher

A segmented tab control switches between all five views: **List**, **Board**, **Calendar**, **Timeline**, and **Insights**. All tabs are active.

#### Filter Bar

Fully real and wired — every control below combines with every other one (AND) into a single filtered ticket list shared by all five views and the header's Tickets/Estimated/Blocked counters; nothing is duplicated per view.

- Search input — matches ticket title or visible key
- Dropdown filters: Assigned (Anyone/Me/Unassigned + real org roster), Priority (Highest/High/Medium/Low), Status
- Quick toggle chips: Mine, Blocked, High Priority (Highest or High), Due Soon (active tickets due within the next 7 days, never overdue), Recently Updated (last 7 days)
- "Add Filter" menu adds a real filter chip to the bar: Labels (multi-select from the real per-org catalog), Due Date / Created Date / Updated Date (from/to range), Reporter (who created the ticket, by real user id — multi-select). Clearing a chip's value removes it from the bar; re-adding it from the menu is how it comes back.
- "Mine" and Reporter match the signed-in user's real `profiles.id`, never the display name

#### Board View

Five independently scrolling columns:

- Backlog
- To Do
- In Progress (includes blocked tickets)
- In Review
- Done
- Blocked (dedicated column for blocked tickets)

Each column:

- Color-coded dot accent, count badge, last-activity subtitle
- Cards link to `/projects/[slug]/tickets/[ticketCode]`

Each board card:

- Blocked indicator (if applicable)
- Title (2 lines max)
- Due date (if present)
- Priority indicator (Highest/High only), milestone, assignee avatar

#### List View

Tickets grouped by the same status sections. Each section has a labeled header with a count and a horizontal rule. Rows show title, blocked indicator, priority (Highest/High only), milestone, due date, and assignee avatar.

#### Calendar View

Month-grid calendar showing tickets on their due dates.

- 6 × 7 cell grid (42 cells), starting on Sunday
- Up to 3 ticket pills per cell; overflow shows "+N more"
- Today's date highlighted with a brand-coloured circle
- Clicking a day opens a right-side panel listing that day's tickets
- Clicking a ticket in the day panel opens a ticket detail sub-panel
- Month navigation via chevron buttons

#### Timeline View

Horizontal planning view grouped by milestone. Inspired by Linear Roadmap.

- Tickets rendered as horizontal bars, colour-coded by status
- Bar width derived from `dueDate − max(3, storyPoints × 1.5)` days (no new schema fields)
- Milestones rendered as collapsible section headers with ticket counts
- Ticket rows indented under their milestone header
- Frozen left label column during horizontal scroll
- Vertical "Today" indicator in brand colour with header badge
- Smooth scroll on mount to position Today at ~1/3 from the left edge
- Clicking a bar navigates to the ticket detail route

#### Insights View

Project-level analytics dashboard computed from the existing ticket dataset.

- **KPI cards**: Open Tickets, Completed, Blocked, Overdue
- **Tickets by Status**: SVG multi-segment donut chart with legend
- **Workload by Assignee**: horizontal bar chart with avatars
- **Priority Distribution**: horizontal bar chart with percentage labels
- **Milestone Progress**: progress bars per milestone, colour-coded by completion
- **Upcoming Due Dates**: top 6 non-done tickets sorted by due date, with relative countdown
- **Recently Completed**: done tickets with assignee avatar and timestamp

No external chart libraries. All charts are pure SVG or CSS.

#### Quick Ticket Preview

Clicking a ticket card opens a slide-in preview panel from the right (520px wide) without leaving the current view.

- Panel slides in with a 250ms ease-out animation; backdrop dims the board
- Header: issue key, title, status badge
- Body: priority, assignee, milestone, story points, due date, labels, description, comments (2), activity timeline
- Content cross-fades when switching between tickets while the panel is open
- Footer: **Expand** button navigates to the Full Detail route
- ESC key and backdrop click close the panel
- State is fully preserved while the panel is open (view, filters, scroll)
- **Editable, when opened from the Tickets board**: Title, Status, Priority, Assignee, Estimated, Due Date, and Labels can all be edited inline, right from the panel — same persistence (`updateTicket`) and same real Activity Log as the full Ticket Detail page, so an edit here and an edit there always agree. Description and Acceptance Criteria stay read-only. This is opt-in per caller (an `editable` prop) — every other place this same panel is used (Dashboard, company-wide Reports, the Project Lead's/Member's own Project Overview, etc., all still on mock data) is unaffected and remains read-only exactly as before. The **Admin** Project Overview's own preview panel now shows real ticket data (same as the rest of that screen) but hasn't been opted into `editable` either, so it stays read-only there too.

#### Full Ticket Detail Page

The route `/projects/[slug]/tickets/[ticketCode]` renders a complete ticket workspace, backed by real Supabase data — see Backend Integration below.

- **← Back to Tickets** button at the top uses `router.back()`, preserving browser history
- Two-column layout: main content left, metadata sidebar right
- Main content: issue key, title, status badge, description, Acceptance Criteria, Attachments (upload, rename, delete, download, and Preview for images/PDF — all real), Time Tracking, comments, activity timeline
- Sidebar: editable status, type, priority, assignee, due date, labels, Estimated hours, Related Tickets (real — link/search/remove, with the correct inverse relation kept automatically on the other ticket). Milestone and Story Points fields exist in code but are dead — defined, never rendered
- Every save on this page (fields, comments, time entries, attachments, related tickets) now shows a real error toast on failure instead of only logging to the console, and a failed inline edit reverts to its previous value rather than leaving an unsaved change on screen

#### Backend Integration

Tickets is now backed by real Supabase data — the second major mock-to-real seam after Projects (see Architecture Status for the full read/write/RLS breakdown).

- `src/lib/tickets.ts` — the single module for every real Tickets read/write: `loadProjectTickets` (all five list views, scoped by `project_id`), `loadTicketByCode` (Ticket Detail's data source, resolved by the visible ticket code, e.g. `JIR-1` — the internal uuid is never exposed in a URL), `createTicket` (New Ticket modal — Type/Status/Priority/Labels/Due Date in "More Options" still write fixed defaults, not the value picked in the form), `updateTicket` (every Ticket Detail *and* Quick Ticket Preview inline edit: Title, Description, Status, Type, Priority, Assignee, Estimated Hours, Due Date, Labels, and each Acceptance Criterion's checked state), `loadTicketComments`/`createTicketComment`, `loadTicketActivity`, `loadOrganizationLabels`/`createOrganizationLabel`, `loadTicketAttachments`/`uploadTicketAttachment`/`downloadTicketAttachment`/`getTicketAttachmentPreviewUrl`/`renameTicketAttachment`/`deleteTicketAttachment` (all real — Storage + metadata row; "Replace File" was removed from the menu rather than wired up), `loadTicketTimeEntries`/`logTicketTime` (minutes as the canonical stored unit), and `loadTicketRelations`/`createTicketRelation`/`deleteTicketRelation` (Related Tickets)
- The ticket detail route was renamed from `/projects/[slug]/tickets/[ticketId]` to `/projects/[slug]/tickets/[ticketCode]` — a real bug is fixed here: the route used to navigate on the internal uuid and could 404 when a stale dev-server route table lagged the rename; the ticket code is now the only thing that ever appears in a ticket URL
- **Activity Log is real and comprehensive**, built almost entirely with database triggers rather than client code, so ticket creation, every field change, attachment uploads/renames/deletes, time entries, and related-ticket add/remove (logged on *both* tickets involved) are all logged automatically with the real authenticated actor
- Tickets list filtering is fully real — search, Assigned (real roster)/Priority/Status dropdowns, the 5 quick-filter chips, and the "Add Filter" menu (Labels/Due Date/Reporter/Created Date/Updated Date) all combine into one filtered list every view and the header counters share; nothing is unwired or duplicated per view anymore
- **Related Tickets is real**: search is scoped to the current project's own real tickets and excludes the current ticket and anything already linked; only 3 canonical relation kinds are ever stored in the database (a single row per relation), with the 2 inverse UI labels ("Is blocked by"/"Is duplicated by") derived per-perspective — this is what keeps the inverse relation correct automatically and makes duplicate-relation prevention a plain database constraint
- Ticket priority is a 4-value scale — Highest/High/Medium/Low — the old "Normal" value was migrated to Medium and removed from the database enum entirely, not just hidden client-side
- Every write path (fields, comments, time entries, attachments, related tickets) now shows a real error toast on failure and never leaves an unpersisted optimistic change on screen; Ticket Detail's own load failure has a Retry button, same as the ticket list
- New Ticket's Possible Duplicates check now runs against the current project's own real tickets, never another project's or the old mock array
- The **Admin** Project Overview now creates/views real tickets against the same real Tickets data as everywhere else (see Project Overview above); the Project Lead's own Project Overview still uses `NewTicketModal`/`TicketDetailScreen` against local mock ticket state
- New tickets now default to Backlog status, not To Do — the fixed default the database column itself already had, previously overridden by the application layer
- Ticket Description is now inline-editable on Ticket Detail with explicit Save/Cancel actions and a placeholder when empty (previously saved but could silently fall back to the old value instead of allowing an empty description, and a failed save discarded the typed draft instead of keeping it on screen)
- Tickets now supports a real, URL-persisted status/alert filter (`?alerts=overdue,blocked,done,in-progress`, etc.) — shown as real, removable filter chips using the same chip style/labels as the existing quick filters, survives a refresh or browser back/forward (real query-state, unlike the pre-existing sessionStorage-based filter handoff, which is unchanged and still used for its own existing callers). This is what backs both the Project Overview Health Alert banner and Project Reports' Delivery Progress cards — see their own sections

#### Navigation & State Restoration

When clicking **Expand** from the preview panel, the tickets screen state is saved to sessionStorage before navigating. On return (back button), the screen restores: active view, filter chips, search query, scroll position, and the same preview ticket reopened.

### Hours & Time Tracking

Completed. Route: `/time-tracking`, branches by role. Personal time logging always happens the same way regardless of role — the "Log Time" button on a ticket in Ticket Detail. **The Admin/Member view is now backed by real Supabase data — implemented and type/build-clean, not yet clicked through in a live browser this session, same "should work, not yet verified" caveat as Users/Admin Project Overview/per-project Reports.**

#### Admin/Member — `time-tracking-screen.tsx`

Full Billing/Finance view, now real: period selector (Today/This Week/This Month/Custom Range) plus real Member/Project/Client/Billing filters, all round-tripped through the URL so they survive a refresh (same `?alerts=`-style query-state precedent as Tickets). Overview KPIs (Billable Hours, Non-Billable Hours, Missing Hours, Weekly Utilization, Projected Billing), the real Timesheets table (real active org members, real logged hours per period, real Capacity %/Status), a Missing Hours panel (renamed from "Hours Missing," then from "Members Missing Hours" — the value counts affected members, not hours), and a Billing by Client table are all real. Billable/Non-Billable figures and Billing by Client reuse Reports → Finance's own `buildFinanceKpiSummary`/`buildBillingOverviewRows`/`buildBillableHoursByMemberRows` (exported for this reuse) rather than a second billing calculation; capacity-based figures (Missing Hours, Weekly Utilization, Capacity %, Status) are kept structurally independent of the Billing filter — they always reflect a member's total logged hours against their real Weekly Capacity (the same org-then-project fallback Team/Reports already use), regardless of billable/non-billable, via two separately-scoped ticket-id sets rather than one shared scope. There is no "Billing by Member" table in this screen. **The Timesheets table and the Missing Hours panel's Member Profile Modal triggers now pass a real `profileId`/`projectSlug`** (see Architecture Status → Member Profile Modal), and the whole screen gained a full structural skeleton loader (`SkeletonBlock`-built) plus a real refresh on returning to a backgrounded browser tab, same precedent as the Dashboards/Reports/Projects list.

#### Project Lead — `project-lead-time-tracking-screen.tsx`

Now real, scoped to exactly the projects this profile leads (`project_memberships.project_role = 'lead'`, via `loadLeadProjects` — the same authoritative definition the Project Lead Dashboard's own project scope selector uses, never `loadOrganizationProjects`/`loadOrganizationTickets`/`loadOrganizationUsers`'s broader "staffed on" or org-wide scope). Tickets/team roster come from `loadProjectTickets`/`loadProjectTeam` per led project (merged and deduped client-side, summing `weeklyCapacity` for anyone staffed on more than one led project), and time entries reuse `loadOrganizationLoggedTimeForRange` verbatim, fed a ticket-id set already narrowed to led projects only. Every calculation (`scopeEntries`, `hoursByMember`, `expectedHoursForPeriod`, `getCurrentWeekRange`/`getCurrentMonthRange`, `round1`, `parseListParam`) is imported from `time-tracking-screen.tsx` (now exported for this reuse) rather than reimplemented, and Logged/Internal Hours reuse `buildFinanceKpiSummary` verbatim (same billable/non-billable split as Admin/Member, just delivery-labeled — no dollar amounts shown anywhere on this page). Still a delivery-focused layout with no revenue/invoicing/billing-by-client concepts: delivery-labeled KPIs (Logged Hours, Internal Hours, Hours Missing, Weekly Utilization, a **Capacity Risk** card), a Hours Missing reminder, a real Hours by Project breakdown (new — no real equivalent existed in the Admin/Member screen to reuse), and a Timesheets table scoped to the Lead's own led-project team. Member/Project/Client filters are now real and functional (the mock version's filter state was never wired to any actual data narrowing); `?projects=<slug>` is read on load and kept round-tripped through the URL, same convention Admin/Member's own Time Tracking screen already uses — a slug outside the signed-in lead's own led projects can only narrow the (already led-project-scoped) ticket set to nothing, never broaden access. No longer imports `mock-time-tracking.ts` data (only its `TimePeriod`/`CustomRange`/`TimesheetStatus` types and `periodDisplayLabel`, same type/helper reuse convention Admin/Member's screen already established). The three mock-only exports it used to import (`MEMBER_GROUPS`/`PROJECT_GROUPS`/`CLIENT_GROUPS`) have been deleted from `time-tracking-screen.tsx` — they had no other consumer. Implemented and type/build-clean (`tsc`/`eslint`/`next build` all pass); not yet clicked through in a live browser against a real Supabase project.

#### Member — no dedicated nav item, but the same real screen as Admin

Members have no Time Tracking sidebar link. A compact "My Time" summary row plus a "View Timesheet" link (`personal-timesheet-panel.tsx`) live inside My Work instead, unaffected by this work.

Time Tracking is also integrated into the Ticket Detail page for logging against a specific ticket. This ticket-level piece is backed by real Supabase data (`loadTicketTimeEntries`/`logTicketTime` in `src/lib/tickets.ts`, minutes as the canonical stored unit) — see Tickets → Backend Integration, unaffected by this work.

Includes:

- **`TimeTrackingSection`** (collapsible, expanded by default) below the Development section
  - Compact summary line: `Xh logged / Yh estimated`
  - Conditional variance text: `+Zh over estimate` in amber, shown only when over
  - Smart 2-segment 4px progress bar: brand fills estimated portion, amber fills overage
  - `View N entries →` link opens `TimeHistoryModal`
- **`LogTimeModal`**: hours + minutes inputs, date picker, comment textarea; submit persists a real time entry and the Activity Log picks it up via a database trigger
- **`TimeHistoryModal`**: full entry list with summary stats (Logged / Estimated / Remaining), scrollable timeline-dot entry list
- Ticket header stats row: Estimated / Logged / Remaining (shown when `ticket.hours` is set)
- Sidebar "Estimated" field (renamed from "Hours")

### Dashboard

Completed. Route: `/` (root). The root no longer redirects to `/projects`. `DashboardScreen` now branches by role — Admin, Project Lead, and Member each see a distinct, purpose-built dashboard rather than a filtered version of one screen. Shared building blocks (KPI card, hero card styles, section container, `RecentActivityList`, `ActiveTicketRow`, and — **new** — `SkeletonBlock`, a single pulsing placeholder primitive) live in `dashboard-shared.tsx`. **All three dashboards — Admin, Project Lead, and Member — are now backed by real Supabase data end-to-end — confirmed working against a live Supabase project.**

**New**: all three dashboards' loading states now render a structural skeleton (matching each dashboard's own real header/KPI-grid/section layout, built from the shared `SkeletonBlock`) instead of a plain "Loading dashboard…" text block — same real load-state gating as before (`loadState`/`deliveryLoadState`), only the visual for that state changed. Along the way, a real (if minor) bug was found and fixed on the **Admin** dashboard: its main data-loading effect never reset `loadState` back to `"loading"` on a re-run (e.g. the real `window` `focus`-regain revalidation `current-user-provider.tsx` already does — see that file's own real refetch-on-focus/route-change effects), so a background refetch after returning to the tab replaced the on-screen data with no visible loading indicator at all, unlike Project Lead's and Member's own effects (which already reset to `"loading"` on every re-run). Admin's effect now does the same reset — same existing mechanism, not a new one; Project Lead's and Member's own refresh behavior is unchanged.

#### Admin (default company-wide view) — `dashboard-screen.tsx`'s `AdminDashboard()`

- Header: real greeting + real current date
- Quick actions: **New Project** and **Add Member** open `CreateProjectModal`/`InviteUserModal` directly from the Dashboard (same modals Projects/Users already use); `+ New Ticket` was removed from Quick Actions entirely
- 4 KPI cards — Assigned Tickets, Hours Burn, Blocked, Due Today — all real
- Organization Health insight band — real, computed from blocked projects, over-capacity members, hours burn, and tickets completed this month
- Two-column layout (`xl:grid-cols-[1fr_320px]`):
  - Left: My Active Work (real, click-to-preview) + Recent Activity (real, via the real `ticket_activity` feed)
  - Right: Projects at Risk (real) + Team Workload (real, progress bars) + Upcoming Deadlines (real)
- Ticket quick-preview panel on row click (reuses `TicketPreviewPanel`)
- No mock data remains on this screen (only the shared `Ticket` type/`getTicketDisplayKey` helper are still imported from `mock-tickets.ts`, same as every other real screen)
- **New**: Recent Activity now shows a real "View all activity →" action when more than 10 real events exist, same cap-plus-probe pattern (`loadOrganizationActivity` fetched one past the display limit, purely to detect "more exists") the Admin Project Overview's own Project Activity widget already used — `RecentActivityList`'s own rendering is unchanged, no second implementation of activity rendering. The link opens a new, dedicated, org-wide Activity History page (`organization-activity-history-screen.tsx`, route `/activity`, not on the Sidebar's main nav — reached only via this link, same "link-only" precedent as Work History) — the org-wide sibling of the existing per-project `/projects/[slug]/activity` page, backed by a new `loadOrganizationActivityPage` in `lib/tickets.ts` that mirrors `loadProjectActivityPage`'s query/pagination shape verbatim. This addition hasn't itself been clicked through in a live browser this session — same "should work, not yet verified" caveat as Users/Admin Project Overview/per-project Reports/Time Tracking (Admin/Member), even though the rest of this Dashboard was previously confirmed live.

#### Project Lead — `project-lead-dashboard.tsx`'s `ProjectLeadDashboard()`

Built from first principles, not a filtered Admin view. Every section is now real.

- **Current Project selector** — every active project this profile leads (`project_memberships.project_role = 'lead'`); switching projects refetches everything below it immediately
- **Current Delivery** hero card — Delivery Progress, Completed Tickets, **Remaining Work (Open Tickets)** (renamed from "Remaining Hours"/"Estimated Hours Remaining" for clarity; same formula, unchanged: sum of each open ticket's own `hours − logged minutes ⁄ 60`, floored at 0 per ticket, then summed for the project), Blocked Tickets — all real. **New**: all three KPIs are now independent click targets, each reusing its own already-real source of truth (never a second query/filter):
  - **Completed Tickets** / **Blocked Tickets**: 0 → not clickable; exactly 1 → opens that ticket's real Ticket Preview panel directly (never Ticket Detail); more than 1 → navigates to this project's Tickets view with the real `?alerts=done` / `?alerts=blocked` filter applied and visible (same query-state convention Tickets already uses elsewhere).
  - **Remaining Work (Open Tickets)**: "contributing" tickets are determined by the *per-ticket* remaining formula above (a ticket only counts if its own remaining is `> 0` — this can diverge from the displayed aggregate, which is floored only once at the end, not per ticket), independent of whether the KPI's own displayed value is 0. 0 contributing tickets → not clickable; exactly 1 → opens its Ticket Preview; more than 1 → navigates to Tickets filtered to the union of those tickets' own statuses. (This KPI briefly linked to Time Tracking during development — that was wrong and has been reverted; it never opens Ticket Detail or Time Tracking.)
- **Target Date** — now the project's own real `projects.target_date` (via `loadLeadProjects`), shown/edited on Project Settings' General section (see Projects below). **Fixed a real bug**: this previously showed the nearest due date among the project's own open tickets — a different, unrelated real field with a similar-looking value — never the actual Target Date column, which was already being fetched but silently discarded.
- **Attention Required** — Blocked Tickets, Due Today, Over Capacity, Awaiting Review — all real, and **all four are now actionable** (same real source of truth each KPI already used, no new queries/filters):
  - **Blocked Tickets / Due Today / Awaiting Review**: 0 → unchanged empty state (Blocked Tickets keeps its pre-existing always-clickable-to-the-unfiltered-Tickets-view behavior at 0, by design; Due Today/Awaiting Review are not clickable at 0); exactly 1 → the card stops showing a bare count and instead shows that ticket's real ID + title, plus a small contextual label (`BLOCKED TICKET` / `DUE TODAY` / `AWAITING REVIEW`, same secondary-label typography used elsewhere on this dashboard) — clicking opens its Ticket Preview panel directly; more than 1 → unchanged count-based card, now navigating with the real `?alerts=blocked` / `?alerts=due-today` / `?alerts=review` filter applied and visible (previously navigated to an unfiltered Tickets view).
  - **Over Capacity**: 0 → not clickable; exactly 1 → shows that member's name (unchanged) and opens the real Member Profile Modal via `openMemberProfile({ profileId: member.id, ... })` — the same real `profileId`-keyed mechanism `TeamCapacityRow` already uses on this same dashboard, never a name/avatar match and never `mock-team.ts`; more than 1 → unchanged, navigates to this project's Team page.
- **Team Capacity** — the real project roster with real assigned hours/utilization, sorted by utilization descending, real empty state
- **Project Work** (renamed from "My Active Work" once it stopped being scoped to just the signed-in lead) — every active ticket in the project regardless of assignee, sorted blocked-first/priority/due date
- **Recent Activity** — real, from any project member, not just the signed-in lead
- **Upcoming Deadlines** — real, from any assignee, with real overdue styling
- Quick actions: **Add Member** opens `AddTeamMemberModal` directly against the selected project (no detour through the Team page); **New Note** opens `NewNoteModal`; **New Ticket** opens `NewTicketModal` (with real Possible Duplicates) — all three reuse the exact modals/services Team/Notes/Tickets already use

#### Member — `member-dashboard.tsx`

A personal cross-project work-queue rather than a project-management view. **Now backed by real Supabase data end-to-end — confirmed working against a live Supabase project**, following the same real-load-state/Retry convention as every other real screen.

- Header: real greeting + real current date (previously the hardcoded string "Tuesday, June 30")
- 4 hero stats — Assigned Tickets, Weekly Capacity (renamed from a hardcoded "Planned Today"), Logged Today, Due Today — all real. **New**: Assigned Tickets and Due Today are now independent click targets, reusing `activeWork`/the same due-today filter already driving each KPI's own count (no second query): 0 → not clickable; exactly 1 → opens that ticket's real Ticket Preview panel directly (Due Today also swaps its bare count for that ticket's real ID + title first); more than 1 → navigates to this project's Tickets view with the real `?assignee=me` filter applied and visible (a real, URL-driven initializer added to Tickets' own existing "Assigned" filter, `tickets-screen.tsx` — previously `assigned` was FilterBar-only, never read from the URL) — Due Today additionally combines it with the existing `?alerts=due-today` filter Admin/Project Lead already use for their own "Due Today" KPIs.
- Recommended Next (hero card) — real, sorted by the same Blocked → Due Today → High Priority → In Progress → Ready to Start → In Review tiering, now driven by the real current local date instead of a fixed mock date/label set
- My Active Work — real tickets assigned to the signed-in member (excluding Done), priority-first, reuses ticket/status components
- Time Today — real, with a real per-project breakdown of today's logged time, plus Logged Today / Weekly Capacity / Remaining This Week
- Needs Your Attention — real, actionable-only events (blocked, reassigned to you, moved to review, estimate changed) sourced from `ticket_activity`; the mock "mention" category has no real source in this schema (comments aren't parsed for @mentions) and simply never populates, never fabricated
- Upcoming Work — real
- Real empty states throughout ("You're all clear," "Nothing needs your attention right now," "No time logged yet today," "Nothing else on the horizon")
- `TicketListRow` / `ActiveTicketRow` gained an optional `projectBadge` slot so multi-project rows can show which project a ticket belongs to
- `MEMBER_WORK`/`WorkItem` (the old mock array) stay defined/exported in this same file, but are now fully unused anywhere in the app — **resolved**: `member-projects-screen.tsx` ("My Projects") was later made real and no longer reads them (see Architecture Status → Projects)

Along the way, fixed a dark-mode bug where the Project Lead's and Member's hero cards (and the Admin "Hours Burn" KPI card) referenced `brand-300/400/900/950` shades that don't exist in the theme, silently falling back to the light gradient in dark mode.

### My Work

Completed.

Route: `/my-work`. Personal home screen for every team member.

Includes:

- Greeting header with user avatar
- KPI cards: Open tickets, Due today, Hours logged, Blocked
- Focus Mode toggle: collapses non-focus tickets for distraction-free view
- Active tickets list with inline status, priority, and due date
- Recent activity feed
- Ticket quick-preview panel on row click
- **Assigned Tickets KPI is a real, independent click target** — reuses `myTickets` (already backing the displayed count): 0 → not clickable; exactly 1 → opens its real Ticket Preview panel directly; more than 1 → navigates to `/tickets?assignee=me` (same filter the Admin Dashboard's own Assigned Tickets KPI already uses). The other three KPI cards are unchanged.
- **Full structural skeleton loader** (`SkeletonBlock`-built, matching the real header/KPI-grid/list layout) plus a real refresh on returning to a backgrounded browser tab, same precedent as the Dashboards/Reports/Projects list.

### Reports

Completed. Route: `/reports`, branches by role. Shared primitives (KPI card, section, status bar, progress bar) extracted into `reports-shared.tsx` so role-specific screens reuse the same building blocks without importing from each other.

#### Admin — `reports-screen.tsx`

Company-wide Delivery/Finance view. **Now backed by real Supabase data end-to-end — confirmed working against a live Supabase project.** (Also the screen the Member role sees when visiting `/reports` — the Finance tab itself stays Admin-only, gated inside the component; Project Lead gets its own separate, now also-real scoped screen — see below.)

- **Shared filters and period** — Project/Assignee/Client/Date filters plus Delivery's own Period selector (This Month/Last Month/This Quarter/Custom Range, default This Month) all combine (AND) into one filtered ticket set every KPI, table, and chip on the Delivery tab reads from a single shared fetch, rather than a separate query per widget. Filter option lists never show a real org member/project/client with zero real tickets. Delivery's Period is fully independent of Finance's own Billing Period selector below — separate state, never overwriting each other, each preserved per tab for the session.
- **Delivery tab**: real KPI row (Projects, Active Tickets, Hours Burn, Blocked, a period-adaptive "Done This Month"/"Done Last Month"/"Done This Quarter"/"Done in Range" KPI, Overdue), a real Health Alerts banner (critical/informational thresholds derived from the same real KPI numbers, never a parallel computation), Hours by Person and Project Health tables, Workload (real assigned hours — `Σ ticket.hours` on currently-assigned, non-Done tickets, deliberately period-independent — plus capacity/utilization and a real "change this week" delta from the Activity Log), Hours Distribution (real hours bucketed by ticket status), and **Tickets by Member** (real tickets grouped by real `assigneeProfileId`, excluding Done, sorted Blocked → Overdue → Priority → due date → code; a ticket belongs to a member's group when currently assigned to them and not Done, OR they logged real hours on it within Delivery's own active period; each ticket row shows that member's own real logged hours on it, each group ends with a real Total Logged sum, and the Period/Project/Assignee/Client/Status/Priority/Labels/Hours filters all combine correctly with it).
- **Finance tab** (Admin only): real KPI row (Billable/Non-Billable Hours, Utilization, Estimated Revenue), Billing Overview (real per-client weighted-average billing rate), and Billable Hours by Member (real per-member revenue) — all three cross-checked to match each other and the KPI card to the dollar/hour, computed per-project-then-summed rather than re-derived from already-rounded display values.
- **Export** — CSV/Excel/PDF for both tabs, built from the exact same in-memory state every widget already reads (no extra queries): Delivery exports 7 sections, Finance keeps every section un-mixed in CSV and in its own worksheet in Excel, and PDF preserves on-screen order. The Export menu was simplified down to only these 3 real options.
- **Header date** — the page header's date (previously the hardcoded string "Monday, June 30, 2026") is now the real current local date, updating automatically each day.
- **Member Profile Modal triggers** (Hours by Person, Workload, Recent Changes, Billable Hours by Member) now all pass a real `profileId`/`projectSlug` (see Architecture Status → Member Profile Modal) instead of resolving by name.
- **Fixed a hydration bug**: Hours Distribution's "Total" line wrapped a `SkeletonBlock` (which renders a `<div>`) inside a `<p>`, which the DOM doesn't allow — the wrapper is now a `<div>` with the same classes.
- **Full structural skeleton loaders** for both tabs (`SkeletonBlock`-built, matching the real KPI strip/tables/filters) plus a real refresh on returning to a backgrounded browser tab, same precedent as the Dashboards/Projects list.

#### Project Lead — `project-lead-reports-screen.tsx`

A purpose-built Reports screen scoped to only the Lead's own projects and team — not the Admin's company-wide view. **Now backed by real Supabase data end-to-end** — the last remaining fully-mock Reports surface, resolved by converting both its Delivery tab and (per an explicit choice to convert it fully rather than patch around it) its Team tab. Implemented and type/build-clean, not yet clicked through in a live browser — same "should work, not yet verified" caveat as Users/the Admin Project Overview.

- **Scope** — `useOrganizationProjects()` (already RLS-scoped to this profile's own led projects), `loadOrganizationTickets`/`loadOrganizationActivity` narrowed client-side to those projects' tickets, and `loadProjectTeam` per led project (merged/deduped by `profileId`, summing capacity/hours for anyone staffed on more than one).
- **Delivery tab** — real KPI row (My Projects, Team Capacity, Blocked Tickets, Due This Week, Team Utilization, Avg. Progress), Project Health and Recent Activity built from `buildProjectHealthRows`/`computeProjectProgressPct` (Admin Reports' own exported functions — never a second calculation), and a real header date, same real-date convention as Admin Reports.
- **Team tab** — real Hours by Person, Workload, Blocked Work by Member, and Team Health, all derived from the same merged per-project team stats the KPI row already computes — no second member list. All mock Team infrastructure for this screen (`TEAM`, `aggregateTeam`, `LEAD_PROJECT_SLUGS`-based aggregation, `blockedHoursOf`, `healthOf`, `BLOCKED_HOURS_BY_MEMBER`) was removed.
- **KPI navigation** — all four leading KPIs are real, independent click targets following the app's established "0 → not clickable, 1 → open the Ticket Preview panel/Member Profile Modal directly, more than 1 → navigate to a filtered Tickets/Team view" rule, each reusing its own already-real source of truth (never a second query):
  - **My Projects**: 0 → not clickable; 1 → navigates to that project's own `/projects/[slug]`; more than 1 → navigates to `/projects`.
  - **Team Capacity**: 0 over-capacity members → not clickable; exactly 1 (whether staffed on one or several led projects) → opens the real Member Profile Modal via `openMemberProfile`, with `projectSlug` included only when that member's over-capacity status resolves to a single real project; more than 1 → navigates to this screen's own Team tab with a real `?filter=over-capacity` chip applied and visible (a real, removable `FilterChip`, round-tripped through the URL).
  - **Blocked Tickets**: 0 → not clickable; 1 → opens that ticket's real Ticket Preview; more than 1 → navigates to `/tickets?alerts=blocked`.
  - **Due This Week**: 0 → not clickable; 1 → opens that ticket's real Ticket Preview; more than 1 → navigates to `/tickets?alerts=due-this-week` — required one small, additive extension to Tickets' own `?alerts=` mechanism (a new `due-this-week` pseudo-type in `tickets-screen.tsx`/`filter-bar.tsx`, using the exact same Monday–Sunday week bounds this KPI already used for its own count).
  - `KpiCard` (`reports-shared.tsx`, shared with Admin Reports) gained the same optional `disabled`/`onClick` props already used elsewhere in the app — purely additive, every other card's plain rendering is unchanged.
- No new migrations — pure application-layer query/rendering work on top of already-real tables.

### Project Reports (per-project)

Route: `/projects/[slug]/reports`, every role. A separate component (`project-reports-screen.tsx`) from both `reports-screen.tsx` (company-wide, Admin) and `project-lead-reports-screen.tsx` (Project Lead's own scoped view) above. **Now backed by real Supabase data end-to-end — implemented and type/build-clean, not yet clicked through in a live browser** (same "should work, not yet verified" caveat as Users/Admin Project Overview).

- **Project Health KPI** — reuses company-wide Reports' own real per-project risk calculation, rather than a second one. Real bug fixed here: this card previously showed the project's lifecycle status (Planning/Active/…) mislabeled as "Project Health" — it now shows a real computed health verdict instead.
- **Weekly Capacity / Assigned Hours / Team Utilization** — the exact same real per-member roster/formula Team already uses (`0%` when capacity is `0`).
- **Estimated vs Logged Hours** — Estimated = real ticket estimates summed; Logged = real time entries summed (all-time); Remaining = `max(estimated - logged, 0)`; percentage = `0` when estimated is `0`.
- **Team Workload** — real roster, with the existing empty state when the project has no active members.
- **Delivery Progress** — real ticket-status counts and completion percentage (`0%` with no tickets). The Completed/In Progress/Blocked cards now navigate contextually instead of the old, non-functional status query param (never actually read anywhere): zero matching tickets never navigates; exactly one links straight to that ticket; more than one hands off to Tickets with the matching status filter applied and visible, via the same real filter mechanism the Project Overview Health Alert banner uses. Total Tickets is unchanged — always the plain, unfiltered Tickets page.
- **Delivery Snapshot** — a real current-month reporting period (first of the month through today, displayed with the app's existing date formatting). Completed Tickets/Hours are now based on real ticket status-change history within that period, not a ticket's own last-updated timestamp, so a ticket touched by an unrelated later edit is never miscounted as "completed this month." Remaining Hours reuses the same number as the Estimated vs Logged card above.
- **Breadcrumb** — real project name, same pattern as the other real breadcrumbs.

No new database tables or columns were needed — pure application-layer query/rendering work on top of already-real `projects`/`tickets`/`ticket_activity`/`ticket_time_entries`/`project_memberships` tables.

### Settings

**Since removed, one pass later**: the whole workspace-wide Settings screen described below (General, Danger Zone) was retired outright — JIRITA is single-tenant, so this configuration isn't meant to be Admin-editable through the UI. `/settings` and `/settings/[section]` now just redirect to the Dashboard; "Settings" no longer appears in the sidebar for any role. See Architecture Status → "Removed (Settings → General & Danger Zone)" for the current, authoritative state. The rest of this entry is kept as a historical record of what was built and later removed.

Completed (at the time; see note above for current state).

Routes (historical): `/settings` (redirected to `/settings/general`) and `/settings/[section]` — down to 2 real sections (General, Danger Zone) after Projects/Time Tracking/Notifications/Integrations were each retired outright rather than left mock (see the four "Removed" entries below).

Sections:

- **General**: **now real** — Workspace Name, Active Days (day picker), Default Role, and Default Weekly Capacity read/write `organizations` directly (see Architecture Status → Settings → General for the full breakdown); Logo/Timezone/Language were removed outright (no schema, no real consumer anywhere in the app — see the audit this was based on), not just left mock
- **Removed**: Projects (`/settings/projects` — Ticket Statuses/Priorities/Ticket Types/Labels) was retired outright, not left mock — see Architecture Status → Removed (Settings → Projects) for why. `/settings/projects` no longer appears in the nav/hub and no longer statically generates; a direct visit falls through to the same "Section not found." default `SectionContent` already renders for any unrecognized slug.
- **Removed**: Time Tracking (`/settings/time-tracking` — Show Estimated Hours on Tickets, Require Estimation on New Tickets, Hour Rounding, Round Up by Default) was retired outright — those four rules are now fixed, non-configurable JIRITA product behavior instead of an Admin setting. See Architecture Status → Removed (Settings → Time Tracking) for the current fixed rules and exactly where each is enforced.
- **Removed**: Notifications (Email, desktop, and digest toggles with per-channel granularity) was retired outright — there are no configurable notification preferences in this app; see Architecture Status → Removed (Settings → Notifications) for the real global system that replaced it.
- **Removed**: Integrations (GitHub connected/3 repos, Slack and Google Calendar Connect buttons, Jira Import Coming Soon) was retired outright — integrations are a per-project concern, not org-wide; see Architecture Status → Removed (Settings → Integrations) for Project Settings' own real Repository Integration section.
- **Danger Zone**: Archive Workspace (amber) and Delete Workspace (red) actions with warning messaging

People (formerly a Settings section) is now the dedicated **Users** module — see below.

Navigation:
- Left sub-nav lists all 4 sections (Admin only — see SettingsNav); active section highlighted
- Breadcrumb: `Settings / Section Name`
- `/settings` redirects server-side to `/settings/general`
- Sidebar Settings link goes directly to `/settings/general`

---

### Users

Completed, and now backed by real Supabase data end-to-end — **implemented and build/type-checked, but not yet confirmed against a live Supabase project or in a browser** (see Architecture Status). Route: `/users`, Admin only — hidden from the sidebar for Project Lead/Member (same nav-hiding convention as Settings), and the page itself also renders an "Admins only" message if visited directly by a non-Admin.

A dedicated top-level management module, replacing the old Settings → People page. `src/lib/users.ts` is now the real data source (`loadOrganizationUsers`, reading `organization_memberships` + `profiles` plus a real `lastLogin`), replacing `mock-users.ts` entirely for this screen; `mock-team.ts`'s `TeamMember` (one row per person *per project*) remains the separate, still-relevant type used everywhere else a project member is referenced.

- **Header**: "Users" title, "Manage user accounts, access and permissions." subtitle, "+ Invite User" button
- **Filters**: Search, Role, Status, Project (multi-select dropdowns, same `FilterDropdown` component used across Tickets/Team/Time Tracking)
- **Table columns**: Avatar + Name, Email, Role, Status (Active/Invited/Disabled), Projects (count, clickable — opens the Projects tab), Weekly Capacity, Last Login (real, via the Auth Admin API), Actions
- **Row actions (⋯)**: View Profile, Edit User (real), Reset Password (real — generates a link, see below), Resend Invitation (Invited only — still mock, toast-only), Disable/Enable User (real), Delete User (confirmation modal required, still visual-only)
- **Invite User modal** (`invite-user-modal.tsx`): a pill toggle between **Send by email** (real, via the Auth Admin API) and **Generate invite link** (mints a single-use link and shows a Copy Link success view instead of closing) — both share one underlying validation/write path so they can't drift. First/Last Name, Email, Role, Weekly Capacity, Assign Projects (checkbox list). The same component also powers **Edit User** via an `editingUser` prop (pre-filled, no invite toggle, "Save Changes" — real: first/last name, role, and weekly capacity persist; the email field still doesn't)
- **Reset Password**: generates a single-use link (`reset-password-link-modal.tsx`, shared with the Member Profile Modal's Security tab below) instead of sending an email — no email is sent by this action
- **Disable/Enable User**: real — flips `organization_memberships.status` only, never touches `profiles`/`auth.users`; a disabled user's own open session is signed out immediately if they're still logged in, and a re-enabled user can log back in correctly (a real bug — stale client-side auth state surviving the disable/enable cycle — was fixed here)
- Every privileged write above (Invite, Disable/Enable, Edit, Reset Password link) goes through its own Server Action (`src/lib/server/*.ts`) using the Supabase service-role key, because `organization_memberships` has no direct `UPDATE`/`INSERT` grant for the `authenticated` role — RLS alone was never the gate, Postgres checks table privileges first — and because each write re-verifies the caller server-side (active org admin, same organization) rather than trusting the browser

The existing Member Profile Modal (`member-profile-modal.tsx`) is reused rather than building a new one — it now supports two modes: the original single-view (unchanged, still used everywhere a `TeamMember` is clicked) and a tabbed mode (Profile / Projects / Permissions / Security / Activity) that activates when opened with a `user` (org-wide `User`) instead of a `member`. In user mode:

- **Activity tab** — real, and **summarized rather than a detailed log**: reuses `ticket_activity` (`loadUserActivity`), grouping every non-milestone action on the same ticket into one "Working on `JIR-x` · N updates" entry, capped at the 10 most recent after grouping; `ticket_created` and "Joined the workspace" stay as their own entries. The old mock events ("Logged in", "Invitation email sent", "User disabled", etc.) were removed rather than kept alongside real data.
- **Security tab** — real Last Login, and a "Generate Reset Link" button (renamed from "Send Reset Email") that reuses the same link-generation flow as the Users list's Reset Password action. `browser`/`os`/`device` have no real source yet and simply don't render.
- **`src/app/accept-invite/`** — the real "set your password" landing page both invite-delivery methods (email link and generated link) resolve to.

---

### Project Notes

Completed, and now backed by real Supabase data end-to-end — **confirmed working against a live Supabase project** (see Architecture Status). Route: `/projects/[slug]/notes`. Real replacement for `src/lib/mock-notes.ts`'s hardcoded array; `mock-notes.ts` itself is kept only as a type-only module (`ProjectNote`).

- `src/lib/notes.ts` — the real data source: `loadProjectNotes` (real list, newest-updated-first), `createNote`, `updateNote`, `duplicateNote` (real "(Copy)"/"(Copy 2)"/... duplication, deduped against every title that currently exists in the project, not just what's loaded client-side), and `deleteNote`. Activity logging (create/update/delete) is handled entirely by database triggers into a new `project_note_activity` table — not yet surfaced in any UI.
- `src/components/notes-screen.tsx` — real list + search (title/body); "+ New Note" (`NewNoteModal`, now exported so the Project Lead Dashboard's Quick Actions can reuse it directly — see Dashboard above) creates a real note.
- `NoteDetailModal` (`src/components/note-detail-modal.tsx`) opened by clicking a note card:
  - **View mode**: full title, author, updated timestamp, tag badge, full body text
  - **Edit mode**: editable title, tag picker, body textarea; entered via a per-note "⋯" menu (Edit / Duplicate / Delete — **all three are now real**, previously Duplicate and Delete were visual-only stubs)
  - Save persists via `updateNote` and only returns to view mode on real success
  - Shared primitives (`TAG_OPTIONS`, `TagBadge`, `INPUT`, `FIELD_LABEL`) extracted into `notes-shared.tsx` so the modal and the notes list use identical tag styling
  - Modal animation: fade + scale-in backdrop, ESC-to-close, `overflow: hidden` on `document.body` while open
- **Tag stays local-only, deliberately unwired** — same "still mock" precedent as New Ticket's "More Options" fields: fully interactive in the UI, but no `project_notes` column exists for it and it's never sent to or read from Supabase.

---

### Member Profile Modal — Standardized Everywhere

Completed.

The existing Member Profile Modal (previously wired independently into three screens) is now the single, standard way to inspect any user across the entire application. Every avatar or member name — Dashboard widgets, Project Overview, ticket cards (Kanban/List/Calendar/Insights), Ticket Detail (assignee, comments, related tickets, PR/commit authors, file uploaders), Reports tables, and Time Tracking tables — is clickable and opens the same modal.

- `src/components/member-profile.tsx` — `MemberProfileProvider` (mounted once in `layout.tsx`), `useMemberProfile()`, and `MemberTrigger` (the shared clickable wrapper; supports a `nested` mode for avatars sitting inside another clickable element, e.g. a ticket row or card `<Link>`, so the two actions don't both fire)
- `src/components/member-profile-modal.tsx` — the modal itself, extracted from the old `team-screen.tsx`
- `resolveTeamMember()` in `src/lib/mock-team.ts` — resolves any `{name, avatar, projectSlug?}` identity to a full `TeamMember`, falling back to a synthesized minimal record for names that only exist as free text (e.g. mock PR authors), so the modal always has something to render
- Standard UX rule going forward: clicking a ticket (card, title, or ID) opens Ticket Detail; clicking a member (avatar or name) opens the Member Profile Modal
- Form controls that list member names (assignee filter dropdown, New Ticket/Ticket Detail assignee picker) are intentionally left as plain selects — those are data-entry controls, not member-viewing surfaces
- **Real metrics, per project**: Active Tickets, Assigned Hours, Utilization, and Current Workload on the card are now computed from real tickets in that project (`loadProjectTickets`) instead of the old `mock-team.ts` roster, which showed 0 for any real user not in that mock array. Weekly Capacity is intentionally left as-is (no real per-member capacity source exists yet).
- **Unassigned no longer opens a fake profile**: clicking the "Unassigned" avatar/name anywhere (Board, List, Preview, Ticket Detail) is now a plain, non-interactive label — no click, no hover state, no pointer cursor — instead of opening a Member Profile Modal for a "team member" named Unassigned. Fixed once in `MemberTrigger` itself, so it applies everywhere consistently.
- **New — real bug fixed**: the assignee avatar in `TicketListRow` (`tickets/ticket-card.tsx` — the row Member Dashboard's own "My Active Work" section, `my-work-screen.tsx`, and `project-overview.tsx` all render) opened the modal with only `name`/`avatar`, never a real `profileId`. For a member's own active-work list (assignee = the signed-in member), this fell through to `resolveTeamMember`'s name-matching against the mock roster, found no match, and synthesized an `unknown-*` profile showing 0 Active Tickets/Assigned Hours/Utilization even though the real ticket was right there. Now passes `profileId={ticket.assigneeProfileId ?? undefined}` (already real, already on every `Ticket`) — same real `profileId`-keyed fetch path every other confirmed-real trigger already uses, no new query.
- **New — real bug fixed**: opening a ticket from *inside* the Member Profile Modal (its own local ticket preview, `selectedTicket` state) and clicking "Expand" navigated to the real Ticket Detail page underneath, but left both the inner ticket preview and the Member Profile Modal itself open on top of it — `MemberProfileProvider` is mounted above the router's own `children` (root `layout.tsx`), so it survives client-side navigation unless explicitly closed. Its inner `TicketPreviewPanel` now passes `onBeforeNavigate={() => { setSelectedTicket(null); handleClose(); }}` — both already-existing local close mechanisms, no new state, no change to any other `TicketPreviewPanel` render site (Tickets board, Ticket Detail's own related-ticket preview, etc.).

---

### Authentication & Profile

Completed, and backed by real Supabase Auth end-to-end (confirmed working against a live project — not just implemented). Routes: `/login`, `/forgot-password`, `/reset-password`, `/change-password`, `/profile`.

Gated by `AuthGuard` (`src/components/auth-guard.tsx`), which redirects every `AppShell`-wrapped route to `/login` when no real Supabase session exists, and shows a dedicated `MembershipErrorScreen` (not the app shell) if a signed-in user has no organization membership in production.

- **Login** (`login-screen.tsx`): email/password form with inline validation and "Remember me", authenticating via `src/lib/auth.ts`'s `login()` (`supabase.auth.signInWithPassword`). The old "Use demo account" shortcut/mock credentials box is gone — there's no seeded demo account against the real backend.
- **Logout**: `src/lib/auth.ts`'s `logout()` (`supabase.auth.signOut`), wired from the account menu.
- **Forgot Password** (`forgot-password-screen.tsx`) → **Reset Password** (`reset-password-screen.tsx`): real `supabase.auth.resetPasswordForEmail()` / `updateUser()`, still always resolves successfully on the request step (mirrors a real backend never revealing whether an email has an account); the reset screen includes a live password-strength meter.
- **Change Password** (`change-password-screen.tsx`): real current-password verification via `src/lib/auth.ts`'s `changePassword()` — re-authenticates with `signInWithPassword` against the real signed-in user's email (never a manual string comparison), then calls `supabase.auth.updateUser()`. Reachable from the Profile page's Security section.
- **Profile** (`profile-screen.tsx`): Profile Information (name, email — read-only, role — read-only, weekly capacity) all load from and save to the real `profiles` + `organization_memberships` rows (`src/lib/membership.ts`); Preferences (Theme, Default Ticket View) unchanged/local; Account (Member Since, Last Login) now reflects real Supabase data; Security (Change Password link).
- **Avatar**: click-to-upload or drag & drop on the Profile avatar (`AvatarPicker` in `profile-screen.tsx`) — validates type/size, center-crops and resizes to a square JPEG via Canvas, uploads to the `avatars` Supabase Storage bucket (`src/lib/avatar-upload.ts`), and saves the storage *path* (never a URL) to `profiles.avatar_url`. Sidebar and Header pick up the new photo automatically via the shared `CurrentUserProvider` context — no per-component wiring needed.
- **Dev-only fallback**: if no real profile/membership exists (or the lookup errors), and only outside a production build, the app falls back to the old mock identity so local dev isn't blocked — visibly flagged with a "Dev fallback" badge in the header. Never engages in production.
- Shared building blocks in `src/components/auth/` (`AuthCard`, `AuthTextField`, `AuthPasswordField`, `AuthSubmitButton`, `PasswordStrengthMeter`) so all auth screens share identical field/button styling.

See Architecture Status for the full list of applied migrations.

---

# In Progress

Nothing currently in progress. Auth/profile/avatar, Projects (Sidebar, `/projects`, per-project Settings — now without a "Project Lead" field, see Current Sprint → Completed → Projects → Project Settings), Tickets (five list views with real filtering, New Ticket, full Ticket Detail, Related Tickets, the editable Quick Ticket Preview, real write-path error handling, a real URL-persisted status/alert filter, the Backlog creation default, and inline Description editing), Team (roster, project-scoped Lead/Member role, Make Project Lead, Add/Remove Member, Work History), Project Notes (list, search, create, edit, Duplicate, delete), the Admin + Project Lead + Member Dashboards, and company-wide Reports (Admin role, Delivery and Finance tabs) backend integration are all done and confirmed working against a live Supabase project — see Current Sprint → Completed → Authentication & Profile / Projects / Project Settings / Tickets / Team / Project Notes / Dashboard / Reports. The **Admin** Project Overview (including its new Project Activity history page), per-project Reports (see Current Sprint → Completed → Project Overview / Project Reports), Time Tracking for the Admin/Member roles (real KPIs/filters/Timesheets/Billing by Client, plus the "Missing Hours" rename and its own Member Profile Modal trigger fixes — see Current Sprint → Completed → Hours & Time Tracking), and the Dashboard's new "View all activity →" action and org-wide Activity History page (see Current Sprint → Completed → Dashboard) are also now implemented and build/type-checked, along with Users backend integration (see Current Sprint → Completed → Users) — all of these still need to be exercised against a live Supabase project and clicked through in a browser before they can be called confirmed; that verification pass is the immediate next step, ahead of any new feature. After that, the next candidate is one of the remaining mock-to-real seams — see Next Recommended Feature. The Unfuddle → Jirita import is specified (`docs/UNFUDDLE_IMPORT_SPECIFICATION.md`) but no importer code exists yet.

---

# Not Implemented

The following features are documented as planned but do not exist in the codebase yet.

### Authentication

- Register / Sign Up screen (no self-service account creation — accounts are provisioned directly in Supabase; see `docs/UNFUDDLE_IMPORT_SPECIFICATION.md` for the eventual bulk-provisioning path)

Login, Logout, Forgot Password, Reset Password, Change Password, and real server-verified session persistence (a real Supabase session, not a mock `localStorage` flag) are implemented — see Current Sprint → Completed → Authentication & Profile. Invitations (inviting a new user to an organization, by email or by generated link) are also implemented, from `/users` — see Current Sprint → Completed → Users — though like the rest of that module, not yet confirmed against a live project.

### Sidebar Navigation

No known dead links remain. Milestones was removed from the UI entirely for MVP. Per-project Notes, Team, and Reports are real, functional routes (`/projects/[slug]/notes`, `/team`, `/reports`), gated per role via `nav-config.ts` rather than hardcoded. Team and Project Notes are now both backed by real Supabase data — see Current Sprint → Completed → Team / Project Notes.

All top-level navigation items (Dashboard, My Work, Projects, Reports, Settings) are functional, and each renders a role-specific screen where applicable (Dashboard, Projects, Reports).

---

# Next Recommended Feature

First priority: confirm Users, the **Admin** Project Overview (including its new Project Activity history page), per-project Reports, Time Tracking for the Admin/Member roles, and the Dashboard's new org-wide Activity History page against a real, live Supabase project (click through each in a browser) — all of these are implemented and type-checked but unverified, see Current Sprint → Completed → Users / Project Overview / Project Reports / Hours & Time Tracking / Dashboard and Architecture Status. (Team carried the same caveat as of an earlier update; it has since been confirmed live, along with Project Notes, all three Dashboards, and company-wide Reports.)

After that, continue the Supabase backend work already underway, following the same pattern established for profiles/organization_memberships, Projects, Tickets, Team, Project Notes, the Dashboards, Reports, the Admin Project Overview, per-project Reports, and Time Tracking (real query + minimum-privilege grants/Server Actions + RLS, with a dev-only mock fallback until fully connected). (Authentication, Ticket editing, Tickets' filters/Related Tickets/editable Preview, real write-path error handling, Team, Project Notes, all three Dashboards, company-wide Reports, the Admin Project Overview, per-project Reports, and Time Tracking (Admin/Member), previously recommended here, are now all complete — only their live-verification passes remain.)

The natural next mock-to-real seams:

- **Resolved**: the Project Lead's and Member's own Project Overview (`project-lead-project-overview.tsx`/`project-overview.tsx`) are now real too, reusing the **Admin** variant's own data loading/building blocks (see Architecture Status → Project Overview)
- **Resolved**: the Project Lead's own scoped Reports view (`project-lead-reports-screen.tsx`) is now real too, both its Delivery and Team tabs, scoped to exactly this profile's led projects and reusing Admin Reports' own health/progress calculations rather than a second implementation (see Reports → Project Lead)
- **Resolved**: the Project Lead's own scoped Time Tracking view (`project-lead-time-tracking-screen.tsx`) is now real too, scoped to exactly this profile's led projects and reusing the Admin/Member `time-tracking-screen.tsx`'s own real calculations/loaders rather than a second implementation (see Hours & Time Tracking → Project Lead)
- **Resolved**: `member-projects-screen.tsx` ("My Projects") is now real — no longer reads `MEMBER_WORK`, and now surfaces a project's lead via Team's real `project_memberships.project_role` (via `loadProjectTeam`), not `ProjectSummary.owner`/`owner_profile_id` (see Architecture Status → Projects)
- **Resolved, differently than planned**: the workspace-wide Settings screen (`/settings/*`) was retired outright rather than made real — JIRITA is single-tenant, so that configuration isn't meant to be Admin-editable through the UI (see Architecture Status → Removed (Settings → General & Danger Zone))

See Architecture Status.

---

# Planned Features

## Project Management

- Backlog
- Sprint Planning
- Releases

Milestones, Versions, and Components were evaluated and explicitly decided against as first-class Jirita entities — see `docs/SUPABASE_MVP_SCHEMA.md` and `docs/UNFUDDLE_IMPORT_SPECIFICATION.md` for the reasoning. Milestone-equivalent grouping stays a free-text field on tickets, not a table.

## Collaboration

- Comments (editable)
- Mentions
- Real-time Activity Timeline

A real, global in-app Notifications system (header bell + dropdown + `/notifications` page) has since shipped — event-driven (ticket assignment/status change, comments, project membership), refreshed on demand rather than via Supabase Realtime — so it's no longer merely planned; see Architecture Status → Removed (Settings → Notifications) for the full detail. Real-time delivery and Mentions remain unimplemented.

## Reporting

- Velocity
- Burndown
- Cycle Time

## Administration

- Teams
- Roles
- Permissions

---

# Architecture Status

Current architecture follows a frontend-first approach. Nearly every screen is now real — Auth/Profile, Projects (Sidebar/`/projects`/per-project Settings, including Repository Integration + real GitHub OAuth, and Member's "My Projects"), Tickets (including Ticket Detail's real Development section and its real loading skeleton), Team, Project Notes, the Admin/Project Lead/Member Dashboards (including their project scope selectors), company-wide Reports (Admin role), Project Overview (all three roles), per-project Reports, Time Tracking (Admin/Member/Project Lead), My Work (Member), ticket-assignment restriction, Users, global Search, and a global in-app Notifications system. The workspace-wide Settings screen (`/settings/*` — General, Danger Zone) was retired outright rather than left mock: JIRITA is single-tenant, so those settings aren't meant to be Admin-editable through the UI; `/settings` and every subroute now just redirect to the Dashboard, and per-project Settings is unaffected. Auth/Profile through company-wide Reports (Admin) are confirmed live; everything from the Admin Project Overview onward in the list above is implemented and type/build-clean but not yet clicked through in a live browser — see the detailed breakdown below.

Current stack:

- Next.js 16.2.9
- React 19
- TypeScript
- TailwindCSS v4
- `@supabase/supabase-js` — used by `src/lib/auth.ts`, `src/lib/membership.ts`, `src/lib/avatar-upload.ts`, `src/lib/projects.ts`, `src/lib/tickets.ts`, `src/lib/notes.ts`, `src/lib/users.ts`, and `src/lib/search.ts`, plus the service-role admin client each file under `src/lib/server/*.ts` builds for its own Server Action

Not installed:

- shadcn/ui (referenced in earlier documentation but not present in `package.json`)

Current data source:

- **Real Supabase, confirmed live**: authentication/session, `profiles`, `organization_memberships`, `organizations`, the `avatars` Storage bucket, `projects`, `clients`, `tickets`, `ticket_comments`, `ticket_activity`, `labels`, `ticket_attachments` (+ Storage bucket), `ticket_time_entries`, `ticket_relations`, `project_memberships` (roster, `project_role`, Add/Remove Member, auto-membership trigger, history guard, Work History RPCs), `project_notes`, `project_note_activity` (written by triggers, not yet read by any UI). Covers the Sidebar, `/projects` (all roles), `/projects/[slug]/settings`, `/projects/[slug]/team` + Work History, `/projects/[slug]/notes`, all five Ticket list views + New Ticket + Ticket Detail + Related Tickets + editable Quick Ticket Preview, all three Dashboards, and company-wide Reports (Admin role).
- **Real Supabase, implemented but not yet confirmed live** (should work, not yet clicked through in a browser): Users (the write side of `organization_memberships` via Server Actions), the **Admin** Project Overview and its paginated Activity history page, per-project Reports (all roles), Time Tracking (Admin/Member/Project Lead), the Dashboard's org-wide Activity History page, the Project Lead's and Member's own Project Overview, all three Dashboards' `?project=` scope selectors, the Project Lead Dashboard's Current Delivery/Attention Required KPI click-throughs and its Target Date fix, Project Settings' new Target Date field, My Work (Member, including its own KPI click-through and skeleton loader), ticket-assignment restriction to a project's own active members, Member's own `/projects` ("My Projects"), global Search, the Project Lead's own scoped Reports (Delivery + Team, including its KPI click-throughs), the `/projects` list's own Project Lead KPI band (Blocked Tickets/Due This Week/Over Capacity), and Admin Reports'/Time Tracking's remaining Member Profile Modal trigger fixes, skeleton loaders, and tab-regain refresh.
- **Mock data**: only the rest of `/settings/*` remains. `project-lead-reports-screen.tsx` no longer reads any mock arrays — its former `MY_ACTIVE`/`RECENT_ACTIVITY`/`PROJECT_TICKETS`/`aggregateTeam`/`LEAD_PROJECT_SLUGS`-based Team aggregation are all gone from this screen; `MY_ACTIVE`/`RECENT_ACTIVITY`/`PROJECT_TICKETS`/`aggregateTeam` themselves still exist as module-level exports in `dashboard-shared.tsx`/`project-lead-dashboard.tsx` (unread by anything now, dead code, not removed as part of this pass). `src/lib/mock-time-tracking.ts` is now a type-only module (`TimePeriod`/`CustomRange`/`TimesheetStatus`, `periodDisplayLabel`) — no screen reads its data arrays anymore. `mock-tickets.ts`/`mock-team.ts`/`mock-notes.ts`/`mock-projects.ts` are kept only as type-only modules or a dev-only fallback (no real organization/membership), never a data source in production.

The detailed, per-feature breakdown of what's connected and how — every Server Action, migration, and real bug fixed along the way — lives below, organized the same way this section's summary is: confirmed-live features first, then implemented-but-unverified ones, then what's still mock.

Backend integration, connected and confirmed working:

- `src/lib/supabase-client.ts` — the lazy Supabase browser client, now imported by `auth.ts`/`membership.ts`/`avatar-upload.ts`/`projects.ts`/`tickets.ts`/`notes.ts`
- `src/lib/auth.ts` — login, logout, session (`onAuthStateChange`), forgot/reset password, and change password (verified via re-authentication, never a manual password comparison)
- `src/lib/membership.ts` — loads a signed-in user's `profiles` + active `organization_memberships` + `organizations` row, and writes real updates (name, weekly capacity via a security-definer RPC, avatar path)
- `src/lib/avatar-upload.ts` — client-side validate/resize (Canvas, no new dependency)/upload to Supabase Storage
- `src/components/current-user-provider.tsx` / `src/components/auth-guard.tsx` — real membership drives `CurrentUser` and route gating, with a dev-only mock fallback (never in production) so local dev isn't blocked on seeded data
- `src/lib/projects.ts` — all real Projects reads/writes: `loadOrganizationProjects` (org-scoped list, RLS decides who sees what — no client-side role filtering), `createProject`/`updateProject` (Projects list Create/Edit modal: name + description), `archiveProject`/`restoreProject` (status only), `loadProjectDetail`/`updateProjectSettings` (Project Settings' General/Billing fields — status writes here structurally exclude `"archived"`; its optional `ownerProfileId` field still exists but nothing calls it with that key anymore, see Project Settings above), `loadOrganizationClients`/`createOrganizationClient` (Billing → Client roster)
- `src/components/organization-projects-provider.tsx` — `OrganizationProjectsProvider`, mounted in `layout.tsx` next to `CurrentUserProvider`; Sidebar, `/projects`, and the Project Settings breadcrumb all read the same fetched list, so any write anywhere refetches once and every surface updates together. Dev-only mock fallback, same convention as `CurrentUserProvider`.
- `src/components/create-project-modal.tsx` / `archive-project-modal.tsx` / `add-client-modal.tsx` — Create/Edit Project, Archive confirmation (reused unchanged by Project Settings' Danger Zone), and the minimal "+ Add new client" flow, respectively
- `src/lib/tickets.ts` — all real Tickets reads/writes: `loadProjectTickets` (all five list views, scoped by `project_id`, RLS decides visibility same as Projects), `loadTicketByCode` (Ticket Detail's data source, resolved by the visible ticket code — never the internal uuid, which stays database-only), `createTicket` (New Ticket modal: title/description/acceptance criteria/estimated hours/assignee persist; "More Options" fields still write fixed defaults), `updateTicket` (every Ticket Detail *and* Quick Ticket Preview inline edit), `loadTicketComments`/`createTicketComment`, `loadTicketActivity` (turns trigger-logged rows into the existing Activity UI shape), `loadOrganizationLabels`/`createOrganizationLabel`, `loadTicketAttachments`/`uploadTicketAttachment`/`downloadTicketAttachment`/`getTicketAttachmentPreviewUrl`/`renameTicketAttachment`/`deleteTicketAttachment` (all real — Storage + metadata row), `loadTicketTimeEntries`/`logTicketTime` (minutes as the canonical unit), `loadTicketRelations`/`createTicketRelation`/`deleteTicketRelation` (Related Tickets)
- `src/components/tickets-screen.tsx` — real, combined filtering: free-text search, Assigned/Priority/Status dropdowns, the 5 quick-filter chips, and the "Add Filter" menu (Labels/Due Date/Reporter/Created Date/Updated Date) all AND together into one `filteredTickets` shared by every view and the header counters — no per-view duplication. "Mine"/Reporter match the real `profiles.id` exposed as `userId` on `useCurrentUser()`, never the display name.
- `src/components/tickets/ticket-preview-panel.tsx` — editable (Title/Status/Priority/Assignee/Estimated/Due Date/Labels) when opened with an `editable` prop; only `tickets-screen.tsx` passes it today, every other call site stays read-only unchanged. Uses the same `updateTicket()` Ticket Detail itself uses.
- `src/components/member-profile-modal.tsx` — the per-project Member card's Active Tickets/Assigned Hours/Utilization/Workload are computed from real tickets in that project instead of the old mock team roster.
- Related Tickets is real: a single `ticket_relations` row per relation (3 canonical kinds), with the inverse relation and duplicate-prevention both derived from that one row rather than kept in sync across two.
- Ticket priority is a 4-value scale (`highest`/`high`/`medium`/`low`) — the database enum was migrated in place (existing `normal` rows moved to `medium`) and the old value dropped, not left as a permanent alias.
- A shared `ErrorToast` (`src/components/tickets/ticket-ui.tsx`) now surfaces every Ticket write failure that previously only hit `console.warn`; failed inline edits roll back to their pre-edit value instead of leaving an unpersisted change on screen.
- `src/app/projects/[slug]/tickets/[ticketCode]/page.tsx` (renamed from `[ticketId]`) + `src/components/tickets/ticket-detail-screen.tsx` — the visible ticket code is now the only thing that ever appears in a ticket URL, fixing a real bug where the route navigated on the internal uuid
- Activity Log is real and driven almost entirely by database triggers, so ticket creation, field changes, attachment uploads/renames/deletes, time entries, and related-ticket add/remove are all logged automatically with the real authenticated actor — no existing write path had to change to get this
- Applied migrations, in order: `20260708000000_mvp_schema.sql` (base schema + RLS), `20260708010000_grant_authenticated_membership_read.sql` (SELECT grants — RLS alone doesn't grant table privileges), `20260709000000_profile_self_service_updates.sql` (self-service name/capacity writes), `20260710000000_avatars_storage.sql` + `20260711000000_fix_avatars_storage_policies.sql` (the `avatars` bucket and its RLS policies — first pass had a policy bug blocking uploads, fixed in the second file), `20260712000000_grant_authenticated_projects_read.sql`, `20260713000000_grant_authenticated_projects_insert.sql`, `20260714000000_fix_projects_select_rls_self_reference.sql` (real bug fix — `projects_select`'s helper function re-queried `projects` from within its own policy, which broke `INSERT`/`UPDATE ... RETURNING` specifically because Postgres evaluates the RETURNING-time SELECT check against the row being written in the same command and that self-reference doesn't reliably see it yet; rewritten to check the row's own columns directly), `20260715000000_grant_authenticated_projects_update.sql`, `20260716000000_add_clients_table.sql` (new `clients` table — not a foreign key on `projects`; `client_name` stays free text), `20260717000000_grant_authenticated_tickets_read.sql`, `20260718000000_grant_authenticated_tickets_insert.sql`, `20260719000000_fix_tickets_insert_rls_admin_lead.sql` (real bug fix — the base schema's ticket-related insert policies only allowed a real `project_memberships` row, but that table is still empty since no staffing UI exists yet, so every insert was blocked for everyone; fixed by also allowing an org admin/lead), `20260720000000_grant_authenticated_ticket_comments_activity_read.sql`, `20260721000000_grant_authenticated_tickets_update.sql`, `20260722000000_add_labels_table.sql`, `20260723000000_add_tickets_acceptance_criteria_done.sql` (parallel `boolean[]` aligned by index with `acceptance_criteria`), `20260724000000_add_ticket_attachments.sql` (private `ticket-attachments` Storage bucket), `20260725000000_fix_ticket_attachments_storage_insert_policy.sql` (real bug fix — an unqualified `storage.foldername(name)` reference silently resolved to the *project's* `name` column instead of the uploaded object's own path, blocking every real upload until qualified as `objects.name`), `20260726000000_add_ticket_time_entries.sql`, `20260727000000_enable_real_ticket_comments.sql` (fixes the same `project_memberships`-only gap for comments, adds the first Activity-logging trigger), `20260728000000_real_ticket_activity_log.sql` (`tickets.created_by`, and the creation/field-change/attachment/time-entry Activity triggers), `20260729000000_add_ticket_attachments_rename.sql` (RLS UPDATE policy, column-scoped to `filename` only), `20260730000000_add_ticket_attachments_delete.sql` (RLS DELETE policy on the metadata table and the Storage bucket — no delete permission existed anywhere before this), `20260731000000_log_attachment_rename_delete_activity.sql` (the matching Activity triggers), `20260801000000_unify_ticket_priority_scale.sql` (swaps the `ticket_priority` enum from `high`/`normal`/`low` to `highest`/`high`/`medium`/`low`, migrating existing `normal` rows to `medium` in the same step and dropping the old enum type), `20260802000000_add_ticket_relations.sql` (the `ticket_relations` table, its RLS policies, and the relation-added/removed Activity triggers). See `docs/SUPABASE_SETUP.md` for how to apply migrations to a new project.
- `docs/UNFUDDLE_IMPORT_SPECIFICATION.md` — how the Techtivo Unfuddle backup will map onto the schema; no importer code exists yet
- `src/lib/projects.ts` — `loadProjectTeam` (real roster: name/email/avatar/real-org-role-title/weekly capacity, falling back to the member's real org-level weekly capacity when the project-level value is unset, never overriding an explicit 0), `addProjectMember`/`removeProjectMember`/`hasProjectMemberHistory` (the real Team roster-write functions), `setProjectLead` (Make Project Lead — clears any existing lead first, since only one is allowed per project), `loadLeadProjects` (the Project Lead Dashboard's real Current Project list, by `project_role = 'lead'`), `loadOrganizationWorkloadMembers` (Admin Dashboard Team Workload)
- `src/components/team-screen.tsx`, `add-team-member-modal.tsx`, `work-history-screen.tsx`, `member-profile-modal.tsx` (project-mode `MemberMenu`) — the real Team screen, its Add Member picker, the dedicated server-side-paginated Work History page, Remove from Project (DB-enforced history guard), and Make Project Lead
- `src/lib/tickets.ts` — `loadUserActivity` (the Users Activity tab's grouped feed), `loadProjectMemberWorkHistorySummary`/`loadProjectMemberWorkHistoryPage` (the two Work History RPC wrappers), `loadOrganizationTickets`/`loadOrganizationLoggedMinutes`/`loadOrganizationActivity` (the org-wide loaders the Admin Dashboard uses, and — scoped to one project — the Project Lead Dashboard reuses for the same widgets)
- A database trigger (`ensure_project_membership`) auto-creates `project_memberships` rows on real contribution (create/edit/comment/log time/upload/link a ticket); a separate `BEFORE DELETE` trigger blocks removing a member with real history at the database level, independent of the UI
- `src/lib/notes.ts` — the real Project Notes module: `loadProjectNotes`/`createNote`/`updateNote`/`duplicateNote`/`deleteNote`, all against `project_notes`; activity (create/update/delete) is logged entirely by database triggers into `project_note_activity`, not yet read by any UI
- `src/components/notes-screen.tsx`/`note-detail-modal.tsx` — real list/search/create/edit/Duplicate/Delete; the Tag field stays local-only, no column exists for it
- `src/components/dashboard-screen.tsx`'s `AdminDashboard()`, `src/components/project-lead-dashboard.tsx`'s `ProjectLeadDashboard()`, and `src/components/member-dashboard.tsx`'s `MemberDashboard()` — every KPI/list/quick-action on all three is now real (see Current Sprint → Completed → Dashboard for the full per-widget breakdown); no new tables were needed, just the loaders above reused/extended
- Migrations, in order (all confirmed against the live project): `20260803000000_add_project_creator_membership.sql`, `20260804000000_grant_authenticated_project_memberships_read.sql`, `20260807000000_grant_authenticated_project_memberships_write.sql`, `20260808000000_auto_project_membership_on_contribution.sql` (`ensure_project_membership` + backfill), `20260809000000_project_membership_history_guard.sql` (the delete guard above), `20260810000000_project_member_work_history_pagination.sql` (the three Work History RPCs), `20260811000000_add_project_notes.sql` (`project_notes` + `project_note_activity`, RLS, and the three logging triggers), `20260812000000_add_project_membership_project_role.sql` (the `project_role` column/constraint/unique-index described above), `20260813000000_restore_project_memberships_after_project_role.sql` + `20260814000000_restore_manually_added_project_membership.sql` (corrective — see Current Sprint → Completed → Team for what happened and how it was repaired)
- `src/lib/tickets.ts` — the Member Dashboard's own reads: `loadProfileLoggedTimeForDate`/`loadProfileLoggedMinutesForRange` (real logged time for one profile, today and over a date range, across every ticket they have access to — not just their own assignments), `loadMemberAttentionEvents` (the real "Needs Your Attention" feed, derived from `ticket_activity`); plus Reports' own reads: `loadOrganizationLoggedTimeForRange`/`loadHoursAndAssigneeActivityForRange`/`loadDeliveryActivityForTickets` (real per-person logged time, weekly hours/assignee-change deltas, and delivery-relevant activity for Hours by Person/Workload/Recent Changes), and `STATUS_FROM_DB`/`formatRelativeTime` (exported for reuse by Reports' Recent Changes)
- `src/lib/projects.ts` — `loadMemberWeeklyCapacity` (a member's real weekly capacity, same org-then-project fallback as `loadProjectTeam`, used by the Member Dashboard) and `loadOrganizationMemberWeeklyCapacities` (the same fallback batched for every org member — Reports' Hours by Person Capacity column)
- `src/components/reports-screen.tsx`'s `AdminReportsScreen()` — every KPI/table/filter/alert/export on both the Delivery and Finance tabs is now real (see Current Sprint → Completed → Reports for the full per-widget breakdown); no new tables were needed
- No new migrations for either the Member Dashboard or company-wide Reports — both are pure application-layer query/rendering work on top of already-real tables

Backend integration, implemented and type-checked, **not yet confirmed against a live Supabase project or in a browser** (Users, the Admin Project Overview, per-project Reports, Time Tracking (Admin/Member), and the Dashboard's new Activity History page):

- `src/lib/users.ts` — `loadOrganizationUsers` (real roster + a real `lastLogin` via the Auth Admin API), `disableOrganizationMember`/`enableOrganizationMember`/`editOrganizationMember`/`inviteOrganizationUser`/`generateOrganizationInviteLink`/`generatePasswordResetLink` — every one of these delegates to its own Server Action rather than writing directly, since `organization_memberships` has no `UPDATE`/`INSERT` grant for `authenticated` at all
- `src/lib/server/invite-user-action.ts`, `disable-user-action.ts`, `edit-user-action.ts`, `last-sign-in-action.ts` — the Server Actions themselves: each builds a caller-authenticated client (identity/authorization check under real RLS) and a service-role client (the actual privileged write, only reached after authorization passes)
- `src/components/invite-user-modal.tsx`, `reset-password-link-modal.tsx`, `accept-invite-screen.tsx` — the email-vs-link invite choice, the shared "link generated" success modal, and the "set your password" landing page both invite methods resolve to
- No migrations pending for the Users list above — `20260805000000_accept_own_invitation_rpc.sql` and `20260806000000_grant_service_role_public_schema.sql` (both back the flows above) are pre-existing and already confirmed applied via the login/logout work.
- `src/components/admin-project-overview.tsx` — the real **Admin** Project Overview: reuses `loadProjectDetail`/`loadProjectTickets`/`loadProjectTeam`/`loadOrganizationLoggedTimeForRange`/`loadOrganizationActivity` (all already-confirmed-live functions) plus company-wide Reports' own exported real health/KPI-alert functions (`buildDeliveryStatusItems`/`buildDeliveryKpiSummary`/`buildHoursByPersonRows`/`buildProjectHealthRows`, no second calculation), scoped to one project. Added `ProjectDetail.createdAt`/`createdAtISO` (an existing `projects.created_at` column, no schema change) and a real project-name breadcrumb.
- `src/components/project-activity-history-screen.tsx` + `src/app/projects/[slug]/activity/page.tsx` — the new dedicated, real, server-side-paginated (`?page=`, 20/page) Project Activity history page, reusing the same activity-label-building function Ticket Detail's own Activity Log already uses, resolved across every ticket in the project via a new `loadProjectActivityPage` (`.range()` + `{count:"exact"}`, no new migration)
- `src/components/project-reports-screen.tsx` — the real per-project Reports screen: reuses `loadProjectDetail`/`loadProjectTickets`/`loadProjectTeam`/`loadOrganizationLoggedTimeForRange` and company-wide Reports' own `buildProjectHealthRows`, plus a new `loadTicketsCompletedInRange` (mirroring the shape of the already-real `loadHoursAndAssigneeActivityForRange`) for the Delivery Snapshot's real current-month, status-activity-based "completed this period" signal
- `src/components/tickets-screen.tsx` + `src/components/tickets/filter-bar.tsx` — the real, URL-persisted status/alert filter (`?alerts=...`) shared by the Admin Project Overview's Health Alert banner and per-project Reports' Delivery Progress cards; rendered as real, removable filter chips reusing the app's own existing `STATUS_LABEL` map for the label
- `src/components/time-tracking-screen.tsx` — the real Admin/Member Time Tracking screen: reuses `loadOrganizationUsers` (active members), `loadOrganizationTickets`/`loadOrganizationProjects`, `loadOrganizationMemberWeeklyCapacities` (the same Team/Reports capacity fallback), and `loadOrganizationLoggedTimeForRange` (fetched for four fixed ranges up front, plus Custom Range on demand) for its data; `buildFinanceKpiSummary`/`buildBillingOverviewRows`/`buildBillableHoursByMemberRows` were exported from `reports-screen.tsx` (previously module-local) so Billable/Non-Billable Hours, Projected Billing, Billing by Client, and the Timesheets table's own Billable/Non-Billable columns reuse Finance's billing calculation exactly, never a second one. Capacity-based figures (Missing Hours — renamed from "Hours Missing," then "Members Missing Hours," Weekly Utilization, Capacity %, Status) are computed from a separate, Billing-filter-independent ticket scope (`capacityTicketIds`) than the Finance-reused figures (`billingTicketIds`), so the Billing filter structurally cannot affect them. Filters (Member/Project/Client/Billing/Date Range) are real and round-tripped through the URL, same `?alerts=`-style precedent as Tickets — `app/time-tracking/page.tsx` gained the same `<Suspense>` wrapper that requires. The Timesheets table's and this panel's Member Profile Modal triggers now pass a real `profileId`/`projectSlug` too (see Confirmed working → Member Profile Modal).
- `src/components/organization-activity-history-screen.tsx` + `src/app/activity/page.tsx` — the new, org-wide sibling of `project-activity-history-screen.tsx`, backed by a new `loadOrganizationActivityPage` in `lib/tickets.ts` that mirrors `loadProjectActivityPage`'s query/pagination shape verbatim (same `buildActivityLabel`, same real `?page=`/20-per-page pagination), resolved across every project in the organization instead of one, with each entry additionally carrying its own project name/slug. Backs the Admin Dashboard's new "View all activity →" action (shown only when `loadOrganizationActivity`'s own 11-event probe detects a real 11th event past the 10 displayed). Not added to the Sidebar's main nav — reached only via that Dashboard link, same "link-only" precedent as Work History.
- No new migrations for any of this — pure application-layer query/rendering work on top of already-real tables

## Confirmed working (login/logout, profile, avatar, change password)

- `src/lib/auth.ts` — real login/logout/session (`login`, `logout`,
  `onAuthStateChange`, `requestPasswordReset`, `confirmPasswordReset`) and
  real Change Password (`changePassword`): verifies the current password by
  re-authenticating with `signInWithPassword` (never a manual string
  comparison), then calls `supabase.auth.updateUser()`. `mock-auth.ts` no
  longer has any login/session/change-password logic — it only holds
  `AuthError` and the shared password-strength helpers.
- `src/lib/membership.ts` — loads the signed-in user's `profiles` row +
  active `organization_memberships` row + `organizations` row
  (`loadMembership`), and writes real updates: `updateProfileNames`
  (first/last name), `updateOwnWeeklyCapacity` (via a security-definer RPC,
  since org role/status stay admin-managed), `updateProfileAvatarPath`
  (stores a Storage *path*, never a URL — `resolveAvatarUrl` turns it back
  into a public URL for display, with `updated_at` as a cache-busting
  query param).
- `src/lib/avatar-upload.ts` — validates (JPG/PNG/WEBP, ≤8MB), center-crops
  and resizes to a 320×320 JPEG via Canvas (no new dependency), uploads to
  the `avatars` Supabase Storage bucket at `<uid>/avatar.jpg` (upsert).
- `src/components/current-user-provider.tsx` — `CurrentUser` (role,
  name, avatar, weekly capacity, etc.) now comes from the real membership
  when one exists, refetched after every save so Sidebar/Header/Profile
  stay in sync. The old dev-only mock fallback is gone entirely — a
  real signed-in session with no active membership (or a lookup error)
  never renders a fake role/name/avatar in any environment, including
  local dev (`isDevFallback` is now hard-coded `false`; the "Dev fallback"
  badge and `RoleSwitcher` in the header are unreachable dead code, kept
  as-is rather than deleted). Two real-time behaviors on top of the
  original load: (1) if the signed-in user's membership ever resolves to
  "no-membership" — most notably an admin disabling this exact user while
  their tab is still open — the provider signs them out immediately
  (`logout()`), which flips `status` to `"unauthenticated"` and lets
  `AuthGuard`'s existing redirect-to-`/login` effect take over; a first-
  ever "no-membership" (never invited) still renders `MembershipErrorScreen`
  the same way, just no longer ever masked by mock data. (2) the still-open
  session's membership is silently revalidated (reusing `runFetch`, no new
  fetching mechanism) on window focus and on every route change, so a
  membership change made from another tab/session is picked up without a
  manual reload — no polling, no timers. `organization-projects-provider.tsx`
  had the equivalent mock-array fallback removed the same way; see its own
  bullet below.
- `src/lib/auth.ts` — `acceptInvitation` (sets the new password, then calls
  the `accept_own_invitation` RPC to flip the invited user's own
  `organization_memberships` row to `active`) backs both invite delivery
  methods below. `src/components/accept-invite-screen.tsx` and
  `src/components/reset-password-screen.tsx` both establish their session
  two ways: the email flow's Supabase-hosted link lands with the session
  already in the URL fragment (`detectSessionInUrl`, unchanged); a link
  generated via `generateLink` (Invite/Reset Password) instead carries
  `?token_hash=...&type=...` in the query string, which these two screens
  now detect and resolve via `supabase.auth.verifyOtp()` before continuing
  through the exact same "set your password" form either way.
- Applied migrations (all confirmed against the live project):
  `20260708000000_mvp_schema.sql` (base schema — organizations, profiles,
  organization_memberships, projects, project_memberships, tickets, ticket
  comments, ticket activity, RLS policies),
  `20260708010000_grant_authenticated_membership_read.sql` (SELECT grants —
  RLS alone isn't enough, Postgres checks table privileges first),
  `20260709000000_profile_self_service_updates.sql` (column-scoped UPDATE
  grant for first/last name + the weekly-capacity RPC),
  `20260710000000_avatars_storage.sql` + `20260711000000_fix_avatars_storage_policies.sql`
  (the `avatars` Storage bucket and its RLS policies — the first pass had a
  bug that blocked uploads, fixed in the second file),
  `20260805000000_accept_own_invitation_rpc.sql` (the security-definer RPC
  `acceptInvitation` calls above — `organization_memberships_update` is
  admin-only by design, so an invited user can't flip their own row any
  other way),
  `20260806000000_grant_service_role_public_schema.sql` (a missing
  service-role grant that broke the Invite User Server Action's own writes;
  see Users below). See `docs/SUPABASE_SETUP.md` for how to apply
  migrations to a new project.

## Confirmed working (Projects — Sidebar, `/projects` list, Project Settings)

Scoped narrowly: only the Sidebar's pinned project list, the `/projects`
page (both the Admin/Project Lead list and, see its own bullet below, the
Member's own "My Projects" view at that same URL), and
`/projects/[slug]/settings` read/write real data. Notes and per-project
Reports are unaffected — see "Still mock" for what's left. (Team is also
real now, but is unrelated to this one.)

- `src/lib/projects.ts` — all real Projects reads/writes:
  `loadOrganizationProjects` (org-scoped list; RLS alone decides who sees
  what — Admin sees every org project, Project Lead/Member only see
  projects they're staffed on via `project_memberships` — so there's no
  client-side role filtering), `createProject` (name + description only;
  slug/project_code auto-derived from the name), `updateProject` (the
  Projects list's Edit modal: name + description only), `archiveProject` /
  `restoreProject` (status only — nothing is ever deleted), plus, for
  Project Settings specifically: `loadProjectDetail` + `updateProjectSettings`
  (name, description, project code, status, category, client, billing
  rate — `updateProjectSettings`'s status field is typed to exclude
  `"archived"`, so that transition is structurally only reachable through
  `archiveProject`/`restoreProject`, never a parallel path) and
  `loadOrganizationClients` / `createOrganizationClient` (Billing → Client,
  backed by the `clients` table below). `updateProjectSettings`'s optional
  `ownerProfileId` field and the `projects.owner_profile_id` column it
  writes both still exist (no schema change), but nothing calls it with
  that key anymore — see the Project Lead removal note below.
- `src/components/organization-projects-provider.tsx` —
  `OrganizationProjectsProvider`, mounted in `layout.tsx` next to
  `CurrentUserProvider`, holds the org's project list once so Sidebar and
  `/projects` always show the exact same data; every write refetches
  through it afterward, which is also how edits made in Project Settings
  propagate to Sidebar, `/projects`, and the settings page's own
  breadcrumb without any extra wiring. The old dev-only mock-array fallback
  (no real organization → the old mock `projects` array) is gone, same as
  `CurrentUserProvider`'s — `isDevFallback` is always `false` now, so this
  provider (and everything gated on it) only ever renders real data or
  nothing.
- `src/components/create-project-modal.tsx` — Create *and* Edit Project (an
  `editingProject` prop switches modes, mirroring `invite-user-modal.tsx`'s
  `editingUser` pattern).
- `src/components/archive-project-modal.tsx` — the Archive confirmation
  modal, reused as-is by both the Projects list row menu and Project
  Settings' Danger Zone (never duplicated). Restore has no confirmation
  step — the menu item / Danger Zone button call `restoreProject` directly.
- `src/components/project-settings-screen.tsx` — real General (Project
  Name, Description, Project Code, Status) and Billing (Project Category,
  Client, Billing Rate) editing, plus a real "Save Changes" button (none
  existed before this). Also exports `ProjectSettingsBreadcrumb`, a client
  component reading from the shared provider so the breadcrumb never shows
  a stale server-rendered name. **The General section's "Project Lead"
  row was removed outright** (not hidden, not disabled) — it was the only
  UI that read/wrote `projects.owner_profile_id`, and the real,
  authoritative "who leads this project" signal is
  `project_memberships.project_role` (see Team below), set exclusively via
  Team's own "Make Project Lead" action. The `loadOrganizationMembers`
  fetch that only existed to populate this picker's roster was removed
  along with it. **Resolved**: the `/projects` list's own Lead column/filter
  has since been reconciled onto `project_role` too — `ProjectSummary.lead`
  is now populated by a new batched `project_memberships` query in
  `loadOrganizationProjects` (`project_role = 'lead'`, resolving to the same
  `{id, name, avatar}` shape the rest of the app already uses for a person),
  and the list's row/filter read that field instead of the older
  `owner_profile_id`-backed `ProjectSummary.owner`. `owner_profile_id`
  itself, and `updateProjectSettings`'s optional `ownerProfileId` param, are
  both left in place (no schema change, no other caller removed) — they
  simply have no remaining Lead-column reader anywhere in the app now.
- `src/components/settings-ui.tsx` — `SelectField`/`TextField`/
  `NumberField` gained an optional `onChange` (`SelectField` also gained
  `options`) to become real controlled inputs; every existing call site
  that doesn't pass them (the org-wide `/settings/*` pages) keeps its
  original display-only rendering, unchanged.
- `src/components/add-client-modal.tsx` — the minimal "+ Add new client"
  flow from Project Settings' Client selector: name only, created
  immediately in Supabase and selected in the form, persisted to the
  project's `client_name` on the next Save like every other field on that
  screen (no separate/hidden write path).
- **`src/components/member-projects-screen.tsx` ("My Projects," Member
  role, real replacement for its entire mock implementation)** — also
  fixes a real bug on the way: the old `<img src={card.leadAvatar}>` could
  render with `src=""` whenever a project had no owner; `leadAvatar` now
  always resolves to a real URL (`FALLBACK_AVATAR` when there's no lead),
  with a defensive `{leadAvatar && <img .../>}` guard on top. The card list
  itself now comes from `useOrganizationProjects()` (already real, already
  RLS-scoped to this Member's own active `project_memberships` — no
  separate membership query needed), one card per project regardless of
  whether the member currently has any tickets there (previously a project
  only appeared if it had at least one mock `WorkItem`). Project Lead comes
  from `loadProjectTeam`'s real `projectRole === "lead"` member (never the
  older `ProjectSummary.owner`), falling back to the existing "Lead:
  Unassigned" text when none exists. Assigned/Due-This-Week ticket counts
  come from `loadProjectTickets`, filtered to `assigneeProfileId === userId`
  per project. No more free-text "Updated Xh ago" recency parsing — cards
  keep `useOrganizationProjects()`'s own real order (already sorted by
  `updated_at` server-side). No longer reads `member-dashboard.tsx`'s
  `MEMBER_WORK` mock array at all.
- **Real, URL-applied `?blocked=<slug,slug,...>` filter on `ManagedProjectsScreen`
  (`/projects`, Admin/Project Lead)** — backs the Admin Dashboard's own
  "projects currently blocked" health-insight click-through (see the
  Dashboard section above): rather than have the Projects list re-derive
  "which projects are blocked" itself, the Dashboard hands off the exact
  real project slugs it already computed from real tickets, same
  query-state-handoff precedent as Tickets' own `?alerts=`. Shown as a real,
  removable `FilterChip` (reusing `tickets/filter-chip.tsx`, never a new
  chip design) when active; combines via AND with every other existing
  filter. `app/projects/page.tsx` is now wrapped in `<Suspense>` for this
  reason. (This remains a precise slug handoff, not a stand-in for a
  missing count — see the Health/Progress/Counters bullet below for the
  list's own now-real per-row blocked count.)
- **Health, Progress, Open/Blocked/Overdue are now real per-row values on
  `ManagedProjectsScreen`, one shared computation** (previously the Health
  badge/filter read the stale, never-updated `projects.health` column, and
  Progress/Open/Blocked/Overdue all read always-`0` `ProjectSummary` fields
  — see Current Sprint → Completed → Projects → "Health, Progress, Ticket
  Counters & Tab-Regain Refresh" above for the full detail):
  - Health badge, the Health filter, and the "At Risk" KPI all read
    `buildProjectHealthRows`'s (`reports-screen.tsx`) real `risk`, computed
    once per fetch over every project's real tickets — never `projects.health`.
  - The Admin Dashboard's own "Projects at Risk"/blocked-projects insight
    (`dashboard-screen.tsx`) now calls this exact same function too, instead
    of a second, locally-duplicated blocked/overdue classification.
  - Each row's Progress reuses a new, exported `computeProjectProgressPct`
    (`reports-screen.tsx`) — the same real done/total ticket-count formula
    Project Overview's own progress bar already used.
  - Each row's Open/Blocked/Overdue counters read straight off that same
    `buildProjectHealthRows` result (extended with two new fields, `open`
    and `overdueOpen`, alongside the pre-existing `blocked`) — no second
    pass over tickets, no more always-`0` `openTickets`/`blockedTickets`/
    `overdueTickets`.
  - The screen now also refreshes all of the above on returning to a
    backgrounded browser tab (reusing the Dashboards' own existing
    focus-regain mechanism — no new listener/polling) and shows a new
    `SkeletonBlock`-built `ProjectsLoadingSkeleton` in place of the old
    plain "Loading projects…" text, both on first load and on every tab
    return.
  - `awaitingReviewTickets`/`dueThisWeekTickets`/`activeMilestones` remain
    out of scope — still always `0`/unpopulated for real projects.
- Migrations (in addition to the ones above, all confirmed against the
  live project): `20260712000000_grant_authenticated_projects_read.sql`,
  `20260713000000_grant_authenticated_projects_insert.sql`,
  `20260714000000_fix_projects_select_rls_self_reference.sql` (real bug
  fix: `projects_select`'s helper function re-queried `projects` from
  within its own policy, which silently broke `INSERT`/`UPDATE ...
  RETURNING` — even for a genuine org admin — because Postgres evaluates
  the RETURNING-time SELECT check against the row being written in the
  same command, and that self-reference doesn't reliably see it yet;
  rewritten to check the row's own columns directly instead),
  `20260715000000_grant_authenticated_projects_update.sql`,
  `20260716000000_add_clients_table.sql` (new `clients` table —
  deliberately not a foreign key on `projects`; `client_name` stays free
  text, this table only supplies a real per-org roster and basic
  duplicate-by-name prevention).

## Confirmed working (Tickets — list views, New Ticket, and Ticket Detail)

Scoped narrowly, like Projects above: only the ticket data itself and the
screens listed here are real as of this original pass — Project Overview,
Notes, and per-project Reports were still mock at the time and are now
real too, each covered by its own section above/below.

- `src/lib/tickets.ts` — the single module for every real Tickets read/write:
  `loadProjectTickets` (all five list views — List/Board/Calendar/Timeline/
  Insights — scoped to one project via `project_id`, RLS decides
  visibility same as Projects), `loadTicketByCode` (Ticket Detail's real
  data source, resolved by the visible ticket code — e.g. `JIR-1` — never
  the internal uuid, which stays a database-only identifier and is never
  exposed in a URL), `createTicket` (New Ticket modal: title, description,
  acceptance criteria, estimated hours, and assignee are persisted;
  Type/Status/Priority/Labels/Due Date in "More Options" are still
  unwired and always write fixed defaults — `backlog`/`medium`/`task`/none —
  matching that sprint's explicit scope), `updateTicket` (every Ticket
  Detail *and* Quick Ticket Preview inline edit: Title, Description,
  Status, Type, Priority, Assignee, Estimated Hours, Due Date, Labels, and
  each Acceptance Criterion's checked state), `loadTicketComments` /
  `createTicketComment` (real comment thread, newest first),
  `loadTicketActivity` (see Activity Log below), `loadOrganizationLabels` /
  `createOrganizationLabel` (the Labels selector's real, per-org,
  case-insensitive-deduped catalog, merged with the static seed categories
  already in `ALL_LABELS`), `loadTicketAttachments` / `uploadTicketAttachment`
  / `downloadTicketAttachment` / `getTicketAttachmentPreviewUrl` (image/PDF
  Preview via a short-lived signed URL — the bucket is private) /
  `renameTicketAttachment` / `deleteTicketAttachment` (all real — Storage +
  metadata row; "Replace File" was removed from the UI entirely rather than
  wired up), `loadTicketTimeEntries` / `logTicketTime` (real time entries,
  minutes as the canonical stored unit to avoid float drift, Date defaults
  to the user's real local today), and `loadTicketRelations` /
  `createTicketRelation` / `deleteTicketRelation` (Related Tickets — see its
  own bullet below). Ticket priority is a 4-value scale —
  `highest`/`high`/`medium`/`low` — `normal` was fully migrated to `medium`
  and removed from the database enum, not just phased out client-side.
- `src/components/tickets-screen.tsx` — the five list views' orchestrator;
  loads real tickets for the currently-open project only, and now actually
  filters them: free-text search (title/key), the Assigned/Priority/Status
  dropdowns, the 5 quick-filter chips (Mine/Blocked/High Priority/Due
  Soon/Recently Updated), and the "Add Filter" menu (Labels, Due Date,
  Reporter, Created Date, Updated Date) all combine with AND into one
  `filteredTickets` that every view and the header counters read from — none
  of this filtering is duplicated per view. "Mine"/Reporter match the
  signed-in user's real `profiles.id` (exposed as `userId` on
  `useCurrentUser()`), never the display name.
- `src/components/tickets/ticket-preview-panel.tsx` — the Quick Ticket
  Preview drawer is now editable (Title, Status, Priority, Assignee,
  Estimated, Due Date, Labels) when opened with `editable` — currently only
  `tickets-screen.tsx` (the Tickets board) passes that; the other ~9 call
  sites (Dashboard, Reports, Project Overview, etc.) render it read-only
  exactly as before. Persists through the same `updateTicket()` Ticket
  Detail itself uses, so both stay in sync.
- `src/components/member-profile-modal.tsx` — the per-project Member card's
  Active Tickets, Assigned Hours, Utilization, and Current Workload are now
  computed from real tickets in that project (via `loadProjectTickets`),
  replacing the old `mock-team.ts` roster numbers that showed 0 for any real
  user not in that mock array. Weekly Capacity is intentionally left as-is
  (no real per-member capacity source exists yet).
- `src/components/tickets/new-ticket-modal.tsx` — Possible Duplicates
  checks only the current project's own real tickets (never another
  project's, never the old mock array).
- `src/app/projects/[slug]/tickets/[ticketCode]/page.tsx` (renamed from
  `[ticketId]`) + `src/components/tickets/ticket-detail-screen.tsx` — real
  bug fixed here: the route used to navigate on the internal uuid and 404
  when a stale dev-server route table lagged the rename; now the ticket
  code is the only thing that ever appears in a ticket URL.
  `TicketDetailBreadcrumb` mirrors `ProjectSettingsBreadcrumb`'s pattern
  (client component reading the shared project list + the real ticket).
  Attachments/Time Tracking/Comments keep their existing collapsible-
  section UI untouched — only their data sources changed. Milestone and
  Story Points fields are dead code (defined, never rendered) and were
  left alone.
- **Related Tickets is real** — the "+ Link" control, relation-kind
  selector, and search all work: search is scoped to the current project's
  own real tickets (reuses `loadProjectTickets`, no separate search
  endpoint), excludes the current ticket and anything already linked. Only
  3 canonical kinds are ever stored (`related_to`/`blocks`/`duplicates`) in
  a single `ticket_relations` row per relation; the 5 kinds the UI shows
  (adding "Is blocked by"/"Is duplicated by") are derived per-perspective
  from that one row depending on which ticket is looking at it — this is
  what keeps the inverse relation correct and duplicate-relation prevention
  a plain unique constraint instead of app-level bookkeeping. Opening the
  related ticket, removing a link, and both tickets' Activity Logs all work.
- **Activity Log is real and comprehensive**, built almost entirely with
  database triggers rather than client code, so "only after the real write
  succeeds, with the real authenticated actor" comes for free and no
  existing write path had to change: ticket creation, every field change
  on `tickets` (one row per column that actually changed — labels and
  acceptance-criteria-done are diffed element by element, so each
  added/removed label or each toggled criterion gets its own readable
  entry), attachment uploads/renames/deletes, time entries, and related-
  ticket add/remove (logged on *both* tickets involved, each with the
  correct label for its own side) are all logged by triggers; comment
  creation was already logged by an earlier trigger. `loadTicketActivity`
  turns `event_type`/`field_name`/`old_value`/`new_value` into the existing
  Activity UI's plain `{label, timeAgo}` shape (e.g. "Alex Sosa changed
  Status from To Do to In Progress"), and synthesizes a single "created
  this ticket" entry for tickets that predate this feature.
- **Error handling is real across every Ticket write path** (create/edit/
  move, comments, time entries, attachments, related tickets): a shared
  `ErrorToast` (`ticket-ui.tsx`) surfaces failures that previously only hit
  `console.warn` with nothing shown to the user; inline field edits
  (`persist()` in `ticket-detail-screen.tsx`) roll back to the pre-edit
  value on failure instead of leaving an unpersisted change on screen;
  attachment rename now waits for the real result before closing its input;
  New Ticket/Comment/Log Time all guard against a stuck spinner on a
  rejected request; Ticket Detail's own load failure now has a Retry
  button, matching the ticket list's.
- **Description is now inline-editable on Ticket Detail** — click-to-edit,
  a textarea prefilled with the current value, explicit Save/Cancel
  actions, and a placeholder when empty. Persists through the same
  `updateTicket()` every other inline edit already uses.
- **New tickets default to Backlog, not To Do** — the real `createTicket()`
  insert and the New Ticket modal's own "More Options" Status field both
  changed; the `tickets.status` database column's own default was already
  `'backlog'`, no migration needed.
- **Real URL-applied ticket filters** (`?alerts=<type,type,...>`, e.g.
  `overdue`, `blocked`, or any canonical `TicketStatus`) — the query-state
  handoff Project Overview's Health Alert action and Project Reports'
  Delivery Progress cards both use. `tickets-screen.tsx` reads it via
  `useSearchParams()` and ORs matching tickets into the existing filter
  pipeline; `filter-bar.tsx` renders each active type as a real, removable
  chip. Removing a chip rewrites the URL via `router.push`, so this filter
  is real URL/browser-history state and survives a refresh or back/forward
  navigation. `app/projects/[slug]/tickets/page.tsx` is wrapped in
  `<Suspense>` for this reason. Two more pseudo-types were added on top of
  the original `overdue` (never real ticket statuses, so each keeps its own
  `filter-bar.tsx` label instead of the shared `STATUS_LABEL` map): **
  `due-today`** (a real due date equal to today, no status exclusion — the
  Admin Dashboard's own "Due Today" KPI definition, deliberately different
  from the "Due Soon" quick chip, which excludes done tickets and covers a
  7-day window) and **`completed-this-month`** (status `done` with a real
  `updatedAtISO` in the current calendar month — the same signal the
  Dashboard's "tickets completed this month" health insight and Project
  Reports' Delivery Snapshot already use). Both back the Dashboard's own
  KPI-card/insight-band click-throughs described in the Dashboard section
  above — same mechanism, no second implementation.
- **This same `?alerts=` mechanism, and the whole screen, now also works
  with no `slug` at all** — see "New global, org-wide Tickets view —
  `/tickets`" in the Dashboard section above for the real org-wide mode
  (`loadOrganizationTickets` instead of `loadProjectTickets`, no
  project-scoped actions) this enables, and its own new Project filter.
- Migrations (all confirmed against the live project, in order):
  `20260717000000_grant_authenticated_tickets_read.sql`,
  `20260718000000_grant_authenticated_tickets_insert.sql`,
  `20260719000000_fix_tickets_insert_rls_admin_lead.sql` (real bug: the
  base schema's insert policies only allowed a real `project_memberships`
  row, but that table was still empty — no staffing UI existed yet — so
  every insert was blocked for everyone; fixed by also allowing an org
  admin/lead, the same fix reused by every ticket-related insert policy
  added afterward), `20260720000000_grant_authenticated_ticket_comments_activity_read.sql`,
  `20260721000000_grant_authenticated_tickets_update.sql`,
  `20260722000000_add_labels_table.sql`,
  `20260723000000_add_tickets_acceptance_criteria_done.sql` (parallel
  `boolean[]` aligned by index with `acceptance_criteria`),
  `20260724000000_add_ticket_attachments.sql` (private `ticket-attachments`
  Storage bucket, path `<ticket_id>/<uuid>-<filename>`),
  `20260725000000_fix_ticket_attachments_storage_insert_policy.sql` (real
  bug: the insert policy joined `projects` to check org admin/lead, and
  since `projects` also has a `name` column, the unqualified
  `storage.foldername(name)` reference silently resolved to the *project's*
  name instead of the uploaded object's own path — every real upload
  failed RLS until this was qualified as `objects.name`),
  `20260726000000_add_ticket_time_entries.sql`,
  `20260727000000_enable_real_ticket_comments.sql` (fixes the same
  `is_project_member`-only bug for comments, adds `default auth.uid()` to
  `author_profile_id`, and adds the first Activity-logging trigger),
  `20260728000000_real_ticket_activity_log.sql` (`tickets.created_by`, new
  `field_name`/`old_value`/`new_value` columns on `ticket_activity`, and the
  creation/field-change/attachment/time-entry triggers),
  `20260729000000_add_ticket_attachments_rename.sql` (RLS UPDATE policy +
  column-scoped `grant update (filename)`),
  `20260730000000_add_ticket_attachments_delete.sql` (RLS DELETE policy on
  both the metadata table and the `ticket-attachments` Storage bucket),
  `20260731000000_log_attachment_rename_delete_activity.sql` (the
  `attachment_renamed`/`attachment_deleted` Activity triggers),
  `20260801000000_unify_ticket_priority_scale.sql` (swaps the
  `ticket_priority` enum from `high`/`normal`/`low` to
  `highest`/`high`/`medium`/`low`, migrating existing `normal` rows to
  `medium` in the same step and dropping the old enum type),
  `20260802000000_add_ticket_relations.sql` (the `ticket_relations` table,
  its RLS policies, and the `relation_added`/`relation_removed` Activity
  triggers).

## Tickets → focus/visibility auto-refresh + loading skeleton

`tickets-screen.tsx` (the five-view orchestrator — Board/List/Calendar/
Timeline/Insights, both per-project and the org-wide `/tickets` mode)
gained a real background refresh on tab focus/visibility regain, and a
real structural loading skeleton in place of the old plain "Loading
tickets…" text.

- **Refresh**: reuses the existing shared `useRefreshOnFocusAndVisibility`
  hook (`member-profile-modal.tsx`, already used by `users-screen.tsx`) —
  listens to both `window` `focus` and `document.visibilitychange` →
  `"visible"`, with its own internal 300ms guard collapsing the two firing
  together (common when revisiting a tab) into one real call. No polling,
  no new timers. `runFetch` itself gained the same `hasLoadedRef`/
  `lastRunAtRef` pattern `users-screen.tsx` already established: a second,
  redundant 300ms guard inside `runFetch` (covers the case where
  `organization`'s own focus-driven reference change — via
  `current-user-provider.tsx` — and the explicit listener above fire
  within the same tick), and — once the first real load has ever
  succeeded — a background refresh never resets `loadState` back to
  `"loading"` and never blanks the screen on a failed refresh; it only
  ever swaps in the freshly-fetched `ticketList` once it actually arrives.
  Since every view (Board/List/Calendar/Timeline/Insights), the header's
  Tickets/Estimated/Blocked counters, and each Board column's own counts
  all already derive from the one shared `filteredTickets` (built from
  `ticketList` + the current filters), a refreshed `ticketList` alone is
  enough to bring every one of those up to date — no per-section refetch
  logic was needed. Filters, search, selected view, and the sessionStorage-
  based navigation/scroll-restore state are all independent React state
  never touched by `runFetch`, so they survive the refresh unchanged.
- **Skeleton**: `TicketsScreenSkeleton` mirrors the real header (title +
  description), the "+ New Ticket" button (gated on `canCreateTicket`,
  already known synchronously — no layout shift), the search/filter bar,
  the quick-filter chip row, the Tickets/Estimated/Blocked summary line,
  and the Board's own 6 real columns (Backlog/To Do/In Progress/Blocked/
  In Review/Done) each with a small, representative number of card
  placeholders — using the existing `SkeletonBlock` primitive only. Shown
  only on the true first load (gated by the same `hasLoadedRef` the
  refresh logic above uses), regardless of which view (`view` state) is
  actually selected, since it only ever appears before any real ticket
  data exists in the first place.
- Scope: only `tickets-screen.tsx` was touched. No change to filtering/
  search/creation/edit/drag-and-drop logic, permissions, navigation, or to
  List/Calendar/Timeline/Insights/Board themselves.

## Confirmed working (Ticket assignment — restricted to active project members)

A ticket's Assignee can now only ever be a real, active member of that
ticket's own project — enforced both in every Assignee-picking UI and,
independently, at the write layer. No schema change; "active project
member" is the same real, pre-existing definition used everywhere else —
a row exists in `project_memberships` for `(project_id, profile_id)`.

- **UI**: the three real Assignee `<select>` implementations — New Ticket,
  Ticket Detail (`EditableSidebarAssignee`), and the Quick Ticket Preview
  panel (`PreviewAssigneeControl`) — now all list `loadProjectTeam`'s real,
  project-scoped roster instead of `loadOrganizationMembers`'s org-wide
  one. `tickets-screen.tsx` keeps a second, still org-wide `members` state
  exclusively for the Assigned *filter* dropdown and a new, separate
  `assignableMembers` state (via `loadProjectTeam`) feeding only the two
  real assignment UIs it renders. `project-lead-dashboard.tsx`'s own New
  Ticket modal now passes its already-loaded project `team` roster instead
  of its org-wide `orgMembers` (which stays, feeding only Add Member's
  candidate list).
- **Write layer** (`lib/tickets.ts`) — `createTicket` and `updateTicket`
  both reject (real error, no ticket write) an incoming
  `assigneeProfileId` that isn't a real member of the ticket's project,
  checked via a direct `project_memberships` existence query. Clearing an
  assignee (`null`) is never blocked — only setting one is validated.
  Neither function ever auto-adds the new assignee to
  `project_memberships` — membership continues to be managed exclusively
  from Team.
- **No DB-level enforcement existed before this** — `tickets.assignee_profile_id`'s
  own FK only ever validated against `profiles`, never against the
  ticket's own project's membership; this was a pure application-layer gap
  until now.
- **Historical data audited, not modified** — a one-time, read-only check
  against the live project found zero existing tickets assigned to a
  non-member; nothing needed correcting.
- No new migrations — pure application-layer query/validation work on top
  of the already-real `tickets`/`project_memberships` tables.

## Confirmed working (Project Notes — list, search, New Note, Edit, Duplicate, Delete)

Real replacement for `src/lib/mock-notes.ts`'s hardcoded array on
`/projects/[slug]/notes`. Only the Tag field stays local-only — see below.

- `src/lib/notes.ts` — the single module for every real Notes read/write:
  `loadProjectNotes` (real list for one project, newest-`updated_at`-first;
  RLS via `can_view_project` scopes visibility), `createNote`, `updateNote`,
  `duplicateNote` (copies title/content into a new row in the same
  project, appending `(Copy)`/`(Copy 2)`/... checked against every title
  that currently exists in the project via a fresh query; `updated_by` is
  set explicitly to the real authenticated user), and `deleteNote`.
  Activity logging (create/update/delete) is handled entirely by database
  triggers into `project_note_activity` — nothing in the UI reads that
  table yet (logged for a future Notes Activity view).
- `src/components/notes-screen.tsx` — real list + search (title/body), "+
  New Note" (`NewNoteModal`, exported so `project-lead-dashboard.tsx`'s
  Quick Actions can reuse it directly), and the card menu's Edit/Duplicate/
  Delete, all real.
- `src/components/note-detail-modal.tsx` — the detail view's Edit (saves
  via `updateNote`, only leaves edit mode on real success), Duplicate, and
  Delete are all wired to the real functions above.
- `src/lib/mock-notes.ts` — kept as a type-only module (`ProjectNote`); the
  mock array and `getNotesByProjectSlug` are gone.
- **Tag stays local-only, deliberately unwired** — the Tag picker keeps
  working as UI state, but no `project_notes` column exists for it and
  it's never sent to or read from Supabase.
- Migration: `20260811000000_add_project_notes.sql` (`project_notes` +
  `project_note_activity` tables, RLS select/insert/update/delete policies
  and grants, and the three logging triggers).

## Confirmed working (Users — list, Invite, Disable/Enable, Edit, Reset Password link, Activity, Security)

**Implemented and build/type-checked, not yet confirmed against a live
Supabase project or in a browser.** Scoped to `/users` (Admin only) and the
shared Member Profile Modal's user-mode tabs it opens into. Every
privileged write below goes through a Server Action using
`SUPABASE_SERVICE_ROLE_KEY` — never a direct client write — because
`organization_memberships` has no `UPDATE`/`INSERT` grant for the
`authenticated` role at all, and because each write needs to independently
re-verify the caller server-side (active org admin, same organization)
rather than trust anything the browser claims.

- `src/lib/users.ts` — the real data source, replacing `mock-users.ts`
  entirely for this screen: `loadOrganizationUsers` (role/status/weekly
  capacity/joined date + a real `lastLogin`), `disableOrganizationMember`
  / `enableOrganizationMember` (one shared Server Action,
  `setMembershipStatusAction`), `editOrganizationMember` (first/last name +
  role + weekly capacity, atomically as much as two separate writes
  without a real DB transaction can be — an honest partial-failure message
  if the second write fails after the first succeeds), `inviteOrganizationUser`
  (email invite) / `generateOrganizationInviteLink` (single-use link
  instead), and `generatePasswordResetLink`. `updateOrganizationMember`
  (direct client write, pre-existing) is now used **only** by the Users
  list's inline Weekly Capacity cell (`CapacityCell`) — intentionally left
  as-is/still broken, it has no Server Action yet.
- `src/lib/server/invite-user-action.ts` — `inviteUserAction` (real email
  via `inviteUserByEmail`) and `generateInviteLinkAction` /
  `generatePasswordResetLinkAction` (both use `generateLink`, which mints a
  single-use token but never sends mail) share one `prepareInvite` +
  `finalizeInviteRecords` pair. The link handed back to the admin is
  always built from `NEXT_PUBLIC_APP_URL` + the token — never
  `GenerateLinkProperties.action_link`, which points at the Supabase
  project's own domain.
- `src/lib/server/disable-user-action.ts` — `disableUserAction` /
  `enableUserAction`; only ever touches `organization_memberships.status`,
  never `profiles` or `auth.users`.
- `src/lib/server/edit-user-action.ts` — `editUserAction`, the
  authorization pattern (caller-authenticated client for identity + admin
  check, service-role client only after that passes) mirrored by every
  other Server Action in this family.
- `src/lib/server/last-sign-in-action.ts` — `loadLastSignInTimesAction`
  resolves real `last_sign_in_at` per org member via the Auth Admin API
  (`listUsers`, paged).
- `src/components/invite-user-modal.tsx` — a pill toggle between "Send by
  email" and "Generate invite link"; the latter replaces the form with a
  success view (read-only link field, Copy Link, Done). Edit mode now
  genuinely awaits `editOrganizationMember` and only closes on real
  success.
- `src/components/reset-password-link-modal.tsx` — the shared "link
  generated" success modal, used both by the Users row menu's "Reset
  Password" and by the Member Profile Modal's Security tab "Generate Reset
  Link".
- `src/components/users-screen.tsx` — Disable/Enable/Edit/Reset Password
  link are all real now. The shared `Toast` gained a real `variant`
  ("success" | "error"). Resend Invitation stays intentionally mock.
- `src/components/member-profile-modal.tsx` (user-mode tabs) — the
  Activity tab is real and **summarized**: reuses `ticket_activity` (via
  `loadUserActivity`), grouping every non-milestone action on the same
  ticket into one "Working on `JIR-x` · N updates" entry while
  `ticket_created` and "Joined the workspace" stay as their own entries;
  capped at the 10 most recent after grouping. The Security tab shows the
  real `lastLogin` and its "Generate Reset Link" button calls
  `generatePasswordResetLink`. **Profile and Permissions tabs are real**
  (org-role-derived; Permissions' description copy is intentionally static
  per role). **Resolved**: the Projects tab is now real too — project
  name/slug/id/Lead from `useOrganizationProjects()`, Active Tickets/
  Assigned Hours from one real `loadOrganizationTickets` call filtered by
  `assigneeProfileId === user.id && status !== "done"`, never
  `mock-tickets.ts`/`mock-projects.ts` or name matching (see Technical
  Debt). All four data-bearing tabs (Projects/Activity/Security's reset
  link/the list itself) now also share one real `useRefreshOnFocusAndVisibility`
  hook (window `focus` + `document.visibilitychange`, deduped) and a real
  loading skeleton on first load only — a background refresh never blanks
  already-valid data.
- `src/app/accept-invite/` + `src/components/accept-invite-screen.tsx` —
  the real "set your password" landing page for both invite methods.
- `.env.example` — `NEXT_PUBLIC_APP_URL`, the app's own public base URL
  used to build every generated link above — never a Supabase URL.
- Migrations: `20260805000000_accept_own_invitation_rpc.sql` and
  `20260806000000_grant_service_role_public_schema.sql` (both pre-existing,
  already confirmed live). No new grants/RLS were needed for
  Disable/Enable/Edit/Reset-Password-link themselves — all four go
  through the service-role client, which bypasses grants/RLS by design
  once the Server Action's own authorization check has already passed.

## Confirmed working (Project → Team)

Scoped to `/projects/[slug]/team` and the Work History page it links to,
plus the project-scoped Lead/Member role and Team Capacity data this
section's own `loadProjectTeam` also backs on the Project Lead Dashboard.
Real replacement for `mock-team.ts`'s `getTeamByProjectSlug` on this
screen only — every other `mock-team.ts` consumer is untouched.

- **Team membership is now (mostly) automatic.** A database trigger
  (`ensure_project_membership`, security-definer) creates a
  `project_memberships` row the first time someone creates a ticket, edits
  one, comments, logs time, uploads an attachment, or links a ticket. A
  backfill covers contributions that already existed before this trigger.
- **Project-scoped role (Lead vs. Member) is now a real, explicit column** —
  `project_memberships.project_role` (`'lead'` | `'member'`, default
  `'member'`, a partial unique index enforces at most one lead per project)
  is the authoritative "who leads this project" signal, distinct from
  `projects.owner_profile_id` and from `organization_memberships.role`.
  `loadProjectTeam`'s `title` field was also fixed to show each member's
  real *org* role label rather than `project_memberships.title`.
- **Make Project Lead** — an Admin-only action in `member-profile-modal.tsx`'s
  `MemberMenu`, gated to members whose real org role is itself Admin or
  Project Lead. `setProjectLead` (`lib/projects.ts`) clears any existing
  lead on the project first, then promotes the new one. A `window`
  `CustomEvent` lets `team-screen.tsx` reflect the change immediately
  without a manual reload.
- **`loadProjectTeam`'s Weekly Capacity now falls back to the member's real
  organization-level capacity** when the project-level value is unset —
  a real bug fix. Only a genuinely unset value falls back; an explicit 0
  is never overridden.
- `src/lib/projects.ts` — `loadProjectTeam`, `addProjectMember`,
  `removeProjectMember` (direct client delete; the real guarantee against
  removing a member with history is a database trigger, not this function
  or the UI), and `hasProjectMemberHistory` (an RPC check deciding whether
  "Remove from Project" even appears).
- **"Remove from Project" can never delete a member with real history, at
  the database level.** A `BEFORE DELETE` trigger on `project_memberships`
  calls the same history check and raises an exception if it's true.
- `src/components/team-screen.tsx` — real roster + real KPIs. "+ Add
  Member" opens `add-team-member-modal.tsx`, a picker over real org
  members not already on the team.
- `src/components/member-profile-modal.tsx` (project-mode `MemberMenu`) —
  "Send Message" was removed outright; "View Ticket History" was renamed
  to "View Work History" and now navigates to its own page instead of
  opening a second modal.
- `src/app/projects/[slug]/team/[userId]/work-history/` +
  `src/components/work-history-screen.tsx` — real, **server-side**
  pagination (20/page, `?page=` in the URL) via two RPCs built on one
  shared inner table function, so the participation rule exists in exactly
  one place. Clicking a ticket reuses the real Ticket Detail route
  directly, never `TicketPreviewPanel`.
- **New: a global counterpart, `src/app/time-tracking/team/[userId]/work-history/`**,
  reusing the exact same `work-history-screen.tsx` component (a `slug?`
  prop now makes it optional) rather than a second page/design. Three real
  modes live in one component: **"project"** (`slug` set, non-Admin viewer)
  — the original page above, byte-for-byte unchanged; **"team"** (no
  `slug`, the Project Lead's own route) — aggregates across every real
  project this profile leads (`loadLeadProjects`); **"admin"** (`slug` set,
  `user.role === "ADMIN"`) — the *same* `/projects/[slug]/team/[userId]/work-history`
  route as "project," but scoped to every real org project
  (`useOrganizationProjects()`) instead, with Project pre-selected to the
  entry `[slug]`. "team"/"admin" both add a real filter row (Search/
  Project/Period/Status/Activity) and a 4th "Activities" KPI, sharing one
  data effect and one set of `lib/tickets.ts` functions — no duplicated
  fetch/filter logic between the two.
- `src/lib/tickets.ts` — `loadTeamMemberWorkHistorySummaryAcrossProjects`,
  `loadTeamMemberWorkHistoryPageAcrossProjects`,
  `loadTeamMemberWorkHistoryProjectOptions`, `TeamWorkHistoryFilters`/
  `TeamWorkHistoryActivityFilter` (new). All reuse the existing
  `project_member_work_history_summary`/`_page` RPCs above (called once per
  real project in the given scope, merged/sorted/paginated client-side) —
  no new RPC, no new migration. Period/Activity filtering falls back to
  direct `ticket_time_entries`/`ticket_activity` reads, always scoped to
  the already-resolved real ticket-id participation set plus the real
  `profileId`, only when those filters narrow past the RPCs' own all-time
  aggregates.
- Migrations, in order (all confirmed against the live project):
  `20260803000000_add_project_creator_membership.sql`,
  `20260804000000_grant_authenticated_project_memberships_read.sql`,
  `20260807000000_grant_authenticated_project_memberships_write.sql`,
  `20260808000000_auto_project_membership_on_contribution.sql`,
  `20260809000000_project_membership_history_guard.sql`,
  `20260810000000_project_member_work_history_pagination.sql`,
  `20260812000000_add_project_membership_project_role.sql`,
  `20260813000000_restore_project_memberships_after_project_role.sql` and
  `20260814000000_restore_manually_added_project_membership.sql`
  (corrective — during this work, a validation script accidentally deleted
  every real `project_memberships` row in the live database; these two
  migrations re-derive/restore them from still-intact source data, plus a
  hardcoded restore for the one row with no derivable source, approved by
  the user before applying. Fully verified restored afterward. Live-
  validation scripts against this schema must always scope test-data
  creation/cleanup to freshly-generated, uniquely-stamped slugs/emails —
  never broad/unscoped deletes against any real table).

## Confirmed working (Project Overview — Admin, Project Lead, and Member)

Implemented and type/build-clean (`tsc`/`eslint`/`next build` all pass),
**not yet clicked through in a live browser**. Real for all three roles:
`admin-project-overview.tsx`, `project-lead-project-overview.tsx`, and
`project-overview.tsx` (Member). The Project Lead's and Member's own
Project Overview reuse the Admin file's own building blocks directly
(`ExpandableDescription`, `activityEventToEntry`, `TicketGroup`,
`ProjectHealthRow`, `HealthRowContent`, and the `ActivityEntry`/
`TeamMember`/`HealthRow`/`HealthStatus` types) rather than a second
implementation.

- **Header** — real project name, description, status, category, and
  creation date, all from `loadProjectDetail`. Description is
  expandable/collapsible (measured via `scrollHeight`/`clientHeight`, not a
  character count). The "Owned by" field was removed outright.
- **Alert Banner (Health Alerts)** — reuses Delivery Reports' own
  `buildDeliveryStatusItems`/`buildDeliveryKpiSummary`/
  `buildHoursByPersonRows`, scoped to one project. Exactly one alert type
  resolving to exactly one real ticket links straight to it; every other
  actionable combination hands off to the Tickets page via
  `?alerts=<type,type,...>`.
- **KPIs** — Open Tickets, Progress (real done/total percentage), Blocked,
  and Closed This Month, all from real tickets.
- **Active Work** — real Blocked/In Progress/In Review ticket groups.
- **Project Activity (Admin only)** — capped at the 10 most recent real
  events (`loadOrganizationActivity`), with a "View all activity →" link to
  a new, dedicated, fully paginated `/projects/[slug]/activity` page.
  Project Lead's own view replaces this with **Needs Your Attention**
  (Blocked/Due Today/Awaiting Review, deduped into one ticket list); Member's
  own view has **My Activity**, scoped to this member's own tickets.
- **Team** — real roster from `loadProjectTeam`.
- **Project Health** — reuses Delivery Reports' own `buildProjectHealthRows`
  for the real risk verdict. Admin shows an honest "No scope tracking
  available yet" Scope row; Project Lead's own view omits the Scope row
  outright.
- No new migrations — pure application-layer query/rendering work on top of
  already-real `projects`/`tickets`/`ticket_activity`/`ticket_time_entries`/
  `project_memberships` tables.

## Project Overview → loading skeleton

All three Project Overview variants gained a real structural loading
skeleton in place of the old plain "Loading project…" text, shown only on
the true first load — none of their data-loading effects changed.

- **Admin and Project Lead** share one `ProjectOverviewSkeleton`
  (`admin-project-overview.tsx`, exported and imported by
  `project-lead-project-overview.tsx` rather than a second copy) — both
  variants render the exact same layout shape (header, alert banner,
  4-cell KPI strip, a 2-cards-left/2-cards-right grid), so one skeleton
  faithfully represents both. The "+ New Ticket" button placeholder is
  gated on `canManageProject`, already known synchronously (from the
  signed-in role), so there's no layout shift once real data lands.
- **Member** gets its own `MemberProjectOverviewSkeleton`
  (`project-overview.tsx`) — its layout genuinely differs (a different
  KPI set, "My Project Work" with its own List/Board toggle row instead
  of "Active Work", "My Activity" instead of "Project Activity", and a
  right column with up to 3 cards — Needs My Attention/Team/Quick Links —
  instead of Admin/Project Lead's fixed 2), so it wasn't forced through
  the shared shape.
- Both use the existing `SkeletonBlock` primitive only (no new skeleton
  primitive). Scope: only the three Project Overview components were
  touched — no change to any data-loading effect, query, permission
  check, or clickable element.

## Confirmed working (Dashboard — Admin, Project Lead, and Member)

Real KPIs, lists, and quick actions for all three roles' `/dashboard` — no
mock data remains on any of the three screens themselves (only
`Ticket`/`getTicketDisplayKey` are still imported from `mock-tickets.ts`,
as the shared type/display-key helper every real screen uses the same
way).

- `src/lib/tickets.ts` — `loadOrganizationTickets`, `loadOrganizationLoggedMinutes`,
  `loadOrganizationActivity` (filtered to 5 curated event types —
  `blocked`/`completed`/`hours`/`assigned`/`priority`). `src/lib/projects.ts` —
  `loadOrganizationWorkloadMembers`, `loadLeadProjects` (Project Lead's
  Current Project list, by `project_role = 'lead'` — a real bug was fixed
  here mid-build, it originally filtered by the older, unrelated
  `owner_profile_id`), `loadMemberProjects`/`loadMemberWeeklyCapacity`.
- **Admin** (`AdminDashboard()`) — Assigned Tickets, Hours Burn, Blocked,
  Due Today, My Active Work, Recent Activity, My Upcoming Deadlines, Team
  Workload, Projects at Risk, and Organization Health are all real. Quick
  Actions: New Project and Add Member open their modals directly; New
  Ticket was removed from Quick Actions entirely. Recent Activity has a
  real "View all activity →" action to a new, dedicated, org-wide
  `/activity` page (`OrganizationActivityHistoryScreen`, mirroring the
  per-project Activity page's query/pagination shape verbatim) — not on
  the Sidebar's main nav, link-only.
- **The 4 KPI cards, the Organization Health insight band, and Projects at
  Risk's own rows are all real, independent click targets now** (previously
  static) — each resolves to a real destination built from the exact same
  ticket/hour list the card itself displays, never a second/duplicated
  calculation, and each is a no-op when its own value is 0:
  - **Assigned Tickets** (open, non-`"done"`, tickets in the current
    project scope) — 1 ticket → straight to its own detail page (real
    `projectSlug` + ticket key); 2+ → the current project's own
    `/projects/<slug>/tickets?alerts=<the 5 non-done statuses>` when a
    project is selected, or the new org-wide `/tickets?alerts=...` (see
    below) under "All Projects" — always resolvable regardless of how many
    different projects those tickets span.
  - **Blocked** and **Due Today** follow the identical single-ticket /
    `?alerts=` pattern (`?alerts=blocked`, and a new `?alerts=due-today`
    pseudo-type — see the Tickets section below for both).
  - **Hours Burn** ("logged / estimated · X% · Yh remaining") → real
    logged minutes gate whether it's clickable at all (not the rounded
    display value); when clickable, opens `/time-tracking` filtered to the
    current project (`?projects=<slug>`) or org-wide, with
    `?period=custom&from=2000-01-01&to=<today>` — Time Tracking has no
    "All Time" period of its own, so this reuses its existing Custom Range
    params with a deliberately early lower bound instead of adding a new
    period type. Billable + Non-Billable Hours there sum to the exact same
    total Hours Burn reads from the same `ticket_time_entries` rows.
    Honest limitation, not fabricated: Time Tracking has no "estimated
    hours" or "logged/estimated %" concept anywhere on that screen (its
    only percentage, Weekly Utilization, is pinned to the current calendar
    week against team capacity, independent of the Period selector), so
    that one piece of Hours Burn's own display has no equivalent there —
    nothing was invented to force a match.
  - **Organization Health** insight band — the "N projects currently
    blocked"/"X blocked — N tickets" item links to that project's
    `/projects/<slug>` Overview (1 project) or the real, new
    `/projects?blocked=<slug,slug,...>` filter (2+, see the Projects
    section below); "N tickets completed this month" uses a new
    `?alerts=completed-this-month` pseudo-type (1 ticket → its own detail);
    "Hours burn at X% · Yh remaining" reuses the exact same href the Hours
    Burn KPI card itself computes — no second calculation. The "members
    above capacity" item and the empty-state fallback stay exactly as
    before, not clickable — out of scope.
  - **Projects at Risk** — each row (name, risk badge, progress bar,
    percentage, affected-ticket text) is one single `<Link>` to
    `/projects/<slug>` (the project's own real slug) — no per-element
    links. "Full report →" is unchanged, still `/reports`. **Resolved**:
    this widget's own risk classification (and the blocked-projects health
    insight above it) now reuses `buildProjectHealthRows` (`reports-screen.tsx`,
    via a shared `healthRowsBySlug`) instead of a second, locally-duplicated
    blocked-then-overdue calculation — the same real rule the Projects
    list's own Health badge/filter/"At Risk" KPI now reuse too (see Current
    Sprint → Completed → Projects and the Projects Architecture Status
    entry above). Each row's own `progressPct`/affected-ticket count are
    still computed locally, since those are display details the shared
    function doesn't return.
- **New global, org-wide Tickets view — `/tickets`** (`app/tickets/page.tsx`,
  no route param) — built to give the "All Projects" scope's own multi-project
  click-throughs above a real destination, since `/projects/[slug]/tickets`
  can only ever show one project. Reuses the exact same `TicketsScreen`
  component every per-project Tickets page already renders (`slug` prop now
  optional): with no `slug`, it loads via `loadOrganizationTickets` instead
  of `loadProjectTickets`, hides "+ New Ticket" (no single project to
  create into), and the ticket preview panel resolves each ticket's own real
  `projectSlug` instead of one page-level value. Not on the Sidebar's main
  nav — link-only, same precedent as `/activity`/Work History. A **Project
  filter** was added to this view only (never to the per-project Tickets
  page, where the project is already fixed by the route) — role-scoped
  options (Admin: every active org project; Project Lead:
  `project_role = 'lead'` projects only; Member: any active membership),
  synced to `?project=<slug>`, validated against the loaded option list
  before being trusted (same "ignore a stale/invalid slug" precedent the
  Dashboards' own scope selectors already use).
- **Project Lead** (`ProjectLeadDashboard()`) — Current Project selector
  (`?project=<slug>`, only rendered when leading more than one active
  project), Current Delivery, Target Date (now the nearest due date among
  the project's own active tickets, previously read the unrelated
  `projects.target_date`), Attention Required, Team Capacity, Project Work
  (renamed from "My Active Work"), Recent Activity, Upcoming Deadlines are
  all real. Quick Actions: Add Member/New Note/New Ticket all open their
  real modals directly against the selected project.
- **Member** (`MemberDashboard()`) — Assigned Tickets, Weekly Capacity
  (renamed from "Planned Today"), Logged Today, Due Today, Recommended
  Next, My Active Work, Needs Your Attention, Time Today, and Upcoming Work
  are all real. `MEMBER_WORK`/`WorkItem` stay defined/exported in this file
  but are now fully unused anywhere in the app.
- **Project scope selector on all three** — a `?project=<slug>` selector
  in the header's top-actions row. Admin defaults to "All Projects"
  (org-wide); Project Lead's/Member's only render when scoped to more than
  one project. Every KPI/list re-scopes to that project's own data;
  fast-switching resets to a zero state first so stale numbers never show.
  `app/dashboard/page.tsx` is wrapped in `<Suspense>` for this.
- No new migrations — pure application-layer query/rendering work on top of
  already-real tables.

## Confirmed working (Member Profile Modal — real data source)

**Scoped narrowly on purpose — this is not an app-wide migration.** An
investigation (triggered by Team Workload's own numbers looking right while
the modal opened from it showed `Assigned Hours = 0h`/`Utilization = 0%`/
`Active Tickets = 0`/`View Work History` 404ing to a `/projects/team/
unknown-<name>/work-history` URL) found the shared Member Profile Modal
(`member-profile-modal.tsx`, opened via `MemberTrigger`/`openMemberProfile`
in `member-profile.tsx`) had never been real: `resolveTeamMember`
(`mock-team.ts`) only ever matched by **name** against a hardcoded mock
roster, or — for a real org member with no mock entry — synthesized a
`TeamMember` with `id: "unknown-" + slugified-name` and hardcoded
`assignedHours: 0`/`weeklyCapacity: 40`/`activeTicketIds: []`. Every "click
a person" trigger across the app that only had a name/avatar (which was
almost all of them) hit this path.

- **The fix, applied to exactly two entry points**: Team Workload
  (`dashboard-screen.tsx`'s `WorkloadRow`, Admin Dashboard) and Recent
  Activity (`dashboard-shared.tsx`'s `RecentActivityList`, Admin Dashboard).
  Both now pass a real `profileId` (`OrgWorkloadMember.id` for Team
  Workload; the new `OrganizationActivityEvent.actorProfileId` — the raw
  `actor_profile_id` the query already fetched but never exposed, for
  Recent Activity) and a real `projectSlug` (the Dashboard's own current
  `?project=` scope — omitted entirely under "All Projects," never a
  guessed/first project) through `MemberTrigger` into `MemberIdentity`.
- **The modal itself now has exactly one way to get real data, driven only
  by `(realProfileId, slug)`**: with a `slug`, `Promise.all([loadProjectTickets,
  loadProjectTeam])`, filtered by real `assigneeProfileId === realProfileId`
  (never name-matching); with no `slug` ("All Projects"),
  `Promise.all([loadOrganizationTickets, loadOrganizationMemberWeeklyCapacities])`,
  same real id filter, aggregated across every accessible project. Assigned
  Hours/Utilization/Active Tickets/Current Workload/Weekly Capacity are all
  derived from this one fetch — the old per-caller `realActiveTickets`/
  `realWeeklyCapacity` props (a stopgap from the Team Workload-only fix that
  preceded this one) were removed once the modal could fetch its own data,
  rather than kept as a second path. A real, separate bug fixed along the
  way: the "Weekly Capacity" stat tile read the un-overridden `member`
  object instead of the merged `effectiveMember`, so it kept showing the
  40h stub even after Assigned Hours/Utilization were already fixed.
- **View Work History** (`MemberMenu`) now always uses this same real
  `profileId`/`slug` for its route, so it can no longer build an
  `unknown-*` URL. With no real `slug` (All Projects), it's omitted from
  the menu entirely (never shown disabled). If that leaves the menu with
  zero items (e.g. All Projects, no other action applicable), the "⋯"
  trigger button itself is now omitted rather than opening an empty
  popover. **Note (now stale as written above)**: a global/cross-project
  Work History page *does* now exist (`/time-tracking/team/[userId]/work-history`,
  see Confirmed working → Project → Team) — this `MemberMenu` item itself
  was not revisited to link to it; still worth a follow-up pass.
- **Real, pre-existing `CapacityBar` bug fixed**: the shared bar this
  modal's own "Current Workload" stat renders (also used by Team's member
  cards and per-project Reports' Team Workload) computed its fill color
  from the already width-clamped percentage, so its `pct > 100` red branch
  could never be reached — an over-100%-utilized member's bar stayed amber
  no matter how over-allocated they were. Now colors off the real,
  unclamped percentage; only the bar's *width* stays clamped to 100%.
- **Since widened to company-wide Reports and Time Tracking**: Reports'
  Hours by Person, Workload, Recent Changes, and Billable Hours by Member
  (`reports-screen.tsx`), and Time Tracking's Timesheets and Missing Hours
  panel (`time-tracking-screen.tsx`), now all pass a real `profileId`
  (`PersonRow`/`WorkloadRow`/`MemberBillingRowReal.id`/
  `TimesheetViewRow.id`) and `projectSlug` (each screen's own active
  Project filter, when scoped to exactly one project) through the same
  `MemberTrigger`/`openMemberProfile` mechanism, rather than a second
  fetch path.
- **Every other remaining `MemberTrigger`/`openMemberProfile` call site is
  unchanged** — Project Overview (all three roles), ticket
  assignees/comments/attachments, My Work's Recently Updated, and Project
  Lead's Dashboard still resolve through the old name-matching/`unknown-*`
  path. `team-screen.tsx` is the one pre-existing exception (already passed
  a real `profileId`+`projectSlug` before the original fix) and benefits
  from the same real fetch automatically, with no changes of its own
  needed. A broader migration of the remaining call sites was scoped out of
  this pass — see Technical Debt.
- No new migrations — `actorProfileId` on `OrganizationActivityEvent` is a
  purely additive field (the underlying query already selected
  `actor_profile_id`; it just wasn't exposed on the returned object before).

## Confirmed working (My Work — Member)

Real replacement for `my-work-screen.tsx`'s entire mock data set for the
Member role's `/my-work`.

- **Tickets** — `loadOrganizationTickets` filtered to
  `assigneeProfileId === userId`.
- **KPIs** — Assigned Tickets, Active, Estimated Hours, Blocked, and Due
  This Week, computed from the member's full, unfiltered ticket set.
- **My Tickets — filters are now real and functional**: Status/Priority/
  Project/Labels all actually filter the ticket list (previously rendered
  but never applied), composing (AND) with the KPI quick-filters.
- **Recently Updated** reuses `loadOrganizationActivity` scoped to this
  member's own ticket ids. `OrganizationActivityEvent` gained one new
  field, `createdAtISO`, purely additive.
- **My Time (Member only) + Personal Timesheet panel** — Logged Today
  (`loadProfileLoggedTimeForDate`) and Personal Capacity
  (`loadMemberWeeklyCapacity`); Logged This Week/This Month come from
  `loadOrganizationLoggedTimeForRange`. The Timesheet panel's own entry
  list is backed by a new, minimal `loadProfileTimeEntries`.
- No new migrations — pure application-layer query/rendering work on top of
  already-real tables.

## Confirmed working (Reports — Admin, Delivery and Finance tabs)

Real KPIs, tables, filters, alerts, and Export for both tabs of `/reports`
(`AdminReportsScreen`). Project Lead gets a separate, still-mock component
(`ProjectLeadReportsScreen`) instead.

- **Shared filters and period** — Project/Assignee/Client/Date filters
  plus Delivery's own independent Period selector (This Month/Last
  Month/This Quarter/Custom Range) all read from one shared fetch; every
  KPI/table/chip on Delivery derives from the same filtered ticket set via
  `useMemo` chains. Finance keeps its own separate Billing Period selector
  and its own `rawTimeEntries` fetch — the two tabs' periods never
  overwrite each other.
- **Delivery KPIs, Health Alerts, Project Health, Hours by Person** —
  `buildDeliveryKpiSummary`, `buildProjectHealthRows`,
  `buildHoursByPersonRows` compute real rollups from real tickets, logged
  time (Delivery's own period-scoped range), and weekly capacity.
  `buildDeliveryKpiSummary`'s "Done …" KPI takes an optional real
  completed-in-range ticket count (`loadTicketsCompletedInRange`, the same
  real `ticket_activity` status→done signal used elsewhere — never
  `updated_at`); its two existing 4-arg external callers (Admin/Project
  Lead Project Overview) are unaffected.
- **Workload** — `buildWorkloadRows`: real assigned hours (`Σ ticket.hours`
  on currently-assigned, non-Done tickets — plain sum, never netted
  against logged time), capacity/utilization, plus a real "change this
  week" delta. Deliberately does **not** use Delivery's Period — its
  `timeEntries` parameter is received but unused by the calculation.
- **Hours Distribution** — `buildHoursDistribution`: real hours bucketed by
  ticket status, excluding backlog.
- **Tickets by Member** — `buildTicketsByMember`: real tickets grouped by
  real `assigneeProfileId` (never name/avatar), excluding Done, sorted
  Blocked → Overdue → Priority → due date → code; a ticket belongs to a
  member's group when currently assigned to them and not Done, OR they
  logged real hours on it within Delivery's own active Period (real union,
  deduped per ticket per group); each ticket shows that member's own real
  logged hours on it (from `ticket_time_entries`, never `ticket.hours`),
  each group ends with a real Total Logged sum, and the Member filter
  applies after grouping (filters which groups show, not which tickets a
  group's history can include). Replaced the old flat "Recent Changes"
  activity feed outright.
- **Delivery Export** — CSV/Excel/PDF build 7 sections from the exact same
  in-memory state every widget already reads, including Delivery's own
  selected Period in the export metadata.
- **Finance KPIs, Billing Overview, Billable Hours by Member** — real
  Billable/Non-Billable hours, Utilization, and Estimated Revenue from real
  logged time × each project's real billing rate.
- **Finance Export** — CSV/Excel (per-section worksheets)/PDF, all
  preserving on-screen order.
- No new migrations — pure application-layer query/rendering work on top
  of already-real tables.

## Confirmed working (Reports — Project, per-project)

Implemented and type/build-clean, **not yet clicked through in a live
browser**. Real replacement for `/projects/[slug]/reports`'s
(`project-reports-screen.tsx`) previous org-wide mock ticket list and
`mock-team.ts` roster, for every role that can open it. Project Lead's own,
separate Reports view (`project-lead-reports-screen.tsx`) is now also real
— see the next section.

- **Data loading** — `loadProjectDetail`, `loadProjectTickets`,
  `loadProjectTeam`, and `loadOrganizationLoggedTimeForRange`, all scoped
  to the route's own `slug`.
- **Project Health KPI** — now calls Delivery Reports' own
  `buildProjectHealthRows`, scoped to this one project, rather than a
  second calculation — a real bug fixed here (this KPI was previously just
  showing `project.status` mislabeled as "Project Health").
- **Estimated vs Logged Hours, Team Workload, Delivery Progress** — real
  sums/counts from real tickets/time entries/roster. Delivery Progress's
  cards now navigate contextually via the same real `?alerts=<status>`
  mechanism instead of the old, non-functional `?status=` query param.
- **Delivery Snapshot** — a new `loadTicketsCompletedInRange` finds tickets
  with a real `status_changed → done` activity row within the current
  calendar month, rather than trusting `updated_at`.
- No new migrations — pure application-layer query/rendering work on top of
  already-real tables.

## Confirmed working (Reports — Project Lead, Delivery and Team tabs)

Implemented and type/build-clean, **not yet clicked through in a live
browser**. Real replacement for `project-lead-reports-screen.tsx`'s entire
mock data set — the last remaining fully-mock Reports surface — scoped to
exactly this profile's own led projects, not the Admin's company-wide view.

- **Scope** — `useOrganizationProjects()` (already RLS-scoped to led
  projects), `loadOrganizationTickets`/`loadOrganizationActivity` narrowed
  client-side to those projects, and `loadProjectTeam` per led project,
  merged/deduped by `profileId` (summing capacity/hours for anyone staffed
  on more than one led project).
- **Delivery tab** — real KPI row, Project Health, and Recent Activity all
  reuse Admin Reports' own exported `buildProjectHealthRows`/
  `computeProjectProgressPct` rather than a second calculation.
- **Team tab** — converted to real data in full (an explicit scope
  decision, rather than a minimal patch): Hours by Person, Workload,
  Blocked Work by Member, and Team Health all read the same merged
  per-project team stats the KPI row computes. All Team-tab mock
  infrastructure (`TEAM`, `aggregateTeam`, `LEAD_PROJECT_SLUGS`-based
  aggregation, `blockedHoursOf`, `healthOf`, `BLOCKED_HOURS_BY_MEMBER`) was
  removed.
- **KPI navigation** — My Projects, Team Capacity, Blocked Tickets, and Due
  This Week are all real, independent click targets (0 → not clickable; 1
  → opens the Ticket Preview panel/Member Profile Modal directly; more
  than 1 → navigates to a filtered Tickets/Team view), each reusing its own
  already-real source of truth:
  - **Team Capacity** opens the real Member Profile Modal via
    `openMemberProfile` when exactly one real member is over capacity
    (`projectSlug` included only when that resolves to a single real
    project), or navigates to this screen's own Team tab with a real,
    removable `?filter=over-capacity` chip when more than one is.
  - **Due This Week** navigates to `/tickets?alerts=due-this-week` — the
    one new, additive piece: Tickets' own `?alerts=` mechanism
    (`tickets-screen.tsx`/`filter-bar.tsx`) gained a `due-this-week`
    pseudo-type, using the exact same Monday–Sunday week bounds this KPI
    already used for its own count, never a second/different definition.
- `KpiCard` (`reports-shared.tsx`) gained optional `disabled`/`onClick`
  props, shared with Admin Reports' own KPI cards, purely additive.
- No new migrations — pure application-layer query/rendering work on top of
  already-real tables.

## Confirmed working (Time Tracking — Admin, Member, and Project Lead)

Real replacement for `/time-tracking`'s previous fully-mock data source, for
all three roles. Not yet clicked through in a live browser.

### Admin/Member — `time-tracking-screen.tsx`

- **Data load** — real active org users, org-wide tickets/projects, and
  real per-member weekly capacity are all fetched once per organization.
  Real logged time is fetched for four fixed ranges up front (Today/
  Yesterday/This Week/This Month); Custom Range is fetched separately.
- **Billing is reused verbatim from Reports → Finance, never recalculated**
  — `buildFinanceKpiSummary`/`buildBillingOverviewRows`/
  `buildBillableHoursByMemberRows` were exported from `reports-screen.tsx`
  for this reuse.
- **Capacity-based metrics are deliberately independent of the Billing
  filter** — Missing Hours (relabeled from "Hours Missing," then from
  "Members Missing Hours"), Weekly Utilization, and Timesheets' Capacity %/
  Status always use a member's *total* logged hours; two separate
  ticket-id scopes are computed (`capacityTicketIds` vs. `billingTicketIds`)
  so the Billing filter has no code path into capacity math at all.
- **Timesheets and Missing Hours' Member Profile Modal triggers** now pass
  a real `profileId`/`projectSlug` (see Confirmed working — Member Profile
  Modal, below) instead of resolving by name, and the whole screen gained a
  full structural skeleton loader plus a real refresh on returning to a
  backgrounded browser tab.
- **Filters are real and URL-persisted** — Member/Project/Client/Billing/
  Date Range all filter real data and round-trip through the URL, same
  `<Suspense>` requirement as Tickets' `?alerts=`.
- **Timesheets table** — one real row per active org member, with a real
  "Review →" action navigating to the existing Work History route.
- No new migrations — pure application-layer query/rendering work on top
  of already-real tables.

### Project Lead — `project-lead-time-tracking-screen.tsx` (**resolved**, no longer mock)

Same page layout/copy as the previous mock version (a delivery-focused
build with no revenue/invoicing/billing-by-client concepts) — only the data
source changed, and every calculation is imported and reused verbatim from
the Admin/Member screen above (`scopeEntries`, `hoursByMember`,
`expectedHoursForPeriod`, `getCurrentWeekRange`/`getCurrentMonthRange`,
`round1`, `parseListParam`, all exported from `time-tracking-screen.tsx`
for this reuse) rather than a second implementation.

- **Scoped strictly to led projects** — `loadLeadProjects` (the same
  `project_memberships.project_role = 'lead'` definition the Dashboard's
  own project scope selector uses) determines the project set first; team
  roster and tickets come from `loadProjectTeam`/`loadProjectTickets` per
  led project (merged/deduped client-side, summing `weeklyCapacity` for
  anyone staffed on more than one), never the org-wide
  `loadOrganizationUsers`/`loadOrganizationTickets`/`loadOrganizationProjects`
  Admin/Member use — those would leak every org member/project into a
  Project-Lead-only page.
- **Logged Hours / Internal Hours** KPIs reuse `buildFinanceKpiSummary`
  verbatim (same billable/non-billable split as Admin/Member, just
  delivery-labeled — no dollar amounts shown anywhere on this page).
- **Hours by Project** and **Capacity Risk** have no real equivalent in the
  Admin/Member screen to reuse — both are new, small aggregations over the
  same already-loaded real tickets/time-entries (project-hours breakdown;
  count of members with `capacityPct > 100`), not a second data source.
- **Member/Project/Client filters are now functional** — the previous mock
  version's filter state existed but was never wired into any actual
  narrowing of the displayed data.
- **`?projects=<slug>` is read on load and kept round-tripped through the
  URL**, same convention Admin/Member's own screen already uses. A slug
  outside the signed-in lead's own led projects can't broaden access — the
  underlying ticket set is already scoped server-side to led projects only,
  so an out-of-scope slug can only narrow the result to nothing.
- The three mock-only exports this screen used to import
  (`MEMBER_GROUPS`/`PROJECT_GROUPS`/`CLIENT_GROUPS`) were deleted from
  `time-tracking-screen.tsx` — no other consumer.
- **Client filter gained a synthetic "No Client" option** for internal
  projects — determined by each real project's own `client` field being
  null/absent (never by `category` alone or by project name), and only
  offered when at least one such project actually exists in this Lead's own
  scope. Frontend-only sentinel value, never written to Supabase.
- **Four real, pre-existing bugs fixed**: two Timesheets/Missing-Hours
  Member Profile Modal triggers were missing a real `profileId`; "Logged
  Hours" totaled Finance's billable-only hours instead of every real
  `entriesForSelectedPeriod`; weekly capacity was summed across a member's
  own led projects instead of resolved to one canonical value via
  `mergeLedTeams` (`Math.max` across their per-project rows); "Capacity
  Risk" and the Timesheets Capacity column now use the same shared
  assigned-hours/capacity definition Team/Reports/Dashboards/Projects/the
  Member Profile Modal already share. The header's fixed date was replaced
  with the real current date, and the page gained the same loading skeleton
  on initial load/autorefresh as the rest of Time Tracking.
- **Timesheets "View →" is now wired** (previously had no `onClick` at
  all): resolves to a single real project (the active Project filter when
  it selects exactly one, else the row's own single led project, else this
  Lead's own single led project overall) or, when a row genuinely spans
  more than one led project, to the new global Work History page below —
  never disabled, never a guessed project.

## Confirmed working (Global Search)

JIRITA's global Search (the Sidebar's own Search field, previously a fully
inert decorative button) now has a real, permission-scoped Supabase data
layer and a working results popover with click and full keyboard
navigation. No new migrations.

- **`src/lib/search.ts` (new) — `searchGlobal(organizationId, role, userId,
  query)`**, the single reusable data-layer function everything below
  consumes. Returns up to 5 deduplicated results each for Projects,
  Tickets, and Users. Permission scoping happens as real query filters,
  never a client-side trim: **Admin** → every project in the organization;
  **Project Lead** → only projects where `project_role = 'lead'`;
  **Member** → any active `project_memberships` row. Search terms are
  escaped before being used in an `ilike` pattern.
- **`src/components/sidebar.tsx`** — the Search field is a real controlled
  `<input>`; a results popover renders below it. Opens on focus, only
  renders once there's a non-empty typed term; debounced ~300ms; real
  loading/error/empty states. Results render grouped (Projects/Tickets/
  Users); clicking navigates to the real detail page/route for each.
  **Keyboard**: global `⌘K`/`Ctrl+K` focuses the field and opens the
  popover from anywhere in the app; `ArrowDown`/`ArrowUp` walk the results
  as one continuous list; `Enter` selects; `Escape` closes.

## Removed (Settings → General & Danger Zone) — the whole workspace-wide Settings screen retired outright (single-tenant)

The entire workspace-wide Settings screen — General (Workspace Name,
Active Days, Default Role, Default Capacity) and Danger Zone (Archive/
Delete Workspace, always visual-only) — was retired outright, by explicit
product decision: JIRITA runs as a **single-tenant** solution, so
workspace-level configuration is not meant to be Admin-editable through
the UI. This is the same "retire outright, don't leave it mock" precedent
already used for Settings → Projects/Time Tracking/Notifications/
Integrations, extended here to the two sections that were left (General,
Danger Zone) — Settings now has no sections at all.

- **Navigation**: "Settings" was removed from `nav-config.ts`'s
  `MainNavKey`/`MAIN_NAV_BY_ROLE` (it was only ever in the Admin array) and
  from the sidebar's `NAV_LINK`/`EXPLICIT_NAV_PAGES` (`sidebar.tsx`) — no
  role sees a Settings link anymore.
- **Routes**: `/settings` and `/settings/[section]` (every subroute,
  including `/settings/general`/`/settings/danger-zone`) now do nothing but
  `redirect("/dashboard")` — the old `SettingsSectionScreen`/
  `SettingsBreadcrumb` render, `generateStaticParams`, and per-section
  metadata are gone. Typing any of these URLs directly lands on the
  Dashboard, same as before login-gating would have applied.
- **Components deleted outright** (no longer reachable from anywhere):
  `settings-screen.tsx` (`SETTINGS_SECTIONS`/`DANGER_SECTION`/the unused
  `SettingsScreen` landing component) and `settings-section-screen.tsx`
  (`GeneralContent`/`DangerZoneContent`/`SettingsNav`). `settings-ui.tsx`
  (`SettingGroup`/`SettingRow`/`TextField`/`NumberField`/`SelectField`) was
  **kept** — it's shared with Project Settings and the Profile page, both
  unaffected by this change.
- **Nothing in Supabase changed**: no table, column, or migration was
  touched or dropped. `organizations.name`/`default_role`/
  `default_weekly_capacity`/`active_days` (from
  `20260815000000_add_organization_settings_defaults.sql`) still exist with
  their current real values for this workspace — Techtivo / Member / 40h /
  Monday–Friday — and every existing consumer of them keeps reading the
  exact same columns, unchanged (see "Still consumed by" below). The write
  path, `updateOrganizationSettingsAction`
  (`lib/server/update-organization-settings-action.ts`), was left in place
  rather than deleted — it's simply unreachable now that no UI calls it.
- **Project Settings is completely unaffected** — it's a distinct,
  per-project screen (`project-settings-screen.tsx`) that never depended on
  the workspace-wide Settings screen for anything besides sharing
  `settings-ui.tsx`'s form primitives.
- **Still consumed by** (unchanged by this pass):
  - **Invite User** (`invite-user-modal.tsx`) — a brand-new invite (no
    `editingUser`) now seeds Role/Weekly Capacity from
    `organization.defaultRole`/`defaultWeeklyCapacity` instead of a fixed
    `"MEMBER"`/`40`. Editing an existing user is untouched: `editingUser`'s
    own real `role`/`weeklyCapacity` always wins first in the fallback
    chain, so changing Settings → General's defaults later can never
    retroactively alter an existing member — the literal `"MEMBER"`/`40`
    left in the code is only a type-safety net for the one instant
    `organization` itself hasn't resolved yet (this modal only opens from
    the already-AuthGuard-gated `/users` page), never the real functional
    default.
  - **Time Tracking** (Admin/Member `time-tracking-screen.tsx`, reused
    verbatim by `project-lead-time-tracking-screen.tsx`) — `countWeekdays`
    (hardcoded Mon–Fri) is gone; `expectedHoursForPeriod` now takes a 4th
    `activeDays` param and spreads the real `weeklyCapacity` across however
    many days the organization actually configured (`weeklyCapacity /
    activeDays.length`), via a new shared helper,
    `src/lib/active-days.ts` (`isActiveDay`/`countActiveDaysInRange` —
    the one place ISO weekday numbers 1–7 are reconciled with
    `Date.getDay()`'s 0–6). "Today" only expects hours on a real active
    day; "This Month" now counts the real current month's own active days
    (via the already-existing `getCurrentMonthRange`) instead of a fixed
    4.33-week approximation; "This Week"/"Custom Range" were already
    real-range-based and now filter by `activeDays` too. "Week" still
    reduces to the plain `weeklyCapacity` (a full 7-day week always
    contains every configured active day exactly once, so the math is
    provably unchanged) — same real total, no longer assuming which days
    they fall on. Scoped strictly to expected-hours/Hours Missing/timesheet
    compliance — Workload, Assigned Hours, and Weekly Utilization (all
    logged/assigned-hours ratios, not "vs. expected") are untouched, same
    as the capacity-unification pass above left them.

## Removed (Settings → Projects)

Retired outright rather than left mock or built out further — its own two
prior passes had already made Labels real (list + "+ Add", reusing
`loadOrganizationLabels`/`createOrganizationLabel`, `lib/tickets.ts`) and
made Ticket Statuses/Priorities/Ticket Types real-but-read-only chips
sourced from the official `STATUS_LABEL`/`PRIORITY_LABEL`/
`PRIORITY_VALUES`/`TICKET_TYPE_LABEL` constants, but that still left the
section without enough real administrative value for the MVP: Statuses/
Priorities/Ticket Types can't go further than read-only without converting
their underlying Postgres enums (`ticket_status`/`ticket_priority`/
`ticket_type` — global to the database, shared by every organization, not
per-org rows) into organization-scoped lookup tables, a genuine
architecture change touching the ~17 files across Board/List/Calendar/
filters/badges/Reports/Time Tracking that treat them as a fixed TypeScript
union; and Labels' own "+ Add" already exists inside the real Tickets flow
(Ticket Detail's own Labels picker), so it added nothing this section alone
justified keeping.

`/settings/projects` no longer appears in the Settings hub's cards or left
sub-nav (both read `SETTINGS_SECTIONS`, `settings-screen.tsx`, which no
longer has a `"projects"` entry) and no longer statically generates
(`SECTION_TITLES`, `app/settings/[section]/page.tsx`). A direct visit falls
through to the exact same "Section not found." default branch
`SectionContent` (`settings-section-screen.tsx`) already renders for any
other unrecognized slug — no new page/redirect logic. `ProjectsContent`/
`LabelsGroup` and every constant/import used exclusively by them were
deleted, including the now-fully-dead `Chip` component
(`settings-ui.tsx` — confirmed unused by every other consumer of that
file). `loadOrganizationLabels`/`createOrganizationLabel` (`lib/tickets.ts`)
and the real `ticket_status`/`ticket_priority`/`ticket_type` enums/
constants themselves are completely untouched — Ticket Detail's own Labels
picker (and everything else in Tickets/Board/Reports/Time Tracking) works
exactly as before.

## Removed (Settings → Time Tracking)

Retired outright, one pass after being made real: Show Estimated Hours on
Tickets, Require Estimation on New Tickets, Hour Rounding, and Round Up by
Default are no longer an Admin-configurable setting at all — they're now
**fixed JIRITA product behavior**, per explicit product decision. The
`updateOrganizationSettingsAction` Server Action, `Organization` type/
`loadMembership`, and `current-user-provider.tsx` all reverted to exactly
their Settings → General-only shape from before that section existed —
none of them read or write `show_ticket_estimates`/`require_ticket_estimate`/
`time_rounding_minutes`/`round_time_up` anymore. `settings-screen.tsx`/
`settings-section-screen.tsx`/`app/settings/[section]/page.tsx` no longer
reference the section at all — `/settings/time-tracking` falls through to
the same "Section not found." default `SectionContent` already renders for
any unrecognized slug, and no longer statically generates. `SettingsNav`'s
old non-Admin special case (a Project Lead/Member could reach this one
section only) is gone along with it — every remaining Settings section
(General/Notifications/Integrations/Danger Zone) is Admin-only, so
non-Admins now see an empty Settings nav.

**The four `organizations` columns still exist** (kept for compatibility,
not dropped — `20260816000000_add_organization_time_tracking_settings.sql`
is untouched), but are deliberately unread/unwritten by any code path now
— see the deprecation notes on `lib/membership.ts`'s `Organization`,
`lib/time-rounding.ts`, `lib/tickets.ts`'s `logTicketTime`, and
`update-organization-settings-action.ts`'s own header comment.

**The fixed rules themselves, and exactly where each is enforced:**

- **Estimated Hours is always visible** — New Ticket, Ticket Detail's
  sidebar "Estimated" field, and the Ticket Preview panel's Hours field all
  reverted to their original, unconditional rendering (`ticket-preview-panel.tsx`'s
  now-unnecessary `useCurrentUser()` call was removed along with it — it
  had no other use).
- **Estimation stays optional at ticket creation** — `createTicket`
  (`lib/tickets.ts`) reverted to no estimate check at all; `new-ticket-modal.tsx`
  reverted its Hours field/submit validation to the original
  always-optional behavior.
- **A real estimate (`hours > 0`) is now required before a ticket can move
  to In Progress, In Review, or Done** (new rule — never existed before
  this pass). Enforced in exactly one place: `updateTicket`
  (`lib/tickets.ts`), the single real gateway every status change in the
  app already goes through (Ticket Detail's `EditableSidebarStatus`,
  Ticket Preview's `EditableStatusBadge` — confirmed by an exhaustive
  search that neither Board nor any other surface has a status-change path
  of its own). Reads the ticket's current `hours` (or the same call's own
  `input.hours`, if it's setting both at once) — never a second query per
  ticket in a loop. Backlog/To Do/Blocked stay estimate-free, and a ticket
  already sitting in a restricted status without an estimate is never
  retroactively flagged — the check only runs when `input.status` is
  actively being set to one of the three. Rejecting requires **no new UI
  code**: both call sites' existing `persist()`/`persistPatch()` wrappers
  (ticket-detail-screen.tsx/ticket-preview-panel.tsx) already show a
  rejection via the shared error toast and never apply the optimistic
  status change on failure — the same "real backend rejection, existing
  error pattern, data preserved" behavior every other inline edit in this
  app already had.
- **Every logged time entry now rounds up to a fixed 15-minute increment**
  — `lib/time-rounding.ts`'s `roundLoggedMinutesUp` (rewritten; the
  previous configurable `roundLoggedMinutes(raw, increment, roundUp)` and
  its Settings-only exports were removed) is the one shared pure helper,
  applied inside `logTicketTime` (`lib/tickets.ts` — again the single real
  write path, so Admin/Project Lead/Member can never diverge) before
  persisting. A positive entry can never round to 0 (`ceil` of any positive
  value is always >= 1 increment). No organization lookup anymore — the
  increment is a fixed constant, not read from any `organizations` column.
  No historical `ticket_time_entries` row was touched or re-rounded.

## Removed (Settings → Notifications) — replaced by a real, global Notifications system

Settings → Notifications (the mock Email/Desktop/Weekly-Digest toggles
section) was retired outright, the same way Settings → Time Tracking and
Settings → Projects were before it — not because preferences moved
elsewhere, but because this app has no configurable notification
preferences at all by design. `settings-screen.tsx`'s `SETTINGS_SECTIONS`
no longer lists it, `settings-section-screen.tsx`'s `NotificationsContent`/
`Toggle` import/dispatch `case` are gone, and `app/settings/[section]/page.tsx`'s
`SECTION_TITLES` no longer includes it — `/settings/notifications` falls
through to the same "Section not found." default `SectionContent` every
other unrecognized slug already renders (same precedent as
`/settings/projects`/`/settings/time-tracking`), and no longer statically
generates. General/Integrations/Danger Zone are unaffected.

In its place: a real, global, in-app notification system — the header
bell (every authenticated page), a 5-most-recent dropdown preview, and a
full paginated `/notifications` page — backed by a brand-new `notifications`
table (`20260817000000_add_notifications.sql`) and one new data layer,
`lib/notifications.ts` (`createNotification`/`loadRecentNotifications`/
`loadNotificationsPage`/`loadUnreadNotificationCount`/`markNotificationRead`/
`markAllNotificationsRead`). No email, push, desktop notifications, cron,
job queues, watchers, configurable preferences, or Supabase Realtime —
purely a table read on demand (initial load, window-focus/tab-visibility
regain, right after marking read, and immediately if a notification is
created for the current session's own profile within the same tab) and
written through a service-role Server Action.

**Four real events create a notification** (never a fabricated/mock one),
each wired into the one real write path that operation already had, after
that write has actually succeeded, fire-and-forget so a notification
failure can never revert or block it:
- **Ticket assigned** — `updateTicket` (`lib/tickets.ts`), when
  `assignee_profile_id` genuinely changes to a real, different profile.
- **Comment on assigned ticket** — `createTicketComment` (`lib/tickets.ts`),
  when the ticket's current assignee isn't the comment's own author.
- **Ticket status changed** — `updateTicket`, when `status` genuinely
  changes, notifying the ticket's current assignee with both the old and
  new status's real display labels (reusing `buildActivityLabel`'s own
  `activityStatusLabel`, never a second copy).
- **Added to project** — `addProjectMember` (`lib/projects.ts`), only on a
  real new `project_memberships` insert (a 23505-caught "already a
  member" — e.g. auto-added by the contribution trigger — never notifies).
  The auto-membership-on-contribution DB trigger itself doesn't go through
  this JS function at all, so it never notifies either.

**Mention-in-comment is deliberately not implemented.** An audit of the
real comment system (`ticket_comments`/`createTicketComment`) found no
structured `@mention` storage anywhere in this schema — comments are
plain, unparsed text. Resolving a "mention" by matching a name in that text
would mean guessing at an ambiguous string match, which this feature's own
rules explicitly rule out. `comment_mention` still exists as a real,
allowed `notifications.type` (checked by the table's own constraint) for
whenever a real, structured mention mechanism is built — no code path
creates one today.

**Every write is centrally guarded, not per-call-site**: `createNotification`
(the single real entry point every one of the four events above calls) is
the one place that skips notifying a profile about its own action —
self-assignment, self-comment-on-own-assigned-ticket (can't happen, but
guarded anyway), and self-added-to-a-project all no-op here rather than
being re-checked at each of the four call sites. `create-notification-action.ts`
(the service-role Server Action `createNotification` calls) independently
re-verifies, server-side: the attributed actor must be whoever is actually
calling it (never a client-claimed id), and both the caller and the
recipient must be real, active members of the exact organization claimed —
so one organization's member can never notify, or fabricate a notification
pointed at, a profile in a different organization. A referenced project/
ticket is likewise confirmed to really belong to that same organization
before the insert.

**RLS**: `notifications` has no `INSERT`/`DELETE` grant or policy for
`authenticated` at all — creation only ever happens through the
service-role action above. A recipient can `SELECT` only their own rows
(`recipient_profile_id = auth.uid()`, plus the same `is_org_member` floor
every other table already uses), and can `UPDATE` only `read_at` on their
own rows (a column-level `GRANT UPDATE (read_at)`, since RLS alone can't
restrict which column). Every bandeja is personal — an Admin/Project Lead
never automatically sees anyone else's notifications, same as every other
role in this app.

Bell click destinations reuse the app's existing stable-route convention
(the same one global Search's own results popover already established in
`sidebar.tsx`) rather than the Ticket Preview panel's client-only state,
since the bell has to work from any authenticated page: a ticket
notification goes to `/projects/{slug}/tickets/{code}`, a project-only one
to `/projects/{slug}`, and one with neither destination just marks itself
read in place. All of the above is implemented and type/build-clean
(`tsc`/`eslint`/`next build` all pass) — same "should work, not yet
verified live" status as everything else in this list.

## Removed (Settings → Integrations) — replaced by Project Settings → Repository Integration

Settings → Integrations (the mock "Connected: GitHub" card plus
Slack/Google Calendar/"Coming soon" Jira Import in the "Available" list)
was retired outright, the same way Notifications/Time Tracking/Projects
were before it — not because it moved to another org-wide screen, but
because integrations are a **per-project** concern, not an organization-wide
one. `settings-screen.tsx`'s `SETTINGS_SECTIONS` no longer lists it,
`settings-section-screen.tsx`'s `IntegrationsContent`/dispatch `case` are
gone, and `app/settings/[section]/page.tsx`'s `SECTION_TITLES` no longer
includes it — `/settings/integrations` falls through to the same "Section
not found." default `SectionContent` every other unrecognized slug already
renders (same precedent as `/settings/notifications`/`/settings/time-tracking`/
`/settings/projects`), and no longer statically generates. General/Danger
Zone are unaffected. `settings-ui.tsx`'s `Toggle` primitive — only ever
used by the mock Notifications/Integrations toggles, both now gone — was
removed outright too, having no real call site left anywhere in the app.

In its place: Project Settings (`/projects/[slug]/settings`) gained a new
**Repository Integration** section — Repository Provider (a real
`repository_provider` enum column: `none`/`github`/`gitlab`, matching the
same enum-column convention `status`/`priority`/`health`/`category`
already use on `projects`, added by
`20260818000000_add_project_repository_integration.sql`) and Repository
URL (`repository_url`, plain text, hidden entirely when Provider is
"None"). **No OAuth, no sync, no commit reads, no webhooks, no "Connect"/
"Disconnect"/"Test Connection" button, and nothing ever calls out to
GitHub/GitLab** — this is deliberately just the persisted configuration,
format-validated client-side only (`https://github.com/owner/repository` /
`https://gitlab.com/group/project`) before Save Changes will accept it,
ahead of a real integration. The section's own small status line reads the
**persisted** record (`project.repositoryProvider`/`repositoryUrl`, not
the in-progress draft) — "Not connected" when unset, "GitHub connected" /
"GitLab connected" otherwise — with an "Open Repository" link (opens the
saved URL in a new tab) shown only once a real URL is saved; switching
Provider back to "None" and saving always clears `repository_url` too, so
a stale URL can never persist invisibly behind it. `lib/projects.ts`'s
`ProjectDetail`/`ProjectSettingsUpdate`/`loadProjectDetail`/
`updateProjectSettings` all gained this pair of fields; `ProjectSummary`
(the Sidebar/`/projects` list shape) deliberately did not, since nothing
outside Project Settings needs it yet. Implemented and type/build-clean
(`tsc`/`eslint`/`next build` all pass) — same "should work, not yet
verified live" status as everything else in this list.

**Data model corrected, one pass later**: the first pass above made
`repository_provider` a `not null` enum defaulting to `'none'` — a real
follow-up spec pass replaced that with the intended model, `null` meaning
"None" (there is no separate `'none'` value written or read anywhere
anymore), via a new additive migration,
`20260819000000_make_project_repository_provider_nullable.sql` (drops the
column's `not null`/`default`, migrates any existing `'none'` rows to
`null`, and adds two real `CHECK` constraints: `repository_provider` can
only ever be `null`/`'github'`/`'gitlab'` — `'none'` stays a defined enum
label since Postgres can't drop one in place, but the `CHECK` keeps it from
ever being stored again — and `repository_url` must be `null` exactly when
`repository_provider` is `null`, non-null otherwise, never one without the
other). `RepositoryProvider` (`lib/projects.ts`) is now `"github" |
"gitlab"`, and every real reader/writer (`ProjectDetail.repositoryProvider`,
`ProjectSettingsUpdate.repositoryProvider`, `loadProjectDetail`,
`updateProjectSettings`) uses `RepositoryProvider | null` instead. The
format-validation regexes (GitHub: exactly `owner/repository`, host
anchored to `github.com` so a lookalike like `github.fake.com` can't pass;
GitLab: `group/project` with unlimited subgroup nesting,
`group/subgroup/.../project`, host anchored to `gitlab.com`) moved into a
single pure, exported `validateRepositoryUrl(provider, url)` in
`lib/projects.ts` — `project-settings-screen.tsx`'s pre-Save check and
`updateProjectSettings`'s own backend-side check (a real safety net behind
the UI, so a direct call bypassing it can never persist a malformed or
missing URL either) both call the same one implementation, never two that
could drift. A new `normalizeRepositoryUrl` (also `lib/projects.ts`,
applied only inside `updateProjectSettings`, once, regardless of caller)
trims and strips exactly one trailing `/` before persisting — `.git`
suffixes are never required or stripped. The Select's "None" option is
represented by an empty-string sentinel in the DOM value space only
(native `<select>` can't hold `null`), translated to real `null` the
instant it's chosen — which also clears the local URL draft immediately,
not just at Save. Real authorization was already in place and needed no
change: `projects_update`'s RLS (`is_org_admin_or_lead(organization_id)`,
the same policy every other Project Settings field already writes
through) evaluates against the row's own real `organization_id`, never a
client-claimed one, so a forged `organizationId` argument can neither
target another organization's project nor grant a caller a role they don't
really have.

## GitHub OAuth (Repository Integration)

Real, working OAuth 2.0 + PKCE connection between one project's Repository
Integration and the real GitHub repository its `repository_url` points at
— GitLab has no OAuth in this pass (`GitLab: mantener solo "Repository
configured"` per this feature's own spec), and nothing this app writes
back to GitHub (no webhooks, commits, PRs, issues, branches, deployments,
sync, or import).

**New table, `project_repository_connections`** (migration
`20260821000000_add_project_repository_connections.sql`) — separate from
`projects.repository_provider`/`repository_url`, which are **untouched by
this pass** and still mean exactly what they meant before it (the plain
configured link). This table means something different: a *verified*
authorization proving real read access to that same repository. One row
per project (`unique(project_id, provider)`, `provider` constrained to
`'github'` only), storing the access token split across three columns
(`access_token_ciphertext`/`_iv`/`_auth_tag` — AES-256-GCM output, never a
single packed blob) plus safe display metadata (`provider_username`,
`repository_full_name`, `repository_html_url`, `repository_default_branch`,
`repository_is_private`, `connected_by_profile_id`, `connected_at`,
`last_verified_at`). RLS is enabled with a real `SELECT` policy mirroring
`is_org_admin_or_lead` (defense in depth / floor for any future direct
read), but **no `authenticated` grant of any kind exists on this table** —
every real read or write goes through a service-role Server Action, so a
client literally cannot query this table directly, which is what makes
"loaders never return the encrypted columns" trivially true rather than
something to keep independently correct at the column level. A new `AFTER
UPDATE OF repository_provider, repository_url` trigger on `projects`
(`invalidate_github_repository_connection`, `security definer`) deletes
any matching connection row the instant either field changes on Save
(including a change to "None") — this fires regardless of the calling
role's own (intentionally absent) grants on the connections table, and
means a saved GitHub authorization can never be silently reused against a
different repository than the one it was actually verified against.

**`lib/server/github-token-crypto.ts`** — the one place a token is ever
encrypted or decrypted. AES-256-GCM via `node:crypto`, a random 96-bit IV
per encryption (never reused), and `GITHUB_TOKEN_ENCRYPTION_KEY` decoded
from base64 and validated to be exactly 32 bytes before use (a wrong-length
key throws immediately rather than producing a subtly-broken cipher).
Throws at import time if it's ever evaluated with `window` defined — this
repo adds no new dependencies, so there's no `server-only` package to
enforce that at build time; this is the equivalent runtime backstop. A
decrypted token is never assigned to anything a Server Action returns, is
never logged, and only every exists for the duration of one outgoing
`fetch` to the GitHub API.

**`lib/server/github-repository-connection.ts`** — shared, non-"use
server" helpers used by both Route Handlers and the Server Actions below
(caller/admin Supabase client factories, `isOrgAdminOrLead` — a direct
mirror of `projects_update`'s own RLS, queried service-role-side so it
can't be spoofed by a client-controlled organization id — GitHub URL
parsing/validation, GitHub API headers/status-code mapping, and the OAuth
flow's own cookie names/options).

**`GET /api/integrations/github/connect?projectId=<real id>`** — starts
the flow. A real architecture gap had to be worked around here: this app's
Supabase session lives in the browser's own `localStorage` (see
`lib/supabase-client.ts`), not a cookie, so a plain top-level GET
navigation to a Route Handler carries no proof of identity on its own
(unlike the Server Actions elsewhere in this app, which receive an
explicit `accessToken` argument via Next.js's own RPC transport — not
possible for a route reached by `<a>`/`window.location.href`). The fix:
`project-settings-screen.tsx`'s "Connect GitHub"/"Reconnect GitHub" button
bridges its own already-verified session token into a short-lived (30s),
single-purpose, path-scoped (`/api/integrations/github` only) cookie
(`jirita_gh_bridge`) immediately before navigating — this route reads it
once, verifies it exactly like every other Server Action already does
(`caller.auth.getUser(token)`), and clears it right away. This is still a
normal top-level navigation (`window.location.href`, never `window.open`)
— no popup, and the actual OAuth logic (state/PKCE generation, the
GitHub redirect URL itself) is all constructed server-side, never in
client code. Once authenticated, the route re-derives the real project row
by id (never trusts a client-supplied slug/organization id), checks
`is_org_admin_or_lead`, confirms `repository_provider === "github"` with a
real saved URL, generates a cryptographically random `state` and PKCE
`code_verifier`/`code_challenge` (S256), stores them (plus the project id,
organization id, and the caller's own profile id — needed again at
callback time, since GitHub's own redirect back is a fresh, unauthenticated
navigation with no bridge cookie available) in httpOnly, `SameSite=Lax`,
10-minute cookies, and redirects to `github.com/login/oauth/authorize`
with `scope=repo` and `allow_signup=false`.

**`GET /api/integrations/github/callback`** — re-validates everything
again from scratch rather than trusting the connect-time cookies blindly:
exact `state` match (aborts and clears cookies without exchanging the code
on any mismatch), a fresh `is_org_admin_or_lead` check, and that
`repository_provider`/`repository_url` are still exactly what they were at
connect time. Exchanges the code server-side
(`client_id`/`client_secret`/`code`/`redirect_uri`/`code_verifier` against
`github.com/login/oauth/access_token`, `client_secret` never leaving the
server), verifies the account via `GET /user`, then verifies **real read
access to the exact configured repository** via `GET /repos/{owner}
/{repo}` (parsed from `repository_url`, `.git`/trailing-slash stripped
only for the API path, never for what's stored) — confirming the
returned `full_name` case-insensitively matches and, when GitHub returns a
`permissions` object, that `permissions.pull === true`. `401`/`403`/`404`
map to distinct, safe reason codes; nothing is saved if any check fails.
On success, the token is encrypted and the connection row upserted
(`onConflict: project_id,provider`). Every redirect back to Project
Settings — success or failure — carries only a small, closed-set
`?integration=connected` or `?integration=error&reason=<code>` indicator,
never a GitHub response body, code, or token; the return path itself is
always computed server-side from the real project's own slug, never
accepted from the client or GitHub, so there's no open-redirect surface.

**Status/UX** — `loadGitHubConnectionStatusAction` is the only way the UI
ever learns the real state: `not-connected` (no row), `connected` (a row
whose `last_verified_at` is fresh — under 15 minutes old — or that just
re-verified successfully; returns `username`/`repositoryFullName`/
`repositoryHtmlUrl`, never token/scope data), or `needs-reconnect` (the
stored token failed a live re-check — `repository_provider`/
`repository_url` are left untouched, only the UI's own "Connect
GitHub"/"Reconnect GitHub" is affected). Re-verification calls
`GET /repos/{full_name}` with the decrypted token and is deduped
per-connection via an in-process `Map` of in-flight promises, so a
focus-regain refresh landing at the same moment as an initial load shares
one real GitHub request rather than firing two — there is no polling
anywhere in this feature. `project-settings-screen.tsx` only ever fetches
this when the project's real, persisted `repositoryProvider` is
`"github"`, re-checks when the project identity/provider/**url** changes
(a same-provider URL edit still invalidates the old connection via the DB
trigger above, so the URL has to be a dependency too, not just the
provider) or on window-focus/tab-visibility regain
(`useRefreshOnFocusAndVisibility`, the same shared hook the Member Profile
Modal/Users list already use), and shows a one-time `?integration=`
banner that's stripped from the URL immediately after being read so a
refresh/back-navigation can never re-show a stale result.
**Disconnect** (`disconnectGitHubProjectConnectionAction`) re-verifies
`is_org_admin_or_lead` fresh and only ever deletes the local
`project_repository_connections` row — GitHub's own OAuth App
authorization is never revoked (the user can do that themselves from
github.com/settings/applications).

**Env var naming note**: this feature's own request named the client
credentials `GITHUB_OAUTH_CLIENT_ID`/`GITHUB_OAUTH_CLIENT_SECRET`, but
this environment's real `.env.local` already has them as
`GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET` (the callback URL and
encryption key names matched exactly:
`GITHUB_OAUTH_CALLBACK_URL`/`GITHUB_TOKEN_ENCRYPTION_KEY`). The code reads
the names that are actually set (`GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET`)
— `.env.local` was not modified, per this feature's own explicit
instruction, and no value/secret was ever printed or logged while
confirming this.

Implemented and type/build-clean (`tsc`/`eslint`/`next build` all pass).
**Not interactively verified against real github.com** in this
environment (no live GitHub OAuth App credentials/browser session
available here) — same "should work, not yet verified live" status as
every other backend feature in this list, stated plainly rather than
implied otherwise.

**Stability/security hardening, one pass later**: two real problems
surfaced from dev logs were fixed without changing any UI or the OAuth
flow's own functional behavior. First, the status-check `useEffect` in
`project-settings-screen.tsx` had grown a dependency array whose length
changed between an earlier edit and a later one within the same dev
session (`[readyProject?.id, readyProject?.repositoryProvider]` →
`...repositoryUrl]` added afterward) — harmless after a full reload, but
exactly the shape of change that trips React's "size changed between
renders" check under Fast Refresh, and worth hardening against for good.
The effect's dependency array is now a fixed, statically-written 4-tuple
(`[readyProject?.id, readyProject?.repositoryProvider,
readyProject?.repositoryUrl, refreshGitHubStatus]`) — same length and
order always, no spread/filter/ternary — and the effect body was reworked
to reference only `readyProject?.repositoryProvider` (already a
dependency), never the bare `readyProject` object, so `refreshGitHubStatus`
could be added as a real, non-suppressed dependency (its own identity only
changes exactly when `readyProject`/`isDevFallback`/`organization` do, so
this adds no spurious re-runs). Second, and more seriously: the Supabase
JWT was being passed as a plain, serializable `accessToken` argument to
`loadGitHubConnectionStatusAction`/`disconnectGitHubProjectConnectionAction`
— visible in Next.js's own dev-time Server Action logging/network
payloads, i.e. a real token-exposure bug, not just a lint nitpick. Both
actions' signatures dropped `accessToken` entirely (now just
`{ projectId }`) and instead call a new `consumeBridgeSessionToken()`
(`lib/server/github-repository-connection.ts`) that reads the same
short-lived cookie mechanism `/connect`'s own bridge already uses — a
deliberate reuse rather than a second authentication strategy — via
`next/headers`'s `cookies()`, and clears it immediately, whether or not it
was present. That cookie's path had to widen from
`/api/integrations/github` (fine for a plain navigation to `/connect`) to
`/` — a Server Action call originates from whatever page path the caller
is on (e.g. `/projects/[slug]/settings`), which a narrower-scoped cookie
would never reach — so the bridge cookie's own clearing logic in both
Route Handlers was split out from the other five OAuth-flow cookies
(state/verifier/projectId/organizationId/profileId, which correctly stay
scoped to `/api/integrations/github`, only ever read by `/callback`). The
token itself still never appears in a log, a Server Action argument, a
response, a query param, or persisted React state — confirmed by a repo-
wide grep of every file in this feature, not just asserted.

## Ticket Detail → Development (real GitHub, read-only)

Ticket Detail (`ticket-detail-screen.tsx`) gained a real **Development**
section — branches, commits, and pull requests related to one ticket by
its own real ticket code (e.g. "JIR-8") only, never by title, author name,
or any other ambiguous text. This replaces (by name only — nothing else
was reused) the old fully-mock "Development" module removed earlier in
this app's history for having no real integration to back it; that
removal's own reasoning is now resolved by the real GitHub OAuth
connection built in the previous pass.

**`lib/server/ticket-development-actions.ts`** (new Server Action,
`loadTicketDevelopmentActivityAction`) is the only place this data is
read. Same session-bridge pattern as the GitHub OAuth Server Actions (the
JWT is never one of this action's own arguments — Next.js's dev-time
Server Action logging would expose it — so `ticket-detail-screen.tsx`
bridges its own already-verified session into the same short-lived cookie
`project-settings-screen.tsx`'s own `bridgeGithubSession()` established,
duplicated locally here as `bridgeGithubSessionForDevelopment()` rather
than a shared client module). Authorization reuses real RLS rather than a
second permission model: the project and ticket are both looked up with
the *caller's own* Supabase client (anon key + their bearer token), so
`projects_select`/`tickets_select`'s existing `can_view_project` policy
decides what's visible — a row only ever comes back for a project/ticket
this profile can genuinely view, and a ticket code is never trusted
blindly (it's parsed the same "`<project_code>-<number>`" way
`lib/tickets.ts`'s own `loadTicketByCode` does, then confirmed against a
real `tickets` row in that exact project). Only once that's confirmed does
anything escalate to the service-role client, and only to read
`project_repository_connections` (no `authenticated` grant exists on it at
all) and decrypt its token via the existing `decryptGitHubToken` — neither
the OAuth migration, the crypto helper, nor Project Settings' own
Repository Integration section were modified to build this.

**Read-only GitHub queries**, exactly one request per type
(`GET /repos/{owner}/{repo}/branches`, `/commits`, `/pulls?state=all`, each
`per_page=100`, fetched in parallel) — never one request per result.
Matching is case-insensitive substring matching against the ticket code
only: branch **name**, commit **message**, PR **title**/**body**/**head
branch** — nothing else. Results are capped (5 branches, 10 commits, 10
PRs) and sorted (branches alphabetically, commits/PRs by date descending)
after filtering. A 5-minute, server-process-local cache keyed by
`projectId:ticketCode` (plus an in-flight-request dedupe map, same
convention as the OAuth status check) means a focus-regain refresh or a
second render within that window never re-calls GitHub — no polling, no
Realtime, nothing persisted to Supabase (commits/PRs/branches are never
stored, only read live and cached in memory).

**The section either shows real data or doesn't exist at all** — there is
no "connect GitHub" CTA inside a ticket (that stays exclusively in Project
Settings), no "No development activity" empty state, and no visible error
banner for an expired connection or a GitHub 401/403/404: every one of
those cases collapses into the same `{ status: "hidden" }` result, and the
component renders nothing (not even the section header) once that's known
— a brief scoped skeleton (reusing the existing `SkeletonBlock` primitive,
inside the section only, never blocking the rest of the page) shows only
while that determination is still in flight. GitLab projects never show
this section at all in this pass (no OAuth exists for GitLab). The DTO
returned to the client is a small, explicit, hand-picked shape per item
(e.g. a commit's short SHA/message/author/avatar/date/URL) — never a
GitHub access token, the connection's ciphertext/IV/auth tag, OAuth
scopes, or a raw GitHub API response.

Visually, `Development` reuses the exact same `CollapsibleSection`
wrapper/heading style every other Ticket Detail body section (Attachments,
Time Tracking, Comments, Activity) already uses, positioned between
Attachments and Time Tracking per this feature's own spec; every row is a
single `target="_blank" rel="noopener noreferrer"` link out to the real
GitHub page — no create-branch/create-PR/comment/merge/status-change
affordance exists anywhere in it. Ticket Preview, Board, Reports, Activity
Log, Notifications, and Project Overview were all deliberately left
untouched — this is Ticket Detail only. Implemented and type/build-clean
(`tsc`/`eslint`/`next build` all pass) — same "should work, not yet
verified live" status as the GitHub OAuth connection itself; not
interactively verified against a real connected repository in this
environment.

**Visual polish, one pass later** (presentation only — no change to the
loading logic, the OAuth connection, GitHub queries, matching, caching,
limits, sort order, DTOs, links, the skeleton, or the show/hide
conditions, and `lib/server/ticket-development-actions.ts` was not
touched at all): each of the three groups (Branches/Commits/Pull
Requests) now shows its own small icon, name, and real count in
parentheses (e.g. "Branches (1)") and is only rendered at all when it
actually has items — `CollapsibleSection`'s own existing `· N items`
header badge is unchanged and is still the only overall total, never
duplicated per group. Rows lost their bordered/filled-card look in favor
of a plain, compact hover row (no per-item boxes, no heavy borders, no
large icons) — a git-branch/commit/pull-request icon set small enough to
sit next to each group's own label, reused on branch rows themselves too.
Commit and pull-request rows now follow an explicit two-line hierarchy
(SHA/`#number` + message/title on the first line, avatar + author +
relative date — plus, new, the PR's own head branch when present — on the
second), and a branch name that doesn't fit no longer gets cut off with an
ellipsis (`break-all` instead of `truncate`, matching the requirement that
a long branch name may wrap across lines rather than lose information).
Every row keeps a visible focus ring for keyboard navigation, decorative
icons and avatars are `aria-hidden`/empty-`alt` (the adjacent visible text
already says the same thing), and each row also carries an explicit
`aria-label` describing its real destination. Collapse/expand behavior is
unchanged — collapsing `Development` still hides every group at once,
there is no independent per-group collapse. PR state colors were already
drawn from the app's existing palette (emerald/slate/brand/red, the same
badge convention used elsewhere) and Merged already took priority over
Closed in `ticket-development-actions.ts`'s own `pullRequestDisplayState`
before this pass — neither needed to change.

**Real bug fixed, one pass later: commits on unmerged feature branches
were never found.** `GET /repos/{owner}/{repo}/commits` with no `sha`
parameter only ever returns the *default* branch's own history — a real
commit whose message contained the ticket code (e.g. "JIR-8") but that
only existed on an unmerged branch like `test/JIR-8-github-integration`
was silently invisible, even though that same branch already correctly
showed up in the Branches group. `ticket-development-actions.ts` now
queries commits **per related branch** (`?sha={branchName}`, the exact
same already-capped-at-5 branch list the Branches group displays — never
a second, larger set) plus one additional query against the connection's
own real `repository_default_branch` (read from
`project_repository_connections`, never `"main"`/`"master"` assumed; if
it's unset, that one query is simply skipped, related-branch commits
still load), so a commit that's only ever existed on a feature branch —
and one that's since been merged to the default branch — are both found.
Every one of those parallel per-ref requests (`Promise.allSettled`, not
`Promise.all`) is independently fault-tolerant: a branch deleted between
the branches listing and this query (or any other single-ref failure)
only drops that one ref's commits — it never hides Branches/Pull Requests
or results already found from the other refs, matching this feature's own
"no technical error inside a ticket" rule. Results are deduped by the
commit's **full SHA** (never the short display SHA) before the existing
sort-by-date-descending/cap-at-10 logic runs, so a commit that shows up on
both its feature branch and, once merged, the default branch is still
shown exactly once. The matching rule itself didn't change (ticket code
only, case-insensitive, against `commit.message`), the 5-minute cache
key is still `projectId:ticketCode` unchanged, and the DTO/UI were not
touched — this was purely a server-side data-completeness fix.

**Manual "Refresh," one pass later** — Development's header gained a
discrete `Refresh` action (next to the collapse chevron, same
`headerAction` slot/visual convention Attachments' "Upload Files" and
Time Tracking's "Log Time" buttons already use) so a newly created
branch/commit/PR doesn't have to wait out the existing 5-minute cache.
`loadTicketDevelopmentActivityAction` gained one new, optional
`forceRefresh` boolean (`lib/server/ticket-development-actions.ts`) that
skips *only* the cache-read for that exact `projectId:ticketCode` key —
the key itself is still always rebuilt server-side from the same real,
already-validated `projectId`/`ticketCode` this action already used, so
the client can never force-refresh an arbitrary key, and every
authorization check (session/organization/project+ticket access/GitHub
connection) still runs in full on every forced call, exactly as on a
normal one. No polling, no Supabase Realtime, no webhooks, no periodic
auto-refresh, and the 5-minute TTL/matching/OAuth flow are all otherwise
unchanged. A forced check that comes back `hidden` (a transient GitHub
hiccup) never overwrites an already-good cached `ready` snapshot for that
key (`computeTicketDevelopmentActivity`'s own new check) — Refresh can
only ever replace good data with *fresher* good data, never blank it out
over one failed attempt; the button itself keeps existing Branches/
Commits/Pull Requests on screen for the whole round trip (React state
isn't touched until the new result actually arrives) and only shows a
disabled state with the existing `animate-spin` convention (already used
elsewhere in this same file) on its own small icon — never a full-section
skeleton replacing real data, and never a technical error if the refresh
itself fails. A ticket/project navigation while a refresh was still in
flight resets the button's own disabled state so it can never get stuck.

**Closing quality pass, one pass later** (presentation/readability only —
no OAuth, cache TTL/matching, encryption, Project Settings, or migration
changes, and `ticket-development-actions.ts` was not touched at all):

- **Merge commits read as text again.** GitHub's own auto-generated merge
  commit message ("Merge pull request #1 from owner/branch") is now shown
  as "Merged "&lt;PR title&gt;"" when that PR's title is already available
  from the *same* Development load (a `Map` built from the already-fetched
  `pullRequests`, never a second GitHub request). **Corrected, one pass
  later**: if no matching PR is found, the original GitHub message is left
  exactly as-is — the earlier "Merged Pull Request #N" placeholder text was
  removed, since fabricating a stand-in label wasn't actually asked for.
  Purely a display transform either way — the real commit message, SHA,
  and URL are all untouched; a normal (non-merge) commit message renders
  exactly as before.
- **The Merged/Open/Draft/Closed badge now reuses `StatusBadge`'s own
  pill shape** (`ticket-ui.tsx` — `inline-flex items-center px-2 py-0.5
  rounded-md text-[11px] font-semibold`) instead of a bespoke one, with
  `uppercase tracking-wide` kept on top so the on-screen text still reads
  "MERGED"/"OPEN"/etc. exactly as before.
- **The header counter is a real, pluralized summary** — "· 1 Branch · 3
  Commits · 1 PR" (correct singular/plural per category, a category with
  zero items simply omitted) instead of "· 5 items", still rendered in
  `CollapsibleSection`'s existing single-line badge slot next to the
  title — same header height as before, always visible whether collapsed
  or not.
- **A discreet GitHub mark** now sits directly before the "Development"
  title text (`CollapsibleSection`'s `title` prop was widened from
  `string` to `ReactNode` to allow this — a zero-behavior-change type
  broadening; the other four sections that use it, Attachments/Time
  Tracking/Comments/Activity, all still pass a plain string and render
  identically). No asset was downloaded — it's one more small inline SVG,
  matching the exact size/neutral color already used for Development's own
  branch/commit/PR icons.
- **Spacing between the three groups was tightened slightly**
  (`space-y-4` → `space-y-3`) for a more compact block; row content,
  padding, and the full-row single-`<a>` click target (already covering
  the entire row, not just the visible text, for Branches/Commits/Pull
  Requests alike) were confirmed unchanged. The short SHA display (never
  the full SHA — the DTO doesn't even expose one) was likewise confirmed
  unchanged, already consistent.

## Ticket Detail → loading skeleton

Replaced the plain "Loading ticket…" text state with a real,
full-fidelity `TicketDetailSkeleton` (`ticket-detail-screen.tsx`, defined
just above `TicketDetailScreen`), shown for both the initial page load and
the already-existing automatic refresh on focus/tab-visibility regain —
neither trigger changed; only what gets rendered while `loadState ===
"loading"` did.

- Mirrors the real layout exactly, using the same outer shell
  (`max-w-5xl mx-auto px-6 sm:px-10 py-10`), the same
  `article`/`aside` two-column split (`flex gap-12 items-start`,
  `w-56 flex-shrink-0 sticky top-8`), `CollapsibleSection`'s own
  `mt-10 pt-8 border-t` rhythm for each main-column placeholder
  (Description, Attachments, Development, Time Tracking, Comments,
  Activity, in that order), and `SidebarField`'s own `py-3.5 border-b
  ... last:border-0` rhythm for each of the eight sidebar rows (Status,
  Assignee, Type, Priority, Estimated, Due Date, Labels, Related
  Tickets) — so there's no layout shift once the real ticket mounts.
- Reuses the existing `SkeletonBlock` primitive (`dashboard-shared.tsx`)
  throughout; no second skeleton primitive/library was introduced, and
  `SkeletonBlock` itself was not modified.
- `BackToTicketsButton` is kept real (not a placeholder) — it's cheap and
  data-independent, and global navigation is never blocked while a
  ticket is loading.
- Development gets only a generic, compact placeholder (two plain
  skeleton rows) — the real `DevelopmentSection` (and its own GitHub
  fetch) is never mounted while this skeleton is showing, since it's
  nested inside the same `loadState === "loading"` early return as
  before.
- Root container carries `aria-busy="true"`; every placeholder is a
  plain, non-interactive `<div>` (no tabbable elements besides the real
  `BackToTicketsButton`).
- No new listeners, timers, or artificial delays were added —
  `runFetchTicket` and its `useEffect` (including the existing
  `organization`-reference-change trigger that already re-fires this on
  focus regain) are untouched.
- Scope: only `ticket-detail-screen.tsx` was touched. No change to
  `ticket-development-actions.ts`, GitHub OAuth, Project Settings, or
  any migration.

## Still mock

- **Resolved, differently than planned**: the workspace-wide Settings screen
  (`/settings/*` — General, Danger Zone) is no longer on this list, but not
  because it was made real — it was retired outright, since JIRITA is
  single-tenant and this configuration isn't meant to be Admin-editable
  through the UI. See Removed → Settings → General & Danger Zone. Time
  Tracking and Projects were both retired outright before it, for
  unrelated reasons — see Removed → Settings → Time Tracking (estimate
  visibility/requirement and time rounding are now fixed product behavior,
  not a setting) and Removed → Settings → Projects. Notifications and
  Integrations were retired outright too — Notifications replaced by a
  real global system (see Removed → Settings → Notifications),
  Integrations replaced by Project Settings' own real Repository
  Integration section (see Removed → Settings → Integrations).
  Also **resolved**:
  `src/components/project-lead-reports-screen.tsx` (the
  Project Lead role's own Reports view) no longer reads
  `PROJECT_TICKETS`/`RECENT_ACTIVITY`/`MY_PROJECT_NAMES` or any other
  mock data — see Confirmed working → Reports → Project Lead.
- **Resolved**: Invite User's Default Role/Weekly Capacity prefill and Time
  Tracking's expected-hours/Hours Missing calculations read the real
  `organizations.default_role`/`default_weekly_capacity`/`active_days`
  columns — still unchanged by the Settings screen's removal, since that
  data was never dropped, only the UI that used to write it. See Removed →
  Settings → General & Danger Zone → "Still consumed by" for the full
  breakdown.
- Within Tickets/Ticket Detail specifically, still mock/unimplemented on
  purpose: New Ticket's "More Options" fields (Type/Status/Priority/
  Labels/Due Date always write fixed defaults); editing or deleting a
  Comment (local-only); Milestone and Story Points fields on Ticket Detail
  (dead code); GitHub/Development integration (removed entirely, no real
  integration exists).
- Within Users specifically, still mock/unimplemented on purpose: the
  Users list's inline Weekly Capacity cell (`CapacityCell`, no Server
  Action yet); Resend Invitation (toast-only); editing a user's email
  (shown, never persisted); `browser`/`os`/`device` on the Security tab (no
  real source, simply don't render).
- Within Project → Team specifically, still mock/unimplemented on purpose:
  per-person `status` (Available/Busy/Away) — every real member shows a
  fixed "Available".
- Within Project Notes specifically, still mock/unimplemented on purpose:
  the Tag field (interactive, never persisted); `project_note_activity` is
  written by real triggers but no screen reads it yet.
- `docs/UNFUDDLE_IMPORT_SPECIFICATION.md` defines how Techtivo's Unfuddle
  backup maps onto the schema for the eventual data migration. No importer
  code exists yet.

Note also that Projects' own real rows still don't populate
`openTickets`/`blockedTickets`/`overdueTickets`/`progress`/
`awaitingReviewTickets`/`dueThisWeekTickets`/`activeMilestones` — those are
derived from `tickets` by design and default to `0`/`healthy` on the
`projects` table itself, since nothing re-aggregates those derived fields
back onto the row (see `docs/SUPABASE_MVP_SCHEMA.md`). The Admin Project
Overview, per-project Reports, **and, since this pass, the `/projects` list
itself** all work around this the same way — computing Health/Progress/Open/
Blocked/Overdue directly from real tickets at read time (via
`buildProjectHealthRows`/`computeProjectProgressPct`, see Current Sprint →
Completed → Projects) instead of relying on those stored-but-unpopulated
fields. Only `awaitingReviewTickets`/`dueThisWeekTickets`/`activeMilestones`
remain genuinely unpopulated/`0` anywhere in the app — still read by the
Projects list's own Project Lead info chips/summary cells.

---

# Navigation Status

All completed screens must remain accessible.

Important rule:

No newly implemented screen may replace an existing one.

Every new feature must be integrated into the application's navigation so that all completed screens remain reachable.

Current working routes:

- `/` — Dashboard (role-specific: Admin / Project Lead / Member)
- `/my-work`
- `/projects` — role-specific (Admin full table / Project Lead scoped blocks / Member "My Projects")
- `/projects/[slug]` — real end-to-end for all three roles (Admin/Project Lead/Member)
- `/projects/[slug]/tickets`
- `/projects/[slug]/tickets/[ticketCode]`
- `/tickets` — new org-wide, all-projects Tickets view (no route param); reuses `TicketsScreen` with `slug` omitted; not on the Sidebar's main nav, reached only via the Admin Dashboard's own KPI-card/health-insight click-throughs, same "link-only" precedent as `/activity`/Work History
- `/projects/[slug]/notes`
- `/projects/[slug]/team` — Admin/Project Lead only (real roster, Add/Remove Member)
- `/projects/[slug]/team/[userId]/work-history` — dedicated, server-side-paginated Work History page (Admin viewers get a real Search/Project/Period/Status/Activity filter row + 4th "Activities" KPI, scoped to every real org project; Project Lead/Member see the original unfiltered single-project view, unchanged)
- `/time-tracking/team/[userId]/work-history` — new global counterpart (Project Lead only entry point today, via Timesheets' "View →"); same filter/KPI system as above, scoped to this Lead's own led projects; not on the Sidebar's main nav, same "link-only" precedent as `/projects/[slug]/team/[userId]/work-history`
- `/projects/[slug]/activity` — dedicated, server-side-paginated Project Activity history page (new)
- `/projects/[slug]/reports` — real end-to-end, every role
- `/projects/[slug]/settings` — Admin/Project Lead only (per-project General/Billing/Danger Zone)
- `/reports` — role-specific (Admin company-wide / Project Lead scoped Delivery+Team / Member: no access)
- `/time-tracking` — role-specific (Admin/Member Billing/Finance view real end-to-end / Project Lead delivery-focused view now real too, scoped to led projects / Member: no sidebar link, folded into My Work instead)
- `/users` — Admin only (workspace-wide user account management, replaces the old `/settings/people`)
- `/activity` — dedicated, server-side-paginated, org-wide Activity History page (new), the org-wide sibling of `/projects/[slug]/activity`; not on the Sidebar's main nav, reached only via the Dashboard's "View all activity →" action, same "link-only" precedent as `/projects/[slug]/team/[userId]/work-history`
- `/settings` and `/settings/[section]` (every subroute) → redirect to `/dashboard`; the workspace-wide Settings screen was retired outright (single-tenant — see Architecture Status → Removed (Settings → General & Danger Zone)), not on the Sidebar for any role

---

# Design Decisions

## UI Inspiration

Primary inspiration:

- Linear

Secondary inspiration:

- Jira
- GitHub
- Notion

Goals:

- Modern
- Clean
- Dense information
- High productivity
- Excellent dark mode

---

## Navigation

The application should always feel like a complete product.

Avoid isolated prototype screens.

Every implemented page must be linked through normal navigation.

---

## Mock Data

Until backend integration begins:

- Use realistic mock data.
- Keep relationships coherent.
- Maintain consistent IDs.
- Simulate real project activity.

---

# Development Rules

Always preserve existing functionality.

Never remove completed screens.

Never break navigation.

Prefer extending existing components instead of replacing them.

Maintain visual consistency across Light and Dark modes.

Favor reusable components over duplicated implementations.

**Git workflow**: always work on `main`; commit and push only to `origin/main`; never create branches or Pull Requests unless explicitly asked to.

---

# Technical Debt

Current known items:

- **Resolved**: `ProjectOverview`'s Member-role variant (`project-overview.tsx`) is now real end-to-end and keys off `slug` like the Admin/Project Lead rebuilds — see Architecture Status → Project Overview.
- **Resolved**: Assigned/Priority/Status filter dropdowns and the 5 quick-filter chips on the Tickets page, plus the "Add Filter" menu (Labels/Due Date/Reporter/Created Date/Updated Date), all now really filter the ticket list, combined with AND — see Current Sprint → Completed → Tickets → Filter Bar.
- New Ticket's "More Options" fields (Type, Status, Priority, Labels, Due Date) always write fixed defaults (`backlog`/`medium`/`task`/none — Status changed from `to_do` to `backlog`, matching the database column's own default), never the value picked in the form.
- **Resolved for rename/delete**: Ticket Attachment rename and delete are now real and persisted (Storage + metadata row). "Replace File" was removed from the menu entirely rather than left as a mock stub. Editing or deleting a *Comment* is still local-only — not persisted to Supabase.
- Milestone and Story Points fields on Ticket Detail's sidebar are dead code — defined in `ticket-detail-screen.tsx` but never rendered.
- **Resolved for all three roles**: Admin, Project Lead, and Member Project Overview all now create/view real tickets against the same real Tickets data — see Architecture Status → Project Overview.
- **Resolved, differently than planned**: `settings-screen.tsx` and `settings-section-screen.tsx` are no longer just unrendered — they were deleted outright, along with the workspace-wide Settings screen itself (`/settings`/`/settings/[section]` now just redirect to `/dashboard`). JIRITA is single-tenant, so that configuration isn't meant to be Admin-editable through the UI — see Architecture Status → Removed (Settings → General & Danger Zone). Project Settings (`/projects/[slug]/settings`) is unaffected and remains real.
- Role now comes from a real `organization_membership` when one exists; `current-user.ts`'s mock identities are a dev-only fallback (never in production) rather than the only source of truth. **Resolved**: the `RoleSwitcher` is now gated behind `isDevFallback` (only renders, with a visible "Dev fallback" badge, when there's no real membership) instead of always showing. No real server-side permission enforcement is wired into the UI yet for projects/tickets/etc. — the RLS policies in `supabase/migrations/20260708000000_mvp_schema.sql` are applied and enforce tenant isolation at the DB layer, but the UI doesn't call any of those tables yet.
- **Resolved**: Note "Duplicate" and "Delete" menu actions in `NoteDetailModal` are now real (`duplicateNote`/`deleteNote`), no longer visual stubs — see Current Sprint → Completed → Project Notes.
- In dev fallback only (no real organization membership — never in production): the Projects list no longer filters by the old `LEAD_PROJECT_SLUGS` array (removed since real data is scoped by RLS instead), so a Project Lead testing without a seeded Supabase project now sees the full mock projects list rather than just their 3 owned slugs, while the summary cells (Blocked Tickets, Due This Week, Team Members Over Capacity) still compute against the `LEAD_PROJECT_SLUGS`-scoped team aggregation — a minor mismatch specific to unauthenticated/dev-fallback local testing, not the real-org path.
- **Resolved for Health/Progress/Open/Blocked/Overdue**: `projects.health`/`ProjectSummary.progress`/`openTickets`/`blockedTickets`/`overdueTickets` are still never re-aggregated onto the `projects` row itself (by schema design — see `docs/SUPABASE_MVP_SCHEMA.md`), but the `/projects` list no longer reads any of them: it now computes all five directly from real tickets at read time (`buildProjectHealthRows`/`computeProjectProgressPct`, `reports-screen.tsx`), the same work-around the Admin Project Overview/per-project Reports already used — see Current Sprint → Completed → Projects. `awaitingReviewTickets`/`dueThisWeekTickets`/`activeMilestones` remain unresolved — still `0`/unpopulated, still read by the Project Lead's own info chips/summary cells on that same screen.
- **Users is implemented and passes `tsc`/`eslint`/`next build`, but has never been run against a live Supabase project or clicked through in a browser** — treat as "should work, not yet verified" until that verification pass happens (Team carried this same caveat as of the last update; it's since been confirmed live — see Architecture Status).
- The Users list's inline Weekly Capacity cell (`CapacityCell`) still calls `updateOrganizationMember`, a direct client write — the same "permission denied for table organization_memberships" every other Users write used to hit before it got its own Server Action. Intentionally left as-is; it has no Server Action yet.
- Resend Invitation (Users row menu) is still toast-only — no real resend path exists.
- Editing a user's email — the Edit User form still shows the field but never persists a change to it; only first/last name, role, and weekly capacity are real writes.
- `browser`/`os`/`device` on the Security tab have no real source and simply don't render.
- Per-person availability `status` (Available/Busy/Away) on Team has no real source anywhere in the app — every real member shows a fixed "Available".
- The Notes Tag field is fully interactive in the UI but never persisted — no `project_notes` column exists for it, same "still mock" precedent as New Ticket's "More Options" fields.
- `project_note_activity` is written by real database triggers on every note create/update/delete, but no screen reads it yet — there is no Notes Activity view.
- The Member Dashboard's "Needs Your Attention" mock "mention" event category has no real source in this schema — comments aren't parsed for @mentions — so it stays a defined type but is never populated, the same "kept but unreachable until real data exists" precedent as the Notes Tag field above.
- **Resolved**: `member-projects-screen.tsx` ("My Projects," Member role) is now real (`useOrganizationProjects()` + `loadProjectTeam`/`loadProjectTickets`), no longer reading `MEMBER_WORK` — see Architecture Status → Projects.
- **Resolved**: `project-lead-reports-screen.tsx` (the Project Lead's own scoped Reports view) is now real too, both its Delivery and Team tabs, scoped to this profile's led projects and reusing Admin Reports' own `buildProjectHealthRows`/`computeProjectProgressPct` rather than a second calculation — see Architecture Status → Reports → Project Lead.
- **Resolved**: `project-lead-time-tracking-screen.tsx` (the Project Lead's own scoped Time Tracking view) is now real too, scoped to exactly this profile's led projects and reusing `time-tracking-screen.tsx`'s own real calculations/loaders (exported for this reuse) rather than a second implementation — see Hours & Time Tracking → Project Lead. The three exports it used to import (`MEMBER_GROUPS`/`PROJECT_GROUPS`/`CLIENT_GROUPS`) have been deleted from `time-tracking-screen.tsx`, since they had no other consumer.
- **Resolved**: Project Settings' "Project Lead" field/picker was removed outright (it read/wrote `projects.owner_profile_id`). The `/projects` list's own Lead column/filter has since been reconciled onto Team's real `project_memberships.project_role` too (`ProjectSummary.lead`, via a new batched query in `loadOrganizationProjects`) — `owner_profile_id`/`ProjectSummary.owner` no longer has any Lead-column reader anywhere in the app; see Architecture Status → Projects.
- **New**: the Admin Dashboard's Recent Activity "View all activity →" action and its new org-wide `/activity` page, and Time Tracking's Admin/Member/Project Lead screens becoming real, haven't themselves been clicked through in a live browser yet — same "should work, not yet verified" caveat as Users/the Admin Project Overview/per-project Reports.
- **New, expanded since**: the Member Profile Modal's real-data fetch (see Architecture Status → Member Profile Modal) was originally wired for exactly two entry points — the Admin Dashboard's Team Workload and Recent Activity — plus `team-screen.tsx`, which already qualified before that fix. It has since been extended to every trigger on company-wide Reports (Hours by Person, Workload, Recent Changes, Billable Hours by Member) and Time Tracking (Timesheets, Missing Hours). Every other remaining `MemberTrigger`/`openMemberProfile` caller (Project Overview's team roster/ticket assignees/activity, ticket assignees/comments/attachments across Board/List/Calendar/Insights/Ticket Detail/Quick Ticket Preview, My Work's Recently Updated) still opens the modal with only a name/avatar, so it still resolves through `resolveTeamMember`'s old name-matching/`unknown-*` fallback and can show stale/zeroed numbers for a real (non-mock-roster) org member. A real `profileId` is already obtainable at almost all of these remaining sites today without any loader changes (`ticket.assigneeProfileId`, `ProjectTeamMember.id`) — the remaining work is threading it through, plus two small additive loader fields (`TicketComment.authorProfileId`, `TicketAttachment.uploadedByProfileId`, and restructuring `insights-view.tsx`'s `AssigneeWorkload` map to key by id instead of name) for comment/attachment/insights callers specifically. Deliberately scoped out of this pass rather than attempted as one large migration.
- **Resolved**: Admin Reports → Delivery's Workload block (`buildWorkloadRows`) computed `assignedHours` as `ticket.hours` netted against hours already logged this period ("remaining work"), silently diverging from the "official" `Σ ticket.hours` assigned-hours definition Team/the Dashboards/the Member Profile Modal/Project Lead Time Tracking already share — found via a user-requested read-only audit against the new Tickets by Member block, then fixed to the same plain sum, scoped to just that one calculation. See Overall Progress for the full audit/fix/Period-selector history.
- **Resolved**: the Member Profile Modal's own **user-mode** Projects tab (`ProjectsTabContent`, opened from Admin → Users → View Profile) used to compute each project's "N active tickets"/"Nh assigned" from `lib/mock-tickets.ts`'s static dataset, matched by `t.assignee.name === fullName(user)` string equality — never `assigneeProfileId`/`loadProjectTickets`, the real pattern this same file's own non-user-mode view and `team-screen.tsx` already use. Now real: `loadOrganizationTickets` filtered by `assigneeProfileId === user.id && status !== "done"`, and project name/slug/id/Lead from `useOrganizationProjects()` — the `mock-tickets`/`mock-projects` imports this tab used were removed (see Confirmed working → Users → Member Profile Modal).

Planned future work:

- Live verification (click through each in a browser against a real Supabase project) of Users, the **Admin** Project Overview (including its new Project Activity history page), per-project Reports, Time Tracking (Admin/Member/Project Lead), the Dashboard's org-wide Activity History page, the Project Lead's and Member's own Project Overview, all three Dashboards' project scope selectors, My Work (Member, including its own KPI click-through and skeleton loader), ticket-assignment restriction, Member's own `/projects` ("My Projects"), global Search, the Project Lead's own scoped Reports (Delivery + Team, including its KPI click-throughs), the `/projects` list's Project Lead KPI band, the Reports/Time Tracking Member Profile Modal trigger fixes, and the new fixed Time Tracking rules (estimate required before In Progress/In Review/Done in `updateTicket`, 15-minute always-round-up in `logTicketTime`) — the immediate next step, ahead of any new backend seam
- **No longer applicable**: this used to track backend integration for "the rest of Settings," but the workspace-wide Settings screen was retired outright instead — JIRITA is single-tenant, so that configuration isn't meant to be Admin-editable through the UI (see Architecture Status → Removed (Settings → General & Danger Zone)). Every other screen this line used to cover (the Project Lead's own scoped Reports and Time Tracking views) is done — see Architecture Status.
- API layer
- Real drag & drop (Kanban)
- Real-time updates (including Supabase Realtime delivery for the now-real Notifications system, currently refresh-on-demand only)
- File uploads
- Unfuddle data import (spec complete — see `docs/UNFUDDLE_IMPORT_SPECIFICATION.md`; importer not yet built)

---

# Files Frequently Modified

Expected high-change areas:

- `src/app/`
- `src/components/`
- `src/lib/`

---

# Current MVP Goal

Complete every major screen required for a usable project management platform before connecting real services.

Remaining priority order:

1. Backlog / Sprint Planning
2. Live-verification pass for Users, the Admin Project Overview, per-project Reports, Time Tracking (Admin/Member), the Project Lead's/Member's own Project Overview, the Dashboard project scope selectors, My Work, ticket-assignment restriction, Member's "My Projects", and global Search

(Authentication and Ticket editing, previously first on this list, are now both complete. Per-project Reports, Notes, and Team pages refinements, previously second on this list, are now also complete.)

---

# Definition of Done

A feature is considered complete when:

- UI implemented
- Responsive
- Light Mode supported
- Dark Mode supported
- Connected to application navigation
- Uses realistic mock data
- Matches JIRITA design language
- Does not regress existing functionality

---

# Notes for Future Development

JIRITA should evolve as a polished SaaS product rather than a collection of disconnected screens.

Whenever possible:

- Build reusable components.
- Keep navigation complete.
- Preserve previous work.
- Optimize for future backend integration.
- Minimize refactoring by designing extensible components from the beginning.
