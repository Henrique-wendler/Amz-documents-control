-- Owners, farms, registrations and ownership relationships.

create table public.owners (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  owner_type text not null check (owner_type in ('individual', 'company')),
  name text not null check (btrim(name) <> ''),
  document_number text not null check (document_number ~ '^([0-9]{11}|[0-9]{14})$'),
  phone text,
  email text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  version integer not null default 1 check (version >= 1),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete set null,
  unique (organization_id, document_number),
  unique (organization_id, id),
  check (deleted_at is not null or deleted_by is null)
);

create table public.farms (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  name text not null check (btrim(name) <> ''),
  municipality text not null check (btrim(municipality) <> ''),
  state char(2) not null check (state ~ '^[A-Z]{2}$'),
  location text,
  total_area numeric(15,4) not null check (total_area >= 0),
  reserve_area numeric(15,4) check (reserve_area is null or reserve_area >= 0),
  consolidated_area numeric(15,4) check (consolidated_area is null or consolidated_area >= 0),
  status text not null default 'active' check (status in ('active', 'inactive')),
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  version integer not null default 1 check (version >= 1),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete set null,
  unique (organization_id, id),
  check (deleted_at is not null or deleted_by is null)
);

create table public.registrations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  farm_id uuid not null,
  number text not null check (btrim(number) <> ''),
  previous_number text,
  legal_area numeric(15,4) check (legal_area is null or legal_area >= 0),
  certificate_date date,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  version integer not null default 1 check (version >= 1),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete set null,
  constraint registrations_organization_fk foreign key (organization_id) references public.organizations(id) on delete restrict,
  constraint registrations_farm_fk foreign key (organization_id, farm_id) references public.farms(organization_id, id) on delete restrict,
  unique (organization_id, farm_id, number),
  unique (organization_id, id),
  unique (organization_id, id, farm_id),
  check (deleted_at is not null or deleted_by is null)
);

create table public.ownership_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  owner_id uuid not null,
  registration_id uuid not null,
  ownership_type text not null check (ownership_type in ('owner', 'co_owner', 'usufructuary', 'other')),
  percentage numeric(5,2) check (percentage is null or (percentage > 0 and percentage <= 100)),
  status text not null default 'active' check (status in ('active', 'inactive')),
  start_date date,
  end_date date,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  version integer not null default 1 check (version >= 1),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete set null,
  constraint ownership_links_organization_fk foreign key (organization_id) references public.organizations(id) on delete restrict,
  constraint ownership_links_owner_fk foreign key (organization_id, owner_id) references public.owners(organization_id, id) on delete restrict,
  constraint ownership_links_registration_fk foreign key (organization_id, registration_id) references public.registrations(organization_id, id) on delete restrict,
  check (end_date is null or start_date is null or end_date >= start_date),
  check (deleted_at is not null or deleted_by is null)
);

create index owners_organization_id_idx on public.owners (organization_id);
create index farms_name_idx on public.farms (name);
create index farms_municipality_idx on public.farms (municipality);
create index farms_organization_id_idx on public.farms (organization_id);
create index registrations_farm_id_idx on public.registrations (farm_id);
create index registrations_number_idx on public.registrations (number);
create index ownership_links_owner_id_idx on public.ownership_links (owner_id);
create index ownership_links_registration_id_idx on public.ownership_links (registration_id);
create index ownership_links_active_registration_idx
  on public.ownership_links (registration_id)
  where status = 'active' and deleted_at is null;

create trigger owners_set_metadata
before insert or update on public.owners
for each row execute function private.set_row_metadata();

create trigger farms_set_metadata
before insert or update on public.farms
for each row execute function private.set_row_metadata();

create trigger registrations_set_metadata
before insert or update on public.registrations
for each row execute function private.set_row_metadata();

create trigger ownership_links_set_metadata
before insert or update on public.ownership_links
for each row execute function private.set_row_metadata();

create or replace function private.validate_active_ownership_percentage()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  active_total numeric(7,2);
begin
  perform pg_advisory_xact_lock(hashtextextended(new.registration_id::text, 0));

  if new.status = 'active' and new.deleted_at is null and new.percentage is not null then
    select coalesce(sum(link.percentage), 0)
      into active_total
    from public.ownership_links link
    where link.registration_id = new.registration_id
      and link.organization_id = new.organization_id
      and link.status = 'active'
      and link.deleted_at is null
      and link.id <> new.id;

    if active_total + new.percentage > 100 then
      raise exception using
        errcode = '23514',
        message = 'Active ownership percentage would exceed 100% for the registration.';
    end if;
  end if;

  return new;
end;
$$;

create trigger ownership_links_validate_percentage
before insert or update of registration_id, organization_id, percentage, status, deleted_at
on public.ownership_links
for each row execute function private.validate_active_ownership_percentage();

create or replace function public.create_ownership_link(
  p_owner_id uuid,
  p_registration_id uuid,
  p_ownership_type text,
  p_percentage numeric,
  p_status text,
  p_start_date date,
  p_end_date date
)
returns public.ownership_links
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_organization_id uuid;
  created_link public.ownership_links;
begin
  if not private.has_permission('registrations.manage_ownership') then
    raise exception using errcode = '42501', message = 'Missing registrations.manage_ownership permission.';
  end if;

  select registration.organization_id
    into target_organization_id
  from public.registrations registration
  where registration.id = p_registration_id
    and registration.deleted_at is null;

  if target_organization_id is null or not private.same_organization(target_organization_id) then
    raise exception using errcode = '42501', message = 'Registration is not available to the current organization.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_registration_id::text, 0));

  insert into public.ownership_links (
    organization_id, owner_id, registration_id, ownership_type,
    percentage, status, start_date, end_date
  ) values (
    target_organization_id, p_owner_id, p_registration_id, p_ownership_type,
    p_percentage, p_status, p_start_date, p_end_date
  )
  returning * into created_link;

  return created_link;
end;
$$;

create or replace function public.update_ownership_link(
  p_id uuid,
  p_expected_version integer,
  p_owner_id uuid,
  p_ownership_type text,
  p_percentage numeric,
  p_status text,
  p_start_date date,
  p_end_date date
)
returns public.ownership_links
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_link public.ownership_links;
  updated_link public.ownership_links;
begin
  if not private.has_permission('registrations.manage_ownership') then
    raise exception using errcode = '42501', message = 'Missing registrations.manage_ownership permission.';
  end if;

  select * into current_link
  from public.ownership_links link
  where link.id = p_id
    and link.deleted_at is null;

  if current_link.id is null or not private.same_organization(current_link.organization_id) then
    raise exception using errcode = '42501', message = 'Ownership link is not available to the current organization.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(current_link.registration_id::text, 0));

  update public.ownership_links
  set owner_id = p_owner_id,
      ownership_type = p_ownership_type,
      percentage = p_percentage,
      status = p_status,
      start_date = p_start_date,
      end_date = p_end_date
  where id = p_id
    and version = p_expected_version
  returning * into updated_link;

  if updated_link.id is null then
    raise exception using errcode = '40001', message = 'Ownership link was changed by another transaction.';
  end if;

  return updated_link;
end;
$$;
