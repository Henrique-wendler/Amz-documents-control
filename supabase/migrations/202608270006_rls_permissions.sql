-- Row-level security, grants and permission-sensitive business transitions.

do $$
declare
  secured_table text;
begin
  foreach secured_table in array array[
    'organizations', 'roles', 'permissions', 'role_permissions', 'profiles',
    'owners', 'farms', 'registrations', 'ownership_links',
    'financial_institutions', 'operations', 'operation_registrations', 'operation_financials',
    'guarantee_types', 'guarantees', 'guarantee_type_links', 'guarantee_registrations',
    'guarantee_financials', 'guarantee_items',
    'document_types', 'rural_documents', 'document_attachments', 'file_access_log', 'car_records',
    'audit_log', 'report_templates', 'report_log'
  ] loop
    execute format('alter table public.%I enable row level security', secured_table);
  end loop;
end;
$$;

revoke all on all tables in schema public from anon;
revoke all on all functions in schema private from public;
revoke all on function public.create_ownership_link(uuid, uuid, text, numeric, text, date, date) from public;
revoke all on function public.update_ownership_link(uuid, integer, uuid, text, numeric, text, date, date) from public;

grant usage on schema private to authenticated;
grant execute on function private.current_user_organization_id() to authenticated;
grant execute on function private.has_permission(text) to authenticated;
grant execute on function private.same_organization(uuid) to authenticated;
grant execute on function public.create_ownership_link(uuid, uuid, text, numeric, text, date, date) to authenticated;
grant execute on function public.update_ownership_link(uuid, integer, uuid, text, numeric, text, date, date) to authenticated;

grant select, insert, update on
  public.profiles,
  public.owners,
  public.farms,
  public.registrations,
  public.financial_institutions,
  public.operations,
  public.operation_financials,
  public.guarantee_types,
  public.guarantees,
  public.guarantee_financials,
  public.guarantee_items,
  public.document_types,
  public.rural_documents,
  public.document_attachments,
  public.car_records,
  public.report_templates
to authenticated;

grant select, update on public.organizations to authenticated;

grant select, insert on public.report_log to authenticated;
grant update (downloaded_at, context) on public.report_log to authenticated;

grant select, insert, update, delete on
  public.operation_registrations,
  public.guarantee_type_links,
  public.guarantee_registrations
to authenticated;

grant select on
  public.roles,
  public.permissions,
  public.role_permissions,
  public.ownership_links,
  public.file_access_log,
  public.audit_log,
  public.rural_documents_with_validity
to authenticated;

grant insert, update on public.roles, public.permissions to authenticated;
grant insert, update, delete on public.role_permissions to authenticated;

create policy organizations_select
on public.organizations for select to authenticated
using (
  deleted_at is null
  and private.same_organization(id)
  and private.has_permission('organizations.read')
);

create policy organizations_update
on public.organizations for update to authenticated
using (private.same_organization(id) and private.has_permission('organizations.write'))
with check (private.same_organization(id) and private.has_permission('organizations.write'));

create policy profiles_select
on public.profiles for select to authenticated
using (
  id = auth.uid()
  or (
    private.same_organization(organization_id)
    and private.has_permission('users.manage')
  )
);

create policy profiles_insert
on public.profiles for insert to authenticated
with check (
  private.same_organization(organization_id)
  and private.has_permission('users.manage')
);

create policy profiles_update
on public.profiles for update to authenticated
using (private.same_organization(organization_id) and private.has_permission('users.manage'))
with check (private.same_organization(organization_id) and private.has_permission('users.manage'));

create policy roles_select
on public.roles for select to authenticated
using (private.has_permission('users.manage') or private.has_permission('permissions.manage'));

create policy roles_insert
on public.roles for insert to authenticated
with check (private.has_permission('permissions.manage'));

create policy roles_update
on public.roles for update to authenticated
using (private.has_permission('permissions.manage'))
with check (private.has_permission('permissions.manage'));

create policy permissions_select
on public.permissions for select to authenticated
using (private.has_permission('permissions.manage'));

create policy permissions_insert
on public.permissions for insert to authenticated
with check (private.has_permission('permissions.manage'));

create policy permissions_update
on public.permissions for update to authenticated
using (private.has_permission('permissions.manage'))
with check (private.has_permission('permissions.manage'));

create policy role_permissions_select
on public.role_permissions for select to authenticated
using (private.has_permission('permissions.manage'));

create policy role_permissions_insert
on public.role_permissions for insert to authenticated
with check (private.has_permission('permissions.manage'));

create policy role_permissions_update
on public.role_permissions for update to authenticated
using (private.has_permission('permissions.manage'))
with check (private.has_permission('permissions.manage'));

create policy role_permissions_delete
on public.role_permissions for delete to authenticated
using (private.has_permission('permissions.manage'));

do $$
declare
  policy_spec record;
begin
  for policy_spec in
    select * from (values
      ('owners', 'owners.read', 'owners.write'),
      ('farms', 'farms.read', 'farms.write'),
      ('registrations', 'registrations.read', 'registrations.write'),
      ('financial_institutions', 'operations.read', 'operations.write'),
      ('operations', 'operations.read', 'operations.write'),
      ('guarantee_types', 'guarantees.read', 'guarantees.write'),
      ('guarantees', 'guarantees.read', 'guarantees.write'),
      ('guarantee_items', 'guarantees.read', 'guarantees.write'),
      ('document_types', 'documents.read', 'documents.write'),
      ('rural_documents', 'documents.read', 'documents.write'),
      ('document_attachments', 'files.read', 'files.manage'),
      ('car_records', 'car.read', 'car.write'),
      ('report_templates', 'reports.read', 'reports.manage')
    ) as mapping(table_name, read_permission, write_permission)
  loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (deleted_at is null and private.same_organization(organization_id) and private.has_permission(%L))',
      policy_spec.table_name || '_select', policy_spec.table_name, policy_spec.read_permission
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (private.same_organization(organization_id) and private.has_permission(%L))',
      policy_spec.table_name || '_insert', policy_spec.table_name, policy_spec.write_permission
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (private.same_organization(organization_id) and private.has_permission(%L)) with check (private.same_organization(organization_id) and private.has_permission(%L))',
      policy_spec.table_name || '_update', policy_spec.table_name, policy_spec.write_permission, policy_spec.write_permission
    );
  end loop;
end;
$$;

create policy ownership_links_select
on public.ownership_links for select to authenticated
using (
  deleted_at is null
  and private.same_organization(organization_id)
  and private.has_permission('registrations.read')
);

do $$
declare
  policy_spec record;
begin
  for policy_spec in
    select * from (values
      ('operation_registrations', 'operations.read', 'operations.write'),
      ('guarantee_type_links', 'guarantees.read', 'guarantees.write'),
      ('guarantee_registrations', 'guarantees.read', 'guarantees.write')
    ) as mapping(table_name, read_permission, write_permission)
  loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (private.same_organization(organization_id) and private.has_permission(%L))',
      policy_spec.table_name || '_select', policy_spec.table_name, policy_spec.read_permission
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (private.same_organization(organization_id) and private.has_permission(%L))',
      policy_spec.table_name || '_insert', policy_spec.table_name, policy_spec.write_permission
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (private.same_organization(organization_id) and private.has_permission(%L)) with check (private.same_organization(organization_id) and private.has_permission(%L))',
      policy_spec.table_name || '_update', policy_spec.table_name, policy_spec.write_permission, policy_spec.write_permission
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using (private.same_organization(organization_id) and private.has_permission(%L))',
      policy_spec.table_name || '_delete', policy_spec.table_name, policy_spec.write_permission
    );
  end loop;
end;
$$;

create policy operation_financials_select
on public.operation_financials for select to authenticated
using (private.same_organization(organization_id) and private.has_permission('financial.read'));

create policy operation_financials_insert
on public.operation_financials for insert to authenticated
with check (private.same_organization(organization_id) and private.has_permission('financial.write'));

create policy operation_financials_update
on public.operation_financials for update to authenticated
using (private.same_organization(organization_id) and private.has_permission('financial.write'))
with check (private.same_organization(organization_id) and private.has_permission('financial.write'));

create policy guarantee_financials_select
on public.guarantee_financials for select to authenticated
using (private.same_organization(organization_id) and private.has_permission('financial.read'));

create policy guarantee_financials_insert
on public.guarantee_financials for insert to authenticated
with check (private.same_organization(organization_id) and private.has_permission('financial.write'));

create policy guarantee_financials_update
on public.guarantee_financials for update to authenticated
using (private.same_organization(organization_id) and private.has_permission('financial.write'))
with check (private.same_organization(organization_id) and private.has_permission('financial.write'));

create policy file_access_log_select
on public.file_access_log for select to authenticated
using (
  private.same_organization(organization_id)
  and (private.has_permission('files.manage') or private.has_permission('audit.read'))
);

create policy audit_log_select
on public.audit_log for select to authenticated
using (
  private.same_organization(organization_id)
  and private.has_permission('audit.read')
  and (
    entity_type not in ('operation_financials', 'guarantee_financials')
    or private.has_permission('financial.read')
  )
);

create policy report_log_select
on public.report_log for select to authenticated
using (
  private.same_organization(organization_id)
  and private.has_permission('reports.read')
);

create policy report_log_insert
on public.report_log for insert to authenticated
with check (
  user_id = auth.uid()
  and private.same_organization(organization_id)
  and private.has_permission('reports.generate')
  and (
    not coalesce((included_sections ->> 'include_financial_values')::boolean, false)
    or (
      private.has_permission('reports.financial')
      and private.has_permission('financial.read')
    )
  )
);

create policy report_log_update
on public.report_log for update to authenticated
using (
  user_id = auth.uid()
  and private.same_organization(organization_id)
  and private.has_permission('reports.generate')
)
with check (
  user_id = auth.uid()
  and private.same_organization(organization_id)
  and private.has_permission('reports.generate')
);

create or replace function public.log_file_access(
  p_attachment_id uuid,
  p_action text,
  p_context jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_organization_id uuid;
  created_log_id uuid;
begin
  if p_action not in ('view', 'download', 'copy_reference') then
    raise exception using errcode = '22023', message = 'Unsupported file access action.';
  end if;

  if not private.has_permission('files.read') then
    raise exception using errcode = '42501', message = 'Missing files.read permission.';
  end if;

  select attachment.organization_id
    into target_organization_id
  from public.document_attachments attachment
  where attachment.id = p_attachment_id
    and attachment.status = 'active'
    and attachment.deleted_at is null;

  if target_organization_id is null or not private.same_organization(target_organization_id) then
    raise exception using errcode = '42501', message = 'Attachment is not available to the current organization.';
  end if;

  insert into public.file_access_log (
    organization_id, attachment_id, user_id, action, context
  ) values (
    target_organization_id, p_attachment_id, auth.uid(), p_action, p_context
  ) returning id into created_log_id;

  return created_log_id;
end;
$$;

revoke all on function public.log_file_access(uuid, text, jsonb) from public;
grant execute on function public.log_file_access(uuid, text, jsonb) to authenticated;

create or replace function private.guard_status_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  required_permission text;
begin
  if old.status is not distinct from new.status then
    return new;
  end if;

  required_permission := case new.status
    when 'inactive' then nullif(tg_argv[0], '')
    when 'completed' then nullif(tg_argv[1], '')
    when 'closed' then nullif(tg_argv[1], '')
    when 'cancelled' then nullif(tg_argv[2], '')
    else null
  end;

  if required_permission is not null and not private.has_permission(required_permission) then
    raise exception using errcode = '42501', message = 'Missing permission for the requested status transition.';
  end if;

  return new;
end;
$$;

create trigger owners_guard_status before update of status on public.owners
for each row execute function private.guard_status_transition('owners.inactivate', '', '');
create trigger farms_guard_status before update of status on public.farms
for each row execute function private.guard_status_transition('farms.inactivate', '', '');
create trigger registrations_guard_status before update of status on public.registrations
for each row execute function private.guard_status_transition('registrations.inactivate', '', '');
create trigger operations_guard_status before update of status on public.operations
for each row execute function private.guard_status_transition('', 'operations.close', 'operations.cancel');
create trigger guarantees_guard_status before update of status on public.guarantees
for each row execute function private.guard_status_transition('', 'guarantees.close', 'guarantees.cancel');
create trigger rural_documents_guard_status before update of status on public.rural_documents
for each row execute function private.guard_status_transition('documents.inactivate', '', '');
create trigger car_records_guard_status before update of status on public.car_records
for each row execute function private.guard_status_transition('car.inactivate', '', '');

create or replace function private.guard_soft_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.deleted_at is distinct from new.deleted_at then
    if not private.has_permission(tg_argv[0]) then
      raise exception using errcode = '42501', message = 'Missing permission for soft delete or restore.';
    end if;

    if new.deleted_at is null then
      new.deleted_by := null;
    else
      new.deleted_by := auth.uid();
    end if;
  end if;

  return new;
end;
$$;

do $$
declare
  guard_spec record;
begin
  for guard_spec in
    select * from (values
      ('organizations', 'organizations.soft_delete'),
      ('owners', 'owners.soft_delete'),
      ('farms', 'farms.soft_delete'),
      ('registrations', 'registrations.soft_delete'),
      ('ownership_links', 'registrations.soft_delete'),
      ('financial_institutions', 'operations.soft_delete'),
      ('operations', 'operations.soft_delete'),
      ('guarantee_types', 'guarantees.soft_delete'),
      ('guarantees', 'guarantees.soft_delete'),
      ('guarantee_items', 'guarantees.soft_delete'),
      ('document_types', 'documents.soft_delete'),
      ('rural_documents', 'documents.soft_delete'),
      ('document_attachments', 'files.soft_delete'),
      ('car_records', 'car.soft_delete'),
      ('report_templates', 'reports.manage')
    ) as mapping(table_name, permission_key)
  loop
    execute format(
      'create trigger %I before update of deleted_at on public.%I for each row execute function private.guard_soft_delete(%L)',
      guard_spec.table_name || '_guard_soft_delete',
      guard_spec.table_name,
      guard_spec.permission_key
    );
  end loop;
end;
$$;

create or replace function public.restore_soft_deleted_record(
  p_entity_type text,
  p_id uuid,
  p_expected_version integer
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_table text;
  required_permission text;
  target_organization_id uuid := private.current_user_organization_id();
  affected_rows integer;
begin
  select mapping.table_name, mapping.permission_key
    into target_table, required_permission
  from (values
    ('owners', 'owners.soft_delete'),
    ('farms', 'farms.soft_delete'),
    ('registrations', 'registrations.soft_delete'),
    ('ownership_links', 'registrations.soft_delete'),
    ('financial_institutions', 'operations.soft_delete'),
    ('operations', 'operations.soft_delete'),
    ('guarantee_types', 'guarantees.soft_delete'),
    ('guarantees', 'guarantees.soft_delete'),
    ('guarantee_items', 'guarantees.soft_delete'),
    ('document_types', 'documents.soft_delete'),
    ('rural_documents', 'documents.soft_delete'),
    ('document_attachments', 'files.soft_delete'),
    ('car_records', 'car.soft_delete'),
    ('report_templates', 'reports.manage')
  ) as mapping(table_name, permission_key)
  where mapping.table_name = p_entity_type;

  if target_table is null then
    raise exception using errcode = '22023', message = 'Unsupported entity type for restore.';
  end if;

  if target_organization_id is null or not private.has_permission(required_permission) then
    raise exception using errcode = '42501', message = 'Missing permission for restore.';
  end if;

  execute format(
    'update public.%I set deleted_at = null where id = $1 and organization_id = $2 and version = $3 and deleted_at is not null',
    target_table
  ) using p_id, target_organization_id, p_expected_version;

  get diagnostics affected_rows = row_count;
  if affected_rows = 0 then
    raise exception using
      errcode = '40001',
      message = 'Record is unavailable or was changed by another transaction.';
  end if;

  return affected_rows;
end;
$$;

revoke all on function public.restore_soft_deleted_record(text, uuid, integer) from public;
grant execute on function public.restore_soft_deleted_record(text, uuid, integer) to authenticated;

create or replace function public.soft_delete_record(
  p_entity_type text,
  p_id uuid,
  p_expected_version integer
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_table text;
  required_permission text;
  target_organization_id uuid := private.current_user_organization_id();
  affected_rows integer;
begin
  select mapping.table_name, mapping.permission_key
    into target_table, required_permission
  from (values
    ('owners', 'owners.soft_delete'),
    ('farms', 'farms.soft_delete'),
    ('registrations', 'registrations.soft_delete'),
    ('ownership_links', 'registrations.soft_delete'),
    ('financial_institutions', 'operations.soft_delete'),
    ('operations', 'operations.soft_delete'),
    ('guarantee_types', 'guarantees.soft_delete'),
    ('guarantees', 'guarantees.soft_delete'),
    ('guarantee_items', 'guarantees.soft_delete'),
    ('document_types', 'documents.soft_delete'),
    ('rural_documents', 'documents.soft_delete'),
    ('document_attachments', 'files.soft_delete'),
    ('car_records', 'car.soft_delete'),
    ('report_templates', 'reports.manage')
  ) as mapping(table_name, permission_key)
  where mapping.table_name = p_entity_type;

  if target_table is null then
    raise exception using errcode = '22023', message = 'Unsupported entity type for soft delete.';
  end if;

  if target_organization_id is null or not private.has_permission(required_permission) then
    raise exception using errcode = '42501', message = 'Missing permission for soft delete.';
  end if;

  execute format(
    'update public.%I set deleted_at = now() where id = $1 and organization_id = $2 and version = $3 and deleted_at is null',
    target_table
  ) using p_id, target_organization_id, p_expected_version;

  get diagnostics affected_rows = row_count;
  if affected_rows = 0 then
    raise exception using
      errcode = '40001',
      message = 'Record is unavailable or was changed by another transaction.';
  end if;

  return affected_rows;
end;
$$;

revoke all on function public.soft_delete_record(text, uuid, integer) from public;
grant execute on function public.soft_delete_record(text, uuid, integer) to authenticated;
