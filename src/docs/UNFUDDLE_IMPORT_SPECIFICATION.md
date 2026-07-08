# Unfuddle Import Specification (Techtivo)

This is the source of truth for migrating Techtivo's Unfuddle account into Jirita.
It supersedes ad-hoc assumptions about the backup's shape — every structural claim
below was confirmed by directly inspecting Techtivo's own `backup.xml`, not
inferred from Unfuddle's general documentation.

Companion documents: `docs/SUPABASE_MVP_SCHEMA.md` (target schema) and
`supabase/migrations/20260708000000_mvp_schema.sql` (the tables this import
writes into). This document does not introduce any new tables or columns — it
only defines how Unfuddle data maps onto what those already define.

---

## 1. Background

Techtivo uses Unfuddle in a non-standard way. Unfuddle's data model expects an
organization to create one **Project** per real project, with **Milestones** as
checkpoints inside each project. Techtivo instead created a single Unfuddle
Project ("PG - Soporte y Mantenimiento") for its entire account and used
**Milestones** as the real business projects — one Milestone per client or
initiative (e.g. "GEORGIAOAKS", "KT Drive your career 2.0", "Techtivo website").

This is not a data-quality problem to correct during import. It's the actual
shape of thirteen years of real business history, and this document describes
how that structure is **intentionally** transformed into the Jirita domain
model: administrator-selected Unfuddle Milestones become Jirita Projects, and
the one Unfuddle Project is kept only as import provenance, not as a Jirita
entity. Import is an **assisted, administrator-driven process** — not a bulk
"import everything" operation — see §3 for the explicit product decisions this
implies, and §4 for the full concept-by-concept mapping.

---

## 2. Backup Structure

**Confirmed layout** (standard Unfuddle account-backup archive):

```
backup.xml
media/
```

`backup.xml` is a single XML document (Techtivo's is ~42 MB, ~1,043,500 lines)
containing the entire account as one `<account>` tree — people, the project,
and everything nested inside that one project (milestones, tickets, comments,
messages, notebooks, components, versions, severities, categories,
ticket-reports). `media/` holds the binary contents of every attachment
referenced by `<attachment>` elements in the XML.

**Confirmed backup statistics:**

| Entity | Count |
|---|---|
| Unfuddle Project | 1 |
| People | 9 |
| Milestones | 71 |
| Tickets | 12,610 |
| Comments | 9,283 |

Additional structural facts confirmed directly in the backup, relevant to
scoping this import (see §4, §7, §8 for how each is used):

- Every one of the 71 Milestones has at least one ticket. Ticket counts per
  Milestone range from 1 to 7,883, with a median of 12 — **one single
  Milestone ("KT Drive your career 2.0") accounts for ~62% of all 12,610
  tickets**, and 28 of the 71 Milestones (39%) have fewer than 5 tickets each.
- **53 of the 12,610 tickets have no `milestone-id` at all** — they belong to
  the account's one Unfuddle Project but were never assigned to a Milestone.
  How to handle them is an unresolved product decision — see §7.
- Of the 9 People, 5 are flagged `is-removed = true` (former staff/contractors,
  no longer active Unfuddle users) and only 4 of the 9 have a `username` set.
  All 9 have an `email`.
- `severities` and `categories` are empty collections (0 entries) in this
  backup, and no ticket references a `severity-id`. `versions` has 248 entries
  but **zero tickets reference any of them** — an entirely unused feature in
  Techtivo's actual usage. `components` has exactly 1 entry, used by 94 of
  12,610 tickets (<1%). See §8.
- There are 266 Messages, 53 Notebooks, and 1 Repository on the single
  Unfuddle Project — all real, but out of scope for this phase (§8).

---

## 3. Product Decision

These are **intentional product decisions**, made because of how Techtivo
actually used Unfuddle (§1) — not technical limitations of the importer or the
Jirita schema.

- Jirita does **not** implement Milestones as a first-class entity. (Jirita's
  `tickets.milestone` remains a free-text field, per
  `docs/SUPABASE_MVP_SCHEMA.md` — it is not promoted to a table for this
  import either.)
- The import process is **assisted, not automatic**. There is no "import
  everything" path.
- Every one of the 71 Unfuddle Milestones is **analyzed** and given an import
  recommendation (§6, §7) — analysis covers all of them, regardless of how
  many the administrator ultimately imports.
- The **administrator chooses** which Milestones are actually imported. No
  Milestone is imported without that explicit selection.
- Every Milestone the administrator selects becomes one Jirita **Project**.
  Milestones that are not selected are not imported in this pass.
- The single Unfuddle Project is imported **only as organization-level import
  metadata** (source account title, subdomain, project id/short-name) — it
  never becomes a Jirita `projects` row itself.
- Tickets are imported **directly into their corresponding Jirita Project** —
  the Project derived from the ticket's Unfuddle `milestone-id`, not into any
  intermediate structure.
- Comments remain attached to the Ticket they belong to; they are not imported
  as a separate, browsable stream.
- Attachments are **postponed to a later phase** (§6, §8) — `media/` is
  retained so nothing is lost, but no attachment rows are created in this
  phase because no Jirita entity for them exists yet.

---

## 4. Domain Mapping

| Unfuddle Concept | Business Meaning (Techtivo's actual usage) | Jirita Concept | Import Action |
|---|---|---|---|
| **Project** | Administrative container only — Techtivo created exactly one and never used it to separate real projects (§1) | Organization import metadata only — never a Jirita `projects` row | **Imported as metadata only** |
| **Milestone** | The real, client/initiative-scoped body of work — what Techtivo actually treats as "a project" day to day | Project | **Imported** — each selected Milestone → one `projects` row (§3, §6, §7) |
| **Ticket** | Unit of work | Ticket | **Imported** — directly into the Project derived from `milestone-id`; `number` preserved as `ticket_number` |
| **Comment** | Discussion attached to a Ticket | Ticket Comment | **Imported** — only where `parent-type = Ticket`; comments on Messages/Notebook pages are out of scope (see Message, Notebook rows) |
| **Person** | Unfuddle user account | Profile (+ `organization_membership`) | **Imported** — all 9 People become Profiles; `is-removed` drives membership status (§5) |
| **Attachment** | File uploaded to a ticket, comment, message, or notebook page | No Jirita entity yet | **Deferred** (§3, §8) — `media/` retained for a later phase |
| **Message** | Project-level discussion-board post, separate from tickets | No Jirita equivalent | **Ignored** — no Jirita concept for a project-wide message board exists or is planned for MVP |
| **Notebook** | Wiki-style reference pages | No Jirita entity yet (closest future match: Notes/Wiki, per `SUPABASE_MVP_SCHEMA.md`'s deferred list) | **Ignored for this phase** |
| **Repository** | Linked source-control repository | No Jirita equivalent yet (GitHub Integration is future-roadmap per `CLAUDE.md`) | **Ignored** |
| **Version** | Release/version tag on a ticket | No Jirita equivalent | **Ignored** — confirmed unused: 0 of 12,610 tickets reference any of the 248 Version records |
| **Component** | Sub-area/module tag on a ticket | No Jirita equivalent (could inform a future labels feature) | **Ignored for MVP** — only 94 of 12,610 tickets (<1%) use one |
| **Severity** | Bug-severity classification, distinct from priority | No Jirita equivalent (priority is Jirita's only urgency axis) | **Ignored** — confirmed entirely unused: 0 severities defined, 0 tickets reference one |
| **Category** | Ticket categorization tag | No Jirita equivalent (could inform a future labels feature) | **Ignored** — confirmed entirely unused: 0 categories defined |

---

## 5. Field Mapping

Column names on the right refer to `supabase/migrations/20260708000000_mvp_schema.sql`.

### People → Profiles

| Unfuddle field | Jirita column | Notes |
|---|---|---|
| `id` | `profiles.unfuddle_id` | stored as text; the stable idempotent match key |
| `first-name` | `profiles.first_name` | blank on some records — see §2 |
| `last-name` | `profiles.last_name` | blank alongside `first-name` on the same records |
| `email` | `profiles.email` | the only field populated on all 9 records — the most reliable identity signal |
| `username` | *(not imported)* | present on only 4 of 9 records; not used as an identity key |
| `is-removed` | `organization_memberships.status` | `true` → `disabled`, `false` → `active` |
| `is-administrator` | `organization_memberships.role` | `true` → `admin`; `false` → `member` by default (Unfuddle has no Project Lead/Member distinction — see note below) |
| — | `profiles.avatar_url` | no source field; left `null` on import |
| `created-at` / `updated-at` | `profiles.created_at` / `updated_at` | preserved from Unfuddle (historical fidelity), not the import run's own timestamp |

Note: Unfuddle's `is-administrator` only distinguishes admin vs. non-admin, but
Jirita's `org_role` has three values (`admin` / `project_lead` / `member`).
Every non-admin Person defaults to `member` on import — promoting specific
people to `project_lead` is a manual step after import, not something the
backup data can determine automatically.

### Tickets → Tickets

| Unfuddle field | Jirita column | Notes |
|---|---|---|
| `id` | `tickets.unfuddle_id` | |
| `number` | `tickets.ticket_number` | preserved as-is — already per-project-sequential in Unfuddle, matching Jirita's own per-project scoping |
| `summary` | `tickets.title` | |
| `description` | `tickets.description` | Markdown preserved as-is (`description-format` is `markdown` throughout this backup) |
| `status` | `tickets.status` | mapped per the confirmed value table below |
| `priority` (`1`–`5`) | `tickets.priority` | see "Priority: initial mapping proposal" below — not yet finalized |
| `milestone-id` | `tickets.project_id` | resolved via the imported Milestone → Project mapping (§4); the 53 tickets with no `milestone-id` have no Milestone to derive a destination Project from — their handling is an unresolved product decision (§7), not settled here |
| `assignee-id` | `tickets.assignee_profile_id` | resolved via the imported Person → Profile mapping; `null` if unassigned |
| `reporter-id` | *(no direct column)* | Jirita's `tickets` has no separate reporter/creator field; record as the actor on the ticket's first `ticket_activity` "created" event instead |
| `due-on` | `tickets.due_date` | |
| `hours-estimate-current` | `tickets.hours` | `hours-estimate-initial` is not imported — there is only one `hours` column |
| `component-id` | *(not imported)* | Component deferred (§4, §8); populated on <1% of tickets anyway |
| `severity-id` | *(not imported)* | Severity deferred (§4, §8); confirmed unused (0 references) |
| `version-id` | *(not imported)* | Version deferred (§4, §8); confirmed unused (0 references) |
| — | `tickets.type` | no source field exists in this backup; current proposal defaults every imported ticket to `task` — see note below (intentionally deferred, not final) |
| — | `tickets.labels` | no direct source; imported as `{}` |
| — | `tickets.story_points`, `tickets.acceptance_criteria` | no Unfuddle equivalent; left `null` |
| `created-at` / `updated-at` | `tickets.created_at` / `updated_at` | preserved from Unfuddle, not the import run's own timestamp |

Confirmed `status` value mapping (all five values found in this backup):

| Unfuddle `status` | Jirita `tickets.status` |
|---|---|
| `new` | `to_do` |
| `In Progress` | `in_progress` |
| `Resolved in Staging` | `review` |
| `Resolved Live` | `done` |
| `closed` | `done` |

No ticket in this backup maps to Jirita's `backlog` or `blocked` statuses —
every imported ticket lands in `to_do`, `in_progress`, `review`, or `done`.

#### Priority: initial mapping proposal

| Unfuddle `priority` | Jirita `tickets.priority` |
|---|---|
| `1` | `high` |
| `2` | `high` |
| `3` | `normal` |
| `4` | `low` |
| `5` | `low` |

This is an **initial proposal, not a finalized mapping**. It was inferred
purely from the backup's structure — Unfuddle's own convention (1 = highest,
5 = lowest) and the observed distribution across the 12,610 tickets (`3` is
overwhelmingly the most common value, at 11,579 tickets; `1`/`2` together
account for 160; `4`/`5` together account for 871). It has not been validated
against how Techtivo's team actually used these five levels day to day, and
should be confirmed with them before being treated as permanent.

Note on `type` — current proposal, intentionally deferred: Unfuddle's ticket
schema has no task-vs-bug field in this backup (Severity, which sometimes
signals "this is a bug" in other Unfuddle setups, is unused here — see §2).
The current proposal is to default every imported ticket's `type` to `task`.
Future versions of the importer may classify some imported tickets as Bugs,
Incidents, or other ticket types, based on additional rules (e.g. keyword
heuristics on the ticket body) or manual review after import — that
classification work is intentionally deferred, not ruled out.

### Comments → Ticket Comments

| Unfuddle field | Jirita column | Notes |
|---|---|---|
| `id` | `ticket_comments.unfuddle_id` | |
| `parent-id` (where `parent-type = Ticket`) | `ticket_comments.ticket_id` | resolved via the imported Ticket → `unfuddle_id` mapping; comments whose `parent-type` is `Message` or a Notebook page are out of scope (§4) |
| `body` | `ticket_comments.body` | Markdown preserved as-is |
| `author-id` | `ticket_comments.author_profile_id` | resolved via the Person → Profile mapping; `null` if it doesn't resolve |
| `created-at` | `ticket_comments.created_at` | preserved from Unfuddle |
| `updated-at` | `ticket_comments.updated_at` | only set when it differs from `created-at` — i.e. the comment was actually edited |

---

## 6. Import Strategy

**Step 1 — Upload backup**
Administrator uploads Techtivo's Unfuddle export archive.

**Step 2 — Parse `backup.xml`**
Parse the single XML document into People, the one Project (metadata only),
Milestones, and Tickets (with nested Comments and Attachments).

**Step 3 — Analyze all Milestones**
Every one of the 71 Milestones is analyzed — not just a pre-filtered subset.
For each, compute: total ticket count, open ticket count, and most recent
ticket activity (§7) — never raw `milestone.updated-at`.

**Step 4 — Display a migration preview**
Show every analyzed Milestone as a candidate Project. For each Milestone,
show:

- **Name**
- **Ticket count**
- **Open ticket count**
- **Last ticket activity**
- **Import recommendation**

This is a preview, not a pre-selected import list — every Milestone appears,
including ones the recommendation engine (§7) suggests skipping.

**Step 5 — Allow the administrator to select which Projects to import**
The administrator reviews the preview and chooses which candidate Milestones
actually become Jirita Projects for this import run. Not every Milestone
needs to be imported in one pass — e.g. the 28 Milestones with fewer than 5
tickets may reasonably be deferred to a later batch. Recommendations from
Step 4 are a starting point, not a constraint — the administrator can select
any Milestone, including ones marked "not recommended."

**Step 6 — Import only the selected Projects, Tickets, Comments and Users**
In dependency order:
- **users** — all 9 People → Profiles + organization memberships (all 9 are
  imported regardless of which Projects are selected, since assignees/authors
  on any selected ticket/comment may reference any of them)
- **projects** — each *selected* Milestone → one Project
- **tickets** — tickets belonging to a *selected* Milestone; the 53 tickets
  with no `milestone-id` are handled per whatever strategy §7 ultimately
  settles on — they are not simply excluded by default
- **comments** — only Ticket-parented comments on an imported ticket

Milestones the administrator did not select, and their tickets/comments, are
not imported in this pass — they remain available to import later from the
same backup.

Attachments remain postponed to a later phase regardless of which Projects
are selected here (§3, §8); `media/` is retained untouched so that later phase
can run without re-uploading the backup.

---

## 7. Project Selection Rules

**Recommendations are based on ticket information, not milestone metadata.**
Projects must not be recommended using `milestone.updated-at` or any other
Milestone-level field. Recommended signals, computed from each Milestone's
tickets:

- **Open ticket count**
- **Total ticket count**
- **Last ticket activity** (most recent ticket `updated-at`)

This is confirmed, not theoretical, from Techtivo's own backup:

- **GEORGIAOAKS** (Milestone id 69, archived): 176 total tickets, **0 open**,
  and the most recent ticket activity is **2023-05-31**. The Milestone's own
  `updated-at`, however, reads **2024-11-21** — 18 months later than any real
  work on it.
- **STRONG-BRIDGE** (Milestone id 71, archived): 120 total tickets, **0
  open**, with the most recent ticket activity all the way back in
  **2018-06-05** — over seven years stale. Its Milestone `updated-at` still
  reads **2024-11-20**.

In both cases, something unrelated to actual project work (a bulk archive
pass, a backup/administrative touch) bumped `updated-at` years after the
project was really done. Recommending by `milestone.updated-at` would surface
both as if they were recently active — actively misleading an administrator
trying to prioritize what to import first. Ticket-derived signals correctly
show both as long-dormant.

By contrast, "KT Drive your career 2.0" (7,883 total tickets, ~62% of the
entire backup) shows real, recent activity: its latest ticket activity is
**2026-07-06/07**, matching its Milestone `updated-at`. Its **open ticket
count is only 3**, though — a reminder that open count alone is a weak signal
even on genuinely active Milestones (most tickets get closed quickly once
done); it's the combination of last activity, total volume, and open count
together that distinguishes real ongoing work from a long-dead Milestone, not
any single signal in isolation.

**The recommendation engine only suggests Projects — it does not decide.**
Every one of the 71 Milestones is analyzed and labeled with a recommendation
(§6 Step 4), but **the administrator always makes the final selection**: they
can accept a recommendation, import a Milestone marked "not recommended," or
skip one marked "recommended." Nothing is imported without that explicit
choice (§3).

**Orphaned tickets: unresolved product decision.** 53 of the 12,610 tickets
have no `milestone-id`. Since every Jirita Project is derived from a selected
Milestone (§3), these 53 tickets have no Milestone to derive a destination
Project from — they require a dedicated migration strategy that **has not
been decided yet**.

The importer must detect these tickets and present them to the administrator
explicitly, rather than silently dropping them or silently attaching them
anywhere. Candidate strategies — listed here without recommending any one of
them as final:

- **Ignore them** — leave them out of Jirita entirely for this phase.
- **Import them into a generated "Imported Unassigned Tickets" project** — a
  catch-all Jirita Project created specifically to hold orphaned tickets.
- **Allow the administrator to choose the destination project** for these
  tickets (individually or as a group) at import time.

The final product decision on how to handle these 53 tickets will be made
during implementation, not in this document.

---

## 8. Deferred Features

Explicitly out of scope for this import phase:

- **Attachments** — confirmed present (referenced across tickets/comments/
  messages/notebook pages, with `media/` holding the files); no Jirita entity
  exists yet.
- **Messages** — 266 confirmed in this backup; no Jirita equivalent planned
  for MVP.
- **Notebooks** — 53 confirmed; closest future match is a Notes/Wiki table
  (already deferred in `SUPABASE_MVP_SCHEMA.md`), not built yet.
- **Repositories** — 1 confirmed (a linked git repo); no Jirita equivalent
  until a future GitHub Integration.
- **Versions** — 248 confirmed, but 0 tickets reference any of them.
- **Components** — 1 confirmed, used by <1% of tickets.
- **Categories** — 0 confirmed (empty collection).
- **Severities** — 0 confirmed (empty collection, unused).
- **Time tracking** — Unfuddle's `enable-time-tracking` flag is on for the
  project, but time-tracking data has its own deferred schema
  (`mock-time-tracking.ts`'s domain, per `SUPABASE_MVP_SCHEMA.md`) and is not
  part of this import.

---

## 9. Future Evolution

This first importer is deliberately optimized for Techtivo's specific,
confirmed backup: one Unfuddle Project whose Milestones are really projects.
That Milestone → Project transformation (§3) is a **Techtivo-specific policy
decision**, not a property of Unfuddle backups in general — a different
organization migrating from Unfuddle in the future might use Projects and
Milestones the standard way, in which case this exact transformation would be
wrong for them.

The parsing layer (§6 Steps 2–3: reading `backup.xml` into People, Projects,
Milestones, Tickets, Comments, and the currently-deferred entities) should
stay generic — capable of handling more than one Unfuddle Project, Milestones
used as ordinary sub-project checkpoints, and non-Techtivo field values —
so that a future organization's import is a matter of choosing a different
mapping policy on top of the same parser, not redesigning the importer itself.

---

## 10. Migration Idempotency

The same backup may be imported **more than once** — during testing, after
fixing an importer bug, to pull in additional Milestones the administrator
didn't select on an earlier pass (§6 Step 5), or against a fresher backup
covering the same historical data. **The importer must never create
duplicate rows when that happens.**

Every table this import writes to carries an `unfuddle_id` column (per
`docs/SUPABASE_MVP_SCHEMA.md`'s "Unfuddle import notes" and the unique
constraints already defined in
`supabase/migrations/20260708000000_mvp_schema.sql`) specifically so an
existing record can always be matched against the source backup instead of
being re-created:

- **Profiles** are upserted, matched on `unfuddle_id`.
- **Projects** are upserted, matched on `unfuddle_id` (the originating
  Milestone's id).
- **Tickets** are upserted, matched on `unfuddle_id`.
- **Comments** are upserted, matched on `unfuddle_id`.

An upsert here means: if a row with that `unfuddle_id` already exists, update
it in place with the backup's current values; otherwise insert a new row.
Running the same import twice in a row should leave the database in exactly
the same state as running it once — **the import process must be safely
repeatable**.

Idempotency is a **core architectural requirement** for this importer, not a
nice-to-have, because:

- **Selection is inherently iterative** (§6, §7). The administrator is
  expected to run the import more than once as they select additional
  Milestones over successive passes (§6 Step 5) — each run must only add
  what's new, never duplicate what a prior run already imported.
- **Backups will be re-uploaded.** Techtivo's Unfuddle account was still live
  when this backup was taken, so a later, fresher backup covering the same
  historical tickets and comments must update existing rows, not double them.
- **Import failures must be safe to retry.** A partial failure partway
  through a large import (12,610 tickets, thousands of comments) should be
  recoverable by simply re-running the same import, not by manually
  diagnosing and cleaning up partial state.
- Without this guarantee, every import run would need its own bespoke
  cleanup/dedup step before or after it — exactly the kind of ad-hoc,
  error-prone process this whole specification exists to avoid.
