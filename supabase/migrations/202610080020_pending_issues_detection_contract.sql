-- Central de Pendências, phase 2: current conditions, idempotent reconciliation
-- and tenant-scoped read contracts. No detector result or aggregate is stored.

-- These predicates are used by the detector for one tenant and a date range.
-- The pre-existing document expiration index has no tenant key; neither
-- operations nor guarantees has a status/date index.
create index operations_pending_issue_end_date_idx
  on public.operations (organization_id, end_date)
  where status = 'active' and deleted_at is null and end_date is not null;
create index guarantees_pending_issue_end_date_idx
  on public.guarantees (organization_id, end_date)
  where status = 'active' and deleted_at is null and end_date is not null;
create index rural_documents_pending_issue_expiration_idx
  on public.rural_documents (organization_id, expiration_date)
  where status = 'active' and deleted_at is null and expiration_date is not null;

-- Returns only conditions that exist today. The document validity vocabulary
-- comes from the existing view; explicit date predicates allow index scans.
create function private.detect_pending_issues(p_organization_id uuid)
returns table (
  organization_id uuid,
  issue_type text,
  operation_id uuid,
  guarantee_id uuid,
  document_id uuid,
  source_date date,
  currently_detected boolean,
  days_overdue integer,
  days_until_due integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select document.organization_id, 'document_expired'::text,
    null::uuid, null::uuid, document.id, document.expiration_date,
    true, (current_date - document.expiration_date)::integer, null::integer
  from public.rural_documents_with_validity document
  join public.document_types document_type
    on document_type.organization_id = document.organization_id
   and document_type.id = document.document_type_id
  join public.farms farm
    on farm.organization_id = document.organization_id
   and farm.id = document.farm_id
  where document.organization_id = p_organization_id
    and document.status = 'active'
    and document.expiration_date < current_date
    and document.validity_status = 'expired'
    and document_type.status = 'active'
    and document_type.deleted_at is null
    and farm.status = 'active'
    and farm.deleted_at is null

  union all

  select document.organization_id, 'document_expiring'::text,
    null::uuid, null::uuid, document.id, document.expiration_date,
    true, null::integer, (document.expiration_date - current_date)::integer
  from public.rural_documents_with_validity document
  join public.document_types document_type
    on document_type.organization_id = document.organization_id
   and document_type.id = document.document_type_id
  join public.farms farm
    on farm.organization_id = document.organization_id
   and farm.id = document.farm_id
  where document.organization_id = p_organization_id
    and document.status = 'active'
    and document.expiration_date between current_date and current_date + 30
    and document.validity_status = 'expiring'
    and document_type.status = 'active'
    and document_type.deleted_at is null
    and farm.status = 'active'
    and farm.deleted_at is null

  union all

  select guarantee.organization_id, 'guarantee_expired'::text,
    null::uuid, guarantee.id, null::uuid, guarantee.end_date,
    true, (current_date - guarantee.end_date)::integer, null::integer
  from public.guarantees guarantee
  join public.operations operation
    on operation.organization_id = guarantee.organization_id
   and operation.id = guarantee.operation_id
  where guarantee.organization_id = p_organization_id
    and guarantee.status = 'active'
    and guarantee.deleted_at is null
    and guarantee.end_date is not null
    and guarantee.end_date < current_date
    and operation.deleted_at is null

  union all

  select guarantee.organization_id, 'guarantee_expiring'::text,
    null::uuid, guarantee.id, null::uuid, guarantee.end_date,
    true, null::integer, (guarantee.end_date - current_date)::integer
  from public.guarantees guarantee
  join public.operations operation
    on operation.organization_id = guarantee.organization_id
   and operation.id = guarantee.operation_id
  where guarantee.organization_id = p_organization_id
    and guarantee.status = 'active'
    and guarantee.deleted_at is null
    and guarantee.end_date between current_date and current_date + 30
    and operation.deleted_at is null

  union all

  select operation.organization_id, 'operation_active_after_end_date'::text,
    operation.id, null::uuid, null::uuid, operation.end_date,
    true, (current_date - operation.end_date)::integer, null::integer
  from public.operations operation
  where operation.organization_id = p_organization_id
    and operation.status = 'active'
    and operation.deleted_at is null
    and operation.end_date is not null
    and operation.end_date < current_date;
$$;

revoke all on function private.detect_pending_issues(uuid) from public, anon, authenticated;

-- Future scheduling can call this internal routine from a trusted database
-- role. The browser calls only the checked, zero-argument public wrapper.
create function private.reconcile_pending_issues_for_organization(p_organization_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted_count integer;
begin
  insert into public.pending_issue_management (
    organization_id, issue_type, operation_id, guarantee_id, document_id
  )
  select detected.organization_id, detected.issue_type,
    detected.operation_id, detected.guarantee_id, detected.document_id
  from private.detect_pending_issues(p_organization_id) detected
  on conflict do nothing;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

revoke all on function private.reconcile_pending_issues_for_organization(uuid) from public, anon, authenticated;

create function public.reconcile_pending_issues()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_organization_id uuid := private.current_user_organization_id();
begin
  if actor_organization_id is null or not private.has_permission('pending_issues.manage') then
    raise exception using errcode = '42501', message = 'Missing pending_issues.manage permission.';
  end if;

  return private.reconcile_pending_issues_for_organization(actor_organization_id);
end;
$$;

revoke all on function public.reconcile_pending_issues() from public, anon, authenticated;
grant execute on function public.reconcile_pending_issues() to authenticated;

-- Migration 019 initially allowed browser INSERT/UPDATE on the management
-- table. Only reconciliation may create detected issues; human edits use the
-- narrow, version-checked RPC below. Keep the tenant-scoped SELECT policy.
revoke insert, update, delete on public.pending_issue_management from public, anon, authenticated;
drop policy pending_issue_management_insert on public.pending_issue_management;
drop policy pending_issue_management_update on public.pending_issue_management;

-- The four managerial values form a complete snapshot. A nullable argument
-- set to NULL clears that field; NULL never means "leave it unchanged".
create function public.update_pending_issue_management(
  p_pending_issue_id uuid,
  p_expected_version integer,
  p_assigned_to uuid,
  p_status text,
  p_resolution_due_date date,
  p_justification text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_organization_id uuid := private.current_user_organization_id();
  updated_version integer;
begin
  if actor_organization_id is null or not private.has_permission('pending_issues.manage') then
    raise exception using errcode = '42501', message = 'Missing pending_issues.manage permission.';
  end if;
  if p_pending_issue_id is null or p_expected_version is null or p_expected_version < 1
    or p_status is null then
    raise exception using errcode = '22023', message = 'Issue ID, expected version and status are required.';
  end if;

  update public.pending_issue_management issue
  set assigned_to = p_assigned_to,
      status = p_status,
      resolution_due_date = p_resolution_due_date,
      justification = p_justification
  where issue.id = p_pending_issue_id
    and issue.organization_id = actor_organization_id
    and issue.version = p_expected_version
  returning issue.version into updated_version;

  if updated_version is null then
    if exists (
      select 1 from public.pending_issue_management issue
      where issue.id = p_pending_issue_id
        and issue.organization_id = actor_organization_id
    ) then
      raise exception using errcode = '40001', message = 'Pending issue version conflict.';
    end if;
    raise exception using errcode = 'P0002', message = 'Pending issue is unavailable.';
  end if;

  return updated_version;
end;
$$;

revoke all on function public.update_pending_issue_management(uuid, integer, uuid, text, date, text)
  from public, anon, authenticated;
grant execute on function public.update_pending_issue_management(uuid, integer, uuid, text, date, text)
  to authenticated;

-- One row per persisted issue, including history whose objective condition
-- is no longer present. This is the common source for list and summary RPCs.
create function private.pending_issue_snapshot(p_organization_id uuid)
returns table (
  pending_issue_id uuid,
  organization_id uuid,
  issue_type text,
  status text,
  operation_id uuid,
  guarantee_id uuid,
  document_id uuid,
  source_operation_id uuid,
  source_date date,
  days_overdue integer,
  days_until_due integer,
  currently_detected boolean,
  needs_reopen_review boolean,
  identified_at timestamptz,
  resolution_due_date date,
  internal_days_overdue integer,
  internal_days_until_due integer,
  assigned_to uuid,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  with detected as materialized (
    select * from private.detect_pending_issues(p_organization_id)
  )
  select management.id, management.organization_id, management.issue_type,
    management.status, management.operation_id, management.guarantee_id,
    management.document_id, coalesce(management.operation_id, guarantee.operation_id),
    coalesce(detected.source_date, document.expiration_date,
      guarantee.end_date, operation.end_date),
    detected.days_overdue, detected.days_until_due,
    detected.issue_type is not null,
    detected.issue_type is not null and management.status in ('resolved', 'justified'),
    management.identified_at, management.resolution_due_date,
    case when management.status in ('open', 'in_analysis', 'in_progress')
      and management.resolution_due_date < current_date
      then (current_date - management.resolution_due_date)::integer end,
    case when management.status in ('open', 'in_analysis', 'in_progress')
      and management.resolution_due_date >= current_date
      then (management.resolution_due_date - current_date)::integer end,
    management.assigned_to, management.updated_at
  from public.pending_issue_management management
  left join detected
    on detected.organization_id = management.organization_id
   and detected.issue_type = management.issue_type
   and coalesce(detected.operation_id, detected.guarantee_id, detected.document_id)
     = coalesce(management.operation_id, management.guarantee_id, management.document_id)
  left join public.rural_documents document
    on document.organization_id = management.organization_id
   and document.id = management.document_id
  left join public.guarantees guarantee
    on guarantee.organization_id = management.organization_id
   and guarantee.id = management.guarantee_id
  left join public.operations operation
    on operation.organization_id = management.organization_id
   and operation.id = management.operation_id
  where management.organization_id = p_organization_id;
$$;

revoke all on function private.pending_issue_snapshot(uuid) from public, anon, authenticated;

-- A page is selected before its relationship arrays are constructed. The
-- four sort keys are fixed strings, never interpolated into SQL.
create function public.list_pending_issues(
  p_status text default null,
  p_issue_type text default null,
  p_assigned_to uuid default null,
  p_currently_detected boolean default null,
  p_internal_overdue boolean default null,
  p_operation_id uuid default null,
  p_institution_id uuid default null,
  p_farm_id uuid default null,
  p_search text default null,
  p_sort text default 'identified_desc',
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  pending_issue_id uuid,
  issue_type text,
  status text,
  currently_detected boolean,
  needs_reopen_review boolean,
  identified_at timestamptz,
  source_date date,
  days_overdue integer,
  days_until_due integer,
  resolution_due_date date,
  internal_days_overdue integer,
  internal_days_until_due integer,
  assigned_to uuid,
  responsible_name text,
  updated_at timestamptz,
  source_kind text,
  source_name text,
  operation_id uuid,
  operation_number text,
  institution_id uuid,
  institution_name text,
  guarantee_id uuid,
  document_id uuid,
  registrations jsonb,
  farms jsonb,
  owners jsonb,
  operation_amount numeric,
  guarantee_amount numeric,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_organization_id uuid := private.current_user_organization_id();
  can_read_financial boolean;
begin
  if actor_organization_id is null or not private.has_permission('pending_issues.read') then
    raise exception using errcode = '42501', message = 'Missing pending_issues.read permission.';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 100
     or p_offset is null or p_offset < 0 or p_offset > 100000
     or p_sort is null or p_sort not in (
       'identified_desc', 'identified_asc', 'source_date_asc', 'source_date_desc'
     )
     or length(coalesce(p_search, '')) > 100 then
    raise exception using errcode = '22023', message = 'Invalid pending issue list parameters.';
  end if;

  can_read_financial := private.has_permission('pending_issues.financial_read');

  return query
  with filtered as materialized (
    select snapshot.*,
      count(*) over () as matching_count
    from private.pending_issue_snapshot(actor_organization_id) snapshot
    left join public.guarantees source_guarantee
      on source_guarantee.organization_id = actor_organization_id
     and source_guarantee.id = snapshot.guarantee_id
    left join public.rural_documents source_document
      on source_document.organization_id = actor_organization_id
     and source_document.id = snapshot.document_id
    left join public.document_types source_document_type
      on source_document_type.organization_id = actor_organization_id
     and source_document_type.id = source_document.document_type_id
    left join public.operations source_operation
      on source_operation.organization_id = actor_organization_id
     and source_operation.id = snapshot.source_operation_id
    left join public.financial_institutions source_institution
      on source_institution.organization_id = actor_organization_id
     and source_institution.id = source_operation.institution_id
    where (p_status is null or snapshot.status = p_status)
      and (p_issue_type is null or snapshot.issue_type = p_issue_type)
      and (p_assigned_to is null or snapshot.assigned_to = p_assigned_to)
      and (p_currently_detected is null or snapshot.currently_detected = p_currently_detected)
      and (p_internal_overdue is null
        or (snapshot.internal_days_overdue is not null) = p_internal_overdue)
      and (p_operation_id is null or snapshot.source_operation_id = p_operation_id)
      and (p_institution_id is null or source_operation.institution_id = p_institution_id)
      and (p_farm_id is null or source_document.farm_id = p_farm_id
        or exists (
          select 1 from public.operation_registrations operation_registration
          join public.registrations registration
            on registration.organization_id = operation_registration.organization_id
           and registration.id = operation_registration.registration_id
          where operation_registration.organization_id = actor_organization_id
            and operation_registration.operation_id = snapshot.source_operation_id
            and registration.farm_id = p_farm_id
        )
        or exists (
          select 1 from public.guarantee_registrations guarantee_registration
          join public.registrations registration
            on registration.organization_id = guarantee_registration.organization_id
           and registration.id = guarantee_registration.registration_id
          where guarantee_registration.organization_id = actor_organization_id
            and guarantee_registration.guarantee_id = snapshot.guarantee_id
            and registration.farm_id = p_farm_id
        ))
      and (nullif(btrim(p_search), '') is null
        or position(lower(btrim(p_search)) in lower(concat_ws(' ',
          source_operation.operation_number, source_institution.name,
          source_guarantee.description, source_document.document_number,
          source_document_type.name
        ))) > 0)
  ),
  page as materialized (
    select * from filtered
    order by
      case when p_sort = 'identified_asc' then filtered.identified_at end asc nulls last,
      case when p_sort = 'identified_desc' then filtered.identified_at end desc nulls last,
      case when p_sort = 'source_date_asc' then filtered.source_date end asc nulls last,
      case when p_sort = 'source_date_desc' then filtered.source_date end desc nulls last,
      filtered.pending_issue_id desc
    limit p_limit offset p_offset
  )
  select page.pending_issue_id, page.issue_type, page.status,
    page.currently_detected, page.needs_reopen_review, page.identified_at,
    page.source_date, page.days_overdue, page.days_until_due,
    page.resolution_due_date, page.internal_days_overdue,
    page.internal_days_until_due, page.assigned_to, responsible.full_name,
    page.updated_at,
    case when page.document_id is not null then 'document'
      when page.guarantee_id is not null then 'guarantee' else 'operation' end,
    case when page.document_id is not null
      then coalesce(document.document_number, document_type.name)
      when page.guarantee_id is not null
      then guarantee.description
      else operation.operation_number end,
    page.source_operation_id, operation.operation_number,
    institution.id, institution.name, page.guarantee_id, page.document_id,
    related.registrations, related.farms, related.owners,
    case when can_read_financial then operation_financial.amount end,
    case when can_read_financial then guarantee_financial.amount end,
    page.matching_count
  from page
  left join public.profiles responsible
    on responsible.organization_id = actor_organization_id
   and responsible.id = page.assigned_to
  left join public.rural_documents document
    on document.organization_id = actor_organization_id
   and document.id = page.document_id
  left join public.document_types document_type
    on document_type.organization_id = actor_organization_id
   and document_type.id = document.document_type_id
  left join public.guarantees guarantee
    on guarantee.organization_id = actor_organization_id
   and guarantee.id = page.guarantee_id
  left join public.operations operation
    on operation.organization_id = actor_organization_id
   and operation.id = page.source_operation_id
  left join public.financial_institutions institution
    on institution.organization_id = actor_organization_id
   and institution.id = operation.institution_id
  left join public.operation_financials operation_financial
    on can_read_financial
   and operation_financial.organization_id = actor_organization_id
   and operation_financial.operation_id = page.source_operation_id
   and page.document_id is null
  left join public.guarantee_financials guarantee_financial
    on can_read_financial
   and guarantee_financial.organization_id = actor_organization_id
   and guarantee_financial.guarantee_id = page.guarantee_id
  left join lateral (
    with relation_ids as (
      select 'operation'::text as relation, link.registration_id
      from public.operation_registrations link
      where page.document_id is null
        and link.organization_id = actor_organization_id
        and link.operation_id = page.source_operation_id
      union all
      select 'guarantee'::text, link.registration_id
      from public.guarantee_registrations link
      where page.guarantee_id is not null
        and link.organization_id = actor_organization_id
        and link.guarantee_id = page.guarantee_id
      union all
      select 'document'::text, document.registration_id
      where page.document_id is not null and document.registration_id is not null
    ),
    registration_rows as (
      select distinct relation_ids.relation, registration.id,
        registration.number, registration.farm_id
      from relation_ids
      join public.registrations registration
        on registration.organization_id = actor_organization_id
       and registration.id = relation_ids.registration_id
    ),
    farm_rows as (
      select farm.id, farm.name, farm.municipality, farm.state
      from public.farms farm
      where farm.organization_id = actor_organization_id
        and (farm.id in (select farm_id from registration_rows)
          or (page.document_id is not null and farm.id = document.farm_id))
    ),
    owner_rows as (
      select distinct owner.id, owner.name, owner.status
      from registration_rows registration
      join public.ownership_links ownership
        on ownership.organization_id = actor_organization_id
       and ownership.registration_id = registration.id
       and ownership.status = 'active'
       and ownership.deleted_at is null
      join public.owners owner
        on owner.organization_id = actor_organization_id
       and owner.id = ownership.owner_id
    )
    select
      coalesce((select jsonb_agg(jsonb_build_object(
        'relation', related_registration.relation, 'id', related_registration.id,
        'number', related_registration.number, 'farm_id', related_registration.farm_id
      ) order by related_registration.relation, related_registration.number, related_registration.id)
        from registration_rows related_registration), '[]'::jsonb) as registrations,
      coalesce((select jsonb_agg(jsonb_build_object(
        'id', related_farm.id, 'name', related_farm.name,
        'municipality', related_farm.municipality, 'state', related_farm.state
      ) order by related_farm.name, related_farm.id)
        from farm_rows related_farm), '[]'::jsonb) as farms,
      coalesce((select jsonb_agg(jsonb_build_object(
        'id', related_owner.id, 'name', related_owner.name, 'status', related_owner.status
      ) order by related_owner.name, related_owner.id)
        from owner_rows related_owner), '[]'::jsonb) as owners
  ) related on true;
end;
$$;

revoke all on function public.list_pending_issues(
  text, text, uuid, boolean, boolean, uuid, uuid, uuid, text, text, integer, integer
) from public, anon, authenticated;
grant execute on function public.list_pending_issues(
  text, text, uuid, boolean, boolean, uuid, uuid, uuid, text, text, integer, integer
) to authenticated;

-- Only currently detected operation/guarantee issues contribute to the
-- financial exposure. An operation amount wins; otherwise distinct affected
-- guarantee amounts are summed. SUM over no known amounts remains NULL.
create function public.get_pending_issue_summary()
returns table (
  open_count bigint,
  currently_detected_count bigint,
  needs_reopen_review_count bigint,
  affected_operations_count bigint,
  total_financial_amount numeric,
  operations_without_financial_value bigint,
  internal_overdue_count bigint,
  unassigned_count bigint,
  max_days_overdue integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_organization_id uuid := private.current_user_organization_id();
  can_read_financial boolean;
begin
  if actor_organization_id is null or not private.has_permission('pending_issues.read') then
    raise exception using errcode = '42501', message = 'Missing pending_issues.read permission.';
  end if;
  can_read_financial := private.has_permission('pending_issues.financial_read');

  return query
  with snapshot as materialized (
    select * from private.pending_issue_snapshot(actor_organization_id)
  ),
  affected_operations as materialized (
    select distinct source_operation_id as operation_id
    from snapshot
    where currently_detected and source_operation_id is not null
      and document_id is null
  ),
  affected_guarantees as materialized (
    select distinct guarantee_id, source_operation_id as operation_id
    from snapshot
    where currently_detected and guarantee_id is not null
  ),
  guarantee_values as (
    select affected_guarantees.operation_id, sum(financial.amount) as amount
    from affected_guarantees
    join public.guarantee_financials financial
      on can_read_financial
     and financial.organization_id = actor_organization_id
     and financial.guarantee_id = affected_guarantees.guarantee_id
    group by affected_guarantees.operation_id
  ),
  operation_values as (
    select affected_operations.operation_id,
      coalesce(financial.amount, guarantee_values.amount) as amount
    from affected_operations
    left join public.operation_financials financial
      on can_read_financial
     and financial.organization_id = actor_organization_id
     and financial.operation_id = affected_operations.operation_id
    left join guarantee_values
      on guarantee_values.operation_id = affected_operations.operation_id
  )
  select
    (select count(*) from snapshot where status in ('open', 'in_analysis', 'in_progress')),
    (select count(*) from snapshot where currently_detected),
    (select count(*) from snapshot where needs_reopen_review),
    (select count(*) from affected_operations),
    case when can_read_financial then (select sum(amount) from operation_values) end,
    case when can_read_financial
      then (select count(*) from operation_values where amount is null) end,
    (select count(*) from snapshot where internal_days_overdue is not null),
    (select count(*) from snapshot
      where status in ('open', 'in_analysis', 'in_progress') and assigned_to is null),
    (select max(days_overdue) from snapshot where currently_detected);
end;
$$;

revoke all on function public.get_pending_issue_summary() from public, anon, authenticated;
grant execute on function public.get_pending_issue_summary() to authenticated;

-- The selector follows the same eligibility rule as the assignment trigger
-- in migration 019, without granting browser reads on all profiles or roles.
-- Assignment still revalidates eligibility at write time.
create function public.list_pending_issue_assignees()
returns table (
  profile_id uuid,
  full_name text,
  role_key text,
  role_name text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_organization_id uuid := private.current_user_organization_id();
begin
  if actor_organization_id is null or not private.has_permission('pending_issues.manage') then
    raise exception using errcode = '42501', message = 'Missing pending_issues.manage permission.';
  end if;

  return query
  select profile.id, profile.full_name, role.role_key, role.name
  from public.profiles profile
  join public.roles role
    on role.role_key = profile.role_key
   and role.status = 'active'
  join public.role_permissions role_permission
    on role_permission.role_key = role.role_key
   and role_permission.permission_key = 'pending_issues.manage'
  where profile.organization_id = actor_organization_id
    and profile.status = 'active'
  order by lower(profile.full_name), profile.id;
end;
$$;

revoke all on function public.list_pending_issue_assignees() from public, anon, authenticated;
grant execute on function public.list_pending_issue_assignees() to authenticated;
