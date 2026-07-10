-- Minimal Labels catalog — backs the "+ Create <label>" flow in Ticket
-- Detail's Labels selector. Previously the picker only offered the
-- hardcoded ALL_LABELS array (Accessibility, API, Bug, ...); this lets a
-- real org grow its own label catalog, shared across every ticket in the
-- workspace. tickets.labels stays exactly as it is (a free-text text[]
-- column) — this table only supplies "which names exist" plus
-- case-insensitive duplicate prevention, not a restructuring of how a
-- ticket's own labels are stored.
--
-- No edit/delete/color/description/category support (not implemented in
-- the UI per this sprint's scope), so only select/insert are granted.

create table public.labels (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  name             text not null check (char_length(name) between 1 and 40),
  created_at       timestamptz not null default now()
);

-- Case-insensitive uniqueness per org ("Bug" and "bug" are the same label).
create unique index labels_org_lower_name_key on public.labels (organization_id, lower(name));
create index labels_organization_id_idx on public.labels (organization_id);

alter table public.labels enable row level security;

-- Any org member can read the catalog (needed to populate the picker for
-- any ticket) and create a new label — labels are a lightweight, shared
-- taxonomy, not an admin-gated resource like Clients.
create policy labels_select on public.labels
  for select
  using (public.is_org_member(organization_id));

create policy labels_insert on public.labels
  for insert
  with check (public.is_org_member(organization_id));

grant select, insert on public.labels to authenticated;
