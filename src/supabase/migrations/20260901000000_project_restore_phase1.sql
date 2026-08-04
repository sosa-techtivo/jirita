-- Project-restore Phase 1: a single transactional RPC that writes the
-- project, project_memberships, and tickets rows already computed by
-- buildProjectRestorePlan() (src/lib/server/build-project-restore-plan.ts).
-- Comments, activity, time entries, attachments, relations, notes,
-- note_activity, and per-project ticket_statuses are explicitly out of
-- scope for this phase — nothing here writes to those tables.
--
-- Two problems, two bypasses, following the exact precedent already
-- established by the Unfuddle historical importer:
--
-- 1. tickets_log_created (20260728000000, already patched once by
--    20260822000000_ticket_activity_historical_import_bypass.sql) would
--    otherwise log a synthetic "ticket_created" ticket_activity row, dated
--    today, for every restored ticket — exactly the "no debe generar...
--    actividad artificial de creación" problem this phase must avoid, and
--    the real historical ticket_created row belongs in a later phase's own
--    activity restore, not fabricated here. This migration does not touch
--    that trigger again — it reuses the transaction-local GUC
--    (`jirita.import_bypass_activity_log`) that bypass already introduced,
--    since it already does exactly the right thing for ticket inserts.
--
-- 2. add_project_creator_membership (20260803000000) has no precedent bypass
--    — the Unfuddle importer never needed one, because it always inserts
--    projects with created_by = null (its own migration's comment: "we
--    don't actually know who created them... never backfilled with a
--    guess"), which already makes that trigger's own `if new.created_by is
--    not null` guard a no-op. A restored project's created_by can be a
--    real, non-null, remapped destination profile id (see
--    buildProjectRestorePlan's profileMappings), so the trigger would fire
--    for real here and create an unplanned, possibly duplicate
--    project_memberships row never listed in the plan's own `members`
--    array — violating both "sin memberships duplicadas" and "conteos
--    insertados coinciden con el plan". A new GUC,
--    `jirita.restore_bypass_creator_membership`, is introduced below,
--    following the identical pattern (transaction-local, is_local => true,
--    checked via current_setting(..., missing_ok => true) so every
--    ordinary project creation — createProject() in src/lib/projects.ts,
--    completely unchanged — behaves exactly as before).
--
-- tickets_ensure_membership_on_insert / _on_update (20260808000000) need no
-- bypass at all: per that migration's own design and the historical
-- importer's own audit (20260822000000's comment), they key off
-- auth.uid(), not any column on the inserted row, and auth.uid() is null
-- under the service_role-only caller this RPC is restricted to — already a
-- no-op here, same as it already is for the importer.
--
-- seed_default_ticket_statuses (20260830000000) is not applied to
-- production and is out of scope either way: if it ever is applied, it
-- unconditionally seeds legacy-enum-equivalent ticket_statuses rows for
-- the new project, which is harmless and self-consistent with the tickets
-- this phase inserts (they only ever write the legacy `status` enum, never
-- `status_id` — requirement 11: "no restaurar estados... si el esquema
-- futuro existe, no usarlo todavía").

-- ── add_project_creator_membership: skip only when the transaction-local flag is set ──
-- Identical signature, security context, and default behavior as the
-- original (20260803000000) — only the new early-return guard is added.

create or replace function public.add_project_creator_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(current_setting('jirita.restore_bypass_creator_membership', true), 'false') = 'true' then
    return new;
  end if;

  if new.created_by is not null then
    insert into public.project_memberships (project_id, profile_id, title)
    values (
      new.id,
      new.created_by,
      case when new.owner_profile_id = new.created_by then 'Project Lead' else 'Member' end
    )
    on conflict (project_id, profile_id) do nothing;
  end if;
  return new;
end;
$$;

-- ── restore_project_phase1: the one transactional entry point ──────────────
-- Accepts { project, members, tickets } as a single jsonb payload (shaped
-- exactly like ProjectRestorePlan's own project/members/tickets — see
-- src/lib/server/execute-project-restore-phase1.ts, the only caller).
-- Validates every precondition itself — target project must not already
-- exist, slug/project_code must be free in the destination organization,
-- every membership's profile must belong to that organization, every
-- ticket must point at the new project id, ticket_number must not repeat
-- within the payload, and every referenced profile id must be real — before
-- writing anything, so a bad payload never partially applies. The whole
-- function body is one implicit transaction: any `raise exception` (from
-- the checks above, from a real FK/unique-constraint violation on insert,
-- or from the final inserted-count check) rolls back everything the
-- function did, including the project row itself — Postgres's own
-- guarantee for a single function invocation, not something this code
-- implements manually.
--
-- `security invoker` (the default, stated explicitly): no privilege
-- escalation is needed or wanted — only service_role can call this at all
-- (see grants below), and service_role already bypasses RLS and has full
-- table access on its own, same as both historical-import bypass RPCs.

create or replace function public.restore_project_phase1(payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_project            jsonb := payload -> 'project';
  v_members            jsonb := coalesce(payload -> 'members', '[]'::jsonb);
  v_tickets            jsonb := coalesce(payload -> 'tickets', '[]'::jsonb);
  v_project_id         uuid;
  v_org_id             uuid;
  v_slug               text;
  v_project_code       text;
  v_member_count       integer;
  v_ticket_count       integer;
  v_inserted_members   integer;
  v_inserted_tickets   integer;
  v_bad_count          integer;
begin
  if v_project is null or jsonb_typeof(v_project) <> 'object' then
    raise exception 'restore_project_phase1: payload.project is required and must be an object';
  end if;
  if jsonb_typeof(v_members) <> 'array' then
    raise exception 'restore_project_phase1: payload.members must be an array';
  end if;
  if jsonb_typeof(v_tickets) <> 'array' then
    raise exception 'restore_project_phase1: payload.tickets must be an array';
  end if;

  v_project_id   := nullif(v_project ->> 'id', '')::uuid;
  v_org_id       := nullif(v_project ->> 'organization_id', '')::uuid;
  v_slug         := v_project ->> 'slug';
  v_project_code := v_project ->> 'project_code';

  if v_project_id is null or v_org_id is null or coalesce(v_slug, '') = '' or coalesce(v_project_code, '') = '' then
    raise exception 'restore_project_phase1: project.id, organization_id, slug and project_code are all required';
  end if;

  -- ── Preconditions — never trust the caller for integrity ─────────────────

  if not exists (select 1 from public.organizations o where o.id = v_org_id) then
    raise exception 'restore_project_phase1: destination organization % does not exist', v_org_id;
  end if;

  if exists (select 1 from public.projects p where p.id = v_project_id) then
    raise exception 'restore_project_phase1: project % already exists', v_project_id;
  end if;

  if exists (
    select 1 from public.projects p
    where p.organization_id = v_org_id and (p.slug = v_slug or p.project_code = v_project_code)
  ) then
    raise exception 'restore_project_phase1: slug "%" or project_code "%" is already in use in organization %', v_slug, v_project_code, v_org_id;
  end if;

  v_member_count := jsonb_array_length(v_members);
  v_ticket_count := jsonb_array_length(v_tickets);

  select count(*) into v_bad_count
  from jsonb_array_elements(v_members) as m
  where not exists (
    select 1 from public.organization_memberships om
    where om.organization_id = v_org_id
      and om.profile_id = nullif(m ->> 'profile_id', '')::uuid
  );
  if v_bad_count > 0 then
    raise exception 'restore_project_phase1: % membership row(s) reference a profile that is not a member of organization %', v_bad_count, v_org_id;
  end if;

  select count(*) into v_bad_count
  from jsonb_array_elements(v_tickets) as t
  where nullif(t ->> 'project_id', '')::uuid is distinct from v_project_id;
  if v_bad_count > 0 then
    raise exception 'restore_project_phase1: % ticket row(s) do not point at the new project id %', v_bad_count, v_project_id;
  end if;

  select count(*) into v_bad_count
  from (
    select (t ->> 'ticket_number')::integer as tn
    from jsonb_array_elements(v_tickets) as t
    group by tn
    having count(*) > 1
  ) dups;
  if v_bad_count > 0 then
    raise exception 'restore_project_phase1: plan contains duplicate ticket_number values';
  end if;

  -- Every referenced profile id (project.owner_profile_id/created_by,
  -- members.profile_id, tickets.assignee_profile_id/created_by) must be a
  -- real row in profiles — an explicit, informative pre-check rather than
  -- relying only on the FK constraints the inserts below already enforce.
  select count(*) into v_bad_count
  from (
    select nullif(v_project ->> 'owner_profile_id', '')::uuid as pid
    union all select nullif(v_project ->> 'created_by', '')::uuid
    union all select nullif(m ->> 'profile_id', '')::uuid from jsonb_array_elements(v_members) as m
    union all select nullif(t ->> 'assignee_profile_id', '')::uuid from jsonb_array_elements(v_tickets) as t
    union all select nullif(t ->> 'created_by', '')::uuid from jsonb_array_elements(v_tickets) as t
  ) refs
  where refs.pid is not null
    and not exists (select 1 from public.profiles pr where pr.id = refs.pid);
  if v_bad_count > 0 then
    raise exception 'restore_project_phase1: % referenced profile id(s) do not exist', v_bad_count;
  end if;

  -- ── Writes — bypassing the two automatic side-effect triggers for the
  -- rest of this transaction only ─────────────────────────────────────────
  perform set_config('jirita.restore_bypass_creator_membership', 'true', true);
  perform set_config('jirita.import_bypass_activity_log', 'true', true);

  insert into public.projects (
    id, organization_id, slug, name, short_name, project_code, description,
    status, priority, health, category, client_name, default_hourly_rate,
    owner_profile_id, target_date, unfuddle_id, unfuddle_imported_at,
    repository_provider, repository_url, created_by, created_at, updated_at
  )
  values (
    v_project_id,
    v_org_id,
    v_slug,
    v_project ->> 'name',
    v_project ->> 'short_name',
    v_project_code,
    v_project ->> 'description',
    (v_project ->> 'status')::public.project_status,
    (v_project ->> 'priority')::public.project_priority,
    (v_project ->> 'health')::public.project_health,
    (v_project ->> 'category')::public.project_category,
    v_project ->> 'client_name',
    nullif(v_project ->> 'default_hourly_rate', '')::numeric,
    nullif(v_project ->> 'owner_profile_id', '')::uuid,
    nullif(v_project ->> 'target_date', '')::date,
    v_project ->> 'unfuddle_id',
    nullif(v_project ->> 'unfuddle_imported_at', '')::timestamptz,
    null, -- repository_provider: never restored
    null, -- repository_url: never restored
    nullif(v_project ->> 'created_by', '')::uuid,
    (v_project ->> 'created_at')::timestamptz,
    (v_project ->> 'updated_at')::timestamptz
  );

  insert into public.project_memberships (
    id, project_id, profile_id, title, weekly_capacity, project_role, created_at
  )
  select
    (m ->> 'id')::uuid,
    v_project_id,
    (m ->> 'profile_id')::uuid,
    m ->> 'title',
    nullif(m ->> 'weekly_capacity', '')::numeric,
    coalesce(m ->> 'project_role', 'member'),
    (m ->> 'created_at')::timestamptz
  from jsonb_array_elements(v_members) as m;
  get diagnostics v_inserted_members = row_count;

  insert into public.tickets (
    id, project_id, ticket_number, title, description, status, priority, type,
    assignee_profile_id, milestone, labels, acceptance_criteria, acceptance_criteria_done,
    story_points, hours, due_date, unfuddle_id, unfuddle_imported_at, created_by,
    created_at, updated_at
  )
  select
    (t ->> 'id')::uuid,
    v_project_id,
    (t ->> 'ticket_number')::integer,
    t ->> 'title',
    t ->> 'description',
    (t ->> 'status')::public.ticket_status,
    (t ->> 'priority')::public.ticket_priority,
    (t ->> 'type')::public.ticket_type,
    nullif(t ->> 'assignee_profile_id', '')::uuid,
    t ->> 'milestone',
    coalesce((select array_agg(x) from jsonb_array_elements_text(t -> 'labels') as x), '{}'::text[]),
    case
      when t -> 'acceptance_criteria' is null or t -> 'acceptance_criteria' = 'null'::jsonb then null
      else (select array_agg(x) from jsonb_array_elements_text(t -> 'acceptance_criteria') as x)
    end,
    coalesce((select array_agg(x::boolean) from jsonb_array_elements_text(t -> 'acceptance_criteria_done') as x), '{}'::boolean[]),
    nullif(t ->> 'story_points', '')::integer,
    nullif(t ->> 'hours', '')::numeric,
    nullif(t ->> 'due_date', '')::date,
    t ->> 'unfuddle_id',
    nullif(t ->> 'unfuddle_imported_at', '')::timestamptz,
    nullif(t ->> 'created_by', '')::uuid,
    (t ->> 'created_at')::timestamptz,
    (t ->> 'updated_at')::timestamptz
  from jsonb_array_elements(v_tickets) as t;
  get diagnostics v_inserted_tickets = row_count;

  -- ── Post-write integrity: inserted counts must match the plan exactly ───
  if v_inserted_members is distinct from v_member_count then
    raise exception 'restore_project_phase1: inserted % membership row(s) but the plan had %', v_inserted_members, v_member_count;
  end if;
  if v_inserted_tickets is distinct from v_ticket_count then
    raise exception 'restore_project_phase1: inserted % ticket row(s) but the plan had %', v_inserted_tickets, v_ticket_count;
  end if;

  return jsonb_build_object(
    'projectId', v_project_id,
    'inserted', jsonb_build_object(
      'members', v_inserted_members,
      'tickets', v_inserted_tickets
    )
  );
end;
$$;

comment on function public.restore_project_phase1(jsonb) is
  'Project-restore Phase 1 only: writes project, project_memberships, and '
  'tickets from a ProjectRestorePlan payload inside one transaction, '
  'bypassing the automatic creator-membership and synthetic-activity-log '
  'triggers via transaction-local GUCs. Never call from client code — '
  'EXECUTE is restricted to service_role.';

revoke all on function public.restore_project_phase1(jsonb) from public;
revoke all on function public.restore_project_phase1(jsonb) from anon;
revoke all on function public.restore_project_phase1(jsonb) from authenticated;
grant execute on function public.restore_project_phase1(jsonb) to service_role;
