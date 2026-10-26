\set ON_ERROR_STOP on

-- Local-only integration test. It requires one active admin profile and rolls
-- back every fixture and mutation. Never point this script at a Cloud project.
begin;

do $$
begin
  if (select count(*) from public.profiles profile
      join public.organizations organization on organization.id = profile.organization_id
      where profile.role_key = 'admin' and profile.status = 'active'
        and organization.status = 'active' and organization.deleted_at is null) <> 1 then
    raise exception 'MFA local test requires exactly one active admin profile';
  end if;
end;
$$;

select set_config('mfa_test.actor_id', profile.id::text, true),
       set_config('mfa_test.tenant_id', profile.organization_id::text, true)
from public.profiles profile where profile.role_key = 'admin' and profile.status = 'active';

-- Keep a second manager while testing the original admin's role/status guards.
with created as (
  insert into auth.users (id) values (gen_random_uuid()) returning id
)
insert into public.profiles (id, organization_id, full_name, role_key)
select id, current_setting('mfa_test.tenant_id')::uuid, 'MFA local backup admin', 'admin'
from created;

with created as (
  insert into public.organizations (legal_name) values ('MFA local other tenant') returning id
)
select set_config('mfa_test.other_tenant_id', id::text, true) from created;

with created as (
  insert into public.owners (organization_id, owner_type, name, document_number)
  values (current_setting('mfa_test.tenant_id')::uuid, 'individual', 'MFA local owner', '12312312312')
  returning id
)
select set_config('mfa_test.owner_id', id::text, true) from created;

with created as (
  insert into public.owners (organization_id, owner_type, name, document_number)
  values (current_setting('mfa_test.other_tenant_id')::uuid, 'individual', 'MFA other owner', '12312312313')
  returning id
)
select set_config('mfa_test.other_owner_id', id::text, true) from created;

with created as (
  insert into public.farms (organization_id, name, municipality, state, total_area)
  values (current_setting('mfa_test.tenant_id')::uuid, 'MFA local farm', 'Palmas', 'TO', 10)
  returning id
)
select set_config('mfa_test.farm_id', id::text, true) from created;

with created as (
  insert into public.farms (organization_id, name, municipality, state, total_area)
  values (current_setting('mfa_test.other_tenant_id')::uuid, 'MFA other farm', 'Palmas', 'TO', 20)
  returning id
)
select set_config('mfa_test.other_farm_id', id::text, true) from created;

with created as (
  insert into storage.objects (bucket_id, name)
  values ('rural-documents', current_setting('mfa_test.tenant_id') || '/mfa-local/test.pdf')
  returning id
)
select set_config('mfa_test.object_id', id::text, true) from created;

select set_config('request.jwt.claims', json_build_object(
  'sub', current_setting('mfa_test.actor_id'), 'role', 'authenticated', 'aal', 'aal1'
)::text, true);
set local role authenticated;

do $$
declare
  denied boolean := false;
begin
  if auth.uid() is distinct from current_setting('mfa_test.actor_id')::uuid
    or private.current_user_has_aal2()
    or private.has_permission('owners.read') then
    raise exception 'aal1 identity or permission gate failed';
  end if;
  if (select count(*) from public.profiles where id = auth.uid()) <> 1
    or (select count(*) from public.profiles) <> 1 then
    raise exception 'aal1 must read only its own profile for MFA enrollment';
  end if;
  if exists (select 1 from public.owners where id = current_setting('mfa_test.owner_id')::uuid)
    or exists (select 1 from public.farms where id = current_setting('mfa_test.farm_id')::uuid)
    or exists (select 1 from public.pending_issue_management)
    or exists (select 1 from storage.objects where id = current_setting('mfa_test.object_id')::uuid)
    or exists (select 1 from public.current_user_permissions()) then
    raise exception 'aal1 can read protected business data';
  end if;
  begin
    insert into public.owners (organization_id, owner_type, name, document_number)
    values (current_setting('mfa_test.tenant_id')::uuid, 'individual', 'Blocked', '12312312314');
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'aal1 owner write was allowed'; end if;
  denied := false;
  begin
    insert into storage.objects (bucket_id, name)
    values ('rural-documents', current_setting('mfa_test.tenant_id') || '/mfa-local/blocked.pdf');
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'aal1 Storage write was allowed'; end if;
  denied := false;
  begin
    perform public.get_pending_issue_summary();
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'aal1 privileged RPC was allowed'; end if;
  raise notice 'PASS aal1: own profile readable; owners, farms, write, RPC, pending and Storage denied';
end;
$$;

select set_config('request.jwt.claims', json_build_object(
  'sub', current_setting('mfa_test.actor_id'), 'role', 'authenticated', 'aal', 'aal2'
)::text, true);

do $$
begin
  if not private.current_user_has_aal2()
    or not private.has_permission('owners.read')
    or not private.has_permission('owners.write')
    or (select count(*) from public.owners where id = current_setting('mfa_test.owner_id')::uuid) <> 1
    or (select count(*) from public.farms where id = current_setting('mfa_test.farm_id')::uuid) <> 1
    or (select count(*) from storage.objects where id = current_setting('mfa_test.object_id')::uuid) <> 1
    or not exists (select 1 from public.current_user_permissions() where permission_key = 'owners.read') then
    raise exception 'aal2 admin cannot access authorized tenant data';
  end if;
  insert into public.owners (organization_id, owner_type, name, document_number)
  values (current_setting('mfa_test.tenant_id')::uuid, 'individual', 'Allowed', '12312312315');
  insert into storage.objects (bucket_id, name)
  values ('rural-documents', current_setting('mfa_test.tenant_id') || '/mfa-local/allowed.pdf');
  perform public.get_pending_issue_summary();
  if exists (select 1 from public.owners where id = current_setting('mfa_test.other_owner_id')::uuid)
    or exists (select 1 from public.farms where id = current_setting('mfa_test.other_farm_id')::uuid) then
    raise exception 'aal2 admin can read another tenant';
  end if;
  raise notice 'PASS aal2: authorized read, write, RPC and Storage; other tenant denied';
end;
$$;

reset role;
update public.profiles set role_key = 'viewer' where id = current_setting('mfa_test.actor_id')::uuid;
set local role authenticated;
do $$
declare denied boolean := false;
begin
  if private.has_permission('owners.write') or private.has_permission('pending_issues.read') then
    raise exception 'aal2 viewer received an unauthorized permission';
  end if;
  begin
    perform public.get_pending_issue_summary();
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'aal2 viewer used a privileged RPC'; end if;
  raise notice 'PASS permission: aal2 without permission denied';
end;
$$;

reset role;
update public.profiles set role_key = 'admin', status = 'inactive'
where id = current_setting('mfa_test.actor_id')::uuid;
set local role authenticated;
do $$
begin
  if private.has_permission('owners.read')
    or exists (select 1 from public.owners where id = current_setting('mfa_test.owner_id')::uuid) then
    raise exception 'inactive profile accessed business data';
  end if;
  raise notice 'PASS inactive profile: denied';
end;
$$;

reset role;
update public.profiles set status = 'active' where id = current_setting('mfa_test.actor_id')::uuid;
update public.organizations set status = 'inactive'
where id = current_setting('mfa_test.tenant_id')::uuid;
set local role authenticated;
do $$
begin
  if private.has_permission('owners.read')
    or exists (select 1 from public.owners where id = current_setting('mfa_test.owner_id')::uuid) then
    raise exception 'inactive organization accessed business data';
  end if;
  raise notice 'PASS inactive organization: denied';
end;
$$;

rollback;
