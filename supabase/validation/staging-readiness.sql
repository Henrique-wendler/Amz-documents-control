\set ON_ERROR_STOP on

begin;
set transaction read only;

do $$
declare
  expected_versions text[] := array[
    '202608270001', '202608270002', '202608270003', '202608270004',
    '202608270005', '202608270006', '202608280007', '202608280008',
    '202608280009', '202609010010', '202609030011', '202609030012',
    '202609040013', '202609040014', '202609040015', '202609040016',
    '202609150017', '202609240018', '202610080019', '202610080020'
  ];
  applied_versions text[];
begin
  select array_agg(version order by version)
    into applied_versions
  from supabase_migrations.schema_migrations;

  if applied_versions is distinct from expected_versions then
    raise exception 'Migration history differs from the expected 001-020 set.';
  end if;
end;
$$;

do $$
declare
  expected_tables text[] := array[
    'organizations', 'roles', 'permissions', 'role_permissions', 'profiles',
    'owners', 'farms', 'registrations', 'ownership_links',
    'financial_institutions', 'operations', 'operation_registrations', 'operation_financials',
    'guarantee_types', 'guarantees', 'guarantee_type_links', 'guarantee_registrations',
    'guarantee_financials', 'guarantee_items', 'document_types', 'rural_documents',
    'document_attachments', 'file_access_log', 'car_records', 'audit_log',
    'report_templates', 'report_log', 'attachment_locations', 'file_gateway_instances',
    'remote_copy_jobs', 'pending_issue_management', 'pending_issue_events'
  ];
  missing text[];
  without_rls text[];
begin
  select array_agg(table_name order by table_name)
    into missing
  from unnest(expected_tables) table_name
  where to_regclass(format('public.%I', table_name)) is null;

  if missing is not null then
    raise exception 'Missing public tables: %', array_to_string(missing, ', ');
  end if;

  select array_agg(table_name order by table_name)
    into without_rls
  from unnest(expected_tables) table_name
  join pg_class relation on relation.oid = to_regclass(format('public.%I', table_name))
  where not relation.relrowsecurity;

  if without_rls is not null then
    raise exception 'RLS is disabled on: %', array_to_string(without_rls, ', ');
  end if;
end;
$$;

do $$
declare
  broad_policies text[];
  missing_permissions text[];
  technician_permissions text[];
  missing_central_policies text[];
begin
  select array_agg(format('%I.%I', schemaname, tablename) order by schemaname, tablename)
    into broad_policies
  from pg_policies
  where 'authenticated' = any(roles)
    and cmd = 'ALL';

  if broad_policies is not null then
    raise exception 'Broad authenticated ALL policies found: %', array_to_string(broad_policies, ', ');
  end if;

  select array_agg(permission_key order by permission_key)
    into missing_permissions
  from unnest(array[
    'users.manage', 'catalogs.manage', 'files.read', 'files.manage',
    'reports.read', 'reports.generate', 'reports.export', 'reports.financial',
    'financial.read', 'financial.write', 'audit.read',
    'pending_issues.read', 'pending_issues.manage', 'pending_issues.financial_read'
  ]) permission_key
  where not exists (
    select 1 from public.permissions permission
    where permission.permission_key = permission_key
  );

  if missing_permissions is not null then
    raise exception 'Required permissions are missing: %', array_to_string(missing_permissions, ', ');
  end if;

  select array_agg(permission_key order by permission_key)
    into technician_permissions
  from public.role_permissions
  where role_key = 'technician';

  if technician_permissions is distinct from array[
    'pending_issues.financial_read', 'pending_issues.manage', 'pending_issues.read'
  ] then
    raise exception 'Technician must have exactly the three Central permissions.';
  end if;

  if (select count(*) from public.role_permissions
      where role_key = 'admin' and permission_key like 'pending_issues.%') <> 3
    or exists (select 1 from public.role_permissions
      where role_key in ('manager', 'operator', 'viewer')
        and permission_key like 'pending_issues.%') then
    raise exception 'Central permissions are assigned to an unexpected role.';
  end if;

  select array_agg(policy_name order by policy_name)
    into missing_central_policies
  from unnest(array[
    'pending_issue_management_select', 'pending_issue_events_select'
  ]) policy_name
  where not exists (
    select 1 from pg_policies policy
    where policy.schemaname = 'public'
      and policy.tablename = case
        when policy_name = 'pending_issue_events_select' then 'pending_issue_events'
        else 'pending_issue_management'
      end
      and policy.policyname = policy_name
  );

  if missing_central_policies is not null then
    raise exception 'Central RLS policies are missing: %', array_to_string(missing_central_policies, ', ');
  end if;

  if has_table_privilege('authenticated', 'public.pending_issue_events', 'INSERT')
    or has_table_privilege('authenticated', 'public.pending_issue_events', 'UPDATE')
    or has_table_privilege('authenticated', 'public.pending_issue_events', 'DELETE') then
    raise exception 'Browser role can mutate the Central event history directly.';
  end if;
end;
$$;

do $$
declare
  missing_policies text[];
begin
  if not exists (
    select 1 from storage.buckets
    where id = 'rural-documents'
      and public = false
  ) then
    raise exception 'Private bucket rural-documents is missing or public.';
  end if;

  select array_agg(policy_name order by policy_name)
    into missing_policies
  from unnest(array[
    'rural_documents_storage_select',
    'rural_documents_storage_insert',
    'rural_documents_storage_update',
    'rural_documents_storage_delete'
  ]) policy_name
  where not exists (
    select 1 from pg_policies policy
    where policy.schemaname = 'storage'
      and policy.tablename = 'objects'
      and policy.policyname = policy_name
  );

  if missing_policies is not null then
    raise exception 'Storage policies are missing: %', array_to_string(missing_policies, ', ');
  end if;
end;
$$;

do $$
declare
  required_functions text[] := array[
    'public.current_user_permissions()',
    'public.create_ownership_link(uuid,uuid,text,numeric,text,date,date)',
    'public.update_ownership_link(uuid,integer,uuid,text,numeric,text,date,date)',
    'public.save_operation_transactional(uuid,integer,text,uuid,text,text,date,date,text,uuid[],uuid,numeric,integer)',
    'public.save_guarantee_transactional(uuid,integer,uuid,text,text,smallint,text,date,date,text,uuid[],uuid,uuid[],numeric,integer)',
    'public.begin_document_upload(uuid,text,text,bigint)',
    'public.finalize_document_upload(uuid,uuid,text,bigint,text)',
    'public.request_attachment_remote_copy(uuid,uuid)',
    'public.add_pending_issue_note(uuid,text)',
    'public.reconcile_pending_issues()',
    'public.update_pending_issue_management(uuid,integer,uuid,text,date,text)',
    'public.list_pending_issues(text,text,uuid,boolean,boolean,uuid,uuid,uuid,text,text,integer,integer)',
    'public.get_pending_issue_summary()',
    'public.list_pending_issue_assignees()'
  ];
  missing text[];
  gateway_function text;
begin
  select array_agg(signature order by signature)
    into missing
  from unnest(required_functions) signature
  where to_regprocedure(signature) is null;

  if missing is not null then
    raise exception 'Required functions/RPCs are missing: %', array_to_string(missing, ', ');
  end if;

  if has_function_privilege('anon', 'public.add_pending_issue_note(uuid,text)', 'EXECUTE')
    or not has_function_privilege('authenticated', 'public.add_pending_issue_note(uuid,text)', 'EXECUTE')
    or has_function_privilege('authenticated', 'private.prepare_pending_issue_management()', 'EXECUTE')
    or has_function_privilege('authenticated', 'private.write_pending_issue_history()', 'EXECUTE') then
    raise exception 'Central function grants are not restricted as expected.';
  end if;

  if has_function_privilege('anon', 'public.reconcile_pending_issues()', 'EXECUTE')
    or has_function_privilege('anon', 'public.update_pending_issue_management(uuid,integer,uuid,text,date,text)', 'EXECUTE')
    or has_function_privilege('anon', 'public.list_pending_issues(text,text,uuid,boolean,boolean,uuid,uuid,uuid,text,text,integer,integer)', 'EXECUTE')
    or has_function_privilege('anon', 'public.get_pending_issue_summary()', 'EXECUTE')
    or has_function_privilege('anon', 'public.list_pending_issue_assignees()', 'EXECUTE')
    or not has_function_privilege('authenticated', 'public.reconcile_pending_issues()', 'EXECUTE')
    or not has_function_privilege('authenticated', 'public.update_pending_issue_management(uuid,integer,uuid,text,date,text)', 'EXECUTE')
    or not has_function_privilege('authenticated', 'public.list_pending_issues(text,text,uuid,boolean,boolean,uuid,uuid,uuid,text,text,integer,integer)', 'EXECUTE')
    or not has_function_privilege('authenticated', 'public.get_pending_issue_summary()', 'EXECUTE')
    or not has_function_privilege('authenticated', 'public.list_pending_issue_assignees()', 'EXECUTE')
    or has_function_privilege('authenticated', 'private.detect_pending_issues(uuid)', 'EXECUTE')
    or has_function_privilege('authenticated', 'private.reconcile_pending_issues_for_organization(uuid)', 'EXECUTE')
    or has_function_privilege('authenticated', 'private.pending_issue_snapshot(uuid)', 'EXECUTE') then
    raise exception 'Central detection/read functions have unexpected grants.';
  end if;

  if not has_table_privilege('authenticated', 'public.pending_issue_management', 'SELECT')
    or has_table_privilege('authenticated', 'public.pending_issue_management', 'INSERT')
    or has_table_privilege('authenticated', 'public.pending_issue_management', 'UPDATE')
    or has_table_privilege('authenticated', 'public.pending_issue_management', 'DELETE')
    or has_table_privilege('anon', 'public.pending_issue_management', 'SELECT')
    or has_table_privilege('anon', 'public.pending_issue_management', 'INSERT')
    or has_table_privilege('anon', 'public.pending_issue_management', 'UPDATE')
    or has_table_privilege('anon', 'public.pending_issue_management', 'DELETE')
    or exists (
      select 1 from pg_policies policy
      where policy.schemaname = 'public'
        and policy.tablename = 'pending_issue_management'
        and policy.policyname in ('pending_issue_management_insert', 'pending_issue_management_update')
    ) then
    raise exception 'Central management table grants/policies allow unexpected direct writes.';
  end if;

  foreach gateway_function in array array[
    'public.claim_file_sync_candidates(uuid,integer,integer,integer)',
    'public.complete_file_sync(uuid,uuid,text,text,bigint,text)',
    'public.fail_file_sync(uuid,uuid,text,integer)',
    'public.claim_remote_copy_jobs(uuid,integer,integer,integer)',
    'public.prepare_remote_copy_upload(uuid,uuid,text,bigint,text)',
    'public.complete_remote_copy_upload(uuid,uuid,uuid,text,bigint,text)',
    'public.fail_remote_copy_job(uuid,uuid,text,integer)'
  ] loop
    if to_regprocedure(gateway_function) is null then
      raise exception 'Gateway RPC is missing: %', gateway_function;
    end if;
    if has_function_privilege('authenticated', gateway_function, 'EXECUTE')
      or has_function_privilege('anon', gateway_function, 'EXECUTE') then
      raise exception 'Gateway RPC is exposed to a browser role: %', gateway_function;
    end if;
  end loop;
end;
$$;

do $$
declare
  gateway_read_table text;
begin
  foreach gateway_read_table in array array[
    'organizations',
    'file_gateway_instances',
    'remote_copy_jobs',
    'attachment_locations',
    'file_access_log'
  ] loop
    if not has_table_privilege('service_role', format('public.%I', gateway_read_table), 'SELECT') then
      raise exception 'service_role is missing SELECT on public.%', gateway_read_table;
    end if;

    if has_table_privilege('service_role', format('public.%I', gateway_read_table), 'INSERT')
      or has_table_privilege('service_role', format('public.%I', gateway_read_table), 'UPDATE')
      or has_table_privilege('service_role', format('public.%I', gateway_read_table), 'DELETE')
      or has_table_privilege('service_role', format('public.%I', gateway_read_table), 'TRUNCATE')
      or has_table_privilege('service_role', format('public.%I', gateway_read_table), 'REFERENCES')
      or has_table_privilege('service_role', format('public.%I', gateway_read_table), 'TRIGGER') then
      raise exception 'service_role has a forbidden mutation privilege on public.%', gateway_read_table;
    end if;
  end loop;
end;
$$;

select
  20 as migrations_validated,
  32 as public_tables_validated,
  'rural-documents' as private_bucket_validated,
  'staging database readiness checks passed' as result;

rollback;
