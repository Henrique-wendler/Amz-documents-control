-- Atomic write boundaries for operations and guarantees.
-- SECURITY INVOKER intentionally preserves table grants, RLS and trigger-based auditing.

create or replace function public.save_operation_transactional(
  p_id uuid,
  p_expected_version integer,
  p_operation_number text,
  p_institution_id uuid,
  p_purpose text,
  p_status text,
  p_start_date date,
  p_end_date date,
  p_notes text,
  p_registration_ids uuid[],
  p_primary_registration_id uuid,
  p_amount numeric,
  p_expected_financial_version integer
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_organization_id uuid := private.current_user_organization_id();
  target_operation_id uuid;
  affected_rows integer;
  existing_financial_version integer;
begin
  if target_organization_id is null or not private.has_permission('operations.write') then
    raise exception using errcode = '42501', message = 'Missing operations.write permission.';
  end if;

  if p_amount is not null and (
    not private.has_permission('financial.read')
    or not private.has_permission('financial.write')
  ) then
    raise exception using errcode = '42501', message = 'Missing financial.read or financial.write permission.';
  end if;

  if p_id is null and p_expected_version is not null then
    raise exception using errcode = '22023', message = 'Expected version is only valid when updating an operation.';
  end if;

  if p_id is not null and p_expected_version is null then
    raise exception using errcode = '22023', message = 'Expected version is required when updating an operation.';
  end if;

  if p_operation_number is null or btrim(p_operation_number) = '' then
    raise exception using errcode = '22023', message = 'Operation number is required.';
  end if;

  if p_registration_ids is null or cardinality(p_registration_ids) = 0 then
    raise exception using errcode = '22023', message = 'At least one operation registration is required.';
  end if;

  if exists (select 1 from unnest(p_registration_ids) registration_id where registration_id is null)
     or (select count(distinct registration_id) from unnest(p_registration_ids) registration_id) <> cardinality(p_registration_ids) then
    raise exception using errcode = '22023', message = 'Operation registrations must be unique and non-null.';
  end if;

  if p_primary_registration_id is null or not (p_primary_registration_id = any(p_registration_ids)) then
    raise exception using errcode = '22023', message = 'Primary registration must belong to the operation.';
  end if;

  if not exists (
    select 1
    from public.financial_institutions institution
    where institution.id = p_institution_id
      and institution.organization_id = target_organization_id
      and institution.status = 'active'
      and institution.deleted_at is null
  ) then
    raise exception using errcode = '23503', message = 'Financial institution is unavailable to the current organization.';
  end if;

  if (
    select count(*)
    from public.registrations registration
    where registration.organization_id = target_organization_id
      and registration.id = any(p_registration_ids)
      and registration.deleted_at is null
  ) <> cardinality(p_registration_ids) then
    raise exception using errcode = '23503', message = 'One or more registrations are unavailable to the current organization.';
  end if;

  if p_id is null then
    insert into public.operations (
      organization_id, operation_number, institution_id, purpose, status, start_date, end_date, notes
    ) values (
      target_organization_id, btrim(p_operation_number), p_institution_id, nullif(btrim(p_purpose), ''),
      p_status, p_start_date, p_end_date, nullif(btrim(p_notes), '')
    ) returning id into target_operation_id;
  else
    update public.operations
    set operation_number = btrim(p_operation_number),
        institution_id = p_institution_id,
        purpose = nullif(btrim(p_purpose), ''),
        status = p_status,
        start_date = p_start_date,
        end_date = p_end_date,
        notes = nullif(btrim(p_notes), '')
    where id = p_id
      and organization_id = target_organization_id
      and version = p_expected_version
      and deleted_at is null
    returning id into target_operation_id;

    if target_operation_id is null then
      raise exception using errcode = '40001', message = 'Operation is unavailable or was changed by another transaction.';
    end if;
  end if;

  update public.operation_registrations
  set is_primary = false
  where organization_id = target_organization_id
    and operation_id = target_operation_id
    and is_primary;

  insert into public.operation_registrations (
    organization_id, operation_id, registration_id, is_primary
  )
  select target_organization_id, target_operation_id, registration_id, false
  from unnest(p_registration_ids) registration_id
  on conflict (organization_id, operation_id, registration_id)
  do update set is_primary = false;

  delete from public.operation_registrations
  where organization_id = target_organization_id
    and operation_id = target_operation_id
    and not (registration_id = any(p_registration_ids));

  update public.operation_registrations
  set is_primary = true
  where organization_id = target_organization_id
    and operation_id = target_operation_id
    and registration_id = p_primary_registration_id;

  get diagnostics affected_rows = row_count;
  if affected_rows <> 1 then
    raise exception using errcode = '23514', message = 'Exactly one primary operation registration is required.';
  end if;

  if p_amount is not null then
    select financial.version
      into existing_financial_version
    from public.operation_financials financial
    where financial.organization_id = target_organization_id
      and financial.operation_id = target_operation_id
    for update;

    if existing_financial_version is null then
      if p_expected_financial_version is not null then
        raise exception using errcode = '40001', message = 'Operation financial data is unavailable or was changed by another transaction.';
      end if;

      insert into public.operation_financials (organization_id, operation_id, amount)
      values (target_organization_id, target_operation_id, p_amount);
    else
      if p_expected_financial_version is null or existing_financial_version <> p_expected_financial_version then
        raise exception using errcode = '40001', message = 'Operation financial data is unavailable or was changed by another transaction.';
      end if;

      update public.operation_financials
      set amount = p_amount
      where organization_id = target_organization_id
        and operation_id = target_operation_id
        and version = p_expected_financial_version;

      get diagnostics affected_rows = row_count;
      if affected_rows <> 1 then
        raise exception using errcode = '40001', message = 'Operation financial data is unavailable or was changed by another transaction.';
      end if;
    end if;
  end if;

  return target_operation_id;
end;
$$;

create or replace function public.save_guarantee_transactional(
  p_id uuid,
  p_expected_version integer,
  p_operation_id uuid,
  p_description text,
  p_degree text,
  p_evaluation_year smallint,
  p_status text,
  p_start_date date,
  p_end_date date,
  p_notes text,
  p_guarantee_type_ids uuid[],
  p_primary_guarantee_type_id uuid,
  p_registration_ids uuid[],
  p_amount numeric,
  p_expected_financial_version integer
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_organization_id uuid := private.current_user_organization_id();
  target_guarantee_id uuid;
  affected_rows integer;
  existing_financial_version integer;
begin
  if target_organization_id is null or not private.has_permission('guarantees.write') then
    raise exception using errcode = '42501', message = 'Missing guarantees.write permission.';
  end if;

  if p_amount is not null and (
    not private.has_permission('financial.read')
    or not private.has_permission('financial.write')
  ) then
    raise exception using errcode = '42501', message = 'Missing financial.read or financial.write permission.';
  end if;

  if p_id is null and p_expected_version is not null then
    raise exception using errcode = '22023', message = 'Expected version is only valid when updating a guarantee.';
  end if;

  if p_id is not null and p_expected_version is null then
    raise exception using errcode = '22023', message = 'Expected version is required when updating a guarantee.';
  end if;

  if p_guarantee_type_ids is null or cardinality(p_guarantee_type_ids) = 0 then
    raise exception using errcode = '22023', message = 'At least one guarantee type is required.';
  end if;

  if exists (select 1 from unnest(p_guarantee_type_ids) guarantee_type_id where guarantee_type_id is null)
     or (select count(distinct guarantee_type_id) from unnest(p_guarantee_type_ids) guarantee_type_id) <> cardinality(p_guarantee_type_ids) then
    raise exception using errcode = '22023', message = 'Guarantee types must be unique and non-null.';
  end if;

  if p_primary_guarantee_type_id is null or not (p_primary_guarantee_type_id = any(p_guarantee_type_ids)) then
    raise exception using errcode = '22023', message = 'Primary type must belong to the guarantee.';
  end if;

  if p_registration_ids is null or cardinality(p_registration_ids) = 0 then
    raise exception using errcode = '22023', message = 'At least one guarantee registration is required.';
  end if;

  if exists (select 1 from unnest(p_registration_ids) registration_id where registration_id is null)
     or (select count(distinct registration_id) from unnest(p_registration_ids) registration_id) <> cardinality(p_registration_ids) then
    raise exception using errcode = '22023', message = 'Guarantee registrations must be unique and non-null.';
  end if;

  if not exists (
    select 1
    from public.operations operation
    where operation.id = p_operation_id
      and operation.organization_id = target_organization_id
      and operation.deleted_at is null
  ) then
    raise exception using errcode = '23503', message = 'Operation is unavailable to the current organization.';
  end if;

  if (
    select count(*)
    from public.guarantee_types guarantee_type
    where guarantee_type.organization_id = target_organization_id
      and guarantee_type.id = any(p_guarantee_type_ids)
      and guarantee_type.status = 'active'
      and guarantee_type.deleted_at is null
  ) <> cardinality(p_guarantee_type_ids) then
    raise exception using errcode = '23503', message = 'One or more guarantee types are unavailable to the current organization.';
  end if;

  if (
    select count(*)
    from public.operation_registrations operation_registration
    where operation_registration.organization_id = target_organization_id
      and operation_registration.operation_id = p_operation_id
      and operation_registration.registration_id = any(p_registration_ids)
  ) <> cardinality(p_registration_ids) then
    raise exception using errcode = '23514', message = 'Guarantee registrations must belong to the corresponding operation.';
  end if;

  if p_id is null then
    insert into public.guarantees (
      organization_id, operation_id, description, degree, evaluation_year, status, start_date, end_date, notes
    ) values (
      target_organization_id, p_operation_id, nullif(btrim(p_description), ''), nullif(btrim(p_degree), ''),
      p_evaluation_year, p_status, p_start_date, p_end_date, nullif(btrim(p_notes), '')
    ) returning id into target_guarantee_id;
  else
    update public.guarantees
    set operation_id = p_operation_id,
        description = nullif(btrim(p_description), ''),
        degree = nullif(btrim(p_degree), ''),
        evaluation_year = p_evaluation_year,
        status = p_status,
        start_date = p_start_date,
        end_date = p_end_date,
        notes = nullif(btrim(p_notes), '')
    where id = p_id
      and organization_id = target_organization_id
      and version = p_expected_version
      and deleted_at is null
    returning id into target_guarantee_id;

    if target_guarantee_id is null then
      raise exception using errcode = '40001', message = 'Guarantee is unavailable or was changed by another transaction.';
    end if;
  end if;

  update public.guarantee_type_links
  set is_primary = false
  where organization_id = target_organization_id
    and guarantee_id = target_guarantee_id
    and is_primary;

  insert into public.guarantee_type_links (
    organization_id, guarantee_id, guarantee_type_id, is_primary
  )
  select target_organization_id, target_guarantee_id, guarantee_type_id, false
  from unnest(p_guarantee_type_ids) guarantee_type_id
  on conflict (organization_id, guarantee_id, guarantee_type_id)
  do update set is_primary = false;

  delete from public.guarantee_type_links
  where organization_id = target_organization_id
    and guarantee_id = target_guarantee_id
    and not (guarantee_type_id = any(p_guarantee_type_ids));

  update public.guarantee_type_links
  set is_primary = true
  where organization_id = target_organization_id
    and guarantee_id = target_guarantee_id
    and guarantee_type_id = p_primary_guarantee_type_id;

  get diagnostics affected_rows = row_count;
  if affected_rows <> 1 then
    raise exception using errcode = '23514', message = 'Exactly one primary guarantee type is required.';
  end if;

  insert into public.guarantee_registrations (
    organization_id, guarantee_id, registration_id
  )
  select target_organization_id, target_guarantee_id, registration_id
  from unnest(p_registration_ids) registration_id
  on conflict (organization_id, guarantee_id, registration_id) do nothing;

  delete from public.guarantee_registrations
  where organization_id = target_organization_id
    and guarantee_id = target_guarantee_id
    and not (registration_id = any(p_registration_ids));

  if p_amount is not null then
    select financial.version
      into existing_financial_version
    from public.guarantee_financials financial
    where financial.organization_id = target_organization_id
      and financial.guarantee_id = target_guarantee_id
    for update;

    if existing_financial_version is null then
      if p_expected_financial_version is not null then
        raise exception using errcode = '40001', message = 'Guarantee financial data is unavailable or was changed by another transaction.';
      end if;

      insert into public.guarantee_financials (organization_id, guarantee_id, amount)
      values (target_organization_id, target_guarantee_id, p_amount);
    else
      if p_expected_financial_version is null or existing_financial_version <> p_expected_financial_version then
        raise exception using errcode = '40001', message = 'Guarantee financial data is unavailable or was changed by another transaction.';
      end if;

      update public.guarantee_financials
      set amount = p_amount
      where organization_id = target_organization_id
        and guarantee_id = target_guarantee_id
        and version = p_expected_financial_version;

      get diagnostics affected_rows = row_count;
      if affected_rows <> 1 then
        raise exception using errcode = '40001', message = 'Guarantee financial data is unavailable or was changed by another transaction.';
      end if;
    end if;
  end if;

  return target_guarantee_id;
end;
$$;

revoke all on function public.save_operation_transactional(
  uuid, integer, text, uuid, text, text, date, date, text, uuid[], uuid, numeric, integer
) from public;
grant execute on function public.save_operation_transactional(
  uuid, integer, text, uuid, text, text, date, date, text, uuid[], uuid, numeric, integer
) to authenticated;

revoke all on function public.save_guarantee_transactional(
  uuid, integer, uuid, text, text, smallint, text, date, date, text, uuid[], uuid, uuid[], numeric, integer
) from public;
grant execute on function public.save_guarantee_transactional(
  uuid, integer, uuid, text, text, smallint, text, date, date, text, uuid[], uuid, uuid[], numeric, integer
) to authenticated;
