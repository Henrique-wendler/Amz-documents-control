-- Core identity, tenant, roles and permission catalog.
-- Review-only migration: do not execute until the package is approved.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
revoke all on schema private from public;

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  legal_name text not null check (btrim(legal_name) <> ''),
  trade_name text,
  cnpj text unique check (cnpj is null or cnpj ~ '^[0-9]{14}$'),
  phone text,
  email text,
  address text,
  city text,
  state char(2) check (state is null or state ~ '^[A-Z]{2}$'),
  postal_code text check (postal_code is null or postal_code ~ '^[0-9]{8}$'),
  logo_path text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  version integer not null default 1 check (version >= 1),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete set null,
  check (deleted_at is not null or deleted_by is null)
);

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  role_key text not null unique check (role_key ~ '^[a-z][a-z0-9_]*$'),
  name text not null,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.permissions (
  id uuid primary key default gen_random_uuid(),
  permission_key text not null unique check (permission_key ~ '^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$'),
  description text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.role_permissions (
  role_key text not null references public.roles(role_key) on update cascade on delete restrict,
  permission_key text not null references public.permissions(permission_key) on update cascade on delete restrict,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  primary key (role_key, permission_key)
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  full_name text not null check (btrim(full_name) <> ''),
  role_key text not null references public.roles(role_key) on update cascade on delete restrict,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_organization_id_idx on public.profiles (organization_id);
create index profiles_role_key_idx on public.profiles (role_key);

create or replace function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function private.set_row_metadata()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := coalesce(new.created_at, now());
    new.updated_at := coalesce(new.updated_at, new.created_at);
    new.created_by := coalesce(new.created_by, auth.uid());
    new.updated_by := coalesce(new.updated_by, auth.uid());
    new.version := 1;
  else
    new.created_at := old.created_at;
    new.created_by := old.created_by;
    new.updated_at := now();
    new.updated_by := auth.uid();
    new.version := old.version + 1;
  end if;
  return new;
end;
$$;

create or replace function private.bump_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  new.version := old.version + 1;
  return new;
end;
$$;

create trigger organizations_set_metadata
before insert or update on public.organizations
for each row execute function private.set_row_metadata();

create trigger roles_touch_updated_at
before update on public.roles
for each row execute function private.touch_updated_at();

create trigger permissions_touch_updated_at
before update on public.permissions
for each row execute function private.touch_updated_at();

create trigger profiles_touch_updated_at
before update on public.profiles
for each row execute function private.touch_updated_at();

insert into public.roles (role_key, name)
values
  ('admin', 'Administrador'),
  ('manager', 'Gestor'),
  ('operator', 'Operador'),
  ('viewer', 'Consulta')
on conflict (role_key) do update set name = excluded.name, status = 'active';

insert into public.permissions (permission_key, description)
values
  ('organizations.read', 'Consultar dados da organização'),
  ('organizations.write', 'Alterar dados da organização'),
  ('organizations.soft_delete', 'Remover ou restaurar logicamente a organização'),
  ('owners.read', 'Consultar proprietários'),
  ('owners.write', 'Cadastrar e editar proprietários'),
  ('owners.inactivate', 'Inativar proprietários'),
  ('owners.soft_delete', 'Remover ou restaurar logicamente proprietários'),
  ('farms.read', 'Consultar fazendas'),
  ('farms.write', 'Cadastrar e editar fazendas'),
  ('farms.inactivate', 'Inativar fazendas'),
  ('farms.soft_delete', 'Remover ou restaurar logicamente fazendas'),
  ('registrations.read', 'Consultar matrículas'),
  ('registrations.write', 'Cadastrar e editar matrículas'),
  ('registrations.manage_ownership', 'Gerenciar vínculos de propriedade'),
  ('registrations.inactivate', 'Inativar matrículas'),
  ('registrations.soft_delete', 'Remover ou restaurar logicamente matrículas'),
  ('operations.read', 'Consultar operações'),
  ('operations.write', 'Cadastrar e editar operações'),
  ('operations.close', 'Concluir operações'),
  ('operations.cancel', 'Cancelar operações'),
  ('operations.soft_delete', 'Remover ou restaurar logicamente operações e cadastros auxiliares'),
  ('guarantees.read', 'Consultar garantias'),
  ('guarantees.write', 'Cadastrar e editar garantias'),
  ('guarantees.close', 'Encerrar garantias'),
  ('guarantees.cancel', 'Cancelar garantias'),
  ('guarantees.soft_delete', 'Remover ou restaurar logicamente garantias e itens'),
  ('financial.read', 'Consultar valores financeiros'),
  ('financial.write', 'Cadastrar e editar valores financeiros'),
  ('documents.read', 'Consultar documentos'),
  ('documents.write', 'Cadastrar e editar documentos'),
  ('documents.inactivate', 'Inativar documentos'),
  ('documents.soft_delete', 'Remover ou restaurar logicamente documentos e tipos'),
  ('files.read', 'Consultar referências de arquivos'),
  ('files.manage', 'Gerenciar referências de arquivos'),
  ('files.soft_delete', 'Remover ou restaurar logicamente referências de arquivos'),
  ('car.read', 'Consultar cadastros CAR'),
  ('car.write', 'Cadastrar e editar CAR'),
  ('car.inactivate', 'Inativar CAR'),
  ('car.soft_delete', 'Remover ou restaurar logicamente CAR'),
  ('reports.read', 'Consultar relatórios'),
  ('reports.generate', 'Gerar relatórios'),
  ('reports.export', 'Exportar relatórios'),
  ('reports.financial', 'Incluir valores financeiros em relatórios'),
  ('reports.manage', 'Gerenciar modelos de relatório'),
  ('audit.read', 'Consultar trilha de auditoria'),
  ('users.manage', 'Gerenciar usuários e perfis'),
  ('permissions.manage', 'Gerenciar roles e permissions')
on conflict (permission_key) do update set description = excluded.description;

insert into public.role_permissions (role_key, permission_key)
select 'admin', permission_key from public.permissions
on conflict do nothing;

insert into public.role_permissions (role_key, permission_key)
select 'manager', permission_key
from public.permissions
where permission_key = any (array[
  'organizations.read',
  'owners.read', 'owners.write', 'owners.inactivate',
  'farms.read', 'farms.write', 'farms.inactivate',
  'registrations.read', 'registrations.write', 'registrations.manage_ownership', 'registrations.inactivate',
  'operations.read', 'operations.write', 'operations.close', 'operations.cancel',
  'guarantees.read', 'guarantees.write', 'guarantees.close', 'guarantees.cancel',
  'financial.read', 'financial.write',
  'documents.read', 'documents.write', 'documents.inactivate',
  'files.read', 'files.manage',
  'car.read', 'car.write', 'car.inactivate',
  'reports.read', 'reports.generate', 'reports.export', 'reports.financial', 'reports.manage',
  'audit.read'
])
on conflict do nothing;

insert into public.role_permissions (role_key, permission_key)
select 'operator', permission_key
from public.permissions
where permission_key = any (array[
  'organizations.read',
  'owners.read', 'owners.write',
  'farms.read', 'farms.write',
  'registrations.read', 'registrations.write', 'registrations.manage_ownership',
  'operations.read', 'operations.write',
  'guarantees.read', 'guarantees.write',
  'documents.read', 'documents.write',
  'files.read', 'files.manage',
  'car.read', 'car.write',
  'reports.read', 'reports.generate'
])
on conflict do nothing;

insert into public.role_permissions (role_key, permission_key)
select 'viewer', permission_key
from public.permissions
where permission_key = any (array[
  'organizations.read',
  'owners.read', 'farms.read', 'registrations.read',
  'operations.read', 'guarantees.read',
  'documents.read', 'files.read', 'car.read',
  'reports.read'
])
on conflict do nothing;

create or replace function private.current_user_organization_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.organization_id
  from public.profiles p
  join public.organizations organization on organization.id = p.organization_id
  where p.id = auth.uid()
    and p.status = 'active'
    and organization.status = 'active'
    and organization.deleted_at is null;
$$;

create or replace function private.has_permission(requested_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
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

create or replace function private.same_organization(candidate_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select candidate_organization_id = private.current_user_organization_id();
$$;
