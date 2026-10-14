-- Business data requires a completed TOTP challenge. Keep the caller's own
-- profile readable at aal1 so AuthContext can discover the enrollment step.
create or replace function private.current_user_has_aal2()
returns boolean
language sql
stable
set search_path = ''
as $$
  select auth.uid() is not null
    and coalesce(auth.jwt() ->> 'aal', '') = 'aal2';
$$;

revoke all on function private.current_user_has_aal2() from public, anon;
grant execute on function private.current_user_has_aal2() to authenticated;

-- All existing permission-aware RLS and business RPCs share this gate.
-- The helper does not bypass RLS; it retains the role, tenant and status checks.
create or replace function private.has_permission(requested_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.current_user_has_aal2() and exists (
    select 1
    from public.profiles p
    join public.role_permissions rp on rp.role_key = p.role_key
    join public.permissions pm on pm.permission_key = rp.permission_key
    join public.roles r on r.role_key = p.role_key
    join public.organizations organization on organization.id = p.organization_id
    where p.id = auth.uid()
      and p.status = 'active'
      and r.status = 'active'
      and organization.status = 'active'
      and organization.deleted_at is null
      and pm.permission_key = requested_permission
  );
$$;

-- This definer RPC reads the permission catalog without calling has_permission.
-- Return no business permissions until the MFA step has completed.
create or replace function public.current_user_permissions()
returns table (permission_key text)
language sql
stable
security definer
set search_path = ''
as $$
  select role_permission.permission_key
  from public.profiles profile
  join public.organizations organization on organization.id = profile.organization_id
  join public.roles role on role.role_key = profile.role_key
  join public.role_permissions role_permission on role_permission.role_key = role.role_key
  join public.permissions permission on permission.permission_key = role_permission.permission_key
  where private.current_user_has_aal2()
    and profile.id = auth.uid()
    and profile.status = 'active'
    and organization.status = 'active'
    and organization.deleted_at is null
    and role.status = 'active'
  order by role_permission.permission_key;
$$;

-- Restrictive policies combine with the existing tenant and permission
-- policies. Include tables with no browser grant as defense in depth.
do $$
declare
  secured_table text;
begin
  foreach secured_table in array array[
    'organizations', 'roles', 'permissions', 'role_permissions',
    'owners', 'farms', 'registrations', 'ownership_links',
    'financial_institutions', 'operations', 'operation_registrations',
    'operation_financials', 'guarantee_types', 'guarantees',
    'guarantee_type_links', 'guarantee_registrations',
    'guarantee_financials', 'guarantee_items', 'document_types',
    'rural_documents', 'document_attachments', 'file_access_log',
    'car_records', 'audit_log', 'report_templates', 'report_log',
    'attachment_locations', 'file_gateway_instances', 'remote_copy_jobs',
    'pending_issue_management', 'pending_issue_events'
  ] loop
    execute format(
      'create policy %I on public.%I as restrictive for all to authenticated using (private.current_user_has_aal2()) with check (private.current_user_has_aal2())',
      secured_table || '_require_aal2', secured_table
    );
  end loop;
end;
$$;

create policy profiles_require_aal2_select
on public.profiles as restrictive for select to authenticated
using (id = auth.uid() or private.current_user_has_aal2());

create policy profiles_require_aal2_insert
on public.profiles as restrictive for insert to authenticated
with check (private.current_user_has_aal2());

create policy profiles_require_aal2_update
on public.profiles as restrictive for update to authenticated
using (private.current_user_has_aal2())
with check (private.current_user_has_aal2());

create policy profiles_require_aal2_delete
on public.profiles as restrictive for delete to authenticated
using (private.current_user_has_aal2());

-- Only the application bucket is in scope; other Storage buckets retain their
-- existing policies. The bucket remains private and tenant-prefixed.
create policy rural_documents_require_aal2
on storage.objects as restrictive for all to authenticated
using (bucket_id <> 'rural-documents' or private.current_user_has_aal2())
with check (bucket_id <> 'rural-documents' or private.current_user_has_aal2());
