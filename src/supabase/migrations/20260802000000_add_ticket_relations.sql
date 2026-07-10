-- Real Related Tickets — Ticket Detail's "+ Link" control, relation-kind
-- selector, and search previously did nothing (searchResults was hardcoded
-- to an empty array, links lived only in local React state). This adds the
-- storage + Activity Log wiring; src/lib/tickets.ts adds the read/write
-- functions and ticket-detail-screen.tsx wires the existing UI to them.
--
-- Storage design: one row per relation, in a single canonical direction —
-- NOT one row per direction. Only 3 canonical kinds are ever stored
-- ('related_to', 'blocks', 'duplicates'); the two extra UI-facing kinds
-- ("Is blocked by", "Is duplicated by") are just the inverse *view* of a
-- 'blocks'/'duplicates' row from the other ticket's side — computed by the
-- client depending on whether the ticket in question is ticket_id or
-- related_ticket_id. This is what makes "keep the inverse relation
-- correct" automatic (there's only one row to ever get out of sync) and
-- makes duplicate prevention a plain unique constraint instead of app-level
-- bookkeeping across two rows.
--
-- 'related_to' is symmetric (A related-to B reads the same as B related-to
-- A), so src/lib/tickets.ts always stores it with ticket_id/related_ticket_id
-- sorted into a canonical order — otherwise the same unique constraint
-- wouldn't catch "the same relation, requested from the other ticket."

create table public.ticket_relations (
  id                 uuid primary key default gen_random_uuid(),
  ticket_id          uuid not null references public.tickets (id) on delete cascade,
  related_ticket_id  uuid not null references public.tickets (id) on delete cascade,
  kind               text not null check (kind in ('related_to', 'blocks', 'duplicates')),
  -- Defaults to the authenticated creator — same never-spoofable pattern as
  -- ticket_attachments.uploaded_by / ticket_comments.author_profile_id.
  created_by         uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at         timestamptz not null default now(),
  constraint ticket_relations_no_self_relation check (ticket_id <> related_ticket_id),
  constraint ticket_relations_unique unique (ticket_id, related_ticket_id, kind)
);

create index ticket_relations_ticket_id_idx on public.ticket_relations (ticket_id);
create index ticket_relations_related_ticket_id_idx on public.ticket_relations (related_ticket_id);

alter table public.ticket_relations enable row level security;

create policy ticket_relations_select on public.ticket_relations
  for select
  using (
    exists (
      select 1 from public.tickets t
      where t.id = ticket_id
        and public.can_view_project(t.project_id)
    )
  );

-- Mirrors ticket_attachments_insert/_update's own check (is_org_admin_or_lead
-- OR is_project_member), plus a same-project guard so a related ticket can
-- only ever be picked from the current ticket's own project — the UI's
-- search is already scoped this way, this is the server-side backstop.
create policy ticket_relations_insert on public.ticket_relations
  for insert
  with check (
    exists (
      select 1 from public.tickets t
      join public.projects p on p.id = t.project_id
      where t.id = ticket_id
        and (public.is_org_admin_or_lead(p.organization_id) or public.is_project_member(p.id))
    )
    and exists (
      select 1 from public.tickets t1
      join public.tickets t2 on t2.project_id = t1.project_id
      where t1.id = ticket_id and t2.id = related_ticket_id
    )
  );

create policy ticket_relations_delete on public.ticket_relations
  for delete
  using (
    exists (
      select 1 from public.tickets t
      join public.projects p on p.id = t.project_id
      where t.id = ticket_id
        and (public.is_org_admin_or_lead(p.organization_id) or public.is_project_member(p.id))
    )
  );

grant select, insert, delete on public.ticket_relations to authenticated;

-- ── Activity Log ──────────────────────────────────────────────────────────────
-- Same trigger-based architecture as every other Activity producer (see
-- 20260728000000): firing only inside the same transaction as the real
-- write means "no activity on failure" and "no duplicate activity" both
-- come for free, and no client code has to change.
--
-- One relation involves two tickets, so each trigger writes one activity
-- row per ticket — the label is resolved server-side per perspective
-- ("Blocks" on the initiating ticket's log, "Is blocked by" on the other
-- one's) and stored directly in field_name, so the client never needs to
-- know which side of the row it's looking at.

create or replace function public.log_ticket_relation_added()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  code_a text;
  code_b text;
  label_forward text;
  label_inverse text;
begin
  select p.project_code || '-' || t.ticket_number into code_a
  from public.tickets t join public.projects p on p.id = t.project_id
  where t.id = new.ticket_id;

  select p.project_code || '-' || t.ticket_number into code_b
  from public.tickets t join public.projects p on p.id = t.project_id
  where t.id = new.related_ticket_id;

  label_forward := case new.kind
    when 'blocks' then 'Blocks'
    when 'duplicates' then 'Duplicates'
    else 'Related to'
  end;
  label_inverse := case new.kind
    when 'blocks' then 'Is blocked by'
    when 'duplicates' then 'Is duplicated by'
    else 'Related to'
  end;

  insert into public.ticket_activity (ticket_id, actor_profile_id, event_type, field_name, new_value)
  values (new.ticket_id, actor, 'relation_added', label_forward, code_b);

  insert into public.ticket_activity (ticket_id, actor_profile_id, event_type, field_name, new_value)
  values (new.related_ticket_id, actor, 'relation_added', label_inverse, code_a);

  return new;
end;
$$;

create trigger ticket_relations_log_added
  after insert on public.ticket_relations
  for each row execute function public.log_ticket_relation_added();

create or replace function public.log_ticket_relation_removed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  code_a text;
  code_b text;
  label_forward text;
  label_inverse text;
begin
  select p.project_code || '-' || t.ticket_number into code_a
  from public.tickets t join public.projects p on p.id = t.project_id
  where t.id = old.ticket_id;

  select p.project_code || '-' || t.ticket_number into code_b
  from public.tickets t join public.projects p on p.id = t.project_id
  where t.id = old.related_ticket_id;

  label_forward := case old.kind
    when 'blocks' then 'Blocks'
    when 'duplicates' then 'Duplicates'
    else 'Related to'
  end;
  label_inverse := case old.kind
    when 'blocks' then 'Is blocked by'
    when 'duplicates' then 'Is duplicated by'
    else 'Related to'
  end;

  insert into public.ticket_activity (ticket_id, actor_profile_id, event_type, field_name, old_value)
  values (old.ticket_id, actor, 'relation_removed', label_forward, code_b);

  insert into public.ticket_activity (ticket_id, actor_profile_id, event_type, field_name, old_value)
  values (old.related_ticket_id, actor, 'relation_removed', label_inverse, code_a);

  return old;
end;
$$;

create trigger ticket_relations_log_removed
  after delete on public.ticket_relations
  for each row execute function public.log_ticket_relation_removed();
