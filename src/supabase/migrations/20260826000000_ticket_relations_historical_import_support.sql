-- Historical identity + activity bypass for ticket_relations — same
-- two-part pattern already applied to tickets (20260822000000),
-- ticket_comments (20260823000000), ticket_time_entries (20260824000000),
-- and ticket_attachments (20260825000000).
--
-- Problem 1 (identity): ticket_relations has never had an unfuddle_id (or
-- any historical-identity) column. Unlike every other historically-imported
-- table, Unfuddle also never assigns a relationship its own id — confirmed
-- directly against the raw XML: a `<relationship>type</relationship>`
-- element is a bare sibling of the embedded `<ticket>` inside
-- `<associated-tickets>`, with no `<id>`/`created-at`/`updated-at`/
-- `creator-id` of its own. A literal `unfuddle_id` copy is therefore not
-- possible here; this migration instead adds `unfuddle_relation_key text`,
-- a deterministic composite key built by the importer (TypeScript, not this
-- migration) from the two Unfuddle ticket ids and the normalized relation
-- semantics — see src/lib/unfuddle-import/import-relations/build-relation-key.ts:
--   unfuddle:related:<min_unfuddle_id>:<max_unfuddle_id>
--   unfuddle:sibling:<min_unfuddle_id>:<max_unfuddle_id>
--   unfuddle:parent_child:<parent_unfuddle_id>:<child_unfuddle_id>
-- Nullable (every one of the 2 existing rows, both created from the live
-- app, gets `null` — never backfilled with a guessed value) and unique (a
-- plain `unique` constraint on a nullable column already permits unlimited
-- nulls in Postgres, the same pattern tickets.unfuddle_id/
-- ticket_comments.unfuddle_id/ticket_time_entries.unfuddle_id/
-- ticket_attachments.unfuddle_id all already use).
--
-- Problem 2 (activity): ticket_relations_log_added (20260802000000) is an
-- unconditional `AFTER INSERT` trigger — every new relation gets TWO
-- `ticket_activity` rows (`event_type = 'relation_added'`, one per ticket
-- side), both timestamped `now()`, which would misrepresent 19 historical
-- relations as all created today. Same fix as before: a guard reading the
-- transaction-local GUC `jirita.import_bypass_activity_log` — no second GUC
-- introduced, this is the exact same flag tickets/comments/time entries/
-- attachments already use — and a new, narrowly-scoped
-- `insert_ticket_relations_bypassing_activity_log` RPC that is the only
-- place that ever sets it. Normal app behavior (createTicketRelation in
-- src/lib/tickets.ts) never touches this GUC, so `log_ticket_relation_added`
-- behaves exactly as it did before this migration for every real user
-- action — verified empirically post-deploy (see the controlled tests in
-- this task's own audit trail).
--
-- Problem 3 (timestamp): Unfuddle provides no relation-level timestamp at
-- all (see Problem 1) — there is no historical created_at to preserve. This
-- migration does NOT change ticket_relations.created_at's type, nullability,
-- or default (`timestamptz not null default now()`) — there is no strong
-- justification to (per this task's own instruction not to change
-- nullability without one), and the existing default already produces the
-- only honest value available: the real import moment. The new RPC below
-- deliberately does not accept created_at as an input at all, so every
-- historically-imported row's created_at is genuinely "when this migration
-- was run", never a fabricated or reused date (not the ticket's own
-- created_at, not the project's).
--
-- Access: EXECUTE is revoked from PUBLIC (so neither `anon` nor
-- `authenticated` can call the new RPC) and granted only to `service_role`,
-- which the importer already uses exclusively, server-side only.
--
-- Explicitly NOT changed: ticket_relations_log_removed (only fires on
-- DELETE — irrelevant to an insert-only historical import, and this task's
-- own instruction is to touch only what registers activity "al insertar"),
-- every existing RLS policy (ticket_relations_select/_insert/_delete),
-- every existing constraint (ticket_relations_no_self_relation,
-- ticket_relations_unique, the two ticket_id/related_ticket_id FKs, the
-- kind check), grants on the base table, and every application query
-- against ticket_relations (loadTicketRelations/createTicketRelation/
-- deleteTicketRelation in src/lib/tickets.ts all use explicit column lists,
-- never `select('*')` — verified by direct review — so this one new
-- nullable column changes no existing response shape anywhere).

-- ── ticket_relations: historical identity ───────────────────────────────────

alter table public.ticket_relations
  add column unfuddle_relation_key text,
  add constraint ticket_relations_unfuddle_relation_key_key unique (unfuddle_relation_key);

comment on column public.ticket_relations.unfuddle_relation_key is
  'Historical-import-only. Deterministic composite key preserving Unfuddle''s '
  'original relation identity and semantics, set only by the offline importer '
  'for idempotent re-imports. Unfuddle assigns no id of its own to a '
  '<relationship> element, so this is a synthesized key '
  '(unfuddle:related:<min>:<max> | unfuddle:sibling:<min>:<max> | '
  'unfuddle:parent_child:<parent>:<child>, all Unfuddle ticket ids), never a '
  'literal unfuddle_id copy. Null for every relation created through the app. '
  'Never backfilled retroactively for existing rows.';

-- ── ticket_relations_log_added: skip only when the transaction-local flag is set ──
-- Identical signature, security context, and default behavior as the
-- original (20260802000000) — only the new early-return guard is added.
-- ticket_relations_log_removed is untouched (DELETE-only, not part of an
-- insert-only historical import).

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
  if coalesce(current_setting('jirita.import_bypass_activity_log', true), 'false') = 'true' then
    return new;
  end if;

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

-- ── insert_ticket_relations_bypassing_activity_log: the only way to set the flag for relations ──
-- Historical-import-only. Accepts one batch of relations as a JSON array
-- (each element: ticket_id, related_ticket_id, kind, created_by,
-- unfuddle_relation_key — already canonicalized in TypeScript, see
-- src/lib/unfuddle-import/import-relations/), sets the bypass, performs the
-- real insert in the same transaction, and returns the inserted rows.
-- Inserts only — never updates an existing row (idempotency-by-
-- unfuddle_relation_key is decided in TypeScript, before this is ever
-- called). Touches only `ticket_relations`: never `tickets` (no
-- updated_at write), never manual activity, never memberships/
-- notifications/attachments/comments/time entries. created_at is not an
-- accepted column — see Problem 3 above; every row gets the table's own
-- default (now()).
--
-- Every real constraint (both ticket_id/related_ticket_id FKs,
-- ticket_relations_no_self_relation, ticket_relations_unique, the kind
-- check, and this migration's own unfuddle_relation_key uniqueness) still
-- applies in full — this is a genuine INSERT statement, not a constraint
-- bypass; only the ticket_activity side effect is suppressed.
--
-- `security invoker` (the default, stated explicitly): no privilege
-- escalation needed — only service_role can call this at all (see grants
-- below), and service_role already has full table access and bypasses RLS
-- on its own.

create or replace function public.insert_ticket_relations_bypassing_activity_log(relation_rows jsonb)
returns setof public.ticket_relations
language plpgsql
security invoker
set search_path = public
as $$
begin
  perform set_config('jirita.import_bypass_activity_log', 'true', true);

  return query
    insert into public.ticket_relations (
      ticket_id, related_ticket_id, kind, created_by, unfuddle_relation_key
    )
    select
      (r ->> 'ticket_id')::uuid,
      (r ->> 'related_ticket_id')::uuid,
      r ->> 'kind',
      nullif(r ->> 'created_by', '')::uuid,
      r ->> 'unfuddle_relation_key'
    from jsonb_array_elements(relation_rows) as r
    returning *;
end;
$$;

comment on function public.insert_ticket_relations_bypassing_activity_log(jsonb) is
  'Historical-import-only. Inserts ticket_relations while suppressing the '
  'synthetic relation_added ticket_activity rows, scoped to this transaction '
  'only via the same LOCAL custom GUC tickets/comments/time entries/'
  'attachments already use (jirita.import_bypass_activity_log). Does not '
  'accept created_at — Unfuddle provides no relation-level timestamp, so '
  'every row gets the table''s own default (now()), honestly the import '
  'moment, never a fabricated historical date. Never call from client code '
  '— EXECUTE is restricted to service_role.';

revoke all on function public.insert_ticket_relations_bypassing_activity_log(jsonb) from public;
revoke all on function public.insert_ticket_relations_bypassing_activity_log(jsonb) from anon;
revoke all on function public.insert_ticket_relations_bypassing_activity_log(jsonb) from authenticated;
grant execute on function public.insert_ticket_relations_bypassing_activity_log(jsonb) to service_role;
