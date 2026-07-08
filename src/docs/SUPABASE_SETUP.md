# Supabase Setup — Applying the Initial Migration

How to apply `supabase/migrations/20260708000000_mvp_schema.sql` (defined in
`docs/SUPABASE_MVP_SCHEMA.md`) to a real Supabase project. This is a setup/ops
guide only — it does not connect any screen to Supabase and does not touch
mock auth (`src/lib/mock-auth.ts`) or mock data (`src/lib/mock-*.ts`).

There are two credential sets involved, and they're easy to confuse:

1. **App runtime env vars** — read by `src/lib/supabase-client.ts` in the
   browser. Safe to expose client-side.
2. **CLI/project-link credentials** — used only by your terminal to apply
   migrations. Never shipped to the browser, never committed.

---

## 1. Prerequisites

- A Supabase project (create one at supabase.com if you don't have one yet).
- The Supabase CLI. No install step needed — run it via `npx supabase ...`
  (shown throughout this doc). If you'd rather install it globally or via
  Homebrew, that works too; the commands are the same either way.

---

## 2. Required env vars (app runtime)

Copy the template and fill in your project's values:

```bash
cp .env.example .env.local
```

`.env.local` needs:

- `NEXT_PUBLIC_SUPABASE_URL` — your project's API URL (Project Settings → API).
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — the `anon` public key (same page).

`.env.local` is already covered by the repo's `.env*` gitignore rule — it
will not be committed. These two vars are only consumed by
`getSupabaseBrowserClient()`; nothing currently calls that function, so
setting them has no visible effect on the app yet.

---

## 3. Where to place CLI/project credentials

- **Login token:** `npx supabase login` opens a browser flow and stores the
  CLI's access token in your global `~/.supabase` config — outside this repo,
  never a file you'd commit.
- **Project link:** from the repo root,

  ```bash
  npx supabase link --project-ref <your-project-ref>
  ```

  (Project ref is in your project's dashboard URL / Settings → General.) This
  writes only the non-secret project ref to `supabase/.temp/`; no password or
  key is written to any tracked file.
- **Database password:** `link` prompts for it interactively — enter it at
  the prompt rather than storing it anywhere. If you need a non-interactive
  run (e.g. CI), export it for that shell session only:
  `export SUPABASE_DB_PASSWORD=...` — do not put it in `.env.local` or any
  other file in the repo.

---

## 4. Apply the migration

**Remote (hosted) project**, after linking (§3):

```bash
npx supabase db push
```

Pushes every migration under `supabase/migrations/` not yet applied to the
linked project — currently just `20260708000000_mvp_schema.sql`.

**Local development stack** (Docker), if you're running Supabase locally
instead of/alongside a hosted project:

```bash
npx supabase start   # first time: spins up the local stack, applies all migrations
npx supabase db reset  # re-applies all migrations from scratch against the local stack
```

A minimal `db:push` script is available for the remote flow:

```bash
npm run db:push
```

---

## 5. Verify tables/RLS after applying

In the Supabase Dashboard → **Table Editor**, confirm these 8 tables exist:
`organizations`, `profiles`, `organization_memberships`, `projects`,
`project_memberships`, `tickets`, `ticket_comments`, `ticket_activity`.

In the SQL Editor, two quick checks:

```sql
-- Every table should show rowsecurity = true
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
order by tablename;
```

```sql
-- Should list 22 policies total across the 8 tables
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
order by tablename, policyname;
```

Or from the CLI, confirm the migration is recorded as applied:

```bash
npx supabase migration list
```

---

## 6. Do not commit real secrets

- `.env.local` (anon key + URL) is gitignored already — do not force-add it.
- The **service role key** and **database password** are never needed in any
  file in this repo — the CLI prompts for the password interactively, and
  the service role key (for a future backend/service-role process) has no
  call site yet at all.
- Only `.env.example` (empty placeholders) and this doc are meant to be
  committed.
